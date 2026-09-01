import { sites, type SqliteDatabase } from "@agentsean/db";
import { CADENCES, idempotencyKey } from "./cadence.js";
import { JOB_KINDS, type JobHandler, type JobKind, type JobQueue } from "./types.js";

export type TickResult = {
  recovered: number;
  scheduled: number;
  ran: number;
  errors: string[];
};

export async function ensureCadences(
  queue: JobQueue,
  db: SqliteDatabase,
  now: Date,
): Promise<number> {
  const rows = db.select().from(sites).all();
  let n = 0;
  for (const site of rows) {
    for (const kind of JOB_KINDS) {
      const key = idempotencyKey(site.id, kind, now);
      const job = await queue.enqueue({
        siteId: site.id,
        kind,
        idempotencyKey: key,
        payload: { origin: site.origin, cadenceMs: CADENCES[kind].everyMs },
        runAt: now,
      });
      if (job.createdAt && new Date(job.createdAt).getTime() >= now.getTime() - 2000) {
        n++;
      }
    }
  }
  return n;
}

export async function runDue(
  queue: JobQueue,
  handlers: Partial<Record<JobKind, JobHandler>>,
  opts: { halted: boolean; now: Date; limit?: number | undefined },
): Promise<{ ran: number; errors: string[] }> {
  const claimed = await queue.claimDue(opts.limit ?? 5);
  const errors: string[] = [];
  for (const job of claimed) {
    const handler = handlers[job.kind];
    if (!handler) {
      await queue.fail(job.id, new Error(`no handler for ${job.kind}`));
      errors.push(`${job.id}: no handler for ${job.kind}`);
      continue;
    }
    try {
      const result = await handler(job, {
        now: opts.now,
        halted: opts.halted,
        heartbeat: () => {
          void queue.heartbeat(job.id);
        },
        checkpoint: (payload) => {
          void queue.checkpoint(job.id, payload);
        },
      });
      await queue.complete(job.id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await queue.fail(job.id, err);
      errors.push(`${job.id}: ${message}`);
    }
  }
  return { ran: claimed.length, errors };
}

export async function tick(
  queue: JobQueue,
  handlers: Partial<Record<JobKind, JobHandler>>,
  opts: { db: SqliteDatabase; halted: boolean; now: Date; limit?: number | undefined },
): Promise<TickResult> {
  const recovered = await queue.recoverStale();
  const scheduled = await ensureCadences(queue, opts.db, opts.now);
  const { ran, errors } = await runDue(queue, handlers, opts);
  return { recovered, scheduled, ran, errors };
}

export function startLoop(
  queue: JobQueue,
  handlers: Partial<Record<JobKind, JobHandler>>,
  opts: {
    db: SqliteDatabase;
    halted: () => boolean;
    now?: (() => Date) | undefined;
    intervalMs?: number | undefined;
    onTick?: ((result: TickResult) => void) | undefined;
  },
): () => Promise<void> {
  let stopped = false;
  let inflight: Promise<unknown> = Promise.resolve();
  const intervalMs = opts.intervalMs ?? 15_000;
  const run = () => {
    if (stopped) return;
    inflight = tick(queue, handlers, {
      db: opts.db,
      halted: opts.halted(),
      now: opts.now?.() ?? new Date(),
    })
      .then((result) => opts.onTick?.(result))
      .catch(() => {
        /* the next interval retries; crash recovery requeues stale work */
      });
  };
  run();
  const handle = setInterval(run, intervalMs);
  return async () => {
    stopped = true;
    clearInterval(handle);
    await inflight;
  };
}
