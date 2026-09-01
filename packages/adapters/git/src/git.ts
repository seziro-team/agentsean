import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type GitRun = (args: string[], cwd: string) => string;

export function defaultGitRun(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function ensureGitIdentity(run: GitRun, cwd: string): void {
  try {
    run(["config", "user.email"], cwd);
  } catch {
    run(["-c", "user.email=sean@local", "-c", "user.name=Agent Sean", "status"], cwd);
  }
}

export function gitHead(run: GitRun, cwd: string): string {
  return run(["rev-parse", "HEAD"], cwd);
}

export function gitBranch(run: GitRun, cwd: string): string {
  return run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

export function createBranch(run: GitRun, cwd: string, name: string): void {
  run(["checkout", "-b", name], cwd);
}

export function checkout(run: GitRun, cwd: string, name: string): void {
  run(["checkout", name], cwd);
}

export function commitAll(run: GitRun, cwd: string, message: string): string {
  run(["add", "-A"], cwd);
  run(
    [
      "-c",
      "user.email=sean@agentsean.local",
      "-c",
      "user.name=Agent Sean",
      "commit",
      "-m",
      message,
    ],
    cwd,
  );
  return gitHead(run, cwd);
}

export function revertCommit(run: GitRun, cwd: string, sha: string): string {
  run(
    [
      "-c",
      "user.email=sean@agentsean.local",
      "-c",
      "user.name=Agent Sean",
      "revert",
      "--no-edit",
      sha,
    ],
    cwd,
  );
  return gitHead(run, cwd);
}

export function writeFile(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "utf8");
}

export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function parseGithubRemote(
  remote: string,
): { owner: string; repo: string } | null {
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(remote);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  const https = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(remote);
  if (https) return { owner: https[1]!, repo: https[2]! };
  return null;
}

export function currentRemote(run: GitRun, cwd: string): string | null {
  try {
    return run(["remote", "get-url", "origin"], cwd);
  } catch {
    return null;
  }
}

export function unifiedDiff(before: string, after: string, file: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const lines = [`--- a/${file}`, `+++ b/${file}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) continue;
    if (left !== undefined) lines.push(`-${left}`);
    if (right !== undefined) lines.push(`+${right}`);
  }
  return lines.join("\n");
}
