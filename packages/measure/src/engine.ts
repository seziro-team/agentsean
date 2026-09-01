import { eq } from "drizzle-orm";
import { gscDaily, gscPageDaily, pages, type SqliteDatabase } from "@agentsean/db";
import { persistWaterfall, waterfallFromSite } from "@agentsean/google";
import { sitePowerBrief } from "./power.js";
import { analyzeExperiment, type AnalysisResult } from "./analyze.js";
import { backfillUnlabelledChanges, headline, listClaims } from "./claims.js";
import {
  getExperiment,
  listCohortUrls,
  listExperiments,
  seedDataAnomalies,
} from "./persist.js";
import type { ClaimRecord, PageSeries, PowerBrief } from "./types.js";
import type { WaterfallResult } from "@agentsean/google";

export type MeasureJobResult = {
  siteId: string;
  power: PowerBrief;
  waterfall: WaterfallResult | null;
  analysed: AnalysisResult[];
  claims: ClaimRecord[];
  headline: string;
  backfilled: number;
};

function addDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function monthlyClicksForSite(db: SqliteDatabase, siteId: string): number {
  const rows = db.select().from(gscDaily).where(eq(gscDaily.siteId, siteId)).all();
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (r.searchType !== "web") continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.clicks);
  }
  if (byDate.size === 0) return 0;
  let sum = 0;
  for (const v of byDate.values()) sum += v;
  return sum * (30 / byDate.size);
}

export function seriesForUrls(
  db: SqliteDatabase,
  siteId: string,
  urls: string[],
  preStart: string,
  preEnd: string,
  postStart: string,
  postEnd: string,
): PageSeries[] {
  const rows = db
    .select()
    .from(gscPageDaily)
    .where(eq(gscPageDaily.siteId, siteId))
    .all();
  const out: PageSeries[] = [];
  for (const url of urls) {
    let pre = 0;
    let post = 0;
    for (const r of rows) {
      if (r.page !== url || r.searchType !== "web") continue;
      if (r.date >= preStart && r.date <= preEnd) pre += r.clicks;
      if (r.date >= postStart && r.date <= postEnd) post += r.clicks;
    }
    out.push({ url, preClicks: pre, postClicks: post });
  }
  return out;
}

export function runMeasureJob(
  db: SqliteDatabase,
  opts: { siteId: string; now?: Date | undefined },
): MeasureJobResult {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  seedDataAnomalies(db);
  const monthly = monthlyClicksForSite(db, opts.siteId);
  const pageCount = db
    .select()
    .from(pages)
    .where(eq(pages.siteId, opts.siteId))
    .all().length;
  const power = sitePowerBrief({ monthlyClicks: monthly, pageCount });
  const windowEnd = addDays(today, -3);
  const windowStart = addDays(windowEnd, -27);
  let waterfall: WaterfallResult | null = null;
  try {
    waterfall = waterfallFromSite(db, opts.siteId, windowStart, windowEnd);
    persistWaterfall(db, opts.siteId, waterfall, now);
  } catch {
    waterfall = null;
  }

  const analysed: AnalysisResult[] = [];
  for (const exp of listExperiments(db, opts.siteId)) {
    if (
      exp.status !== "running" &&
      exp.status !== "planned" &&
      exp.status !== "analysing"
    )
      continue;
    if (exp.status === "planned") continue;
    const stored = getExperiment(db, exp.id);
    if (!stored) continue;
    const urls = listCohortUrls(db, exp.id);
    const treatment = seriesForUrls(
      db,
      opts.siteId,
      urls.treatment,
      stored.preStart,
      stored.preEnd,
      stored.postStart,
      stored.plannedEnd,
    );
    const control = seriesForUrls(
      db,
      opts.siteId,
      urls.control,
      stored.preStart,
      stored.preEnd,
      stored.postStart,
      stored.plannedEnd,
    );
    const reserve = seriesForUrls(
      db,
      opts.siteId,
      urls.reserve,
      stored.preStart,
      stored.preEnd,
      stored.postStart,
      stored.plannedEnd,
    );
    analysed.push(
      analyzeExperiment(db, {
        experimentId: exp.id,
        now,
        treatment,
        control,
        reserve,
      }),
    );
  }

  const backfilled = backfillUnlabelledChanges(db, opts.siteId, now, {
    monthlyClicks: monthly,
    pageCount,
  });
  const claims = listClaims(db, opts.siteId);
  return {
    siteId: opts.siteId,
    power,
    waterfall,
    analysed,
    claims,
    headline: headline(claims).line,
    backfilled,
  };
}
