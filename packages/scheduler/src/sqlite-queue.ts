import { randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { jobs, type SqliteDatabase } from "@agentsean/db";
import { backoffMs, MAX_ATTEMPTS, STALE_HEARTBEAT_MS } from "./backoff.js";
import { isJobKind } from "./cadence.js";
import type {
  Clock,
  EnqueueInput,
  Job,
  JobKind,
  JobPayload,
  JobQueue,
  JobStatus,
} from "./types.js";

export type SqliteQueueOptions = {
  now?: Clock | undefined;
};

function parsePayload(raw: string | null): JobPayload {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as JobPayload;
  } catch {
    // ignore
  }
  return {};
}

function asJob(row: typeof jobs.$inferSelect): Job | null {
  if (!isJobKind(row.kind)) return null;
  return {
    id: row.id,
    siteId: row.siteId,
    kind: row.kind,
    status: row.status as Job["status"],
    idempotencyKey: row.idempotencyKey,
    payload: parsePayload(row.payload),
    attempts: row.attempts,
    runAt: row.runAt,
    heartbeatAt: row.heartbeatAt,
    error: row.error,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export function createSqliteQueue(
  db: SqliteDatabase,
  options: SqliteQueueOptions = {},
): JobQueue {
  const now = () => options.now?.() ?? new Date();
  const nowIso = () => now().toISOString();

  const getSync = (id: string): Job | null => {
    const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
    return row ? asJob(row) : null;
  };

  const queue: JobQueue = {
    async enqueue(input: EnqueueInput): Promise<Job> {
      const existing = db
        .select()
        .from(jobs)
        .where(eq(jobs.idempotencyKey, input.idempotencyKey))
        .get();
      if (existing) {
        const job = asJob(existing);
        if (job) return job;
      }
      const id = randomUUID();
      const createdAt = nowIso();
      const runAt =
        input.runAt instanceof Date
          ? input.runAt.toISOString()
          : (input.runAt ?? createdAt);
      try {
        db.insert(jobs)
          .values({
            id,
            siteId: input.siteId ?? null,
            kind: input.kind,
            status: "queued",
            idempotencyKey: input.idempotencyKey,
            payload: JSON.stringify(input.payload ?? {}),
            attempts: 0,
            runAt,
            heartbeatAt: null,
            error: null,
            createdAt,
            completedAt: null,
          })
          .run();
      } catch {
        const raced = db
          .select()
          .from(jobs)
          .where(eq(jobs.idempotencyKey, input.idempotencyKey))
          .get();
        if (raced) {
          const job = asJob(raced);
          if (job) return job;
        }
        throw new Error("failed to enqueue job");
      }
      const created = getSync(id);
      if (!created) throw new Error("failed to load enqueued job");
      return created;
    },

    async claimDue(limit: number): Promise<Job[]> {
      const cap = Math.min(Math.max(1, limit), 25);
      const due = db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "queued"), lte(jobs.runAt, nowIso())))
        .all()
        .slice(0, cap);
      const claimed: Job[] = [];
      const ts = nowIso();
      for (const row of due) {
        db.update(jobs)
          .set({
            status: "running",
            attempts: row.attempts + 1,
            heartbeatAt: ts,
          })
          .where(eq(jobs.id, row.id))
          .run();
        const job = getSync(row.id);
        if (job) claimed.push(job);
      }
      return claimed;
    },

    async heartbeat(id: string): Promise<void> {
      db.update(jobs).set({ heartbeatAt: nowIso() }).where(eq(jobs.id, id)).run();
    },

    async checkpoint(id: string, payload: JobPayload): Promise<void> {
      const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
      const prev = parsePayload(row?.payload ?? null);
      db.update(jobs)
        .set({
          payload: JSON.stringify({ ...prev, ...payload }),
          heartbeatAt: nowIso(),
        })
        .where(eq(jobs.id, id))
        .run();
    },

    async complete(id: string, result?: unknown): Promise<void> {
      const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
      const prev = parsePayload(row?.payload ?? null);
      const next =
        result === undefined ? prev : { ...prev, result };
      db.update(jobs)
        .set({
          status: "completed",
          completedAt: nowIso(),
          heartbeatAt: nowIso(),
          error: null,
          payload: JSON.stringify(next),
        })
        .where(eq(jobs.id, id))
        .run();
    },

    async fail(id: string, error: unknown): Promise<void> {
      const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
      const attempts = row?.attempts ?? 1;
      const message = error instanceof Error ? error.message : String(error);
      const ts = nowIso();
      if (attempts >= MAX_ATTEMPTS) {
        db.update(jobs)
          .set({
            status: "failed",
            error: message,
            completedAt: ts,
            heartbeatAt: ts,
          })
          .where(eq(jobs.id, id))
          .run();
        return;
      }
      const runAt = new Date(now().getTime() + backoffMs(attempts)).toISOString();
      db.update(jobs)
        .set({
          status: "queued",
          error: message,
          runAt,
          heartbeatAt: ts,
        })
        .where(eq(jobs.id, id))
        .run();
    },

    async recoverStale(): Promise<number> {
      const cutoff = new Date(now().getTime() - STALE_HEARTBEAT_MS).toISOString();
      const running = db.select().from(jobs).where(eq(jobs.status, "running")).all();
      let n = 0;
      for (const row of running) {
        if (row.heartbeatAt && row.heartbeatAt >= cutoff) continue;
        db.update(jobs)
          .set({
            status: "queued",
            error: "stale_heartbeat",
            runAt: nowIso(),
          })
          .where(eq(jobs.id, row.id))
          .run();
        n++;
      }
      return n;
    },

    async cancel(id: string): Promise<void> {
      db.update(jobs)
        .set({ status: "cancelled", completedAt: nowIso() })
        .where(eq(jobs.id, id))
        .run();
    },

    async get(id: string): Promise<Job | null> {
      return getSync(id);
    },

    async list(filter) {
      let rows = db.select().from(jobs).all();
      if (filter?.siteId) rows = rows.filter((r) => r.siteId === filter.siteId);
      if (filter?.status) rows = rows.filter((r) => r.status === filter.status);
      return rows
        .map(asJob)
        .filter((j): j is Job => j !== null)
        .toSorted((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
  };

  return queue;
}

export function parseJobKind(kind: string): JobKind {
  if (!isJobKind(kind)) throw new Error(`unknown job kind ${kind}`);
  return kind;
}

export type { JobStatus };
