import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  actions,
  changes,
  contentDrafts,
  entitySightings,
  gscPageDaily,
  openSqlite,
  pages,
  pageSnapshots,
  sites,
} from "@agentsean/db";
import { createGitAdapter } from "@agentsean/adapter-git";
import { HTML_COMMENT } from "./disclosure.js";
import { runContentJob } from "./engine.js";
import type { GenerateFn } from "@agentsean/llm";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function initMarkdownRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-content-"));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, "content"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "content/guide.md"),
    `---\ntitle: Widget guide\n---\n\nWidgets last 12 months. Short page.\n`,
  );
  fs.writeFileSync(path.join(dir, "content/about.md"), `# About\n\nWe make widgets.\n`);
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync(
    "git",
    ["-c", "user.email=t@t.test", "-c", "user.name=t", "commit", "-m", "init"],
    { cwd: dir },
  );
  return dir;
}

const now = new Date("2026-09-01T12:00:00.000Z");

function seedSite(
  db: ReturnType<typeof openSqlite>["db"],
  opts?: { ymyl?: string | undefined },
) {
  const siteId = randomUUID();
  const pageId = randomUUID();
  const aboutId = randomUUID();
  const created = "2026-07-01T00:00:00.000Z";
  db.insert(sites)
    .values({
      id: siteId,
      origin: "https://example.com",
      name: "Example",
      observeUntil: created,
      ymylCategory: opts?.ymyl ?? null,
      createdAt: created,
      updatedAt: created,
    })
    .run();
  db.insert(pages)
    .values({
      id: pageId,
      siteId,
      url: "https://example.com/guide",
      urlHash: "guide",
      title: "Widget guide",
      h1: "Widget guide",
      wordCount: 80,
      firstSeenAt: created,
      inlinkCount: 1,
      outlinkCount: 0,
    })
    .run();
  db.insert(pages)
    .values({
      id: aboutId,
      siteId,
      url: "https://example.com/about",
      urlHash: "about",
      title: "About",
      h1: "About",
      wordCount: 40,
      firstSeenAt: created,
      inlinkCount: 0,
      outlinkCount: 0,
    })
    .run();
  db.insert(pageSnapshots)
    .values({
      id: randomUUID(),
      pageId,
      crawlId: null,
      fetchedAt: created,
      statusCode: 200,
      contentHash: "x",
      body: "Widgets last 12 months. Maintenance every 3 months. Short page.",
      headers: "{}",
    })
    .run();
  for (const url of ["https://example.com/guide", "https://example.com/about"]) {
    db.insert(entitySightings)
      .values({
        id: randomUUID(),
        siteId,
        entity: url,
        entityKind: "url",
        source: "crawl",
        firstSeenAt: created,
      })
      .run();
  }
  for (let i = 1; i <= 56; i++) {
    const date = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    const previousWindow = i > 28;
    db.insert(gscPageDaily)
      .values({
        id: randomUUID(),
        siteId,
        date,
        page: "https://example.com/guide",
        searchType: "web",
        clicks: previousWindow ? 8 : 2,
        impressions: 100,
        position: 12,
      })
      .run();
  }
  return { siteId, pageId, aboutId };
}

const mockGenerate: GenerateFn = async (req) => {
  if (/client_secret|refresh_token|sk-ant-|ghs_/i.test(req.system + req.prompt)) {
    throw new Error("D4 violation: credentials in LLM prompt");
  }
  const brief = JSON.parse(req.prompt) as {
    title: string;
    facts: Array<{ claim: string }>;
    internalLinks: Array<{ url: string; anchor: string }>;
  };
  const link = brief.internalLinks[0]!;
  const body = `# ${brief.title}

${HTML_COMMENT}

Widgets last 12 months with scheduled care. See [${link.anchor}](${link.url}) for the company that builds them and the people who stand behind the housing.

## How to maintain widgets

Clean the housing every 3 months. Widgets that skip that schedule seize at the bearing. Keep a dated log next to the serial plate so the next technician is not guessing about the last service.

Wipe the contacts, check the gasket, and confirm the firmware revision matches the card in the box. A five-minute pass now beats a failed unit in the field.

## When to replace widgets

Replace the unit after 12 months of daily use. Do not stretch a tired bearing because the shell still looks new. Record the swap, recycle the old unit, and start the 12 month clock again. Refresh this URL; do not mint a new one.
`;
  return {
    text: JSON.stringify({ title: brief.title.slice(0, 70), body, jsonld: null }),
    model: "mock-sonnet",
    class: req.class,
    provider: "anthropic",
    inputTokens: 800,
    outputTokens: 400,
    costUsd: 0.006,
    cached: false,
  };
};

describe("content engine exit", () => {
  it("identifies a decaying page, rewrites it, passes the gate, publishes, records E", async () => {
    const repo = initMarkdownRepo();
    const { db, sqlite } = openSqlite(":memory:");
    const { siteId } = seedSite(db);
    const adapter = createGitAdapter({ repoPath: repo, skipPush: true });
    const result = await runContentJob(db, {
      siteId,
      origin: "https://example.com",
      now,
      halted: false,
      generate: mockGenerate,
      adapter,
      approvalKey: Buffer.alloc(32, 7),
    });
    expect(result.skipped, JSON.stringify(result)).toBeFalsy();
    expect(result.applied, JSON.stringify(result)).toBe(1);
    expect(result.evidenceTier).toBe("E");
    const published = db
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.siteId, siteId))
      .all();
    expect(published.some((d) => d.state === "published" && d.evidenceTier === "E")).toBe(true);
    const applied = db
      .select()
      .from(actions)
      .where(eq(actions.actionType, "refresh_content"))
      .all();
    expect(applied.some((a) => a.state === "applied")).toBe(true);
    expect(db.select().from(changes).all().length).toBeGreaterThan(0);
    const live = fs.readFileSync(path.join(repo, "content/guide.md"), "utf8");
    expect(live).toContain("How to maintain widgets");
    expect(live).toContain("ai-generated");
    sqlite.close();
  });

  it("refuses YMYL and freeze without calling the adapter", async () => {
    const repo = initMarkdownRepo();
    const { db, sqlite } = openSqlite(":memory:");
    const { siteId } = seedSite(db, { ymyl: "affiliate" });
    const adapter = createGitAdapter({ repoPath: repo, skipPush: true });
    const blocked = await runContentJob(db, {
      siteId,
      origin: "https://example.com",
      now,
      generate: mockGenerate,
      adapter,
      approvalKey: Buffer.alloc(32, 7),
      ymylCategory: "affiliate",
    });
    expect(blocked.reason).toBe("vertical_block");
    expect(blocked.applied).toBe(0);

    const { db: db2, sqlite: sqlite2 } = openSqlite(":memory:");
    const seeded = seedSite(db2);
    const frozen = await runContentJob(db2, {
      siteId: seeded.siteId,
      origin: "https://example.com",
      now,
      halted: true,
      generate: mockGenerate,
      adapter,
      approvalKey: Buffer.alloc(32, 7),
    });
    expect(frozen.reason).toBe("halted");
    sqlite.close();
    sqlite2.close();
  });
});
