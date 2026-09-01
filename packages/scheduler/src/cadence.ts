import type { JobKind } from "./types.js";
import { JOB_KINDS } from "./types.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/**
 * Default cadences from PLAN Phase 4.
 * Rank tracking is weekly: daily 200-keyword tracking is ~$3.60/mo (45% of $8).
 */
export const CADENCES: Record<JobKind, { everyMs: number; label: string }> = {
  crawl: { everyMs: WEEK_MS, label: "weekly crawl" },
  gsc_sync: { everyMs: DAY_MS, label: "daily GSC / GA4 sync" },
  cwv: { everyMs: WEEK_MS, label: "weekly CrUX / PSI" },
  rank_check: { everyMs: WEEK_MS, label: "weekly rank check" },
  keywords: { everyMs: WEEK_MS, label: "weekly keyword clusters" },
  content: { everyMs: DAY_MS, label: "daily content tasks (T2 cap)" },
  measure: { everyMs: DAY_MS, label: "daily measurement / experiment analysis" },
  surfaces: { everyMs: 30 * DAY_MS, label: "monthly AI visibility / local / mentions" },
  plan_and_apply: { everyMs: DAY_MS, label: "plan and auto-apply T1/T2" },
};

export function isoWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function periodBucket(kind: JobKind, now: Date): string {
  if (kind === "surfaces") return now.toISOString().slice(0, 7);
  if (CADENCES[kind].everyMs >= WEEK_MS) return isoWeek(now);
  return now.toISOString().slice(0, 10);
}

export function idempotencyKey(siteId: string, kind: JobKind, now: Date): string {
  return `${siteId}:${kind}:${periodBucket(kind, now)}`;
}

export function isJobKind(value: string): value is JobKind {
  return (JOB_KINDS as readonly string[]).includes(value);
}
