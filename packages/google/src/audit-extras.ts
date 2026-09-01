import { eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import {
  cruxRecords,
  gscConnections,
  gscPageDaily,
  gscUrlInspections,
} from "@agentsean/db";

export type GscAuditData = {
  clicksByUrl: Record<string, number>;
  impressionsByUrl: Record<string, number>;
  googleCanonicalByUrl: Record<string, string>;
  coverageStateByUrl: Record<string, string>;
};

export type CruxAuditData = {
  lcpP75Ms?: number | undefined;
  inpP75Ms?: number | undefined;
  clsP75?: number | undefined;
  ttfbP75Ms?: number | undefined;
  phoneLcpP75Ms?: number | undefined;
  desktopLcpP75Ms?: number | undefined;
  urlLevel?: boolean | undefined;
};

export function loadAuditExtras(
  db: SqliteDatabase,
  siteId: string,
): { gsc?: GscAuditData | undefined; crux?: CruxAuditData | undefined } {
  const connected = db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.siteId, siteId))
    .get();
  const clicksByUrl: Record<string, number> = {};
  const impressionsByUrl: Record<string, number> = {};
  if (connected) {
    for (const row of db
      .select()
      .from(gscPageDaily)
      .where(eq(gscPageDaily.siteId, siteId))
      .all()) {
      clicksByUrl[row.page] = (clicksByUrl[row.page] ?? 0) + row.clicks;
      impressionsByUrl[row.page] = (impressionsByUrl[row.page] ?? 0) + row.impressions;
    }
  }
  const googleCanonicalByUrl: Record<string, string> = {};
  const coverageStateByUrl: Record<string, string> = {};
  for (const row of db
    .select()
    .from(gscUrlInspections)
    .where(eq(gscUrlInspections.siteId, siteId))
    .all()) {
    if (row.googleCanonical) googleCanonicalByUrl[row.url] = row.googleCanonical;
    if (row.coverageState) coverageStateByUrl[row.url] = row.coverageState;
  }

  const cruxRows = db
    .select()
    .from(cruxRecords)
    .where(eq(cruxRecords.siteId, siteId))
    .all();
  const phone = cruxRows.find((r) => r.formFactor === "PHONE");
  const desktop = cruxRows.find((r) => r.formFactor === "DESKTOP");
  const any = phone ?? desktop ?? cruxRows[0];

  const gsc =
    connected || Object.keys(clicksByUrl).length > 0
      ? {
          clicksByUrl,
          impressionsByUrl,
          googleCanonicalByUrl,
          coverageStateByUrl,
        }
      : undefined;
  const crux = any
    ? {
        lcpP75Ms: any.lcpP75 ?? undefined,
        inpP75Ms: any.inpP75 ?? undefined,
        clsP75: any.clsP75 ?? undefined,
        ttfbP75Ms: any.ttfbP75 ?? undefined,
        phoneLcpP75Ms: phone?.lcpP75 ?? undefined,
        desktopLcpP75Ms: desktop?.lcpP75 ?? undefined,
        urlLevel: any.identifierKind === "url",
      }
    : undefined;
  return { gsc, crux };
}
