import type { SqliteDatabase } from "@agentsean/db";
import { pages } from "@agentsean/db";
import { eq } from "drizzle-orm";
import { UNDERPOWERED_MDE } from "./ladder.js";
import { splitMde, prePostMde, DEFAULT_WINDOW_DAYS } from "./power.js";
import { insertExperiment, seedDataAnomalies, setExperimentStatus, type StoredExperiment } from "./persist.js";
import type { ExperimentSpec } from "./types.js";

export type RegisterResult = {
  experiment: StoredExperiment;
  plannedMde: number;
  status: "planned" | "refused";
  reason: string | null;
};

function dayDiff(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return DEFAULT_WINDOW_DAYS;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function monthlyClicksFromMap(preClicks: Record<string, number> | undefined, windowDays: number): number {
  if (!preClicks) return 0;
  let sum = 0;
  for (const v of Object.values(preClicks)) sum += v;
  return sum * (30 / Math.max(windowDays, 1));
}

/**
 * Create the experiment *before* any change ships. Hypothesis, cohort
 * assignment, and analysis date are frozen at insert.
 */
export function registerExperiment(
  db: SqliteDatabase,
  spec: ExperimentSpec,
  now = new Date(),
): RegisterResult {
  seedDataAnomalies(db);
  if (spec.unit === ("url" as string)) {
    throw new Error("Experiment unit cannot be 'url'. The unit of causal claim is the cohort.");
  }
  const windowDays = dayDiff(spec.postStart, spec.plannedEnd);
  const pageCount = Math.max(
    spec.treatmentUrls.length + spec.controlUrls.length,
    db.select().from(pages).where(eq(pages.siteId, spec.siteId)).all().length,
    2,
  );
  const monthly = monthlyClicksFromMap(spec.preClicks, dayDiff(spec.preStart, spec.preEnd));
  const plannedMde =
    spec.design === "uncontrolled"
      ? prePostMde(windowDays)
      : splitMde({
          monthlyClicks: Math.max(monthly, 1),
          pageCount,
          windowDays,
          pagesPerArm: spec.controlUrls.length || Math.floor(pageCount / 2),
        });
  const underpowered = plannedMde > UNDERPOWERED_MDE;
  const status = underpowered ? "refused" : "planned";
  const id = insertExperiment(db, spec, plannedMde, status, now);
  const experiment = {
    id,
    siteId: spec.siteId,
    hypothesis: spec.hypothesis,
    interventionKind: spec.interventionKind,
    status,
    design: spec.design,
    unit: spec.unit,
    randomisationSeed: spec.randomisationSeed ?? 1,
    clusterKey: spec.clusterKey ?? null,
    preStart: spec.preStart,
    preEnd: spec.preEnd,
    postStart: spec.postStart,
    plannedEnd: spec.plannedEnd,
    primaryMetric: spec.primaryMetric ?? "clicks",
    secondaryMetric: null,
    plannedMde,
    powerTarget: spec.powerTarget ?? 0.8,
    alpha: spec.alpha ?? 0.05,
    evidenceTier: null,
    peekingBlocked: 1,
    createdAt: now.toISOString(),
    concludedAt: null,
  };
  return {
    experiment,
    plannedMde,
    status,
    reason: underpowered
      ? `Refused to start: planned MDE ${Math.round(plannedMde * 100)}% exceeds 40%. Marked not measurable by design.`
      : null,
  };
}

export function startExperiment(db: SqliteDatabase, registered: RegisterResult): RegisterResult {
  if (registered.status === "refused") return registered;
  setExperimentStatus(db, registered.experiment.id, "running");
  return {
    ...registered,
    experiment: { ...registered.experiment, status: "running" },
  };
}
