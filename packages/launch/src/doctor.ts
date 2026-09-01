import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { MIN_NODE, nodeMeetsMin, VERSION } from "./version.js";
import { MIN_TOKEN_LENGTH } from "./token-strength.js";

export type DoctorCheck = {
  id: string;
  ok: boolean;
  severity: "fail" | "warn" | "info";
  detail: string;
};

export type DoctorInput = {
  home: string;
  nodeVersion?: string | undefined;
  port?: number | undefined;
  pidAlive?: boolean | undefined;
  tokenPresent?: boolean | undefined;
  tokenLength?: number | undefined;
  halted?: boolean | undefined;
  dbExists?: boolean | undefined;
  dbMode?: number | undefined;
  googleConnected?: boolean | undefined;
  googleExpiresAt?: string | null | undefined;
  playwright?: boolean | undefined;
  platform?: string | undefined;
};

export type DoctorReport = {
  ok: boolean;
  version: string;
  node: string;
  checks: DoctorCheck[];
};

function modeOf(file: string): number | undefined {
  try {
    return fs.statSync(file).mode & 0o777;
  } catch {
    return undefined;
  }
}

export async function portOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
    sock.setTimeout(400, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

export async function runDoctor(input: DoctorInput): Promise<DoctorReport> {
  const nodeVersion = input.nodeVersion ?? process.versions.node;
  const port = input.port ?? 7777;
  const platform = input.platform ?? process.platform;
  const checks: DoctorCheck[] = [];

  const nodeOk = nodeMeetsMin(nodeVersion);
  checks.push({
    id: "node",
    ok: nodeOk,
    severity: nodeOk ? "info" : "fail",
    detail: nodeOk
      ? `Node ${nodeVersion} (>= ${MIN_NODE})`
      : `Node ${nodeVersion} is too old; need >= ${MIN_NODE}`,
  });

  let homeWritable = false;
  try {
    fs.mkdirSync(input.home, { recursive: true, mode: 0o700 });
    fs.accessSync(input.home, fs.constants.W_OK);
    homeWritable = true;
  } catch {
    homeWritable = false;
  }
  const homeMode = modeOf(input.home);
  const homeModeOk =
    platform === "win32" || homeMode === undefined || (homeMode & 0o077) === 0;
  checks.push({
    id: "home",
    ok: homeWritable && homeModeOk,
    severity: homeWritable ? (homeModeOk ? "info" : "warn") : "fail",
    detail: homeWritable
      ? `writable ${input.home}` +
        (homeModeOk ? "" : ` (mode ${homeMode?.toString(8)} should be 700)`)
      : `cannot write ${input.home}`,
  });

  const listening = await portOpen("127.0.0.1", port);
  if (input.pidAlive) {
    checks.push({
      id: "daemon",
      ok: true,
      severity: "info",
      detail: listening
        ? `daemon running on 127.0.0.1:${port}`
        : "pid file is alive; health endpoint not reachable yet",
    });
  } else {
    checks.push({
      id: "port",
      ok: !listening,
      severity: listening ? "warn" : "info",
      detail: listening
        ? `127.0.0.1:${port} is in use and no Sean pid file`
        : `127.0.0.1:${port} is free`,
    });
  }

  if (input.tokenPresent === false) {
    checks.push({
      id: "token",
      ok: true,
      severity: "info",
      detail: "no token yet — first start will generate a 32-byte token",
    });
  } else if (typeof input.tokenLength === "number") {
    const strong = input.tokenLength >= MIN_TOKEN_LENGTH;
    checks.push({
      id: "token",
      ok: strong,
      severity: strong ? "info" : "fail",
      detail: strong
        ? `auth token length ${input.tokenLength}`
        : `auth token length ${input.tokenLength} < ${MIN_TOKEN_LENGTH}`,
    });
  }

  if (input.halted) {
    checks.push({
      id: "halt",
      ok: true,
      severity: "warn",
      detail: "writes are frozen (HALT). sean unfreeze to resume",
    });
  }

  const dbFile = path.join(input.home, "sean.db");
  const dbExists = input.dbExists ?? fs.existsSync(dbFile);
  if (dbExists) {
    const dbMode = input.dbMode ?? modeOf(dbFile);
    const privateDb =
      platform === "win32" || dbMode === undefined || (dbMode & 0o077) === 0;
    checks.push({
      id: "db",
      ok: privateDb,
      severity: privateDb ? "info" : "fail",
      detail: privateDb
        ? "database is not world-readable"
        : `database mode ${dbMode?.toString(8)} is world-readable`,
    });
  } else {
    checks.push({
      id: "db",
      ok: true,
      severity: "info",
      detail: "no database yet — created on first crawl",
    });
  }

  if (input.googleConnected) {
    const exp = input.googleExpiresAt;
    const stale = exp ? Date.parse(exp) < Date.now() : false;
    checks.push({
      id: "google",
      ok: !stale,
      severity: stale ? "warn" : "info",
      detail: stale
        ? "Google grant looks expired — reconnect with sean connect google"
        : "Google grant present",
    });
  } else {
    checks.push({
      id: "google",
      ok: true,
      severity: "info",
      detail: "Google not connected (optional; audit works without it)",
    });
  }

  checks.push({
    id: "playwright",
    ok: true,
    severity: input.playwright ? "info" : "warn",
    detail: input.playwright
      ? "Playwright is available"
      : "Playwright/Chromium not installed — JS rendering skipped until first crawl that needs it (not downloaded at install)",
  });

  checks.push({
    id: "memory",
    ok: true,
    severity: "info",
    detail: `${Math.round(os.freemem() / 1024 / 1024)} MB free`,
  });

  const ok = checks.every((c) => c.ok || c.severity !== "fail");
  return { ok, version: VERSION, node: nodeVersion, checks };
}
