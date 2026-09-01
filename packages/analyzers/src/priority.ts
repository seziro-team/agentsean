import { getCheck } from "./catalogue.js";
import type { FindingDraft, PrioritizedFinding } from "./types.js";

export const PRIORITY_VERSION = "pr-1.0.0";

export const PRIORITY_FORMULA =
  "priority = severity × coverage × indexability × traffic × confidence ÷ effort";

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 100,
  high: 40,
  medium: 12,
  low: 4,
  insight: 1,
};

function effortFactor(tier: string): number {
  if (tier === "T1" || tier === "T0") return 1.0;
  if (tier === "T2") return 1.3;
  if (tier === "T3") return 2.5;
  return 5.0;
}

export function prioritize(
  findings: FindingDraft[],
  totalUrls: number,
  opts?: {
    gscClicksByUrl?: Record<string, number> | undefined;
    indexableUrls?: Set<string> | undefined;
  },
): PrioritizedFinding[] {
  const n = Math.max(1, totalUrls);
  return findings
    .map((f) => {
      const check = getCheck(f.ruleId);
      const severity = SEVERITY_WEIGHT[f.severity] ?? 12;
      const affected = Math.max(1, f.urls.length);
      const coverage = 0.2 + 0.8 * Math.min(1, affected / Math.max(25, 0.05 * n));
      let indexableAffected = affected;
      if (opts?.indexableUrls) {
        indexableAffected = f.urls.filter((u) => opts.indexableUrls!.has(u)).length;
      }
      const indexability = 0.15 + 0.85 * (indexableAffected / affected);
      let clicks = 0;
      if (opts?.gscClicksByUrl) {
        for (const u of f.urls) clicks += opts.gscClicksByUrl[u] ?? 0;
      }
      const traffic = Math.min(4, 1 + Math.log10(1 + clicks));
      const confidence = f.confidence;
      const effort = effortFactor(check?.autonomyTier ?? f.autonomyTier);
      const priority =
        (severity * coverage * indexability * traffic * confidence) / effort;
      return {
        ...f,
        priority,
        coverage,
        indexability,
        traffic,
        effort,
      };
    })
    .toSorted((a, b) => b.priority - a.priority);
}
