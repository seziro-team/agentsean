import { describe, expect, it } from "vitest";
import { openSqlite } from "@agentsean/db";
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  MAX_ATTEMPTS,
  STALE_HEARTBEAT_MS,
} from "./backoff.js";
import { idempotencyKey } from "./cadence.js";
import { createSqliteQueue } from "./sqlite-queue.js";
import { createPgBossQueue, type PgBossLike } from "./pg-boss.js";

describe("sqlite job queue", () => {
  it("is idempotent on the period key and recovers a stale heartbeat", async () => {
    const { db, sqlite } = openSqlite(":memory:");
    let now = new Date("2026-01-07T12:00:00.000Z");
    const queue = createSqliteQueue(db, { now: () => now });
    const key = idempotencyKey("site-1", "crawl", now);
    const a = await queue.enqueue({
      kind: "crawl",
      idempotencyKey: key,
      payload: { origin: "https://example.com" },
    });
    const b = await queue.enqueue({
      kind: "crawl",
      idempotencyKey: key,
      payload: { origin: "https://example.com" },
    });
    expect(b.id).toBe(a.id);

    const claimed = await queue.claimDue(5);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe("running");

    now = new Date(now.getTime() + STALE_HEARTBEAT_MS + 1000);
    const recovered = await queue.recoverStale();
    expect(recovered).toBe(1);
    const again = await queue.claimDue(5);
    expect(again).toHaveLength(1);
    expect(again[0]?.attempts).toBe(2);

    await queue.fail(again[0]!.id, new Error("boom"));
    const retried = await queue.get(again[0]!.id);
    expect(retried?.status).toBe("queued");
    expect(retried?.error).toBe("boom");
    const runAt = Date.parse(retried?.runAt ?? "");
    expect(runAt).toBeGreaterThan(now.getTime() + BACKOFF_BASE_MS - 1);

    sqlite.close();
  });

  it("fails closed after MAX_ATTEMPTS", async () => {
    const { db, sqlite } = openSqlite(":memory:");
    let now = new Date("2026-01-01T00:00:00.000Z");
    const queue = createSqliteQueue(db, { now: () => now });
    const job = await queue.enqueue({
      kind: "content",
      idempotencyKey: "once",
    });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      now = new Date(now.getTime() + BACKOFF_CAP_MS + 1);
      const claimed = await queue.claimDue(1);
      expect(claimed[0]?.id).toBe(job.id);
      await queue.fail(job.id, new Error("still no"));
    }
    const done = await queue.get(job.id);
    expect(done?.status).toBe("failed");
    expect((await queue.claimDue(1)).length).toBe(0);
    sqlite.close();
  });
});

describe("pg-boss adapter", () => {
  it("maps send/fetch/complete onto the JobQueue interface", async () => {
    const sent: Array<{ name: string; singletonKey?: string }> = [];
    const fake: PgBossLike = {
      async send(name, _data, options) {
        sent.push({ name, singletonKey: options?.singletonKey });
        return "boss-1";
      },
      async fetch(name, batchSize) {
        if (name !== "crawl") return [];
        return [
          {
            id: "boss-1",
            data: {
              siteId: "s",
              idempotencyKey: "s:crawl:2026-W02",
              payload: {},
              createdAt: "2026-01-07T00:00:00.000Z",
            },
            retrycount: 0,
          },
        ].slice(0, batchSize ?? 1);
      },
      async complete() {},
      async fail() {},
      async cancel() {},
    };
    const queue = createPgBossQueue(fake);
    const job = await queue.enqueue({
      siteId: "s",
      kind: "crawl",
      idempotencyKey: "s:crawl:2026-W02",
    });
    expect(job.id).toBe("boss-1");
    expect(sent[0]?.singletonKey).toBe("s:crawl:2026-W02");
    const claimed = await queue.claimDue(3);
    expect(claimed[0]?.kind).toBe("crawl");
    await queue.complete(claimed[0]!.id, { ok: true });
    expect((await queue.get(claimed[0]!.id))?.status).toBe("completed");
  });
});
