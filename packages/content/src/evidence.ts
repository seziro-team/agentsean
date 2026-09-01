import type { EvidenceTier } from "./types.js";

/**
 * Phase 7 ships the full ladder and power calculations. Until then every
 * content change reports E: applied, not measurable. Claiming a click recovery
 * from a rewrite is statistically unsupported on typical agency sites.
 */
export const EVIDENCE_MEANING: Record<EvidenceTier, string> = {
  A: "Controlled experiment with a matched cohort, pre-registered, sufficient power",
  B: "Matched-cohort observational, effect exceeds MDE",
  C: "Pre/post with a Google-update annotation join, effect exceeds MDE",
  D: "Directional signal only, below MDE",
  E: "Applied; not measurable at this site's traffic volume",
};

export const DEFAULT_EVIDENCE_TIER: EvidenceTier = "E";

export function evidenceForContentChange(): EvidenceTier {
  return DEFAULT_EVIDENCE_TIER;
}
