import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import {
  actions,
  changeSnapshots,
  changes,
  findings,
  pages,
  sites,
} from "@agentsean/db";
import { claimForChange, DEFAULT_EVIDENCE_TIER, EVIDENCE_MEANING } from "@agentsean/measure";
import {
  actionFromRow,
  executeAction,
  loadChange,
  loadGitConnection,
  markReverted,
  planTitleActions,
  revertChange,
  saveAction,
  listAdapterConnections,
  upsertAdapterConnection,
  upsertGitConnection,
} from "@agentsean/actions";
import { adapterForSite } from "@agentsean/adapter-factory";
import { isCmsWriteKind, isHostedMode, refuseHostedCmsCredential } from "@agentsean/hosted";
import { isHalted } from "./paths.js";
import { activityPageHtml } from "./activity-page.js";

export type ActionRouteOptions = {
  db: SqliteDatabase;
  seanHome: string;
  token: string;
  gitFetch?: typeof fetch | undefined;
};

function approvalKey(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function siteOf(db: SqliteDatabase, origin?: string) {
  if (origin) {
    return db.select().from(sites).where(eq(sites.origin, origin)).get();
  }
  return db.select().from(sites).all()[0];
}

function adapterFor(
  db: SqliteDatabase,
  siteId: string,
  opts: ActionRouteOptions,
  repoOverride?: string,
) {
  if (repoOverride) {
    upsertGitConnection(db, siteId, {
      ...loadGitConnection(db, siteId),
      repoPath: repoOverride,
    });
  }
  const factoryOpts = opts.gitFetch ? { fetch: opts.gitFetch } : undefined;
  return adapterForSite(db, siteId, factoryOpts);
}

export function registerActionRoutes(app: FastifyInstance, opts: ActionRouteOptions): void {
  const html = activityPageHtml();

  app.get("/activity", async (_req, reply) => {
    reply.type("text/html").send(html);
  });

  app.get("/api/actions", (req) => {
    const q = req.query as { siteId?: string };
    const rows = q.siteId
      ? opts.db.select().from(actions).where(eq(actions.siteId, q.siteId)).all()
      : opts.db.select().from(actions).all();
    return {
      actions: rows.map((r) => ({
        id: r.id,
        kind: r.actionType,
        tier: r.tier,
        state: r.state,
        targetRef: r.targetRef,
        error: r.error,
        createdAt: r.createdAt,
        appliedAt: r.appliedAt,
      })),
    };
  });

  app.get("/api/changes", () => {
    const rows = opts.db.select().from(changes).orderBy(desc(changes.appliedAt)).all();
    const out = rows.map((row) => {
      const snaps = opts.db
        .select()
        .from(changeSnapshots)
        .where(eq(changeSnapshots.changeId, row.id))
        .all();
      const before = snaps.find((s) => s.kind === "before")?.body ?? "";
      const after = snaps.find((s) => s.kind === "after")?.body ?? "";
      const metaRaw = snaps.find((s) => s.kind === "meta")?.body;
      let prUrl: string | null = null;
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw) as { prUrl?: string | null };
          prUrl = meta.prUrl ?? null;
        } catch {
          prUrl = null;
        }
      }
      const claim = claimForChange(opts.db, row.id);
      return {
        id: row.id,
        actionId: row.actionId,
        summary: row.summary,
        appliedAt: row.appliedAt,
        revertedAt: row.revertedAt,
        revertible: Boolean(row.revertible) && !row.revertedAt,
        before,
        after,
        prUrl,
        evidenceTier: claim?.evidenceTier ?? DEFAULT_EVIDENCE_TIER,
        causationClaimed: claim?.causationClaimed ?? false,
        evidenceStatement: claim?.statement ?? EVIDENCE_MEANING.E,
      };
    });
    return { changes: out };
  });

  app.post("/api/adapters/git", async (req, reply) => {
    const body = (req.body ?? {}) as {
      origin?: string;
      repoPath?: string;
      token?: string;
    };
    const site = siteOf(opts.db, body.origin);
    if (!site) return reply.code(400).send({ error: "unknown_site" });
    if (!body.repoPath) return reply.code(400).send({ error: "missing_repoPath" });
    const config: Record<string, unknown> = { repoPath: body.repoPath };
    if (body.token) config["token"] = body.token;
    upsertGitConnection(opts.db, site.id, config);
    return { ok: true, siteId: site.id, kind: "git" };
  });

  app.get("/api/adapters", (req) => {
    const q = req.query as { siteId?: string };
    const site = q.siteId
      ? opts.db.select().from(sites).where(eq(sites.id, q.siteId)).get()
      : opts.db.select().from(sites).all()[0];
    if (!site) return { adapters: [] };
    return {
      adapters: listAdapterConnections(opts.db, site.id).map((r) => ({
        kind: r.kind,
        connected: true,
      })),
    };
  });

  app.post("/api/adapters", async (req, reply) => {
    const body = (req.body ?? {}) as {
      origin?: string;
      kind?: string;
      config?: Record<string, unknown>;
    };
    const site = siteOf(opts.db, body.origin);
    if (!site) return reply.code(400).send({ error: "unknown_site" });
    if (!body.kind || !body.config) return reply.code(400).send({ error: "missing_kind_or_config" });
    if (isHostedMode() && isCmsWriteKind(body.kind)) {
      try {
        refuseHostedCmsCredential(body.kind);
      } catch (err) {
        return reply.code(403).send({ error: "hosted_connector", message: err instanceof Error ? err.message : "refused" });
      }
    }
    upsertAdapterConnection(opts.db, site.id, body.kind, body.config);
    return { ok: true, siteId: site.id, kind: body.kind };
  });

  app.post("/api/actions/plan", async (req, reply) => {
    const body = (req.body ?? {}) as { origin?: string };
    const site = siteOf(opts.db, body.origin);
    if (!site) return reply.code(400).send({ error: "unknown_site" });
    const pageRows = opts.db.select().from(pages).where(eq(pages.siteId, site.id)).all();
    const findingRows = opts.db
      .select()
      .from(findings)
      .where(eq(findings.siteId, site.id))
      .all();
    const planned = planTitleActions({
      siteId: site.id,
      origin: site.origin,
      pages: pageRows.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.title,
        metaDescription: p.metaDescription,
        h1: p.h1,
      })),
      findings: findingRows.map((f) => ({
        id: f.id,
        siteId: f.siteId,
        pageId: f.pageId,
        ruleId: f.ruleId,
        status: f.status,
      })),
    });
    for (const a of planned) saveAction(opts.db, a, "proposed");
    return { ok: true, actions: planned };
  });

  app.post("/api/actions/:id/apply", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { repoPath?: string };
    const row = opts.db.select().from(actions).where(eq(actions.id, id)).get();
    if (!row) return reply.code(404).send({ error: "unknown_action" });
    const action = actionFromRow(row);
    if (!action) return reply.code(400).send({ error: "malformed_action" });
    let adapter;
    try {
      adapter = adapterFor(opts.db, action.siteId, opts, body.repoPath);
    } catch (e) {
      return reply.code(400).send({
        error: "adapter",
        message: e instanceof Error ? e.message : String(e),
      });
    }
    const result = await executeAction({
      db: opts.db,
      action,
      adapter,
      approvalKey: approvalKey(opts.token),
      halted: isHalted(opts.seanHome),
    });
    return result;
  });

  app.post("/api/changes/:id/revert", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const change = loadChange(opts.db, id);
    if (!change) return reply.code(404).send({ error: "unknown_change" });
    const existing = opts.db.select().from(changes).where(eq(changes.id, id)).get();
    if (existing?.revertedAt) return reply.code(409).send({ error: "already_reverted" });
    let adapter;
    try {
      adapter = adapterFor(opts.db, change.siteId, opts);
    } catch (e) {
      return reply.code(400).send({
        error: "adapter",
        message: e instanceof Error ? e.message : String(e),
      });
    }
    const result = await revertChange({ db: opts.db, change, adapter });
    if (!result.ok) return reply.code(500).send({ error: result.error });
    markReverted(opts.db, id);
    const actionRow = opts.db.select().from(actions).where(eq(actions.id, change.actionId)).get();
    if (actionRow) {
      opts.db.update(actions).set({ state: "reverted" }).where(eq(actions.id, actionRow.id)).run();
    }
    return { ok: true, changeId: id };
  });

  app.post("/api/apply", async (req, reply) => {
    const body = (req.body ?? {}) as { origin?: string; repoPath?: string; dryRun?: boolean };
    const site = siteOf(opts.db, body.origin);
    if (!site) return reply.code(400).send({ error: "unknown_site" });
    if (body.repoPath) {
      upsertGitConnection(opts.db, site.id, {
        ...loadGitConnection(opts.db, site.id),
        repoPath: body.repoPath,
      });
    }
    let adapter;
    try {
      adapter = adapterFor(opts.db, site.id, opts, body.repoPath);
    } catch (e) {
      return reply.code(400).send({
        error: "adapter",
        message: e instanceof Error ? e.message : String(e),
      });
    }
    const pageRows = opts.db.select().from(pages).where(eq(pages.siteId, site.id)).all();
    const findingRows = opts.db
      .select()
      .from(findings)
      .where(eq(findings.siteId, site.id))
      .all();
    const planned = planTitleActions({
      siteId: site.id,
      origin: site.origin,
      pages: pageRows.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.title,
        metaDescription: p.metaDescription,
        h1: p.h1,
      })),
      findings: findingRows.map((f) => ({
        id: f.id,
        siteId: f.siteId,
        pageId: f.pageId,
        ruleId: f.ruleId,
        status: f.status,
      })),
    });
    const results = [];
    for (const action of planned) {
      results.push(
        await executeAction({
          db: opts.db,
          action,
          adapter,
          approvalKey: approvalKey(opts.token),
          halted: isHalted(opts.seanHome),
          dryRun: Boolean(body.dryRun),
        }),
      );
    }
    return { ok: true, results, activity: "/activity" };
  });
}
