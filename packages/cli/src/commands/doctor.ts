import { createRequire } from "node:module";
import { loadGrant } from "@agentsean/google";
import {
  defaultSeanHome,
  ensureSeanHome,
  isHalted,
  isPidAlive,
  openDaemonStore,
  readPid,
  DEFAULT_PORT,
  TOKEN_ACCOUNT,
} from "@agentsean/daemon";
import { runDoctor } from "@agentsean/launch";
import { emit } from "../output.js";

function playwrightAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

export async function doctorCommand(opts: {
  json: boolean;
  home?: string | undefined;
  port?: number | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const info = readPid(home);
  const store = openDaemonStore(home);
  let tokenLength: number | undefined;
  let tokenPresent = false;
  try {
    const existing = await store.get(TOKEN_ACCOUNT);
    if (existing) {
      tokenPresent = true;
      tokenLength = existing.unwrap().length;
    }
  } catch {
    tokenPresent = false;
  }
  let googleConnected = false;
  let googleExpiresAt: string | null = null;
  try {
    const grant = await loadGrant(store);
    if (grant) {
      googleConnected = true;
      googleExpiresAt = grant.refreshTokenExpiresAt ?? grant.expiresAt;
    }
  } catch {
    googleConnected = false;
  }

  const report = await runDoctor({
    home,
    port: opts.port ?? info?.port ?? DEFAULT_PORT,
    pidAlive: Boolean(info && isPidAlive(info.pid)),
    tokenPresent,
    tokenLength,
    halted: isHalted(home),
    googleConnected,
    googleExpiresAt,
    playwright: playwrightAvailable(),
  });

  const lines = report.checks.map((c) => {
    const mark = c.ok ? (c.severity === "warn" ? "!" : "ok") : "FAIL";
    return `  [${mark}] ${c.id}: ${c.detail}`;
  });
  emit(
    opts.json,
    { command: "doctor", ...report },
    `Agent Sean ${report.version} doctor ${report.ok ? "passed" : "failed"}\n${lines.join("\n")}`,
  );
  return report.ok ? 0 : 1;
}
