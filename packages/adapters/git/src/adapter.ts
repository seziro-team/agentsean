import fs from "node:fs";
import path from "node:path";
import type {
  Action,
  ActionTarget,
  AdapterApplyResult,
  AdapterCapabilities,
  AdapterDryRun,
  AdapterRead,
  AdapterVerifyResult,
  AppliedChange,
  SiteAdapter,
} from "@agentsean/actions";
import { detectFramework, resolvePageFile } from "./resolve.js";
import { rewriteBody, rewriteTitle, titleInSource } from "./rewrite.js";
import {
  checkout,
  commitAll,
  createBranch,
  currentRemote,
  defaultGitRun,
  gitBranch,
  parseGithubRemote,
  readFile,
  revertCommit,
  unifiedDiff,
  writeFile,
  type GitRun,
} from "./git.js";
import { openGithubPr } from "./github.js";

export type GitAdapterOptions = {
  repoPath: string;
  defaultBranch?: string | undefined;
  token?: string | undefined;
  fetch?: typeof fetch | undefined;
  gitRun?: GitRun | undefined;
  apiBase?: string | undefined;
  skipPush?: boolean | undefined;
};

export function createGitAdapter(opts: GitAdapterOptions): SiteAdapter {
  const run = opts.gitRun ?? defaultGitRun;
  const repo = path.resolve(opts.repoPath);

  function fileFor(target: ActionTarget): string {
    const file = resolvePageFile(repo, target.url);
    if (!file) {
      throw new Error(`no source file for ${target.url} in ${repo} (${detectFramework(repo)})`);
    }
    return file;
  }

  function newPageFile(pagePath: string): string {
    const rel = pagePath.replace(/^\//, "").replace(/\/$/, "") || "index";
    return path.join(repo, "content", `${rel}.md`);
  }

  function plan(action: Action): { file: string; before: string; after: string; summary: string } {
    if (action.kind === "create_page" && "path" in action.payload) {
      const file = newPageFile(action.payload.path);
      const before = fs.existsSync(file) ? readFile(file) : "";
      const after = `# ${action.payload.title}\n\n${action.payload.body}\n`;
      return { file, before, after, summary: `create ${path.relative(repo, file)}` };
    }
    const file = fileFor(action.target);
    const before = readFile(file);
    if (
      "title" in action.payload &&
      (action.kind === "rewrite_title" || action.kind === "fix_title_length")
    ) {
      const rewritten = rewriteTitle(before, action.payload.title);
      if (!rewritten.ok) throw new Error(rewritten.error);
      return {
        file,
        before,
        after: rewritten.after,
        summary: `rewrite title on ${path.relative(repo, file)}`,
      };
    }
    if ("body" in action.payload && action.kind === "refresh_content") {
      const rewritten = rewriteBody(before, action.payload.body);
      if (!rewritten.ok) throw new Error(rewritten.error);
      return {
        file,
        before,
        after: rewritten.after,
        summary: `refresh content on ${path.relative(repo, file)}`,
      };
    }
    throw new Error(`git adapter does not apply ${action.kind}`);
  }

  const adapter: SiteAdapter = {
    kind: "git",
    capabilities(): AdapterCapabilities {
      return { kind: "git", reads: true, writes: true, pullRequests: true, rollback: true };
    },
    async read(target: ActionTarget): Promise<AdapterRead> {
      const file = fileFor(target);
      return {
        targetRef: path.relative(repo, file),
        body: readFile(file),
        contentType: "text/plain",
      };
    },
    async dryRun(action: Action): Promise<AdapterDryRun> {
      const planned = plan(action);
      return {
        targetRef: path.relative(repo, planned.file).replaceAll("\\", "/"),
        before: planned.before,
        after: planned.after,
        summary: planned.summary,
      };
    },
    async apply(action: Action): Promise<AdapterApplyResult> {
      const planned = plan(action);
      const file = planned.file;
      const rel = path.relative(repo, file).replaceAll("\\", "/");
      const base = opts.defaultBranch ?? gitBranch(run, repo);
      const branch =
        action.kind === "rewrite_title" || action.kind === "fix_title_length"
          ? `sean/title-${action.id.slice(0, 8)}`
          : `sean/${action.kind}-${action.id.slice(0, 8)}`;
      try {
        createBranch(run, repo, branch);
      } catch {
        checkout(run, repo, branch);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      writeFile(file, planned.after);
      const sha = commitAll(run, repo, `seo: ${planned.summary}\n\nAction ${action.id}`);
      const diff = unifiedDiff(planned.before, planned.after, rel);
      let prUrl: string | undefined;
      const remote = currentRemote(run, repo);
      const parsed = remote ? parseGithubRemote(remote) : null;
      if (opts.token && parsed) {
        if (!opts.skipPush) {
          try {
            run(["push", "-u", "origin", branch], repo);
          } catch {
            /* local-only is still a valid apply */
          }
        }
        try {
          prUrl = await openGithubPr({
            owner: parsed.owner,
            repo: parsed.repo,
            title: `seo: ${planned.summary}`,
            body: action.rationale.join("\n"),
            head: branch,
            base,
            token: opts.token,
            ...(opts.fetch ? { fetch: opts.fetch } : {}),
            ...(opts.apiBase ? { apiBase: opts.apiBase } : {}),
          });
        } catch {
          prUrl = undefined;
        }
      }
      const result: AdapterApplyResult = {
        targetRef: rel,
        before: planned.before,
        after: planned.after,
        summary: prUrl
          ? `Opened PR ${prUrl} (branch ${branch}, ${sha.slice(0, 7)})`
          : `Committed ${sha.slice(0, 7)} on ${branch}`,
        branch,
        commitSha: sha,
        diff,
      };
      if (prUrl) result.prUrl = prUrl;
      return result;
    },
    async verify(change: AppliedChange): Promise<AdapterVerifyResult> {
      const file = path.join(repo, change.targetRef);
      let live: string;
      try {
        live = readFile(file);
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
      if (live === change.after) return { ok: true, detail: "file matches after snapshot" };
      const expected = titleInSource(change.after);
      const got = titleInSource(live);
      if (expected && got === expected) {
        return { ok: true, detail: "title landed in source" };
      }
      return {
        ok: false,
        detail: `live file does not match after snapshot (expected title ${expected ?? "?"}, got ${got ?? "?"})`,
      };
    },
    async rollback(change: AppliedChange): Promise<AdapterApplyResult> {
      const file = path.join(repo, change.targetRef);
      const liveBefore = readFile(file);
      if (change.commitSha) {
        try {
          const sha = revertCommit(run, repo, change.commitSha);
          const after = readFile(file);
          return {
            targetRef: change.targetRef,
            before: liveBefore,
            after,
            summary: `git revert ${change.commitSha.slice(0, 7)} → ${sha.slice(0, 7)}`,
            commitSha: sha,
            branch: change.branch,
          };
        } catch {
          /* fall through to snapshot restore */
        }
      }
      writeFile(file, change.before);
      const sha = commitAll(run, repo, `seo: revert ${change.targetRef}\n\nChange ${change.id}`);
      return {
        targetRef: change.targetRef,
        before: liveBefore,
        after: change.before,
        summary: `Restored shadow-ledger snapshot (${sha.slice(0, 7)})`,
        commitSha: sha,
        branch: change.branch,
      };
    },
  };
  return adapter;
}
