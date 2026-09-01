import { changepointsOverlapping } from "@agentsean/google";
import type { SqliteDatabase } from "@agentsean/db";
import { assignEvidenceTier, claimCausation, statementFor, TIER_A_MDE_MAX, UNDERPOWERED_MDE } from "./ladder.js";
import { estimateLift } from "./estimator.js";
import { suppress } from "./suppress.js";
import { guardPeeking } from "./peek.js";
import { getExperiment, overlappingAnomalies, saveClaim, saveResult, setExperimentStatus } from "./persist.js";
import { splitMde, prePostMde } from "./power.js";
import type { AnalysisInput, EvidenceTier, ExperimentDesign } from "./types.js";

export type AnalysisResult = {
  experimentId: string;
  peeking: boolean;
  provisional: boolean;
  reason: string | null;
  evidenceTier: EvidenceTier | null;
  causationClaimed: boolean;
  statement: string;
  lift: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  probPositive: number | null;
  realisedMde: number | null;
  suppressedBy: string[];
};

export function analyzeExperiment(db: SqliteDatabase, input: AnalysisInput): AnalysisResult {
  const exp = getExperiment(db, input.experimentId);
  if (!exp) throw new Error(`unknown experiment ${input.experimentId}`);
  const peek = guardPeeking(exp.plannedEnd, input.now, exp.peekingBlocked === 1);
  const metric = input.metric ?? exp.primaryMetric;
  const hasControl = input.control.length > 0 && exp.design !== "uncontrolled";
  const incidents = changepointsOverlapping(db, exp.preStart, exp.plannedEnd);
  const ranking = incidents.some((c) => /core|spam|ranking|update/i.test(c.title) || c.kind === "RANKING_UPDATE");
  const anomalies = input.overlappingAnomalies ?? overlappingAnomalies(db, exp.preStart, exp.plannedEnd);
  const realisedMde = hasControl
    ? splitMde({
        monthlyClicks: monthlyFromSeries(input.treatment, input.control),
        pageCount: Math.max(input.treatment.length + input.control.length, 2),
        pagesPerArm: Math.max(input.control.length, 1),
      })
    : prePostMde(56);
  const rules = suppress({
    metric,
    preStart: exp.preStart,
    plannedEnd: exp.plannedEnd,
    hasControl,
    plannedMde: exp.plannedMde,
    now: input.now,
    overlappingAnomalies: anomalies,
    overlappingRankingUpdate: ranking,
    treatment: input.treatment,
    control: input.control,
    reserve: input.reserve,
  });

  if (!peek.allowed) {
    const statement = peek.reason;
    return {
      experimentId: exp.id,
      peeking: true,
      provisional: true,
      reason: peek.reason,
      evidenceTier: null,
      causationClaimed: false,
      statement,
      lift: null,
      ciLow: null,
      ciHigh: null,
      probPositive: null,
      realisedMde,
      suppressedBy: rules.includes("S9") ? rules : ["S9", ...rules],
    };
  }

  const est =
    input.treatment.length > 0
      ? estimateLift(input.treatment, hasControl ? input.control : zeroControl(input.treatment), {
          seed: exp.randomisationSeed,
        })
      : null;
  const lift = est?.lift ?? null;
  const tier = assignEvidenceTier({
    applied: true,
    preRegistered: true,
    design: exp.design as ExperimentDesign,
    hasControl,
    powerOk: realisedMde <= TIER_A_MDE_MAX,
    underpowered: exp.plannedMde > UNDERPOWERED_MDE || rules.includes("S8"),
    peeking: false,
    suppressed: rules,
    lift,
    realisedMde,
    googleUpdateJoined: true,
  });
  const cause = claimCausation(tier);
  const causationClaimed = cause.allowed && est !== null && est.ciLow > 0;
  const statement = peekingOrStatement(tier, {
    lift,
    realisedMde,
    incidentTitles: incidents.map((c) => c.title),
  });

  saveResult(db, exp.id, {
    metric,
    pointEstimate: lift,
    ciLow: est?.ciLow ?? null,
    ciHigh: est?.ciHigh ?? null,
    ciLevel: est?.ciLevel ?? null,
    probPositive: est?.probPositive ?? null,
    realisedMde,
    nBoot: est?.nBoot ?? null,
    suppressedBy: rules,
    evidenceTier: tier,
    statement,
    causationClaimed,
    analysedAt: input.now.toISOString(),
  });
  setExperimentStatus(db, exp.id, "concluded", {
    evidenceTier: tier,
    concludedAt: input.now.toISOString(),
  });
  saveClaim(db, {
    siteId: exp.siteId,
    changeId: null,
    experimentId: exp.id,
    evidenceTier: tier,
    statement,
    metric,
    causationClaimed,
    refusedReason: causationClaimed ? null : cause.reason,
    createdAt: input.now.toISOString(),
  });

  return {
    experimentId: exp.id,
    peeking: false,
    provisional: false,
    reason: null,
    evidenceTier: tier,
    causationClaimed,
    statement,
    lift,
    ciLow: est?.ciLow ?? null,
    ciHigh: est?.ciHigh ?? null,
    probPositive: est?.probPositive ?? null,
    realisedMde,
    suppressedBy: rules,
  };
}

function peekingOrStatement(
  tier: EvidenceTier,
  opts: { lift: number | null; realisedMde: number | null; incidentTitles: string[] },
): string {
  return statementFor(tier, {
    lift: opts.lift,
    realisedMde: opts.realisedMde,
    incidentTitles: opts.incidentTitles,
  });
}

function monthlyFromSeries(
  treatment: AnalysisInput["treatment"],
  control: AnalysisInput["control"],
): number {
  let clicks = 0;
  for (const r of treatment) clicks += r.preClicks;
  for (const r of control) clicks += r.preClicks;
  return clicks * (30 / 56);
}

function zeroControl(treatment: AnalysisInput["treatment"]): AnalysisInput["control"] {
  return treatment.map((r) => ({ url: `control:${r.url}`, preClicks: r.preClicks, postClicks: r.preClicks }));
}
