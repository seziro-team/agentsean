import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { KIND_TIER } from "@agentsean/actions";
import { createGitAdapter } from "./adapter.js";
import { resolvePageFile } from "./resolve.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function initNextRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-git-"));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "demo", dependencies: { next: "15.0.0" } }),
  );
  fs.writeFileSync(
    path.join(dir, "app/page.tsx"),
    `export const metadata = { title: "Hi" };\nexport default function Page() {\n  return <h1>Hello</h1>;\n}\n`,
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

describe("git adapter", () => {
  it("resolves Next.js app/page.tsx for /", () => {
    const dir = initNextRepo();
    const file = resolvePageFile(dir, "https://example.com/");
    expect(file).toBe(path.join(dir, "app/page.tsx"));
  });

  it("commits a title rewrite, verifies, and reverts from the shadow ledger", async () => {
    const dir = initNextRepo();
    const prs: unknown[] = [];
    const adapter = createGitAdapter({
      repoPath: dir,
      token: "ghs_test",
      skipPush: true,
      apiBase: "http://127.0.0.1:9",
      fetch: (async (_url, init) => {
        prs.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ html_url: "https://github.com/acme/demo/pull/1" }), {
          status: 201,
        });
      }) as typeof fetch,
    });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/acme/demo.git"], {
      cwd: dir,
    });

    const action = {
      id: randomUUID(),
      siteId: randomUUID(),
      kind: "rewrite_title" as const,
      tier: KIND_TIER.rewrite_title,
      target: { pageId: randomUUID(), url: "https://example.com/" },
      payload: { title: "About our running shoes today" },
      rationale: ["Short title."],
      findingIds: [randomUUID()],
      estimatedImpact: { metric: "clicks" as const, estimate: 0, confidence: 0.2 },
    };

    const applied = await adapter.apply(action);
    expect(applied.after).toContain("About our running shoes today");
    expect(applied.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(applied.branch).toMatch(/^sean\/title-/);
    expect(applied.prUrl).toBe("https://github.com/acme/demo/pull/1");
    expect(prs).toHaveLength(1);

    const change = {
      id: randomUUID(),
      actionId: action.id,
      siteId: action.siteId,
      targetRef: applied.targetRef,
      before: applied.before,
      after: applied.after,
      summary: applied.summary,
      commitSha: applied.commitSha,
      branch: applied.branch,
      prUrl: applied.prUrl,
    };
    const verified = await adapter.verify(change);
    expect(verified.ok).toBe(true);

    const rolled = await adapter.rollback(change);
    expect(rolled.after).toContain('title: "Hi"');
    const afterRevert = await adapter.verify({
      ...change,
      after: change.before,
      commitSha: rolled.commitSha,
    });
    expect(afterRevert.ok).toBe(true);
  });
});
