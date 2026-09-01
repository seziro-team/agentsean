import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { costLedger, providerQuotes, type SqliteDatabase } from "@agentsean/db";
import type { CostEstimate } from "./types.js";

export function recordQuote(
  db: SqliteDatabase,
  estimate: CostEstimate,
  opts?: { siteId?: string | null; actualUsd?: number | null },
): string {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.insert(providerQuotes)
    .values({
      id,
      siteId: opts?.siteId ?? null,
      provider: estimate.provider,
      capability: estimate.capability,
      operation: estimate.operation,
      units: estimate.units,
      estimatedUsd: estimate.estimatedUsd,
      actualUsd: opts?.actualUsd ?? null,
      free: estimate.free ? 1 : 0,
      createdAt: now,
    })
    .run();
  return id;
}

export function debitProvider(
  db: SqliteDatabase,
  estimate: CostEstimate,
  opts?: { siteId?: string | null; actualUsd?: number | null },
): void {
  const now = new Date().toISOString();
  const actual = opts?.actualUsd ?? estimate.estimatedUsd;
  recordQuote(db, estimate, { siteId: opts?.siteId ?? null, actualUsd: actual });
  if (actual <= 0 && estimate.free) return;
  db.insert(costLedger)
    .values({
      id: randomUUID(),
      siteId: opts?.siteId ?? null,
      ts: now,
      provider: estimate.provider,
      model: null,
      operation: `${estimate.capability}:${estimate.operation}`,
      inputTokens: null,
      outputTokens: null,
      costUsd: actual,
      currency: "USD",
      meta: JSON.stringify({
        units: estimate.units,
        unitUsd: estimate.unitUsd,
        estimatedUsd: estimate.estimatedUsd,
        free: estimate.free,
        notes: estimate.notes ?? null,
      }),
      createdAt: now,
    })
    .run();
}

export function spendTodayUsd(
  db: SqliteDatabase,
  siteId: string,
  now = new Date(),
): number {
  const day = now.toISOString().slice(0, 10);
  const rows = db
    .select()
    .from(costLedger)
    .where(and(eq(costLedger.siteId, siteId), gte(costLedger.ts, day)))
    .all();
  return rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
}

export function remainingBudgetUsd(
  db: SqliteDatabase,
  siteId: string,
  dailyBudgetUsd: number,
  now = new Date(),
): number {
  return Math.max(0, dailyBudgetUsd - spendTodayUsd(db, siteId, now));
}
