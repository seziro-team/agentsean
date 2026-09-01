import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sites } from "./schema.js";

/** Phase 10 — hosted tenants, billing, envelope keys. Dual-dialect with pg/hosted.ts. */

export const tenants = sqliteTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    plan: text("plan").notNull().default("cloud_starter"),
    status: text("status").notNull().default("trialing"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    byok: integer("byok").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("tenants_email_uidx").on(t.email)],
);

export const tenantSeats = sqliteTable(
  "tenant_seats",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("owner"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("tenant_seats_uidx").on(t.tenantId, t.email),
    index("tenant_seats_tenant_idx").on(t.tenantId),
  ],
);

export const tenantSites = sqliteTable(
  "tenant_sites",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("tenant_sites_site_uidx").on(t.siteId),
    uniqueIndex("tenant_sites_pair_uidx").on(t.tenantId, t.siteId),
    index("tenant_sites_tenant_idx").on(t.tenantId),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    plan: text("plan").notNull(),
    interval: text("interval").notNull().default("month"),
    status: text("status").notNull(),
    currentPeriodEnd: text("current_period_end"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("subscriptions_tenant_idx").on(t.tenantId)],
);

export const stripeEvents = sqliteTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: text("payload").notNull().default("{}"),
  processedAt: text("processed_at").notNull(),
});

export const meteredUsage = sqliteTable(
  "metered_usage",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    quantity: integer("quantity").notNull().default(1),
    period: text("period").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("metered_usage_tenant_idx").on(t.tenantId, t.period)],
);

export const envelopeKeys = sqliteTable(
  "envelope_keys",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    wrappedDek: text("wrapped_dek").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("envelope_keys_tenant_uidx").on(t.tenantId)],
);

export const quotaWindows = sqliteTable(
  "quota_windows",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    windowStart: text("window_start").notNull(),
    jobs: integer("jobs").notNull().default(0),
    crawlPages: integer("crawl_pages").notNull().default(0),
    concurrent: integer("concurrent").notNull().default(0),
  },
  (t) => [uniqueIndex("quota_windows_uidx").on(t.tenantId, t.windowStart)],
);

export const erasureRequests = sqliteTable("erasure_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: text("requested_at").notNull(),
  completedAt: text("completed_at"),
  notes: text("notes"),
});

export const connectorPairings = sqliteTable(
  "connector_pairings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    siteId: text("site_id").references(() => sites.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("connector_pairings_tenant_idx").on(t.tenantId)],
);
