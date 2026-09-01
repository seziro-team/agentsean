import type { CredentialStore } from "@agentsean/credentials";
import type { SqliteDatabase } from "@agentsean/db";
import { sites } from "@agentsean/db";
import { eq } from "drizzle-orm";
import {
  resolveOAuthConfig,
  loopbackRedirectUri,
  parseDesktopClientJson,
} from "./oauth-config.js";
import { startByoAuthorization, exchangeByoCode } from "./oauth-desktop.js";
import { grantFromBrokerHandoff, startBrokerAuthorization } from "./oauth-broker.js";
import type { PendingStore } from "./pending.js";
import {
  loadByoClient,
  loadGrant,
  saveByoClient,
  saveGrant,
  saveApiKey,
  type ByoClient,
  type StoredGoogleGrant,
} from "./tokens.js";
import { createGscClient } from "./gsc.js";
import { createGa4Client } from "./ga4.js";
import { createQuotaManager } from "./quota.js";
import { defaultSleep, type GoogleHttp } from "./http.js";
import { upsertGa4Connection, upsertGscConnection } from "./persist.js";
import { GOOGLE_USERINFO_URL } from "./scopes.js";
import { GscTokenError } from "./errors.js";
import { normalizeGscSiteUrl } from "./scopes.js";

export type ConnectStartInput = {
  mode?: "broker" | "byo" | undefined;
  redirectUri: string;
  siteId?: string | null | undefined;
  credentialsJson?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
};

export async function startConnect(opts: {
  store: CredentialStore;
  pending: PendingStore;
  input: ConnectStartInput;
  env?: NodeJS.ProcessEnv | undefined;
}): Promise<{ authorizationUrl: string; state: string; mode: "broker" | "byo" }> {
  const cfg = resolveOAuthConfig(opts.env);
  let byo: ByoClient | null = cfg.byo;
  if (opts.input.credentialsJson) {
    byo = parseDesktopClientJson(opts.input.credentialsJson);
  } else if (opts.input.clientId && opts.input.clientSecret) {
    byo = { clientId: opts.input.clientId, clientSecret: opts.input.clientSecret };
  }
  const mode = opts.input.mode ?? (byo ? "byo" : "broker");
  if (mode === "byo") {
    if (!byo) {
      throw new GscTokenError(
        "BYO Google Cloud project requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or --credentials client_secret.json.",
      );
    }
    await saveByoClient(opts.store, byo);
    const started = startByoAuthorization({
      client: byo,
      redirectUri: opts.input.redirectUri,
      pending: opts.pending,
      siteId: opts.input.siteId,
    });
    return { ...started, mode: "byo" };
  }
  const started = startBrokerAuthorization({
    brokerUrl: cfg.brokerUrl,
    redirectUri: opts.input.redirectUri,
    pending: opts.pending,
    siteId: opts.input.siteId,
  });
  return {
    authorizationUrl: started.authorizationUrl,
    state: started.state,
    mode: "broker",
  };
}

export async function finishConnect(opts: {
  store: CredentialStore;
  pending: PendingStore;
  query: {
    code?: string | undefined;
    state?: string | undefined;
    payload?: string | undefined;
  };
  fetch?: typeof fetch | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}): Promise<StoredGoogleGrant> {
  const state = opts.query.state;
  if (!state) throw new GscTokenError("OAuth callback missing state.");
  const pending = opts.pending.take(state);
  if (!pending)
    throw new GscTokenError("OAuth state is unknown or expired. Start connect again.");
  const prev = await loadGrant(opts.store);
  const fetchFn = opts.fetch ?? fetch;
  if (pending.mode === "broker") {
    if (!opts.query.payload)
      throw new GscTokenError("Broker callback missing sealed payload.");
    const grant = grantFromBrokerHandoff(pending, opts.query.payload, prev);
    await saveGrant(opts.store, grant);
    return grant;
  }
  if (!opts.query.code) throw new GscTokenError("OAuth callback missing code.");
  const cfg = resolveOAuthConfig(opts.env);
  const byo = (await loadByoClient(opts.store)) ?? cfg.byo;
  if (!byo)
    throw new GscTokenError("BYO client credentials missing at token exchange.");
  const grant = await exchangeByoCode({
    client: byo,
    pending,
    code: opts.query.code,
    fetch: fetchFn,
    prev,
  });
  await saveGrant(opts.store, grant);
  return grant;
}

export async function discoverProperties(opts: {
  db: SqliteDatabase;
  store: CredentialStore;
  fetch?: typeof fetch | undefined;
  siteId?: string | null | undefined;
}): Promise<{
  email: string | null;
  testingModeSuspected: boolean;
  gscSites: { siteUrl: string; permissionLevel: string }[];
  ga4Properties: {
    propertyId: string;
    displayName: string;
    accountId: string;
    accountDisplayName: string;
  }[];
  suggestedGsc: string | null;
}> {
  const grant = await loadGrant(opts.store);
  if (!grant) throw new GscTokenError("Google is not connected.");
  const http: GoogleHttp = {
    fetch: opts.fetch ?? fetch,
    quota: createQuotaManager(opts.db),
    maxRetries: 2,
    sleep: defaultSleep,
    maxBackoffMs: 1000,
  };
  const getToken = async () => grant.accessToken;
  const gsc = createGscClient({ http, getToken });
  const ga4 = createGa4Client({ http, getToken });
  let email = grant.email;
  try {
    const res = await http.fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${grant.accessToken}` },
    });
    if (res.ok) {
      const info = (await res.json()) as { email?: string; sub?: string };
      email = typeof info.email === "string" ? info.email : email;
    }
  } catch {
    // ignore
  }
  const gscSites = await gsc.listSites();
  const ga4Properties = await ga4.listProperties();
  let suggestedGsc: string | null = null;
  if (opts.siteId) {
    const site = opts.db.select().from(sites).where(eq(sites.id, opts.siteId)).get();
    if (site) {
      const want = normalizeGscSiteUrl(site.origin);
      suggestedGsc =
        gscSites.find((s) => s.siteUrl === want)?.siteUrl ??
        gscSites.find((s) => site.origin.startsWith(s.siteUrl.replace(/\/$/, "")))
          ?.siteUrl ??
        null;
    }
  }
  return {
    email,
    testingModeSuspected: grant.testingModeSuspected,
    gscSites,
    ga4Properties,
    suggestedGsc,
  };
}

export async function bindProperties(opts: {
  db: SqliteDatabase;
  store: CredentialStore;
  siteId: string;
  gscSiteUrl?: string | null | undefined;
  ga4PropertyId?: string | null | undefined;
}): Promise<void> {
  const grant = await loadGrant(opts.store);
  if (opts.gscSiteUrl) {
    upsertGscConnection(opts.db, {
      siteId: opts.siteId,
      siteUrl: opts.gscSiteUrl,
      accountEmail: grant?.email,
      googleSub: grant?.googleSub,
    });
  }
  if (opts.ga4PropertyId) {
    upsertGa4Connection(opts.db, {
      siteId: opts.siteId,
      propertyId: opts.ga4PropertyId,
      accountEmail: grant?.email,
    });
  }
}

export { loopbackRedirectUri, saveApiKey };
