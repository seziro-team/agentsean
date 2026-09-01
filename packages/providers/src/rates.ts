import type { Capability, CostEstimate } from "./types.js";

/**
 * DataForSEO published rates (PLAN Phase 6). Quoted *before* the call.
 * SERP $0.60/1k standard queue · Keywords Data $0.06/task (≤1,000 keywords)
 * Labs $0.012/task · Backlinks $0.024/req + $0.000036/row · On-Page $0.15/1k.
 */
export const DFS_RATES = {
  serpPerKeyword: 0.6 / 1000,
  keywordsDataPerTask: 0.06,
  keywordsDataMaxKeywords: 1000,
  labsPerTask: 0.012,
  backlinksPerRequest: 0.024,
  backlinksPerRow: 0.000036,
  onPagePerPage: 0.15 / 1000,
} as const;

export const FREE_NOTE = "zero paid keys";

export function freeEstimate(
  provider: string,
  capability: Capability,
  operation: string,
  units = 1,
  notes?: string,
): CostEstimate {
  return {
    provider,
    capability,
    operation,
    units,
    unitUsd: 0,
    estimatedUsd: 0,
    free: true,
    ...(notes ? { notes } : {}),
  };
}

export function paidEstimate(opts: {
  provider: string;
  capability: Capability;
  operation: string;
  units: number;
  unitUsd: number;
  notes?: string;
}): CostEstimate {
  const estimatedUsd = roundUsd(opts.units * opts.unitUsd);
  return {
    provider: opts.provider,
    capability: opts.capability,
    operation: opts.operation,
    units: opts.units,
    unitUsd: opts.unitUsd,
    estimatedUsd,
    free: false,
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
}

export function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function keywordsDataTasks(keywordCount: number): number {
  return Math.max(1, Math.ceil(keywordCount / DFS_RATES.keywordsDataMaxKeywords));
}
