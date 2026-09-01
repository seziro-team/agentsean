import { DEFAULT_EVIDENCE_TIER, type PowerBrief } from "./types.js";
import { UNDERPOWERED_MDE } from "./ladder.js";

/** PLAN / gap-04 Monte-Carlo floors. Traffic does not move pre/post MDE. */
export const PRE_POST_MDE_28D = 0.8;
export const PRE_POST_MDE_56D = 0.55;
export const PRE_POST_MDE_91D = 0.41;

/** 200 pages, 2,000 clicks/mo, 100 vs 100, 56 days → ~18% (PLAN). */
export const SPLIT_MDE_2K_56D = 0.18;

/** Daily peeking vs fixed-horizon null false-positive rate. */
export const PEEKING_FP_FIXED = 0.047;
export const PEEKING_FP_DAILY = 0.229;

/** Naive α=0.05 tests: P(≥1 false win) at 20 changes/month. */
export const FABRICATED_WIN_20 = 0.64;

export const SEARCHPILOT_MIN_SESSIONS = 30_000;
export const SEMRUSH_MIN_CLICKS_100D = 100_000;
export const DEFAULT_WINDOW_DAYS = 56;
export const DEFAULT_SPLIT = 0.5;

const CLICKS_ARM_MDE: Array<[number, number]> = [
  [100, 0.75],
  [250, 0.43],
  [500, 0.31],
  [1000, 0.22],
  [1867, 0.18],
  [2500, 0.16],
  [5000, 0.15],
  [10_000, 0.12],
  [25_000, 0.11],
];

const PAGES_ARM_MDE: Array<[number, number]> = [
  [10, 0.25],
  [25, 0.2],
  [50, 0.17],
  [100, 0.15],
  [250, 0.115],
  [500, 0.099],
];

function lerpTable(table: Array<[number, number]>, x: number): number {
  if (x <= table[0]![0]) return table[0]![1];
  const last = table[table.length - 1]!;
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i - 1]!;
    const [x2, y2] = table[i]!;
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }
  return last[1];
}

/** Pre/post MDE is a function of window length, not traffic. */
export function prePostMde(windowDays: number): number {
  if (windowDays <= 28) return PRE_POST_MDE_28D;
  if (windowDays <= 56) {
    const t = (windowDays - 28) / 28;
    return PRE_POST_MDE_28D + t * (PRE_POST_MDE_56D - PRE_POST_MDE_28D);
  }
  if (windowDays <= 91) {
    const t = (windowDays - 56) / 35;
    return PRE_POST_MDE_56D + t * (PRE_POST_MDE_91D - PRE_POST_MDE_56D);
  }
  return PRE_POST_MDE_91D;
}

export function clicksPerArmInWindow(
  monthlyClicks: number,
  windowDays: number,
  pagesPerArm: number,
  sitePages: number,
): number {
  const share = sitePages > 0 ? pagesPerArm / sitePages : DEFAULT_SPLIT;
  return monthlyClicks * (windowDays / 30) * share;
}

/**
 * Concurrent-control MDE. Binding constraints are clicks/arm and pages/arm;
 * the floor is ~11% even at huge traffic with only 100 pages/arm.
 */
export function splitMde(opts: {
  monthlyClicks: number;
  pageCount: number;
  windowDays?: number | undefined;
  pagesPerArm?: number | undefined;
}): number {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const pagesPerArm = opts.pagesPerArm ?? Math.floor(opts.pageCount / 2);
  const clicks = clicksPerArmInWindow(
    opts.monthlyClicks,
    windowDays,
    pagesPerArm,
    opts.pageCount,
  );
  const fromClicks = lerpTable(CLICKS_ARM_MDE, clicks);
  const fromPages = lerpTable(PAGES_ARM_MDE, Math.max(pagesPerArm, 1));
  let mde = Math.max(fromClicks, fromPages);
  if (windowDays < 56) {
    const scale = prePostMde(windowDays) / PRE_POST_MDE_56D;
    mde *= Math.min(scale, 1.6);
  } else if (windowDays > 56) {
    const scale = prePostMde(windowDays) / PRE_POST_MDE_56D;
    mde *= Math.max(scale, 0.7);
  }
  return Math.round(mde * 1000) / 1000;
}

export function naiveFalseWinProbability(testsPerMonth: number, alpha = 0.05): number {
  if (testsPerMonth <= 0) return 0;
  return 1 - (1 - alpha) ** testsPerMonth;
}

export function sitePowerBrief(opts: {
  monthlyClicks: number;
  pageCount: number;
  windowDays?: number | undefined;
}): PowerBrief {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const pagesPerArm = Math.max(1, Math.floor(opts.pageCount / 2));
  const pre = prePostMde(windowDays);
  const split = splitMde({
    monthlyClicks: opts.monthlyClicks,
    pageCount: Math.max(opts.pageCount, 2),
    windowDays,
    pagesPerArm,
  });
  const belowIndustryBar =
    opts.monthlyClicks < SEARCHPILOT_MIN_SESSIONS ||
    opts.monthlyClicks * (100 / 30) < SEMRUSH_MIN_CLICKS_100D;
  const underpowered = split > UNDERPOWERED_MDE && pre > UNDERPOWERED_MDE;
  const needed = 1900;
  const message = belowIndustryBar
    ? `Most changes on this site will land in evidence tier E (applied, not measurable). That is true of every SEO tool; only Sean says so. A ${opts.pageCount || 200}-page site with ${Math.round(opts.monthlyClicks)} clicks/month still needs ~${pct(split)} lift over ${windowDays} days for 80% power with a concurrent control. SearchPilot wants ${SEARCHPILOT_MIN_SESSIONS.toLocaleString()} organic sessions/month; Semrush SplitSignal wants 300 pages and ${SEMRUSH_MIN_CLICKS_100D.toLocaleString()} clicks per 100 days. Pre/post MDE is ~${pct(pre)} regardless of traffic. We'd need roughly ${needed} clicks per group over 8 weeks.`
    : `Split-test MDE ≈ ${pct(split)} over ${windowDays} days with ${pagesPerArm} pages/arm. Pre/post MDE remains ~${pct(pre)}.`;
  return {
    monthlyClicks: opts.monthlyClicks,
    pageCount: opts.pageCount,
    windowDays,
    pagesPerArm,
    prePostMde: pre,
    splitMde: split,
    belowIndustryBar,
    underpowered,
    typicalTier: DEFAULT_EVIDENCE_TIER,
    message,
  };
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}
