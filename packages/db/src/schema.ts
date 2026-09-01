import { getDatabaseProvider } from "./provider.js";
import * as sqliteSchema from "./sqlite/schema.js";
import * as pgSchema from "./pg/schema.js";

type AppSchema = typeof sqliteSchema;

const runtimeSchema =
  getDatabaseProvider() === "postgres" ? pgSchema : sqliteSchema;

// Guarded by schema-parity.test.ts — the two dialects must stay interchangeable.
const schema = runtimeSchema as unknown as AppSchema;

export const {
  sites,
  crawls,
  pages,
  pageSnapshots,
  findings,
  actions,
  changes,
  changeSnapshots,
  credentials,
  costLedger,
  jobs,
  settings,
  auditLog,
} = schema;

export { sqliteSchema, pgSchema };
