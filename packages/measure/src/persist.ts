import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  claims,
  cohortMembers,
  cohorts,
  dataAnomalies,
  experimentResults,
  experiments,
  type SqliteDatabase,
} from "@agentsean/db";
import type { ClaimRecord, EvidenceTier, ExperimentSpec } from "./types.js";
import { PlannedEndImmutableError } from "./peek.js";

export type StoredExperiment = {
  id: string;
  siteId: string;
  hypothesis: string;
  interventionKind: string;
  status: string;
  design: string;
  unit: string;
  randomisationSeed: number;
  clusterKey: string | null;
  preStart: string;
  preEnd: string;
  postStart: string;
  plannedEnd: string;
  primaryMetric: string;
  secondaryMetric: string | null;
  plannedMde: number;
  powerTarget: number;
  alpha: number;
  evidenceTier: string | null;
  peekingBlocked: number;
  createdAt: string;
  concludedAt: string | null;
};

const HARDCODED_ANOMALIES: Array<{
  id: string;
  description: string;
  startDate: string;
  endDate: string | null;
  metrics: string[];
  surfaces: string[];
  source: "hardcoded" | "google_official";
}> = [
  {
    id: "gsc-impressions-logging-error-2025",
    description: "GSC impressions logging error. Clicks unaffected.",
    startDate: "2025-05-13",
    endDate: "2026-04-27",
    metrics: ["impressions", "ctr", "position"],
    surfaces: ["web"],
    source: "google_official",
  },
  {
    id: "gsc-num100-removal-2025",
    description: "&num=100 parameter removed. Impression/position step-change.",
    startDate: "2025-09-12",
    endDate: "2025-09-12",
    metrics: ["impressions", "position"],
    surfaces: ["web"],
    source: "hardcoded",
  },
];

export function seedDataAnomalies(db: SqliteDatabase): number {
  let n = 0;
  for (const row of HARDCODED_ANOMALIES) {
    const existing = db
      .select()
      .from(dataAnomalies)
      .where(eq(dataAnomalies.id, row.id))
      .get();
    const values = {
      description: row.description,
      startDate: row.startDate,
      endDate: row.endDate,
      affectedMetrics: JSON.stringify(row.metrics),
      affectedSurfaces: JSON.stringify(row.surfaces),
      source: row.source,
    };
    if (existing) {
      db.update(dataAnomalies).set(values).where(eq(dataAnomalies.id, row.id)).run();
    } else {
      db.insert(dataAnomalies)
        .values({ id: row.id, ...values })
        .run();
    }
    n++;
  }
  return n;
}

export function insertExperiment(
  db: SqliteDatabase,
  spec: ExperimentSpec,
  plannedMde: number,
  status: string,
  now: Date,
): string {
  const id = randomUUID();
  const ts = now.toISOString();
  db.insert(experiments)
    .values({
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
      createdAt: ts,
      concludedAt: null,
    })
    .run();

  const arms: Array<{ arm: "treatment" | "control" | "reserve"; urls: string[] }> = [
    { arm: "treatment", urls: spec.treatmentUrls },
    { arm: "control", urls: spec.controlUrls },
    { arm: "reserve", urls: spec.reserveUrls ?? [] },
  ];
  for (const a of arms) {
    const cohortId = randomUUID();
    db.insert(cohorts).values({ id: cohortId, experimentId: id, arm: a.arm }).run();
    for (const url of a.urls) {
      db.insert(cohortMembers)
        .values({
          id: randomUUID(),
          cohortId,
          url,
          preClicks: spec.preClicks?.[url] ?? 0,
          preImpressions: spec.preImpressions?.[url] ?? 0,
          contentHashAtStart: spec.contentHashAtStart?.[url] ?? null,
        })
        .run();
    }
  }
  return id;
}

export function getExperiment(db: SqliteDatabase, id: string): StoredExperiment | null {
  const row = db.select().from(experiments).where(eq(experiments.id, id)).get();
  return row ?? null;
}

export function listExperiments(
  db: SqliteDatabase,
  siteId: string,
): StoredExperiment[] {
  return db.select().from(experiments).where(eq(experiments.siteId, siteId)).all();
}

export function setExperimentStatus(
  db: SqliteDatabase,
  id: string,
  status: string,
  extra?: {
    evidenceTier?: string | null | undefined;
    concludedAt?: string | null | undefined;
  },
): void {
  const patch: {
    status: string;
    evidenceTier?: string | null;
    concludedAt?: string | null;
  } = { status };
  if (extra && "evidenceTier" in extra) patch.evidenceTier = extra.evidenceTier ?? null;
  if (extra && "concludedAt" in extra) patch.concludedAt = extra.concludedAt ?? null;
  db.update(experiments).set(patch).where(eq(experiments.id, id)).run();
}

export function assertPlannedEndImmutable(
  current: StoredExperiment,
  nextPlannedEnd: string,
): void {
  if (current.status === "planned") return;
  if (current.plannedEnd !== nextPlannedEnd) throw new PlannedEndImmutableError();
}

export function saveResult(
  db: SqliteDatabase,
  experimentId: string,
  row: {
    metric: string;
    pointEstimate: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    ciLevel: number | null;
    probPositive: number | null;
    realisedMde: number | null;
    nBoot: number | null;
    suppressedBy: string[];
    evidenceTier: EvidenceTier;
    statement: string;
    causationClaimed: boolean;
    analysedAt: string;
  },
): void {
  const existing = db
    .select()
    .from(experimentResults)
    .where(eq(experimentResults.experimentId, experimentId))
    .get();
  const values = {
    metric: row.metric,
    pointEstimate: row.pointEstimate,
    ciLow: row.ciLow,
    ciHigh: row.ciHigh,
    ciLevel: row.ciLevel,
    probPositive: row.probPositive,
    realisedMde: row.realisedMde,
    nBoot: row.nBoot,
    suppressedBy: JSON.stringify(row.suppressedBy),
    evidenceTier: row.evidenceTier,
    statement: row.statement,
    causationClaimed: row.causationClaimed ? 1 : 0,
    analysedAt: row.analysedAt,
  };
  if (existing) {
    db.update(experimentResults)
      .set(values)
      .where(eq(experimentResults.experimentId, experimentId))
      .run();
    return;
  }
  db.insert(experimentResults)
    .values({ experimentId, ...values })
    .run();
}

export function saveClaim(
  db: SqliteDatabase,
  row: Omit<ClaimRecord, "id" | "createdAt"> & {
    id?: string | undefined;
    createdAt?: string | undefined;
  },
): ClaimRecord {
  const id = row.id ?? randomUUID();
  const createdAt = row.createdAt ?? new Date().toISOString();
  const values = {
    siteId: row.siteId,
    changeId: row.changeId,
    experimentId: row.experimentId,
    evidenceTier: row.evidenceTier,
    statement: row.statement,
    metric: row.metric,
    causationClaimed: row.causationClaimed ? 1 : 0,
    refusedReason: row.refusedReason,
    createdAt,
  };
  db.insert(claims)
    .values({ id, ...values })
    .run();
  return {
    id,
    siteId: row.siteId,
    changeId: row.changeId,
    experimentId: row.experimentId,
    evidenceTier: row.evidenceTier,
    statement: row.statement,
    metric: row.metric,
    causationClaimed: row.causationClaimed,
    refusedReason: row.refusedReason,
    createdAt,
  };
}

export function listClaims(db: SqliteDatabase, siteId: string): ClaimRecord[] {
  return db
    .select()
    .from(claims)
    .where(eq(claims.siteId, siteId))
    .all()
    .map((r) => ({
      id: r.id,
      siteId: r.siteId,
      changeId: r.changeId,
      experimentId: r.experimentId,
      evidenceTier: r.evidenceTier as ClaimRecord["evidenceTier"],
      statement: r.statement,
      metric: r.metric,
      causationClaimed: r.causationClaimed === 1,
      refusedReason: r.refusedReason,
      createdAt: r.createdAt,
    }));
}

export function claimForChange(
  db: SqliteDatabase,
  changeId: string,
): ClaimRecord | null {
  const row = db.select().from(claims).where(eq(claims.changeId, changeId)).get();
  if (!row) return null;
  return {
    id: row.id,
    siteId: row.siteId,
    changeId: row.changeId,
    experimentId: row.experimentId,
    evidenceTier: row.evidenceTier as ClaimRecord["evidenceTier"],
    statement: row.statement,
    metric: row.metric,
    causationClaimed: row.causationClaimed === 1,
    refusedReason: row.refusedReason,
    createdAt: row.createdAt,
  };
}

export function listCohortUrls(
  db: SqliteDatabase,
  experimentId: string,
): { treatment: string[]; control: string[]; reserve: string[] } {
  const rows = db
    .select()
    .from(cohorts)
    .where(eq(cohorts.experimentId, experimentId))
    .all();
  const out = {
    treatment: [] as string[],
    control: [] as string[],
    reserve: [] as string[],
  };
  for (const c of rows) {
    const members = db
      .select()
      .from(cohortMembers)
      .where(eq(cohortMembers.cohortId, c.id))
      .all();
    const urls = members.map((m) => m.url);
    if (c.arm === "treatment") out.treatment.push(...urls);
    else if (c.arm === "control") out.control.push(...urls);
    else if (c.arm === "reserve") out.reserve.push(...urls);
  }
  return out;
}

export function overlappingAnomalies(
  db: SqliteDatabase,
  start: string,
  end: string,
): Array<{ id: string; metrics: string[] }> {
  return db
    .select()
    .from(dataAnomalies)
    .all()
    .filter((r) => {
      const e = r.endDate ?? r.startDate;
      return r.startDate <= end && e >= start;
    })
    .map((r) => ({
      id: r.id,
      metrics: JSON.parse(r.affectedMetrics) as string[],
    }));
}
