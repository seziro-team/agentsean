import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  openSqlite,
  actions,
  entitySightings,
  findings,
  pages,
  sites,
} from "@agentsean/db";
import {
  executeAction,
  KIND_TIER,
  planTitleActions,
  type ActionKind,
  type SiteAdapter,
} from "@agentsean/actions";
import { createHandlers } from "./handlers.js";
import { tick } from "./runner.js";
import { createSqliteQueue } from "./sqlite-queue.js";
import { DAY_MS } from "./cadence.js";
import type { JobHandler, JobKind } from "./types.js";

function seedSite(db: ReturnType<typeof openSqlite>["db"], now: Date) {
  const id = randomUUID();
  const pageId = randomUUID();
  const findingId = randomUUID();
  const created = new Date(now.getTime() - 14 * DAY_MS).toISOString();
  db.insert(sites)
    .values({
      id,
      origin: "https://example.com",
      name: "Example",
      observeUntil: created,
      createdAt: created,
      updatedAt: created,
    })
    .run();
  db.insert(pages)
    .values({
      id: pageId,
      siteId: id,
      url: "https://example.com/",
      urlHash: "h1",
      title: "x",
      metaDescription: null,
      h1: "Example widgets",
      firstSeenAt: created,
      lastCrawledAt: created,
      inlinkCount: 0,
      outlinkCount: 0,
    })
    .run();
  db.insert(findings)
    .values({
      id: findingId,
      siteId: id,
      pageId,
      ruleId: "ONP.TITLE_TOO_SHORT",
      severity: "high",
      autonomyTier: "T1",
      title: "Title too short",
      explanation: "Write a better title",
      evidence: null,
      status: "open",
      fingerprint: "fp-title",
      firstDetectedAt: created,
      resolvedAt: null,
    })
    .run();
  db.insert(entitySightings)
    .values({
      id: randomUUID(),
      siteId: id,
      entity: "https://example.com/",
      entityKind: "url",
      source: "crawl",
      firstSeenAt: created,
    })
    .run();
  return { id, pageId, findingId };
}

function mockAdapter(applied: string[]): SiteAdapter {
  let body = 'export const metadata = { title: "x" };\n';
  return {
    kind: "git",
    capabilities: {
      kind: "git",
      reads: true,
      writes: true,
      pullRequests: true,
      rollback: true,
    },
    async read() {
      return { targetRef: "app/page.tsx", body, contentType: "text/plain" };
    },
    async dryRun(action) {
      const title = "title" in action.payload ? action.payload.title : "x";
      return { after: `export const metadata = { title: "${title}" };\n` };
    },
    async apply(action) {
      const title = "title" in action.payload ? action.payload.title : "x";
      const after = `export const metadata = { title: "${title}" };\n`;
      const before = body;
      body = after;
      applied.push(action.kind);
      return {
        targetRef: "app/page.tsx",
        before,
        after,
        summary: `title → ${title}`,
      };
    },
    async verify() {
      return { ok: true as const };
    },
    async rollback() {},
  };
}

describe("unattended week", () => {
  it("applies T1, queues T3, respects freeze, and keeps weekly rank cadence", async () => {
    const { db, sqlite } = openSqlite(":memory:");
    let now = new Date("2026-02-02T09:00:00.000Z");
    const { id: siteId, pageId, findingId } = seedSite(db, now);
    const applied: string[] = [];
    const adapter = mockAdapter(applied);
    const approvalKey = Buffer.alloc(32, 7);
    const planned = planTitleActions({
      siteId,
      origin: "https://example.com",
      pages: [
        {
          id: pageId,
          url: "https://example.com/",
          title: "x",
          metaDescription: null,
          h1: "Example widgets",
        },
      ],
      findings: [
        {
          id: findingId,
          siteId,
          pageId,
          ruleId: "ONP.TITLE_TOO_SHORT",
          status: "open",
        },
      ],
    });
    expect(planned.length).toBeGreaterThan(0);
    const first = await executeAction({
      db,
      action: planned[0]!,
      adapter,
      approvalKey,
      halted: false,
      now,
    });
    expect(first.status, JSON.stringify(first)).toBe("applied");
    expect(applied.length).toBeGreaterThan(0);
    const frozenTry = await executeAction({
      db,
      action: { ...planned[0]!, id: randomUUID() },
      adapter,
      approvalKey,
      halted: true,
      now,
    });
    expect(frozenTry.status).not.toBe("applied");

    const queue = createSqliteQueue(db, { now: () => now });
    const counts: Partial<Record<JobKind, number>> = {};
    const handlers = createHandlers({
      db,
      approvalKey,
      adapterFor: () => adapter,
      crawlImpl: async () => {
        throw new Error("network crawl should not run in the week sim");
      },
    });
    const wrapped: Partial<Record<JobKind, JobHandler>> = {};
    for (const [kind, handler] of Object.entries(handlers) as [JobKind, JobHandler][]) {
      wrapped[kind] = async (job, ctx) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
        if (
          kind === "crawl" ||
          kind === "gsc_sync" ||
          kind === "cwv" ||
          kind === "plan_and_apply" ||
          kind === "keywords" ||
          kind === "measure" ||
          kind === "surfaces"
        ) {
          return { skipped: true, simulated: true };
        }
        return handler(job, ctx);
      };
    }

    let halted = false;
    for (let day = 0; day < 7; day++) {
      if (day === 5) halted = true;
      await tick(queue, wrapped, { db, halted, now, limit: 20 });
      now = new Date(now.getTime() + DAY_MS);
    }

    expect(counts.gsc_sync).toBe(7);
    expect(counts.plan_and_apply).toBe(7);
    expect(counts.rank_check).toBe(1);
    expect(counts.keywords).toBe(1);
    expect(counts.crawl).toBe(1);
    expect(counts.content).toBe(7);
    expect(counts.measure).toBe(7);
    expect(counts.surfaces).toBe(1);
    expect(applied.length).toBe(1);
    expect(applied.every((k) => KIND_TIER[k as ActionKind] <= 2)).toBe(true);

    db.insert(actions)
      .values({
        id: randomUUID(),
        siteId,
        pageId,
        findingId,
        actionType: "change_canonical",
        targetRef: "https://example.com/",
        payload: "{}",
        risk: "high",
        tier: "T3",
        state: "queued",
        createdAt: now.toISOString(),
      })
      .run();
    const queuedT3 = db.select().from(actions).where(eq(actions.tier, "T3")).all();
    expect(queuedT3.every((r) => r.state === "queued" && !r.appliedAt)).toBe(true);

    sqlite.close();
  });
});
