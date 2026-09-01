import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDaemon, type RunningDaemon } from "@agentsean/daemon";
import { run } from "./cli.js";

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sean-e2e-"));
}

async function captureRun(argv: string[]): Promise<{ code: number; out: string }> {
  const chunks: string[] = [];
  const wrap = (s: string | Uint8Array) => {
    chunks.push(String(s));
    return true;
  };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = wrap as typeof process.stdout.write;
  process.stderr.write = wrap as typeof process.stderr.write;
  try {
    const code = await run(argv);
    return { code, out: chunks.join("") };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

describe("cli e2e against a live daemon", () => {
  let running: RunningDaemon | undefined;
  let home: string | undefined;

  afterEach(async () => {
    if (running) {
      await running.close();
      running = undefined;
    }
  });

  it("status --json sees a started daemon", async () => {
    home = tmpHome();
    running = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      seanHome: home,
      registerSignals: false,
    });

    const { code, out } = await captureRun([
      "node",
      "sean",
      "status",
      "--json",
      "--home",
      home,
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.trim()) as {
      running: boolean;
      pid: number;
      port: number;
      health: { ok: boolean } | null;
    };
    expect(parsed.running).toBe(true);
    expect(parsed.pid).toBe(running.pid);
    expect(parsed.port).toBe(running.port);
    expect(parsed.health?.ok).toBe(true);
  });

  it("serves the local Google connect page from the daemon", async () => {
    home = tmpHome();
    running = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      seanHome: home,
      registerSignals: false,
    });
    const res = await fetch(`http://127.0.0.1:${running.port}/connect`, {
      headers: { Host: `127.0.0.1:${running.port}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Connect Google");
    expect(html).toContain("Under two minutes");
  });

  it("serves the activity dashboard with a revert control", async () => {
    home = tmpHome();
    running = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      seanHome: home,
      registerSignals: false,
    });
    const res = await fetch(`http://127.0.0.1:${running.port}/activity`, {
      headers: { Host: `127.0.0.1:${running.port}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Activity");
    expect(html).toContain("One click reverts it");
    expect(html).toContain("/api/changes/");
  });

  it("serves the dashboard shell on GET / with no CORS", async () => {
    home = tmpHome();
    running = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      seanHome: home,
      registerSignals: false,
    });
    const res = await fetch(`http://127.0.0.1:${running.port}/`, {
      headers: { Host: `127.0.0.1:${running.port}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Agent Sean");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("freeze writes HALT and status reports it", async () => {
    home = tmpHome();
    const frozen = await captureRun(["node", "sean", "freeze", "--json", "--home", home]);
    expect(frozen.code).toBe(0);
    expect(JSON.parse(frozen.out).halted).toBe(true);
    running = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      seanHome: home,
      registerSignals: false,
    });
    const health = await fetch(`http://127.0.0.1:${running.port}/api/health`, {
      headers: { Host: `127.0.0.1:${running.port}` },
    });
    expect((await health.json()).halted).toBe(true);
    const thawed = await captureRun(["node", "sean", "unfreeze", "--json", "--home", home]);
    expect(JSON.parse(thawed.out).halted).toBe(false);
  });
});
