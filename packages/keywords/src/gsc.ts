import { eq } from "drizzle-orm";
import { gscQueryDaily, type SqliteDatabase } from "@agentsean/db";
import type { QueryDaily } from "./types.js";

export function loadGscQueries(db: SqliteDatabase, siteId: string): QueryDaily[] {
  return db
    .select()
    .from(gscQueryDaily)
    .where(eq(gscQueryDaily.siteId, siteId))
    .all()
    .map((r) => ({
      date: r.date,
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    }));
}
