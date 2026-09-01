import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { actions, sites } from "./schema.js";

/** Phase 3 — Action system support tables. Dual-dialect with pg/actions.ts. */

export const adapterConnections = sqliteTable(
  "adapter_connections",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    config: text("config").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("adapter_connections_site_kind_uidx").on(t.siteId, t.kind),
    index("adapter_connections_site_idx").on(t.siteId),
  ],
);

export const urlAllowlist = sqliteTable(
  "url_allowlist",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    addedBy: text("added_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("url_allowlist_site_url_uidx").on(t.siteId, t.url),
    index("url_allowlist_site_idx").on(t.siteId),
  ],
);

export const entitySightings = sqliteTable(
  "entity_sightings",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(),
    entityKind: text("entity_kind").notNull(),
    source: text("source").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
  },
  (t) => [
    uniqueIndex("entity_sightings_site_entity_uidx").on(t.siteId, t.entity),
    index("entity_sightings_site_source_idx").on(t.siteId, t.source),
  ],
);

export const twoKeyApprovals = sqliteTable(
  "two_key_approvals",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    hmac: text("hmac").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("two_key_approvals_action_actor_uidx").on(t.actionId, t.actor),
    index("two_key_approvals_action_idx").on(t.actionId),
  ],
);
