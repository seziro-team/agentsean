export { getDatabaseProvider, type DatabaseProvider } from "./provider.js";
export { CORE_TABLES, type CoreTable } from "./tables.js";
export {
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
  sqliteSchema,
  pgSchema,
} from "./schema.js";
export {
  openSqlite,
  applySqliteSchema,
  assertDbNotWorldReadable,
  type SqliteDatabase,
} from "./client.js";
