import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  defaultSeanHome,
  DEFAULT_HOST,
  DEFAULT_PORT,
  ensureSeanHome,
  isPidAlive,
  logPath,
  pidPath,
  readPid,
  startDaemon,
} from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

async function daemonMainPath(): Promise<string> {
  const resolved = import.meta.resolve("@agentsean/daemon/main");
  return fileURLToPath(resolved);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startCommand(opts: {
  json: boolean;
  foreground: boolean;
  host?: string | undefined;
  port?: number | undefined;
  home?: string | undefined;
}): Promise<number> {
  const host = opts.host ?? DEFAULT_HOST;
  const port = opts.port ?? DEFAULT_PORT;
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());

  const existing = readPid(home);
  if (existing && isPidAlive(existing.pid)) {
    emit(
      opts.json,
      {
        ok: true,
        command: "start",
        alreadyRunning: true,
        pid: existing.pid,
        host: existing.host,
        port: existing.port,
      },
      `Sean is already running (pid ${existing.pid}) on http://${existing.host}:${existing.port}`,
    );
    return 0;
  }

  if (opts.foreground) {
    const running = await startDaemon({ host, port, seanHome: home });
    emit(
      opts.json,
      {
        ok: true,
        command: "start",
        pid: running.pid,
        host: running.host,
        port: running.port,
        health: `http://${running.host}:${running.port}/api/health`,
      },
      `Sean started on http://${running.host}:${running.port} (pid ${running.pid})\nHealth: http://${running.host}:${running.port}/api/health`,
    );
    await new Promise(() => {
      /* run until signal */
    });
    return 0;
  }

  const entry = await daemonMainPath();
  const log = fs.openSync(logPath(home), "a", 0o600);
  const child = spawn(
    process.execPath,
    [entry, "--host", host, "--port", String(port), "--home", home],
    {
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, SEAN_HOME: home },
      windowsHide: true,
    },
  );
  child.unref();
  fs.closeSync(log);

  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const info = readPid(home);
    if (info && isPidAlive(info.pid)) {
      emit(
        opts.json,
        {
          ok: true,
          command: "start",
          pid: info.pid,
          host: info.host,
          port: info.port,
          health: `http://${info.host}:${info.port}/api/health`,
        },
        `Sean started on http://${info.host}:${info.port} (pid ${info.pid})`,
      );
      return 0;
    }
    // If the child already died, don't keep waiting.
    if (child.pid && !isPidAlive(child.pid) && !fs.existsSync(pidPath(home))) {
      break;
    }
  }

  emitError(
    opts.json,
    { command: "start", error: "daemon_failed_to_start" },
    "Sean failed to start. Check ~/.sean/daemon.log",
  );
  return 1;
}
