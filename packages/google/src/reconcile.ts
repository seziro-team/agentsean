import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import { ga4Daily, gscDaily, gscGa4Reconciliation } from "@agentsean/db";
import { changepointsOverlapping } from "./incidents.js";

export type ResidualRow = {
  date: string;
  gscClicks: number;
  ga4OrganicSessions: number;
  residual: number;
  residualPct: number | null;
  overlappingIncidentIds: string[];
  notes: string;
};

/**
 * GSC clicks vs GA4 Google-organic sessions. They will not match:
 * sessions can contain multiple landing-page clicks, attribution differs,
 * consent mode drops GA4, GSC de-bots server-side. The residual is the
 * explicit gap, not a bug. Annotate dates that overlap Google updates.
 */
export function computeResidual(
  gscClicks: number,
  ga4OrganicSessions: number,
): ResidualRow {
  const residual = ga4OrganicSessions - gscClicks;
  const denom = Math.max(gscClicks, ga4OrganicSessions, 1);
  return {
    date: "",
    gscClicks,
    ga4OrganicSessions,
    residual,
    residualPct: Math.round((residual / denom) * 10000) / 10000,
    overlappingIncidentIds: [],
    notes: residualNote(gscClicks, ga4OrganicSessions),
  };
}

function residualNote(gsc: number, ga4: number): string {
  if (gsc === 0 && ga4 === 0) return "both series empty";
  if (ga4 === 0) return "GA4 organic sessions are zero — check tracking / consent mode";
  if (gsc === 0)
    return "GSC clicks are zero — property may be unverified or still lagging";
  return "residual = GA4 Google-organic sessions − GSC clicks (expected; not a data bug)";
}

export function reconcileSite(db: SqliteDatabase, siteId: string): ResidualRow[] {
  const gsc = db.select().from(gscDaily).where(eq(gscDaily.siteId, siteId)).all();
  const ga4 = db.select().from(ga4Daily).where(eq(ga4Daily.siteId, siteId)).all();
  const gscByDate = new Map<string, number>();
  for (const row of gsc) {
    if (row.searchType !== "web") continue;
    gscByDate.set(row.date, (gscByDate.get(row.date) ?? 0) + row.clicks);
  }
  const ga4ByDate = new Map<string, number>();
  for (const row of ga4) {
    ga4ByDate.set(row.date, row.organicSessions);
  }
  const dates = [...new Set([...gscByDate.keys(), ...ga4ByDate.keys()])].toSorted();
  const out: ResidualRow[] = [];
  for (const date of dates) {
    const base = computeResidual(gscByDate.get(date) ?? 0, ga4ByDate.get(date) ?? 0);
    const overlapping = changepointsOverlapping(db, date, date);
    const row: ResidualRow = {
      ...base,
      date,
      overlappingIncidentIds: overlapping.map((c) => c.id),
      notes:
        overlapping.length > 0
          ? `${base.notes}; Google updates: ${overlapping.map((c) => c.title).join("; ")}`
          : base.notes,
    };
    out.push(row);
    persistResidual(db, siteId, row);
  }
  return out;
}

function persistResidual(db: SqliteDatabase, siteId: string, row: ResidualRow): void {
  const existing = db
    .select()
    .from(gscGa4Reconciliation)
    .where(
      and(
        eq(gscGa4Reconciliation.siteId, siteId),
        eq(gscGa4Reconciliation.date, row.date),
      ),
    )
    .get();
  const values = {
    gscClicks: row.gscClicks,
    ga4OrganicSessions: row.ga4OrganicSessions,
    residual: row.residual,
    residualPct: row.residualPct,
    overlappingIncidentIds: JSON.stringify(row.overlappingIncidentIds),
    notes: row.notes,
  };
  if (existing) {
    db.update(gscGa4Reconciliation)
      .set(values)
      .where(eq(gscGa4Reconciliation.id, existing.id))
      .run();
    return;
  }
  db.insert(gscGa4Reconciliation)
    .values({ id: randomUUID(), siteId, date: row.date, ...values })
    .run();
}
