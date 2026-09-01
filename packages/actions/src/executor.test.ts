import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { openSqlite } from "@agentsean/db";
import { findings, pages, sites } from "@agentsean/db";
import { createGitAdapter } from "@agentsean/adapter-git";
import { executeAction, revertChange } from "./executor.js";
import { loadChange, markReverted, recordEntity } from "./persist.js";
import { KIND_TIER } from "./kinds.js";
import { planTitleActions } from "./planner.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-ex-"));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "app/page.tsx"),
    `export const metadata = { title: "Hi" };\nexport default function Page() { return <h1>Hello from Example</h1>; }\n`,
  );
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync(
    "git",
    ["-c", "user.email=t@t.test", "-c", "user.name=t", "commit", "-m", "init"],
    { cwd: dir },
  );
  return dir;
}

describe("executor + git adapter", () => {
  it("plans a title fix, applies a commit, records a snapshot, and reverts", async () => {
    const repo = initRepo();
    const { db, sqlite } = openSqlite(":memory:");
    const now = "2026-08-01T00:00:00.000Z";
    const siteId = randomUUID();
    const pageId = randomUUID();
    const findingId = randomUUID();
    db.insert(sites)
      .values({
        id: siteId,
        origin: "https://example.com",
        name: "Example",
        observeUntil: "2026-07-01T00:00:00.000Z",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(pages)
      .values({
        id: pageId,
        siteId,
        url: "https://example.com/",
        urlHash: "abc",
        title: "Hi",
        h1: "Hello from Example",
        firstSeenAt: now,
        inlinkCount: 0,
        outlinkCount: 0,
      })
      .run();
    db.insert(findings)
      .values({
        id: findingId,
        siteId,
        pageId,
        ruleId: "ONP.TITLE_TOO_SHORT",
        severity: "low",
        autonomyTier: "T1",
        title: "Title too short",
        fingerprint: "fp-title",
        status: "open",
        firstDetectedAt: now,
      })
      .run();
    recordEntity(db, siteId, "https://example.com/", "url", "crawl");

    const planned = planTitleActions({
      siteId,
      origin: "https://example.com",
      pages: [
        {
          id: pageId,
          url: "https://example.com/",
          title: "Hi",
          metaDescription: null,
          h1: "Hello from Example",
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
    expect(planned).toHaveLength(1);
    const action = planned[0]!;
    expect(action.kind).toBe("rewrite_title");
    expect(action.tier).toBe(KIND_TIER.rewrite_title);

    const adapter = createGitAdapter({ repoPath: repo });
    const result = await executeAction({
      db,
      action,
      adapter,
      approvalKey: Buffer.alloc(32, 1),
      halted: false,
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(result.status, JSON.stringify(result)).toBe("applied");
    if (result.status !== "applied") {
      sqlite.close();
      return;
    }
    expect(fs.readFileSync(path.join(repo, "app/page.tsx"), "utf8")).toContain(
      action.payload && "title" in action.payload ? action.payload.title : "nope",
    );
    const stored = loadChange(db, result.changeId);
    expect(stored?.before).toContain('title: "Hi"');
    expect(stored?.after).toContain("Hello from Example");

    const reverted = await revertChange({ db, change: stored!, adapter });
    expect(reverted.ok).toBe(true);
    markReverted(db, result.changeId);
    expect(fs.readFileSync(path.join(repo, "app/page.tsx"), "utf8")).toContain(
      'title: "Hi"',
    );
    sqlite.close();
  });
});
