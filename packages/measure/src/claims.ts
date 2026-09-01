import { eq } from "drizzle-orm";
import { changes, type SqliteDatabase } from "@agentsean/db";
import { DEFAULT_EVIDENCE_TIER, claimCausation, statementFor } from "./ladder.js";
import { sitePowerBrief } from "./power.js";
import { claimForChange, listClaims, saveClaim } from "./persist.js";
import type { ClaimRecord } from "./types.js";

export type ClaimHeadline = {
  applied: number;
  byTier: Record<string, number>;
  measured: number;
  notMeasurable: number;
  line: string;
};

export function headline(rows: ClaimRecord[]): ClaimHeadline {
  const byTier: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const r of rows) {
    byTier[r.evidenceTier] = (byTier[r.evidenceTier] ?? 0) + 1;
  }
  const applied = rows.length;
  const measured = (byTier.A ?? 0) + (byTier.B ?? 0);
  const notMeasurable = byTier.E ?? 0;
  const line = `${applied} changes applied · ${measured} measured · ${byTier.C ?? 0} observed pre/post · ${byTier.D ?? 0} directional · ${notMeasurable} not measurable`;
  return { applied, byTier, measured, notMeasurable, line };
}

export function labelAppliedChange(
  db: SqliteDatabase,
  opts: {
    siteId: string;
    changeId: string;
    now?: Date | undefined;
    monthlyClicks?: number | undefined;
    pageCount?: number | undefined;
  },
): ClaimRecord {
  const existing = claimForChange(db, opts.changeId);
  if (existing) return existing;
  const brief = sitePowerBrief({
    monthlyClicks: opts.monthlyClicks ?? 0,
    pageCount: opts.pageCount ?? 0,
  });
  const cause = claimCausation(DEFAULT_EVIDENCE_TIER);
  return saveClaim(db, {
    siteId: opts.siteId,
    changeId: opts.changeId,
    experimentId: null,
    evidenceTier: DEFAULT_EVIDENCE_TIER,
    statement: statementFor(DEFAULT_EVIDENCE_TIER, {
      monthlyClicks: brief.monthlyClicks,
      neededClicksPerArm: 1900,
    }),
    metric: "clicks",
    causationClaimed: false,
    refusedReason: cause.reason,
    createdAt: (opts.now ?? new Date()).toISOString(),
  });
}

export function backfillUnlabelledChanges(
  db: SqliteDatabase,
  siteId: string,
  now: Date,
  traffic?: { monthlyClicks: number; pageCount: number },
): number {
  const rows = db.select().from(changes).where(eq(changes.siteId, siteId)).all();
  let n = 0;
  for (const row of rows) {
    if (claimForChange(db, row.id)) continue;
    labelAppliedChange(db, {
      siteId,
      changeId: row.id,
      now,
      monthlyClicks: traffic?.monthlyClicks,
      pageCount: traffic?.pageCount,
    });
    n++;
  }
  return n;
}

export { listClaims, claimForChange };
