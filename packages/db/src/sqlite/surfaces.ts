import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sites } from "./schema.js";

/** Phase 9 — AI visibility, local, off-page, verticals. Dual-dialect with pg/surfaces.ts. */

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    engine: text("engine").notNull(),
    promptCount: integer("prompt_count").notNull().default(0),
    citationShare: real("citation_share").notNull().default(0),
    shareOfVoice: real("share_of_voice").notNull().default(0),
    estimatedUsd: real("estimated_usd").notNull().default(0),
    ranAt: text("ran_at").notNull(),
  },
  (t) => [
    index("ai_runs_site_idx").on(t.siteId),
    index("ai_runs_ran_idx").on(t.siteId, t.ranAt),
  ],
);

export const aiCitations = sqliteTable(
  "ai_citations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    engine: text("engine").notNull(),
    prompt: text("prompt").notNull(),
    citedUrl: text("cited_url"),
    citedDomain: text("cited_domain"),
    isOurs: integer("is_ours").notNull().default(0),
  },
  (t) => [index("ai_citations_run_idx").on(t.runId)],
);

export const bingAiRows = sqliteTable(
  "bing_ai_rows",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    groundingQuery: text("grounding_query").notNull(),
    citations: integer("citations").notNull().default(0),
    citationShare: real("citation_share").notNull().default(0),
    source: text("source").notNull().default("csv"),
  },
  (t) => [index("bing_ai_rows_site_idx").on(t.siteId)],
);

export const gbpLocations = sqliteTable(
  "gbp_locations",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    locationName: text("location_name").notNull(),
    title: text("title"),
    primaryCategory: text("primary_category"),
    placeId: text("place_id"),
    approvalStatus: text("approval_status").notNull().default("none"),
    verifiedAt: text("verified_at"),
  },
  (t) => [index("gbp_locations_site_idx").on(t.siteId)],
);

export const gbpEdits = sqliteTable(
  "gbp_edits",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    locationId: text("location_id").notNull(),
    kind: text("kind").notNull(),
    payload: text("payload").notNull().default("{}"),
    appliedAt: text("applied_at").notNull(),
  },
  (t) => [index("gbp_edits_loc_idx").on(t.locationId, t.appliedAt)],
);

export const mentions = sqliteTable(
  "mentions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    snippet: text("snippet").notNull(),
    linked: integer("linked").notNull().default(0),
    score: real("score").notNull().default(0),
    kind: text("kind").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("mentions_site_idx").on(t.siteId),
    uniqueIndex("mentions_uidx").on(t.siteId, t.url, t.kind),
  ],
);

export const inbound404s = sqliteTable(
  "inbound_404s",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    status: integer("status"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("inbound_404s_site_idx").on(t.siteId)],
);

export const outreachDrafts = sqliteTable(
  "outreach_drafts",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    mentionId: text("mention_id"),
    toEmail: text("to_email"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    state: text("state").notNull().default("draft"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("outreach_drafts_site_idx").on(t.siteId, t.state)],
);

export const verticalProfiles = sqliteTable(
  "vertical_profiles",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    preset: text("preset").notNull(),
    confidence: real("confidence").notNull().default(0),
    signalsJson: text("signals_json").notNull().default("[]"),
    answersJson: text("answers_json").notNull().default("{}"),
    suppressedChecks: integer("suppressed_checks").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("vertical_profiles_site_uidx").on(t.siteId)],
);
