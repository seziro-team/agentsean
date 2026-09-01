import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import {
  ga4Connections,
  ga4Daily,
  gscDaily,
  gscQueryDaily,
  reconciliationWaterfall,
} from "@agentsean/db";
import {
  DISCREPANCY_CAUSES,
  EU_GA4_INVISIBLE_HIGH,
  EU_GA4_INVISIBLE_LOW,
  GSC_ANONYMIZED_SHARE,
  isEuTimeZone,
  type DiscrepancyCause,
} from "./causes.js";
import { computeResidual } from "./reconcile.js";

export type WaterfallStep = DiscrepancyCause & {
  applies: boolean;
  estimatedShare: number | null;
  detail: string;
};

export type WaterfallResult = {
  windowStart: string;
  windowEnd: string;
  gscClicks: number;
  queryDimensionClicks: number;
  ga4OrganicSessions: number;
  residual: number;
  residualPct: number | null;
  anonymizedQueryShare: number;
  euInvisibleShare: number | null;
  euProperty: boolean;
  steps: WaterfallStep[];
  notes: string;
};

export type WaterfallInput = {
  gscClicks: number;
  queryDimensionClicks: number;
  ga4OrganicSessions: number;
  windowStart: string;
  windowEnd: string;
  timeZone?: string | null | undefined;
  sampled?: boolean | undefined;
  thresholded?: boolean | undefined;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Named 17-cause waterfall. It explains the residual; it does not force
 * GA4 and GSC to match. The leftover is the honest number.
 */
export function buildWaterfall(input: WaterfallInput): WaterfallResult {
  const gscClicks = Math.max(0, input.gscClicks);
  const queryClicks = Math.max(0, input.queryDimensionClicks);
  const ga4 = Math.max(0, input.ga4OrganicSessions);
  const anonymized =
    gscClicks > 0 ? clamp01(1 - queryClicks / gscClicks) : GSC_ANONYMIZED_SHARE;
  const eu = isEuTimeZone(input.timeZone ?? null);
  const euShare = eu ? (EU_GA4_INVISIBLE_LOW + EU_GA4_INVISIBLE_HIGH) / 2 : null;
  const residualRow = computeResidual(gscClicks, ga4);
  const windowDays = daySpan(input.windowStart, input.windowEnd);

  const steps: WaterfallStep[] = DISCREPANCY_CAUSES.map((cause) => {
    switch (cause.code) {
      case "GSC_ANONYMIZED_QUERY":
        return step(cause, true, anonymized, `Query view covers ${pct(1 - anonymized)} of clicks.`);
      case "GA4_CONSENT_DENIED":
        return step(
          cause,
          eu,
          euShare,
          eu
            ? `EU/UK property: ${pct(EU_GA4_INVISIBLE_LOW)}–${pct(EU_GA4_INVISIBLE_HIGH)} of organic is permanently invisible in GA4.`
            : "Not flagged as an EU property timezone.",
        );
      case "DEF_TIMEZONE":
        return step(
          cause,
          true,
          windowDays >= 7 ? 0 : null,
          windowDays >= 7
            ? "Compared on a ≥7-day window; single-day timezone skew collapses."
            : "Window shorter than 7 days — timezone skew can dominate a single day.",
        );
      case "GA4_SAMPLING":
        return step(cause, Boolean(input.sampled), null, input.sampled ? "Sampled GA4 number — do not report without a warning." : "No sampling flag.");
      case "GA4_THRESHOLDING":
        return step(
          cause,
          Boolean(input.thresholded),
          null,
          input.thresholded ? "Thresholded GA4 number — hard gate." : "No thresholding flag.",
        );
      default:
        return step(cause, cause.alwaysPresent, null, cause.notes);
    }
  });

  const notes = [
    residualRow.notes,
    `Anonymized GSC queries ≈ ${pct(anonymized)} of clicks (industry 46.8%).`,
    eu
      ? `EU property: ${pct(EU_GA4_INVISIBLE_LOW)}–${pct(EU_GA4_INVISIBLE_HIGH)} of organic traffic is permanently invisible in GA4.`
      : "GA4 consent loss is the dominant extra gap on EU properties.",
    "The residual is the leftover after naming every structural cause. It is not a bug to fix.",
  ].join(" ");

  return {
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    gscClicks,
    queryDimensionClicks: queryClicks,
    ga4OrganicSessions: ga4,
    residual: residualRow.residual,
    residualPct: residualRow.residualPct,
    anonymizedQueryShare: anonymized,
    euInvisibleShare: euShare,
    euProperty: eu,
    steps,
    notes,
  };
}

function step(
  cause: DiscrepancyCause,
  applies: boolean,
  estimatedShare: number | null,
  detail: string,
): WaterfallStep {
  return Object.assign({}, cause, { applies, estimatedShare, detail });
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function daySpan(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function waterfallFromSite(
  db: SqliteDatabase,
  siteId: string,
  windowStart: string,
  windowEnd: string,
): WaterfallResult {
  const gsc = db.select().from(gscDaily).where(eq(gscDaily.siteId, siteId)).all();
  const queries = db.select().from(gscQueryDaily).where(eq(gscQueryDaily.siteId, siteId)).all();
  const ga4 = db.select().from(ga4Daily).where(eq(ga4Daily.siteId, siteId)).all();
  const conn = db.select().from(ga4Connections).where(eq(ga4Connections.siteId, siteId)).get();

  let gscClicks = 0;
  for (const row of gsc) {
    if (row.searchType !== "web") continue;
    if (row.date < windowStart || row.date > windowEnd) continue;
    gscClicks += row.clicks;
  }
  let queryClicks = 0;
  for (const row of queries) {
    if (row.searchType !== "web") continue;
    if (row.date < windowStart || row.date > windowEnd) continue;
    queryClicks += row.clicks;
  }
  let ga4Sessions = 0;
  for (const row of ga4) {
    if (row.date < windowStart || row.date > windowEnd) continue;
    ga4Sessions += row.organicSessions;
  }

  return buildWaterfall({
    gscClicks,
    queryDimensionClicks: queryClicks,
    ga4OrganicSessions: ga4Sessions,
    windowStart,
    windowEnd,
    timeZone: conn?.timeZone ?? null,
  });
}

export function persistWaterfall(
  db: SqliteDatabase,
  siteId: string,
  result: WaterfallResult,
  now = new Date(),
): void {
  const existing = db
    .select()
    .from(reconciliationWaterfall)
    .where(
      and(
        eq(reconciliationWaterfall.siteId, siteId),
        eq(reconciliationWaterfall.windowStart, result.windowStart),
        eq(reconciliationWaterfall.windowEnd, result.windowEnd),
      ),
    )
    .get();
  const values = {
    date: result.windowEnd,
    gscClicks: result.gscClicks,
    ga4OrganicSessions: result.ga4OrganicSessions,
    residual: result.residual,
    residualPct: result.residualPct,
    causesJson: JSON.stringify(result.steps),
    anonymizedQueryShare: result.anonymizedQueryShare,
    euInvisibleShare: result.euInvisibleShare,
    notes: result.notes,
    createdAt: now.toISOString(),
  };
  if (existing) {
    db.update(reconciliationWaterfall)
      .set(values)
      .where(eq(reconciliationWaterfall.id, existing.id))
      .run();
    return;
  }
  db.insert(reconciliationWaterfall)
    .values({
      id: randomUUID(),
      siteId,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      ...values,
    })
    .run();
}
