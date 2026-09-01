import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { changes, sites } from "./schema.js";

/** Phase 7 — experiments, claims, reconciliation waterfall. Dual-dialect with pg/measure.ts. */

export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    hypothesis: text("hypothesis").notNull(),
    interventionKind: text("intervention_kind").notNull(),
    status: text("status").notNull(),
    design: text("design").notNull(),
    unit: text("unit").notNull(),
    randomisationSeed: integer("randomisation_seed").notNull(),
    clusterKey: text("cluster_key"),
    preStart: text("pre_start").notNull(),
    preEnd: text("pre_end").notNull(),
    postStart: text("post_start").notNull(),
    plannedEnd: text("planned_end").notNull(),
    primaryMetric: text("primary_metric").notNull().default("clicks"),
    secondaryMetric: text("secondary_metric"),
    plannedMde: real("planned_mde").notNull(),
    powerTarget: real("power_target").notNull().default(0.8),
    alpha: real("alpha").notNull().default(0.05),
    evidenceTier: text("evidence_tier"),
    peekingBlocked: integer("peeking_blocked").notNull().default(1),
    createdAt: text("created_at").notNull(),
    concludedAt: text("concluded_at"),
  },
  (t) => [
    index("experiments_site_idx").on(t.siteId),
    index("experiments_status_idx").on(t.siteId, t.status),
    index("experiments_planned_end_idx").on(t.plannedEnd),
  ],
);

export const cohorts = sqliteTable(
  "cohorts",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    arm: text("arm").notNull(),
  },
  (t) => [
    uniqueIndex("cohorts_experiment_arm_uidx").on(t.experimentId, t.arm),
    index("cohorts_experiment_idx").on(t.experimentId),
  ],
);

export const cohortMembers = sqliteTable(
  "cohort_members",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    preClicks: real("pre_clicks").notNull().default(0),
    preImpressions: real("pre_impressions").notNull().default(0),
    contentHashAtStart: text("content_hash_at_start"),
  },
  (t) => [
    uniqueIndex("cohort_members_uidx").on(t.cohortId, t.url),
    index("cohort_members_cohort_idx").on(t.cohortId),
  ],
);

export const experimentResults = sqliteTable("experiment_results", {
  experimentId: text("experiment_id")
    .primaryKey()
    .references(() => experiments.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  pointEstimate: real("point_estimate"),
  ciLow: real("ci_low"),
  ciHigh: real("ci_high"),
  ciLevel: real("ci_level"),
  probPositive: real("prob_positive"),
  realisedMde: real("realised_mde"),
  nBoot: integer("n_boot"),
  suppressedBy: text("suppressed_by").notNull().default("[]"),
  evidenceTier: text("evidence_tier").notNull(),
  statement: text("statement").notNull(),
  causationClaimed: integer("causation_claimed").notNull().default(0),
  analysedAt: text("analysed_at").notNull(),
});

export const dataAnomalies = sqliteTable(
  "data_anomalies",
  {
    id: text("id").primaryKey(),
    description: text("description").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    affectedMetrics: text("affected_metrics").notNull().default("[]"),
    affectedSurfaces: text("affected_surfaces").notNull().default("[]"),
    source: text("source").notNull(),
  },
  (t) => [index("data_anomalies_start_idx").on(t.startDate)],
);

export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    changeId: text("change_id").references(() => changes.id, {
      onDelete: "set null",
    }),
    experimentId: text("experiment_id").references(() => experiments.id, {
      onDelete: "set null",
    }),
    evidenceTier: text("evidence_tier").notNull(),
    statement: text("statement").notNull(),
    metric: text("metric").notNull().default("clicks"),
    causationClaimed: integer("causation_claimed").notNull().default(0),
    refusedReason: text("refused_reason"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("claims_site_idx").on(t.siteId),
    index("claims_change_idx").on(t.changeId),
    index("claims_experiment_idx").on(t.experimentId),
    index("claims_tier_idx").on(t.siteId, t.evidenceTier),
  ],
);

export const reconciliationWaterfall = sqliteTable(
  "reconciliation_waterfall",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    windowStart: text("window_start").notNull(),
    windowEnd: text("window_end").notNull(),
    gscClicks: real("gsc_clicks").notNull().default(0),
    ga4OrganicSessions: real("ga4_organic_sessions").notNull().default(0),
    residual: real("residual").notNull().default(0),
    residualPct: real("residual_pct"),
    causesJson: text("causes_json").notNull(),
    anonymizedQueryShare: real("anonymized_query_share"),
    euInvisibleShare: real("eu_invisible_share"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("reconciliation_waterfall_uidx").on(
      t.siteId,
      t.windowStart,
      t.windowEnd,
    ),
    index("reconciliation_waterfall_site_idx").on(t.siteId),
  ],
);
