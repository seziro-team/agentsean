import {
  DEFAULT_EVIDENCE_TIER,
  EVIDENCE_MEANING,
  EVIDENCE_TIERS,
  type EvidenceTier,
  type ExperimentDesign,
} from "./types.js";

export { EVIDENCE_MEANING, EVIDENCE_TIERS, DEFAULT_EVIDENCE_TIER };
export type { EvidenceTier };

/** Realised MDE at or below this is "sufficient power" for tier A. */
export const TIER_A_MDE_MAX = 0.25;
/** Rule S8: refuse to start a test whose MDE exceeds 40%. */
export const UNDERPOWERED_MDE = 0.4;

export type LadderInput = {
  applied: boolean;
  preRegistered: boolean;
  design: ExperimentDesign | null;
  hasControl: boolean;
  powerOk: boolean;
  underpowered: boolean;
  peeking: boolean;
  suppressed: string[];
  lift: number | null;
  realisedMde: number | null;
  googleUpdateJoined: boolean;
};

export type CausationDecision = {
  allowed: boolean;
  reason: string;
};

export function isEvidenceTier(value: string): value is EvidenceTier {
  return (EVIDENCE_TIERS as readonly string[]).includes(value);
}

/**
 * PLAN Phase 7 ladder. Most rows on agency sites land in E.
 * Causation is only allowed for A.
 */
export function assignEvidenceTier(input: LadderInput): EvidenceTier {
  if (input.peeking) return DEFAULT_EVIDENCE_TIER;
  if (input.underpowered || input.suppressed.includes("S8")) return "E";
  if (!input.applied && !input.preRegistered) return "E";

  const effect = input.lift;
  const mde = input.realisedMde;
  const exceedsMde =
    effect !== null && mde !== null && Number.isFinite(effect) && Number.isFinite(mde) && Math.abs(effect) >= mde;
  const directional =
    effect !== null && Number.isFinite(effect) && effect !== 0 && (mde === null || Math.abs(effect) < mde);

  if (
    input.hasControl &&
    input.preRegistered &&
    input.powerOk &&
    input.suppressed.filter((s) => s !== "S6").length === 0
  ) {
    return "A";
  }
  if (input.hasControl && !input.preRegistered && exceedsMde) return "B";
  if (!input.hasControl && input.googleUpdateJoined && exceedsMde) return "C";
  if (directional) return "D";
  if (input.applied) return "E";
  return DEFAULT_EVIDENCE_TIER;
}

export function claimCausation(tier: EvidenceTier): CausationDecision {
  if (tier === "A") {
    return {
      allowed: true,
      reason: EVIDENCE_MEANING.A,
    };
  }
  return {
    allowed: false,
    reason: `Causation is not supported at evidence tier ${tier}: ${EVIDENCE_MEANING[tier]}`,
  };
}

/** Per-URL "this change generated N clicks" must never exist. */
export function refuseUrlAttribution(url: string): never {
  throw new Error(
    `Refused per-URL attribution for ${url}. The unit of causal claim is the cohort, never the URL.`,
  );
}

export function statementFor(tier: EvidenceTier, opts?: {
  lift?: number | null | undefined;
  realisedMde?: number | null | undefined;
  incidentTitles?: string[] | undefined;
  monthlyClicks?: number | undefined;
  neededClicksPerArm?: number | undefined;
}): string {
  const liftPct = opts?.lift !== null && opts?.lift !== undefined ? pct(opts.lift) : null;
  const mdePct = opts?.realisedMde !== null && opts?.realisedMde !== undefined ? pct(opts.realisedMde) : null;
  switch (tier) {
    case "A":
      return liftPct
        ? `Measured in a pre-registered controlled experiment. Relative lift ${liftPct} on clicks. ${EVIDENCE_MEANING.A}.`
        : `Measured in a pre-registered controlled experiment. ${EVIDENCE_MEANING.A}.`;
    case "B":
      return `Matched-cohort observational comparison. Effect ${liftPct ?? "observed"} exceeds the MDE${mdePct ? ` (${mdePct})` : ""}. Not a pre-registered experiment.`;
    case "C": {
      const updates = opts?.incidentTitles?.length
        ? ` Google updates in the window: ${opts.incidentTitles.join("; ")}.`
        : " Google-update annotations are joined; other things also moved.";
      return `Clicks moved ${liftPct ?? "directionally"} after this change.${updates} We cannot isolate the change.`;
    }
    case "D":
      return `Directional signal only (${liftPct ?? "below the detectable floor"}). The test could only have detected changes larger than ${mdePct ?? "the MDE"}. Not a causal claim.`;
    case "E":
    default: {
      const need = opts?.neededClicksPerArm
        ? ` We'd need roughly ${Math.round(opts.neededClicksPerArm)} clicks per group over 8 weeks`
        : " We'd need roughly 1,900 clicks per group over 8 weeks";
      const have = opts?.monthlyClicks !== undefined ? ` and this site has ~${Math.round(opts.monthlyClicks)} clicks/month.` : ".";
      return `Applied. Not measurable at this site's traffic volume.${need}${have} This is true of every SEO tool; only Sean says so.`;
    }
  }
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}
