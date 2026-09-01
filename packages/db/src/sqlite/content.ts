import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { pages, sites } from "./schema.js";

/** Phase 5 — content engine. Dual-dialect with pg/content.ts. */

export const styleProfiles = sqliteTable(
  "style_profiles",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    voiceJson: text("voice_json").notNull(),
    disclosure: text("disclosure").notNull().default("html_comment"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("style_profiles_site_uidx").on(t.siteId)],
);

export const contentBriefs = sqliteTable(
  "content_briefs",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "set null" }),
    playbookId: text("playbook_id").notNull(),
    playbookVersion: text("playbook_version").notNull(),
    kind: text("kind").notNull(),
    targetUrl: text("target_url").notNull(),
    briefJson: text("brief_json").notNull(),
    score: real("score").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("content_briefs_site_idx").on(t.siteId),
    index("content_briefs_page_idx").on(t.pageId),
  ],
);

export const contentDrafts = sqliteTable(
  "content_drafts",
  {
    id: text("id").primaryKey(),
    briefId: text("brief_id")
      .notNull()
      .references(() => contentBriefs.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "set null" }),
    actionId: text("action_id"),
    title: text("title"),
    body: text("body"),
    model: text("model"),
    modelClass: text("model_class"),
    state: text("state").notNull(),
    gateJson: text("gate_json"),
    evidenceTier: text("evidence_tier").notNull().default("E"),
    createdAt: text("created_at").notNull(),
    publishedAt: text("published_at"),
  },
  (t) => [
    index("content_drafts_site_idx").on(t.siteId),
    index("content_drafts_brief_idx").on(t.briefId),
    index("content_drafts_state_idx").on(t.siteId, t.state),
  ],
);

export const publishGateResults = sqliteTable(
  "publish_gate_results",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    checkId: integer("check_id").notNull(),
    code: text("code").notNull(),
    ok: integer("ok").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("publish_gate_results_draft_idx").on(t.draftId)],
);
