import {
  IMPRESSIONS_BUG_BEGIN,
  IMPRESSIONS_BUG_END,
  impressionsContaminated,
  num100Straddle,
} from "@agentsean/google";
import { UNDERPOWERED_MDE } from "./ladder.js";
import type { PageSeries, SuppressionRule } from "./types.js";
import { estimateLift } from "./estimator.js";

export type SuppressInput = {
  metric: string;
  preStart: string;
  plannedEnd: string;
  hasControl: boolean;
  plannedMde: number;
  now: Date;
  overlappingAnomalies?: Array<{ id: string; metrics: string[] }> | undefined;
  overlappingRankingUpdate?: boolean | undefined;
  treatment?: PageSeries[] | undefined;
  control?: PageSeries[] | undefined;
  reserve?: PageSeries[] | undefined;
  cohort404Share?: number | undefined;
  outOfBandEdits?: boolean | undefined;
};

export const SUPPRESSION_LABEL: Record<SuppressionRule, string> = {
  S1: "GSC data-anomaly window overlaps the outcome metric",
  S2: "Impressions logging error 2025-05-13 → 2026-04-27 (hard block)",
  S3: "&num=100 removal straddles the window (hard block on impressions/position)",
  S4: "No concurrent control — downgrade to applied, not measurable",
  S5: "Google ranking update overlapped an uncontrolled window",
  S6: "Google ranking update overlapped a controlled window (do not suppress; widen CI)",
  S7: "Spillover: control vs reserve differs",
  S8: "Underpowered (planned MDE > 40%)",
  S9: "Peeking: analysis requested before planned_end",
  S10: "Cohort drift: >10% of URLs 404/redirect/deindex",
  S11: "Out-of-band CMS edit on treatment or control pages",
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function suppress(input: SuppressInput): SuppressionRule[] {
  const rules: SuppressionRule[] = [];
  const metric = input.metric;
  const windowStart = input.preStart;
  const windowEnd = input.plannedEnd;

  if (input.overlappingAnomalies?.some((a) => a.metrics.includes(metric))) {
    rules.push("S1");
  }
  if (
    (metric === "impressions" || metric === "ctr" || metric === "position") &&
    impressionsContaminated(windowStart, windowEnd)
  ) {
    rules.push("S2");
  }
  if (
    (metric === "impressions" || metric === "position") &&
    num100Straddle(windowStart, windowEnd)
  ) {
    rules.push("S3");
  }
  if (!input.hasControl) {
    rules.push("S4");
    if (input.overlappingRankingUpdate) rules.push("S5");
  } else if (input.overlappingRankingUpdate) {
    rules.push("S6");
  }
  if (input.hasControl && input.control && input.reserve && input.reserve.length > 0) {
    const spill = estimateLift(input.control, input.reserve, { nBoot: 400, seed: 7 });
    if (spill.probPositive > 0.9 || spill.probPositive < 0.1) rules.push("S7");
  }
  if (input.plannedMde > UNDERPOWERED_MDE) rules.push("S8");
  if (isoDate(input.now) < input.plannedEnd) rules.push("S9");
  if ((input.cohort404Share ?? 0) > 0.1) rules.push("S10");
  if (input.outOfBandEdits) rules.push("S11");
  return rules;
}

export { IMPRESSIONS_BUG_BEGIN, IMPRESSIONS_BUG_END };
