import type { EnqueueInput, Job, JobKind, JobPayload, JobQueue, JobStatus } from "./types.js";
import { JOB_KINDS } from "./types.js";
import { isJobKind } from "./cadence.js";

/**
 * Duck-typed pg-boss surface. Hosted tier constructs `new PgBoss(DATABASE_URL)`
 * and passes it here. Local installs never import pg-boss — they use the jobs table.
 */
export type PgBossLike = {
  send(
    name: string,
    data: object,
    options?: { singletonKey?: string; startAfter?: number | Date | string },
  ): Promise<string | null>;
  fetch(
    name: string,
    batchSize?: number,
  ): Promise<Array<{ id: string; data: object; retrycount?: number }> | null>;
  complete(id: string, data?: object): Promise<void>;
  fail(id: string, data?: object | Error): Promise<void>;
  cancel(id: string): Promise<void>;
};

type Data = {
  siteId: string | null;
  idempotencyKey: string;
  payload: JobPayload;
  createdAt: string;
};

/**
 * pg-boss adapter behind the same JobQueue interface as the SQLite queue.
 */
export function createPgBossQueue(
  boss: PgBossLike,
  options?: { now?: (() => Date) | undefined },
): JobQueue {
  const clock = () => options?.now?.() ?? new Date();
  const byId = new Map<string, Job>();

  const stamp = (
    kind: JobKind,
    row: { id: string; data: object; retrycount?: number },
    status: JobStatus,
  ): Job => {
    const data = row.data as Data;
    const job: Job = {
      id: row.id,
      siteId: data.siteId ?? null,
      kind,
      status,
      idempotencyKey: data.idempotencyKey ?? row.id,
      payload: data.payload ?? {},
      attempts: row.retrycount ?? 0,
      runAt: clock().toISOString(),
      heartbeatAt: clock().toISOString(),
      error: null,
      createdAt: data.createdAt ?? clock().toISOString(),
      completedAt: null,
    };
    byId.set(job.id, job);
    return job;
  };

  return {
    async enqueue(input: EnqueueInput): Promise<Job> {
      const createdAt = clock().toISOString();
      const data: Data = {
        siteId: input.siteId ?? null,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload ?? {},
        createdAt,
      };
      const startAfter = input.runAt
        ? input.runAt instanceof Date
          ? input.runAt
          : new Date(input.runAt)
        : undefined;
      const id =
        (await boss.send(input.kind, data, {
          singletonKey: input.idempotencyKey,
          ...(startAfter ? { startAfter } : {}),
        })) ?? input.idempotencyKey;
      const job: Job = {
        id,
        siteId: input.siteId ?? null,
        kind: input.kind,
        status: "queued",
        idempotencyKey: input.idempotencyKey,
        payload: input.payload ?? {},
        attempts: 0,
        runAt: startAfter ? startAfter.toISOString() : createdAt,
        heartbeatAt: null,
        error: null,
        createdAt,
        completedAt: null,
      };
      byId.set(id, job);
      return job;
    },

    async claimDue(limit: number): Promise<Job[]> {
      const out: Job[] = [];
      for (const kind of JOB_KINDS) {
        if (out.length >= limit) break;
        const batch = (await boss.fetch(kind, limit - out.length)) ?? [];
        for (const row of batch) out.push(stamp(kind, row, "running"));
      }
      return out;
    },

    async heartbeat(id: string): Promise<void> {
      const job = byId.get(id);
      if (job) byId.set(id, { ...job, heartbeatAt: clock().toISOString() });
    },

    async checkpoint(id: string, payload: JobPayload): Promise<void> {
      const job = byId.get(id);
      if (job) {
        byId.set(id, {
          ...job,
          payload: { ...job.payload, ...payload },
          heartbeatAt: clock().toISOString(),
        });
      }
    },

    async complete(id: string, result?: unknown): Promise<void> {
      await boss.complete(id, result ? { result } : undefined);
      const job = byId.get(id);
      if (job) {
        byId.set(id, {
          ...job,
          status: "completed",
          completedAt: clock().toISOString(),
        });
      }
    },

    async fail(id: string, error: unknown): Promise<void> {
      const err = error instanceof Error ? error : new Error(String(error));
      await boss.fail(id, err);
      const job = byId.get(id);
      if (job) byId.set(id, { ...job, status: "queued", error: err.message });
    },

    async recoverStale(): Promise<number> {
      return 0;
    },

    async cancel(id: string): Promise<void> {
      await boss.cancel(id);
      const job = byId.get(id);
      if (job) byId.set(id, { ...job, status: "cancelled" });
    },

    async get(id: string): Promise<Job | null> {
      return byId.get(id) ?? null;
    },

    async list(filter) {
      let rows = [...byId.values()];
      if (filter?.siteId) rows = rows.filter((j) => j.siteId === filter.siteId);
      if (filter?.status) rows = rows.filter((j) => j.status === filter.status);
      return rows;
    },
  };
}

export function assertJobKind(kind: string): JobKind {
  if (!isJobKind(kind)) throw new Error(`unknown job kind ${kind}`);
  return kind;
}
