import {
  DEFAULT_EVIDENCE_TIER,
  EVIDENCE_MEANING,
  type EvidenceTier,
} from "@agentsean/measure";

export { DEFAULT_EVIDENCE_TIER, EVIDENCE_MEANING };
export type { EvidenceTier };

/**
 * Content publishes are Track B unless they sit inside a pre-registered
 * experiment. Unmeasured rewrites stay tier E — claiming a click recovery
 * from a rewrite is statistically unsupported on typical agency sites.
 */
export function evidenceForContentChange(): EvidenceTier {
  return DEFAULT_EVIDENCE_TIER;
}
