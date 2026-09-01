import type { Estimate, PageSeries } from "./types.js";

export const DEFAULT_BOOT = 2000;
export const DEFAULT_CI_LEVEL = 0.95;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sumClicks(rows: PageSeries[], field: "preClicks" | "postClicks"): number {
  let s = 0;
  for (const r of rows) s += r[field];
  return s;
}

/**
 * Click-weighted log ratio-of-ratios:
 * log(post_T / pre_T) − log(post_C / pre_C).
 * Continuity correction of 0.5 so zeros do not explode.
 */
export function logRatioOfRatios(
  treatment: PageSeries[],
  control: PageSeries[],
): number {
  const preT = sumClicks(treatment, "preClicks") + 0.5;
  const postT = sumClicks(treatment, "postClicks") + 0.5;
  const preC = sumClicks(control, "preClicks") + 0.5;
  const postC = sumClicks(control, "postClicks") + 0.5;
  return Math.log(postT / preT) - Math.log(postC / preC);
}

export function relativeLift(logEstimate: number): number {
  return Math.exp(logEstimate) - 1;
}

function resample(rows: PageSeries[], rng: () => number): PageSeries[] {
  if (rows.length === 0) return [];
  const out: PageSeries[] = [];
  for (let i = 0; i < rows.length; i++) {
    const idx = Math.floor(rng() * rows.length);
    out.push(rows[idx]!);
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * (sorted.length - 1))),
  );
  return sorted[i]!;
}

export function estimateLift(
  treatment: PageSeries[],
  control: PageSeries[],
  opts?: {
    nBoot?: number | undefined;
    seed?: number | undefined;
    ciLevel?: number | undefined;
  },
): Estimate {
  const nBoot = opts?.nBoot ?? DEFAULT_BOOT;
  const ciLevel = opts?.ciLevel ?? DEFAULT_CI_LEVEL;
  const seed = opts?.seed ?? 1;
  const pointLog = logRatioOfRatios(treatment, control);
  const lift = relativeLift(pointLog);
  if (treatment.length === 0 || control.length === 0) {
    return {
      lift,
      ciLow: lift,
      ciHigh: lift,
      ciLevel,
      probPositive: lift > 0 ? 1 : 0,
      nBoot: 0,
    };
  }
  const rng = mulberry32(seed);
  const samples: number[] = [];
  let positive = 0;
  for (let i = 0; i < nBoot; i++) {
    const t = resample(treatment, rng);
    const c = resample(control, rng);
    const v = relativeLift(logRatioOfRatios(t, c));
    samples.push(v);
    if (v > 0) positive++;
  }
  samples.sort((a, b) => a - b);
  const alpha = (1 - ciLevel) / 2;
  return {
    lift,
    ciLow: quantile(samples, alpha),
    ciHigh: quantile(samples, 1 - alpha),
    ciLevel,
    probPositive: positive / nBoot,
    nBoot,
  };
}

export function ciSpansZero(est: Estimate): boolean {
  return est.ciLow <= 0 && est.ciHigh >= 0;
}
