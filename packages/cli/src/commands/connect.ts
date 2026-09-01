import fs from "node:fs";
import { spawn } from "node:child_process";
import {
  defaultSeanHome,
  ensureSeanHome,
  isPidAlive,
  loadOrCreateToken,
  openDaemonStore,
  readPid,
} from "@agentsean/daemon";
import { parseDesktopClientJson, saveApiKey, saveByoClient } from "@agentsean/google";
import { startCommand } from "./start.js";
import { emit, emitError } from "../output.js";

function openBrowser(url: string): void {
  if (process.env["SEAN_NO_BROWSER"] === "1") return;
  const plat = process.platform;
  try {
    if (plat === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    else if (plat === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {
    // the printed URL is the fallback
  }
}

export async function connectCommand(opts: {
  json: boolean;
  home?: string | undefined;
  provider?: string | undefined;
  target?: string | undefined;
  byo: boolean;
  credentialsPath?: string | undefined;
  apiKey?: string | undefined;
}): Promise<number> {
  const provider = (opts.provider ?? "google").toLowerCase();
  if (provider !== "google") {
    emitError(
      opts.json,
      { command: "connect", error: "unknown_provider", provider },
      `Unknown provider ${provider}. Try \`sean connect google\`.`,
    );
    return 2;
  }

  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const existing = readPid(home);
  if (!existing || !isPidAlive(existing.pid)) {
    const code = await startCommand({
      json: true,
      foreground: false,
      home,
      quiet: true,
    });
    if (code !== 0) {
      emitError(
        opts.json,
        { command: "connect", error: "daemon_failed_to_start" },
        "Sean failed to start. Check ~/.sean/daemon.log",
      );
      return 1;
    }
  }

  const info = readPid(home);
  if (!info || !isPidAlive(info.pid)) {
    emitError(opts.json, { command: "connect", error: "not_running" }, "Sean is not running.");
    return 1;
  }

  const store = openDaemonStore(home);
  if (opts.credentialsPath) {
    const raw = fs.readFileSync(opts.credentialsPath, "utf8");
    await saveByoClient(store, parseDesktopClientJson(raw));
  }
  if (opts.apiKey) await saveApiKey(store, opts.apiKey);

  const token = await loadOrCreateToken(store);
  const url = `http://${info.host}:${info.port}/connect#token=${token.unwrap()}`;
  openBrowser(url);

  const notes = [
    "The browser stays on 127.0.0.1. A hosted page never fetches this daemon (Chrome 142 Local Network Access).",
    "Default metric is clicks — GSC impressions from 2025-05-13 to 2026-04-27 are contaminated.",
    opts.byo
      ? "BYO Cloud project: publish the OAuth consent screen to Production or refresh tokens expire in 7 days. The unverified warning is expected; click Advanced."
      : "Using the first-party broker when configured. Pass --byo / --credentials for a self-hosted Cloud project.",
  ];

  emit(
    opts.json,
    {
      ok: true,
      command: "connect",
      provider: "google",
      url: `http://${info.host}:${info.port}/connect`,
      origin: opts.target ?? null,
      byo: opts.byo || Boolean(opts.credentialsPath),
      credentialsRequired: false,
      notes,
    },
    `Connect Google in the local dashboard:\n  ${url}\n\n${notes.join("\n")}`,
  );
  return 0;
}
