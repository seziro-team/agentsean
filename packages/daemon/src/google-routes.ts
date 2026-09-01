import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import { googleChangepoints, gscConnections, ga4Connections, gscGa4Reconciliation, sites } from "@agentsean/db";
import type { CredentialStore } from "@agentsean/credentials";
import {
  bindProperties,
  createGscClient,
  createQuotaManager,
  createSiteVerificationClient,
  defaultSleep,
  discoverProperties,
  fileVerificationPath,
  finishConnect,
  loadGrant,
  metaVerificationTag,
  persistVerification,
  startConnect,
  syncGoogle,
  type PendingStore,
} from "@agentsean/google";
import { connectPageHtml } from "./connect-page.js";

export type GoogleRouteOptions = {
  db: SqliteDatabase;
  store: CredentialStore;
  pending: PendingStore;
  getPort: () => number;
  fetch?: typeof fetch | undefined;
};

function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function ensureSite(db: SqliteDatabase, origin: string): string {
  const existing = db.select().from(sites).where(eq(sites.origin, origin)).get();
  if (existing) return existing.id;
  const now = new Date().toISOString();
  const id = randomUUID();
  db.insert(sites)
    .values({
      id,
      origin,
      name: origin,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export function registerGoogleRoutes(app: FastifyInstance, opts: GoogleRouteOptions): void {
  const html = connectPageHtml();

  app.get("/connect", async (_req, reply) => {
    reply.type("text/html").send(html);
  });

  app.get("/api/google/status", async () => {
    const grant = await loadGrant(opts.store);
    const site = opts.db.select().from(sites).all()[0];
    const gsc = site
      ? opts.db.select().from(gscConnections).where(eq(gscConnections.siteId, site.id)).get()
      : undefined;
    const ga4 = site
      ? opts.db.select().from(ga4Connections).where(eq(ga4Connections.siteId, site.id)).get()
      : undefined;
    return {
      connected: Boolean(grant),
      email: grant?.email ?? null,
      testingModeSuspected: grant?.testingModeSuspected ?? false,
      mode: grant?.mode ?? null,
      origin: site?.origin ?? null,
      siteId: site?.id ?? null,
      gscSiteUrl: gsc?.siteUrl ?? null,
      ga4PropertyId: ga4?.propertyId ?? null,
    };
  });

  app.post("/api/google/connect/start", async (req, reply) => {
    const body = (req.body ?? {}) as {
      origin?: string;
      mode?: "broker" | "byo";
      credentialsJson?: string;
      clientId?: string;
      clientSecret?: string;
    };
    const origin = originOf(body.origin);
    if (origin) ensureSite(opts.db, origin);
    const port = opts.getPort();
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    try {
      const started = await startConnect({
        store: opts.store,
        pending: opts.pending,
        input: {
          mode: body.mode,
          redirectUri,
          siteId: origin ? ensureSite(opts.db, origin) : null,
          credentialsJson: body.credentialsJson,
          clientId: body.clientId,
          clientSecret: body.clientSecret,
        },
      });
      return started;
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/oauth/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; payload?: string; error?: string };
    if (q.error) {
      return reply.redirect(`/connect?error=${encodeURIComponent(q.error)}`);
    }
    try {
      await finishConnect({
        store: opts.store,
        pending: opts.pending,
        query: q,
        fetch: opts.fetch,
      });
      return reply.redirect("/connect?connected=1");
    } catch (err) {
      return reply.redirect(
        `/connect?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`,
      );
    }
  });

  app.post("/api/google/discover", async (req, reply) => {
    try {
      const site = opts.db.select().from(sites).all()[0];
      return await discoverProperties({
        db: opts.db,
        store: opts.store,
        fetch: opts.fetch,
        siteId: site?.id,
      });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/google/properties", async (req, reply) => {
    const body = (req.body ?? {}) as {
      origin?: string;
      gscSiteUrl?: string | null;
      ga4PropertyId?: string | null;
    };
    const origin = originOf(body.origin);
    const site = origin
      ? opts.db.select().from(sites).where(eq(sites.origin, origin)).get()
      : opts.db.select().from(sites).all()[0];
    if (!site) return reply.code(400).send({ error: "no_site" });
    await bindProperties({
      db: opts.db,
      store: opts.store,
      siteId: site.id,
      gscSiteUrl: body.gscSiteUrl,
      ga4PropertyId: body.ga4PropertyId,
    });
    return { ok: true, siteId: site.id };
  });

  app.post("/api/google/verify", async (req, reply) => {
    const body = (req.body ?? {}) as {
      method?: "META" | "FILE" | "ANALYTICS" | "TAG_MANAGER" | "DNS_TXT";
      origin?: string;
    };
    if (!body.method) return reply.code(400).send({ error: "missing_method" });
    const origin = originOf(body.origin);
    const site = origin
      ? opts.db.select().from(sites).where(eq(sites.origin, origin)).get()
      : opts.db.select().from(sites).all()[0];
    if (!site) return reply.code(400).send({ error: "no_site" });
    const grant = await loadGrant(opts.store);
    if (!grant) return reply.code(400).send({ error: "not_connected" });
    const http = {
      fetch: opts.fetch ?? fetch,
      quota: createQuotaManager(opts.db),
      maxRetries: 2,
      sleep: defaultSleep,
      maxBackoffMs: 2000,
    };
    const verify = createSiteVerificationClient({
      http,
      getToken: async () => grant.accessToken,
    });
    const identifier = site.origin.endsWith("/") ? site.origin : `${site.origin}/`;
    try {
      const token = await verify.getToken(identifier, body.method);
      persistVerification(opts.db, {
        siteId: site.id,
        method: body.method,
        identifier,
        token: token.token,
        tokenPath: body.method === "FILE" ? fileVerificationPath(token.token) : null,
      });
      try {
        await verify.insert(identifier, body.method);
        persistVerification(opts.db, {
          siteId: site.id,
          method: body.method,
          identifier,
          token: token.token,
          verifiedAt: new Date().toISOString(),
        });
        const gsc = createGscClient({ http, getToken: async () => grant.accessToken });
        await gsc.addSite(identifier);
        return {
          ok: true,
          verified: true,
          token: token.token,
          meta: body.method === "META" ? metaVerificationTag(token.token) : null,
          file: body.method === "FILE" ? fileVerificationPath(token.token) : null,
        };
      } catch {
        return {
          ok: true,
          verified: false,
          token: token.token,
          meta: body.method === "META" ? metaVerificationTag(token.token) : null,
          file: body.method === "FILE" ? fileVerificationPath(token.token) : null,
          hint: "Place the token on the site, then retry verify.",
        };
      }
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/google/api-key", async (req, reply) => {
    const body = (req.body ?? {}) as { apiKey?: string };
    if (!body.apiKey) return reply.code(400).send({ error: "missing_api_key" });
    const { saveApiKey } = await import("@agentsean/google");
    await saveApiKey(opts.store, body.apiKey);
    return { ok: true };
  });

  app.post("/api/google/sync", async (req, reply) => {
    const site = opts.db.select().from(sites).all()[0];
    if (!site) return reply.code(400).send({ error: "no_site" });
    try {
      const result = await syncGoogle({
        db: opts.db,
        store: opts.store,
        fetch: opts.fetch,
        siteId: site.id,
        maxBackoffMs: 50,
        sleep: async () => undefined,
      });
      return { ok: true, ...result, residualRows: result.residualRows.slice(-14) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/google/reconciliation", async () => {
    const site = opts.db.select().from(sites).all()[0];
    if (!site) return { rows: [] };
    const rows = opts.db
      .select()
      .from(gscGa4Reconciliation)
      .where(eq(gscGa4Reconciliation.siteId, site.id))
      .all();
    return { rows };
  });

  app.get("/api/google/incidents", async () => {
    const changepoints = opts.db.select().from(googleChangepoints).all();
    return {
      changepoints: changepoints.map((c) => ({
        id: c.id,
        kind: c.kind,
        begin: c.begin,
        end: c.end,
        title: c.title,
        clicksAffected: c.clicksAffected === 1,
        impressionsAffected: c.impressionsAffected === 1,
      })),
    };
  });
}
