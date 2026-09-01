import { eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import { findings, gscConnections, pages, settings, sites } from "@agentsean/db";
import {
  executeAction,
  loadGitConnection,
  planTitleActions,
  saveAction,
  type SiteAdapter,
} from "@agentsean/actions";
import { createGitAdapter } from "@agentsean/adapter-git";
import { adapterForSite } from "@agentsean/adapter-factory";
import { buildReport, flattenForDb } from "@agentsean/analyzers";
import { crawlSite, persistCrawl, persistFindings, type CrawlCheckpoint } from "@agentsean/crawler";
import { loadAuditExtras, syncGoogle } from "@agentsean/google";
import type { CredentialStore } from "@agentsean/credentials";
import { loadLlmConfig } from "@agentsean/llm";
import { runContentJob } from "@agentsean/content";
import {
  createBingClient,
  createProviderStack,
  loadProviderKeys,
} from "@agentsean/providers";
import {
  createHashEmbeddings,
  loadGscQueries,
  runKeywordsJob,
  runRankCheck,
} from "@agentsean/keywords";
import { runMeasureJob } from "@agentsean/measure";
import { runSurfacesJob } from "@agentsean/surfaces";
import type { HandlerContext, Job, JobHandler, JobKind } from "./types.js";

function settingNumber(db: SqliteDatabase, key: string, fallback: number): number {
  const raw = db.select().from(settings).where(eq(settings.key, key)).get()?.value;
  if (raw === undefined || raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export type HandlerDeps = {
  db: SqliteDatabase;
  store?: CredentialStore | undefined;
  fetch?: typeof fetch | undefined;
  approvalKey: Buffer;
  crawlImpl?: typeof crawlSite | undefined;
  syncImpl?: typeof syncGoogle | undefined;
  adapterFor?: ((siteId: string) => SiteAdapter | null) | undefined;
};

function originOf(job: Job, db: SqliteDatabase): string | null {
  const fromPayload = job.payload["origin"];
  if (typeof fromPayload === "string") return fromPayload;
  if (!job.siteId) return null;
  return db.select().from(sites).where(eq(sites.id, job.siteId)).get()?.origin ?? null;
}

function defaultAdapterFor(deps: HandlerDeps): (siteId: string) => SiteAdapter | null {
  return (siteId) => {
    if (deps.adapterFor) return deps.adapterFor(siteId);
    try {
      return adapterForSite(deps.db, siteId, deps.fetch ? { fetch: deps.fetch } : undefined);
    } catch {
      const cfg = loadGitConnection(deps.db, siteId) ?? {};
      const repoPath = typeof cfg["repoPath"] === "string" ? cfg["repoPath"] : null;
      if (!repoPath) return null;
      const token = typeof cfg["token"] === "string" ? cfg["token"] : undefined;
      return createGitAdapter({
        repoPath,
        ...(token ? { token } : {}),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
    }
  };
}

async function handleCrawl(
  deps: HandlerDeps,
  job: Job,
  ctx: HandlerContext,
): Promise<unknown> {
  const origin = originOf(job, deps.db);
  if (!origin) throw new Error("crawl job missing origin");
  const resumeRaw = job.payload["checkpoint"];
  const resume =
    resumeRaw && typeof resumeRaw === "object"
      ? (resumeRaw as CrawlCheckpoint)
      : undefined;
  const maxPages = typeof job.payload["maxPages"] === "number" ? job.payload["maxPages"] : 5000;
  const crawlId = typeof job.payload["crawlId"] === "string" ? job.payload["crawlId"] : undefined;
  const crawl = deps.crawlImpl ?? crawlSite;
  const result = await crawl({
    startUrl: origin,
    maxPages,
    render: job.payload["render"] !== false,
    ...(resume ? { resume } : {}),
    onCheckpoint: (cp) => {
      ctx.checkpoint({ checkpoint: cp });
    },
    checkpointEvery: 10,
  });
  const persisted = await persistCrawl(deps.db, result, undefined, {
    ...(crawlId ? { crawlId } : {}),
    status: result.aborted || result.truncated ? "running" : "complete",
  });
  ctx.checkpoint({ checkpoint: result.checkpoint, crawlId: persisted.crawlId });
  if (result.aborted || result.truncated) {
    throw new Error(
      result.aborted ? "crawl aborted; will resume" : "crawl truncated; will resume",
    );
  }
  const extras = loadAuditExtras(deps.db, persisted.siteId);
  const elapsedMs = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
  const report = buildReport(result, Number.isFinite(elapsedMs) ? elapsedMs : 0, extras);
  persistFindings(deps.db, persisted.siteId, flattenForDb(persisted.siteId, report.findings));
  const scoreKey = `score:${persisted.siteId}`;
  const scoreJson = JSON.stringify({
    value: report.score.value,
    version: report.score.version,
    band: report.score.band,
  });
  const existingScore = deps.db.select().from(settings).where(eq(settings.key, scoreKey)).get();
  const ts = new Date().toISOString();
  if (existingScore) {
    deps.db.update(settings).set({ value: scoreJson, updatedAt: ts }).where(eq(settings.key, scoreKey)).run();
  } else {
    deps.db.insert(settings).values({ key: scoreKey, value: scoreJson, updatedAt: ts }).run();
  }
  if (!ctx.halted) {
    await planAndMaybeApply(deps, persisted.siteId, origin, ctx.halted, ctx.now);
  }
  return {
    siteId: persisted.siteId,
    crawlId: persisted.crawlId,
    pages: result.pagesSeen,
    findings: report.findings.length,
    score: report.score.value,
  };
}

async function planAndMaybeApply(
  deps: HandlerDeps,
  siteId: string,
  origin: string,
  halted: boolean,
  now: Date,
): Promise<{ planned: number; applied: number; queued: number; rejected: number }> {
  const pageRows = deps.db.select().from(pages).where(eq(pages.siteId, siteId)).all();
  const findingRows = deps.db.select().from(findings).where(eq(findings.siteId, siteId)).all();
  const planned = planTitleActions({
    siteId,
    origin,
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
  const adapter = defaultAdapterFor(deps)(siteId);
  let applied = 0;
  let queued = 0;
  let rejected = 0;
  let runApplied = 0;
  for (const action of planned) {
    if (!adapter) {
      saveAction(deps.db, action, action.tier >= 3 ? "queued" : "proposed");
      if (action.tier >= 3) queued++;
      continue;
    }
    const result = await executeAction({
      db: deps.db,
      action,
      adapter,
      approvalKey: deps.approvalKey,
      halted,
      now,
      appliedThisRun: runApplied,
    });
    if (result.status === "applied") {
      applied++;
      runApplied++;
    } else if (result.status === "queued") queued++;
    else rejected++;
  }
  return { planned: planned.length, applied, queued, rejected };
}

export function createHandlers(deps: HandlerDeps): Record<JobKind, JobHandler> {
  return {
    async crawl(job, ctx) {
      ctx.heartbeat();
      return handleCrawl(deps, job, ctx);
    },
    async gsc_sync(job, ctx) {
      ctx.heartbeat();
      if (!deps.store || !job.siteId) return { skipped: true, reason: "no_google_store" };
      const connected = deps.db
        .select()
        .from(gscConnections)
        .where(eq(gscConnections.siteId, job.siteId))
        .get();
      if (!connected) return { skipped: true, reason: "gsc_not_connected" };
      const sync = deps.syncImpl ?? syncGoogle;
      return sync({
        db: deps.db,
        store: deps.store,
        siteId: job.siteId,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
    },
    async cwv(job, ctx) {
      ctx.heartbeat();
      if (!deps.store || !job.siteId) return { skipped: true, reason: "no_google_store" };
      const sync = deps.syncImpl ?? syncGoogle;
      return sync({
        db: deps.db,
        store: deps.store,
        siteId: job.siteId,
        runPsiAudit: true,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
    },
    async rank_check(job, ctx) {
      ctx.heartbeat();
      if (!job.siteId) return { skipped: true, reason: "no_site" };
      const origin = originOf(job, deps.db);
      if (!origin) return { skipped: true, reason: "no_origin" };
      const keys = await loadProviderKeys(deps.store);
      const gsc = loadGscQueries(deps.db, job.siteId);
      const stack = createProviderStack({
        keys,
        gsc: gsc.map((r) => ({
          query: r.query,
          source: "gsc",
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
      const queries = [...new Set(gsc.map((r) => r.query))].slice(0, 50);
      return runRankCheck({
        db: deps.db,
        siteId: job.siteId,
        origin,
        queries,
        stack,
        now: ctx.now,
        dailyBudgetUsd: settingNumber(deps.db, "budgetUsdDaily", 8),
      });
    },
    async keywords(job, ctx) {
      ctx.heartbeat();
      if (!job.siteId) return { skipped: true, reason: "no_site" };
      const origin = originOf(job, deps.db);
      if (!origin) return { skipped: true, reason: "no_origin" };
      const keys = await loadProviderKeys(deps.store);
      const gsc = loadGscQueries(deps.db, job.siteId);
      const stack = createProviderStack({
        keys,
        gsc: gsc.map((r) => ({
          query: r.query,
          source: "gsc",
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
      const bing = keys.bing
        ? createBingClient({
            apiKey: keys.bing,
            ...(deps.fetch ? { fetch: deps.fetch } : {}),
          })
        : null;
      return runKeywordsJob(deps.db, {
        siteId: job.siteId,
        origin,
        now: ctx.now,
        stack,
        gsc,
        embeddings: createHashEmbeddings(),
        dailyBudgetUsd: settingNumber(deps.db, "budgetUsdDaily", 8),
        ...(bing ? { expand: (seed: string) => bing.getRelatedKeywords(seed) } : {}),
      });
    },
    async measure(job, ctx) {
      ctx.heartbeat();
      if (!job.siteId) return { skipped: true, reason: "no_site" };
      return runMeasureJob(deps.db, { siteId: job.siteId, now: ctx.now });
    },
    async surfaces(job, ctx) {
      ctx.heartbeat();
      if (!job.siteId) return { skipped: true, reason: "no_site" };
      const origin = originOf(job, deps.db);
      if (!origin) return { skipped: true, reason: "no_origin" };
      const llm = await loadLlmConfig({
        ...(deps.store ? { store: deps.store } : {}),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
      return runSurfacesJob(deps.db, {
        siteId: job.siteId,
        origin,
        now: ctx.now,
        ...(llm?.generate ? { generate: llm.generate } : {}),
      });
    },
    async content(job, ctx) {
      ctx.heartbeat();
      if (!job.siteId) return { skipped: true, reason: "no_site" };
      const origin = originOf(job, deps.db);
      if (!origin) return { skipped: true, reason: "no_origin" };
      const llm = await loadLlmConfig({
        ...(deps.store ? { store: deps.store } : {}),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
      return runContentJob(deps.db, {
        siteId: job.siteId,
        origin,
        now: ctx.now,
        halted: ctx.halted,
        llm,
        adapter: defaultAdapterFor(deps)(job.siteId),
        approvalKey: deps.approvalKey,
      });
    },
    async plan_and_apply(job, ctx) {
      ctx.heartbeat();
      const origin = originOf(job, deps.db);
      if (!origin || !job.siteId) throw new Error("plan_and_apply missing site");
      return planAndMaybeApply(deps, job.siteId, origin, ctx.halted, ctx.now);
    },
  };
}
