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
  gscConnections,
  ga4Connections,
  gscDaily,
  gscPageDaily,
  gscQueryDaily,
  gscUrlInspections,
  ga4Daily,
  ga4LandingDaily,
  cruxRecords,
  psiAudits,
  googleIncidents,
  googleChangepoints,
  gscGa4Reconciliation,
  siteVerifications,
  quotaUsage,
  adapterConnections,
  urlAllowlist,
  entitySightings,
  twoKeyApprovals,
  reports,
  styleProfiles,
  contentBriefs,
  contentDrafts,
  publishGateResults,
} = schema;

export { sqliteSchema, pgSchema };
