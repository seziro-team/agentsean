import { eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import { ga4Connections, gscConnections, sites } from "@agentsean/db";
import type { CredentialStore } from "@agentsean/credentials";
import { createQuotaManager } from "./quota.js";
import { defaultSleep, type FetchFn, type GoogleHttp } from "./http.js";
import {
  createGscClient,
  defaultGscWindow,
  monthChunks,
  type GscClient,
} from "./gsc.js";
import { createGa4Client, googleOrganicFilter, type Ga4Client } from "./ga4.js";
import { queryCruxWithFallback } from "./crux.js";
import { runPsi } from "./psi.js";
import {
  fetchIncidents,
  seedCuratedChangepoints,
  upsertIncidents,
} from "./incidents.js";
import { reconcileSite, type ResidualRow } from "./reconcile.js";
import {
  persistCrux,
  persistGa4Daily,
  persistGa4Landing,
  persistGscDaily,
  persistGscDimensionRows,
  persistInspection,
  persistPsi,
} from "./persist.js";
import { loadApiKey, loadByoClient, loadGrant, validAccessToken } from "./tokens.js";
import { brokerRefreshAccessToken } from "./oauth-broker.js";
import { resolveOAuthConfig } from "./oauth-config.js";
import { randomWrapKey } from "./pkce.js";
import { QuotaExceededError } from "./errors.js";

export type SyncResult = {
  gscDays: number;
  gscPages: number;
  gscQueries: number;
  ga4Days: number;
  crux: boolean;
  psi: boolean;
  incidents: number;
  residualRows: ResidualRow[];
  inspectionRemaining: number;
  testingModeSuspected: boolean;
  errors: string[];
};

export type SyncDeps = {
  db: SqliteDatabase;
  store: CredentialStore;
  fetch?: FetchFn | undefined;
  siteId: string;
  inspectUrls?: string[] | undefined;
  runPsiAudit?: boolean | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  maxBackoffMs?: number | undefined;
};

function httpOf(deps: SyncDeps, db: SqliteDatabase): GoogleHttp {
  return {
    fetch: deps.fetch ?? fetch,
    quota: createQuotaManager(db),
    maxRetries: 4,
    sleep: deps.sleep ?? defaultSleep,
    maxBackoffMs: deps.maxBackoffMs ?? 15 * 60_000,
  };
}

async function tokenFn(deps: SyncDeps): Promise<string> {
  const grant = await loadGrant(deps.store);
  if (!grant) throw new Error("Google is not connected.");
  const cfg = resolveOAuthConfig();
  const byo = (await loadByoClient(deps.store)) ?? cfg.byo;
  const fetchFn = deps.fetch ?? fetch;
  return validAccessToken(deps.store, {
    fetch: fetchFn,
    clientId: byo?.clientId,
    clientSecret: byo?.clientSecret,
    brokerRefresh:
      grant.mode === "broker"
        ? async (rt) => {
            const wrap = randomWrapKey();
            return brokerRefreshAccessToken(cfg.brokerUrl, rt, wrap, fetchFn);
          }
        : undefined,
  });
}

export async function syncGoogle(deps: SyncDeps): Promise<SyncResult> {
  const errors: string[] = [];
  seedCuratedChangepoints(deps.db);
  let incidents = 0;
  try {
    const fetched = await fetchIncidents(deps.fetch ?? fetch);
    incidents = upsertIncidents(deps.db, fetched);
  } catch (err) {
    errors.push(`incidents: ${err instanceof Error ? err.message : String(err)}`);
  }

  const grant = await loadGrant(deps.store);
  const testingModeSuspected = grant?.testingModeSuspected ?? false;
  const http = httpOf(deps, deps.db);
  const getToken = () => tokenFn(deps);
  const gsc = createGscClient({ http, getToken });
  const ga4 = createGa4Client({ http, getToken });

  const gscConn = deps.db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.siteId, deps.siteId))
    .get();
  const ga4Conn = deps.db
    .select()
    .from(ga4Connections)
    .where(eq(ga4Connections.siteId, deps.siteId))
    .get();
  const site = deps.db.select().from(sites).where(eq(sites.id, deps.siteId)).get();

  let gscDays = 0;
  let gscPages = 0;
  let gscQueries = 0;
  if (gscConn) {
    try {
      const pulled = await syncGsc(gsc, deps.db, deps.siteId, gscConn.siteUrl);
      gscDays = pulled.days;
      gscPages = pulled.pages;
      gscQueries = pulled.queries;
    } catch (err) {
      errors.push(`gsc: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (deps.inspectUrls?.length) {
      for (const url of deps.inspectUrls) {
        try {
          const remaining = http.quota.remainingInspectionToday(gscConn.siteUrl);
          if (remaining <= 0) break;
          const result = await gsc.inspectUrl(gscConn.siteUrl, url);
          if (result) persistInspection(deps.db, deps.siteId, url, result);
        } catch (err) {
          if (err instanceof QuotaExceededError) break;
          errors.push(
            `inspect ${url}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  let ga4Days = 0;
  if (ga4Conn) {
    try {
      ga4Days = await syncGa4(ga4, deps.db, deps.siteId, ga4Conn.propertyId);
    } catch (err) {
      errors.push(`ga4: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const apiKey = await loadApiKey(deps.store);
  let cruxOk = false;
  let psiOk = false;
  if (apiKey && site) {
    try {
      const rec = await queryCruxWithFallback({
        http,
        apiKey,
        url: site.origin,
        origin: site.origin,
        formFactor: "PHONE",
      });
      persistCrux(deps.db, deps.siteId, rec);
      cruxOk = !rec.insufficientTraffic || rec.lcpP75 !== null;
    } catch (err) {
      errors.push(`crux: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (deps.runPsiAudit) {
      try {
        const psi = await runPsi({ http, url: site.origin, apiKey });
        persistPsi(deps.db, deps.siteId, psi);
        psiOk = true;
      } catch (err) {
        errors.push(`psi: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const residualRows = reconcileSite(deps.db, deps.siteId);
  const inspectionRemaining = gscConn
    ? http.quota.remainingInspectionToday(gscConn.siteUrl)
    : 0;

  return {
    gscDays,
    gscPages,
    gscQueries,
    ga4Days,
    crux: cruxOk,
    psi: psiOk,
    incidents,
    residualRows,
    inspectionRemaining,
    testingModeSuspected,
    errors,
  };
}

async function syncGsc(
  gsc: GscClient,
  db: SqliteDatabase,
  siteId: string,
  siteUrl: string,
): Promise<{ days: number; pages: number; queries: number }> {
  const window = defaultGscWindow();
  const chunks = monthChunks(window.startDate, window.endDate);
  let days = 0;
  let pages = 0;
  let queries = 0;
  let firstIncomplete: string | null = null;
  for (const chunk of chunks) {
    const totals = await gsc.querySearchAnalyticsAllPages(siteUrl, {
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      dimensions: ["date"],
      type: "web",
      dataState: "final",
      rowLimit: 25_000,
    });
    if (totals.firstIncompleteDate) firstIncomplete = totals.firstIncompleteDate;
    for (const row of totals.rows) {
      const date = row.keys?.[0];
      if (!date) continue;
      persistGscDaily(
        db,
        siteId,
        "web",
        date,
        {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
        "final",
        firstIncomplete,
      );
      days += 1;
    }
    const pageRows = await gsc.querySearchAnalyticsAllPages(siteUrl, {
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      dimensions: ["page", "date"],
      type: "web",
      dataState: "final",
      rowLimit: 25_000,
    });
    pages += persistGscDimensionRows(db, siteId, "web", "page", pageRows.rows);
    const queryRows = await gsc.querySearchAnalyticsAllPages(siteUrl, {
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      dimensions: ["query", "date"],
      type: "web",
      dataState: "final",
      rowLimit: 25_000,
    });
    queries += persistGscDimensionRows(db, siteId, "web", "query", queryRows.rows);
  }
  return { days, pages, queries };
}

async function syncGa4(
  ga4: Ga4Client,
  db: SqliteDatabase,
  siteId: string,
  propertyId: string,
): Promise<number> {
  const window = defaultGscWindow();
  const daily = await ga4.runReport({
    propertyId,
    startDate: window.startDate,
    endDate: window.endDate,
    dimensions: ["date"],
    metrics: ["sessions", "engagedSessions", "conversions"],
  });
  const organic = await ga4.runReport({
    propertyId,
    startDate: window.startDate,
    endDate: window.endDate,
    dimensions: ["date"],
    metrics: ["sessions"],
    dimensionFilter: googleOrganicFilter(),
  });
  const organicByDate = new Map<string, number>();
  for (const row of organic.rows) {
    organicByDate.set(ga4Date(row.dimensionValues[0] ?? ""), row.metricValues[0] ?? 0);
  }
  let n = 0;
  for (const row of daily.rows) {
    const date = ga4Date(row.dimensionValues[0] ?? "");
    if (!date) continue;
    persistGa4Daily(db, siteId, date, {
      sessions: row.metricValues[0] ?? 0,
      organicSessions: organicByDate.get(date) ?? 0,
      engagedSessions: row.metricValues[1] ?? 0,
      conversions: row.metricValues[2] ?? 0,
    });
    n += 1;
  }
  const landing = await ga4.runReport({
    propertyId,
    startDate: window.startDate,
    endDate: window.endDate,
    dimensions: ["date", "landingPagePlusQueryString"],
    metrics: ["sessions", "engagedSessions"],
    limit: 10000,
  });
  for (const row of landing.rows) {
    const date = ga4Date(row.dimensionValues[0] ?? "");
    const page = row.dimensionValues[1] ?? "/";
    persistGa4Landing(
      db,
      siteId,
      date,
      page,
      row.metricValues[0] ?? 0,
      row.metricValues[1] ?? 0,
    );
  }
  return n;
}

function ga4Date(raw: string): string {
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}
