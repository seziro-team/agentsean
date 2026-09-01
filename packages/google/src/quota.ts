import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import { quotaUsage } from "@agentsean/db";
import { QuotaExceededError } from "./errors.js";

export const LIMITS = {
  gscSearchAnalyticsQpm: 1200,
  gscUrlInspectionQpd: 2000,
  gscUrlInspectionQpm: 600,
  gscOtherQpm: 200,
  ga4TokensPerHour: 14000,
  psiQpd: 25000,
  psiQpm: 240,
  cruxQpm: 150,
} as const;

export type QuotaApi =
  | "gsc.searchAnalytics"
  | "gsc.urlInspection"
  | "gsc.other"
  | "ga4.data"
  | "psi"
  | "crux";

type WindowKind = "minute" | "hour" | "day";

function utcMinute(d: Date): string {
  return d.toISOString().slice(0, 16) + ":00.000Z";
}
function utcHour(d: Date): string {
  return d.toISOString().slice(0, 13) + ":00:00.000Z";
}
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10) + "T00:00:00.000Z";
}

function windowStart(kind: WindowKind, now: Date): string {
  if (kind === "minute") return utcMinute(now);
  if (kind === "hour") return utcHour(now);
  return utcDay(now);
}

export type QuotaManager = {
  acquire: (api: QuotaApi, scopeKey: string, cost?: number) => Promise<void>;
  record: (api: QuotaApi, scopeKey: string, cost?: number) => void;
  used: (api: QuotaApi, scopeKey: string, kind: WindowKind) => number;
  remainingInspectionToday: (siteUrl: string) => number;
};

function keyOf(api: string, scope: string, kind: WindowKind, start: string): string {
  return `${api}|${scope}|${kind}|${start}`;
}

function limitsFor(api: QuotaApi): { kind: WindowKind; limit: number }[] {
  switch (api) {
    case "gsc.searchAnalytics":
      return [{ kind: "minute", limit: LIMITS.gscSearchAnalyticsQpm }];
    case "gsc.urlInspection":
      return [
        { kind: "day", limit: LIMITS.gscUrlInspectionQpd },
        { kind: "minute", limit: LIMITS.gscUrlInspectionQpm },
      ];
    case "gsc.other":
      return [{ kind: "minute", limit: LIMITS.gscOtherQpm }];
    case "ga4.data":
      return [{ kind: "hour", limit: LIMITS.ga4TokensPerHour }];
    case "psi":
      return [
        { kind: "day", limit: LIMITS.psiQpd },
        { kind: "minute", limit: LIMITS.psiQpm },
      ];
    case "crux":
      return [{ kind: "minute", limit: LIMITS.cruxQpm }];
  }
}

export function createQuotaManager(
  db: SqliteDatabase | null,
  nowFn: () => Date = () => new Date(),
): QuotaManager {
  const mem = new Map<string, number>();

  const read = (api: QuotaApi, scope: string, kind: WindowKind, start: string): number => {
    const k = keyOf(api, scope, kind, start);
    const hit = mem.get(k);
    if (hit !== undefined) return hit;
    if (!db) return 0;
    const row = db
      .select()
      .from(quotaUsage)
      .where(
        and(
          eq(quotaUsage.api, api),
          eq(quotaUsage.scopeKey, scope),
          eq(quotaUsage.windowKind, kind),
          eq(quotaUsage.windowStart, start),
        ),
      )
      .get();
    const n = row?.count ?? 0;
    mem.set(k, n);
    return n;
  };

  const write = (
    api: QuotaApi,
    scope: string,
    kind: WindowKind,
    start: string,
    count: number,
    limit: number,
  ) => {
    const k = keyOf(api, scope, kind, start);
    mem.set(k, count);
    if (!db) return;
    const now = nowFn().toISOString();
    const existing = db
      .select()
      .from(quotaUsage)
      .where(
        and(
          eq(quotaUsage.api, api),
          eq(quotaUsage.scopeKey, scope),
          eq(quotaUsage.windowKind, kind),
          eq(quotaUsage.windowStart, start),
        ),
      )
      .get();
    if (existing) {
      db.update(quotaUsage)
        .set({ count, updatedAt: now })
        .where(eq(quotaUsage.id, existing.id))
        .run();
      return;
    }
    db.insert(quotaUsage)
      .values({
        id: randomUUID(),
        api,
        scopeKey: scope,
        windowKind: kind,
        windowStart: start,
        count,
        limitCount: limit,
        updatedAt: now,
      })
      .run();
  };

  const record = (api: QuotaApi, scopeKey: string, cost = 1) => {
    const now = nowFn();
    for (const { kind, limit } of limitsFor(api)) {
      const start = windowStart(kind, now);
      const next = read(api, scopeKey, kind, start) + cost;
      write(api, scopeKey, kind, start, next, limit);
    }
  };

  return {
    acquire: async (api, scopeKey, cost = 1) => {
      const now = nowFn();
      for (const { kind, limit } of limitsFor(api)) {
        const start = windowStart(kind, now);
        const used = read(api, scopeKey, kind, start);
        if (used + cost > limit) {
          const retry =
            kind === "minute"
              ? 60_000
              : kind === "hour"
                ? 15 * 60_000
                : 60 * 60_000;
          throw new QuotaExceededError(
            api,
            `${api} quota exceeded for ${scopeKey} (${used}/${limit} per ${kind})`,
            retry,
          );
        }
      }
    },
    record,
    used: (api, scopeKey, kind) => {
      const start = windowStart(kind, nowFn());
      return read(api, scopeKey, kind, start);
    },
    remainingInspectionToday: (siteUrl) => {
      const used = read(
        "gsc.urlInspection",
        siteUrl,
        "day",
        windowStart("day", nowFn()),
      );
      return Math.max(0, LIMITS.gscUrlInspectionQpd - used);
    },
  };
}
