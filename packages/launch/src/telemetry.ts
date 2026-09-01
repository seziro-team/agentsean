import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VERSION } from "./version.js";

/**
 * Event names. The only fields we ever send are in `TelemetryPayload`.
 * Never: domain, URL, page content, GSC query, API key, IP, hostname.
 */
export const TELEMETRY_EVENTS = [
  "first_run",
  "command_used",
  "feature_used",
  "error_class",
  "cms_type",
  "service_installed",
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];

export type TelemetryPayload = {
  event: TelemetryEventName;
  version: string;
  os: string;
  arch: string;
  node: string;
  installMethod: string;
  cmsType: string | null;
  command: string | null;
  feature: string | null;
  errorClass: string | null;
};

export type TelemetryConfig = {
  enabled: boolean;
  consentedAt: string | null;
  installMethod: string;
};

const FORBIDDEN = [
  "url",
  "origin",
  "domain",
  "host",
  "query",
  "page",
  "html",
  "token",
  "key",
  "secret",
  "ip",
  "email",
  "refresh",
];

export function telemetryPath(home: string): string {
  return path.join(home, "telemetry.json");
}

export function telemetryLogPath(home: string): string {
  return path.join(home, "telemetry.log");
}

export function dntHonored(env: NodeJS.ProcessEnv = process.env): boolean {
  const dnt = env["DO_NOT_TRACK"]?.trim();
  if (dnt === "1" || dnt?.toLowerCase() === "true") return true;
  const sean = env["SEAN_TELEMETRY"]?.trim();
  if (sean === "0" || sean?.toLowerCase() === "false") return true;
  return false;
}

export function defaultConfig(installMethod = "npx"): TelemetryConfig {
  return { enabled: false, consentedAt: null, installMethod };
}

export function loadTelemetryConfig(home: string): TelemetryConfig {
  const file = telemetryPath(home);
  if (!fs.existsSync(file)) return defaultConfig();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as TelemetryConfig;
    return {
      enabled: Boolean(parsed.enabled),
      consentedAt: parsed.consentedAt ?? null,
      installMethod: parsed.installMethod || "npx",
    };
  } catch {
    return defaultConfig();
  }
}

export function saveTelemetryConfig(home: string, config: TelemetryConfig): void {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.writeFileSync(telemetryPath(home), JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function isTelemetryEnabled(
  home: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (dntHonored(env)) return false;
  return loadTelemetryConfig(home).enabled;
}

export function previewPayload(
  partial: Partial<TelemetryPayload> = {},
): TelemetryPayload {
  const payload: TelemetryPayload = {
    event: partial.event ?? "first_run",
    version: VERSION,
    os: os.platform(),
    arch: os.arch(),
    node: process.versions.node,
    installMethod: partial.installMethod ?? "npx",
    cmsType: partial.cmsType ?? null,
    command: partial.command ?? null,
    feature: partial.feature ?? null,
    errorClass: partial.errorClass ?? null,
  };
  assertSafePayload(payload);
  return payload;
}

export function assertSafePayload(payload: TelemetryPayload): void {
  const keys = new Set(Object.keys(payload).map((k) => k.toLowerCase()));
  for (const f of FORBIDDEN) {
    if (keys.has(f)) {
      throw new Error(`telemetry payload must not include ${f}`);
    }
  }
  const blob = JSON.stringify(payload).toLowerCase();
  if (/https?:\/\//.test(blob)) {
    throw new Error("telemetry payload must not include URLs");
  }
}

export function recordEvent(
  home: string,
  partial: Partial<TelemetryPayload> & { event: TelemetryEventName },
  env: NodeJS.ProcessEnv = process.env,
): TelemetryPayload | null {
  if (!isTelemetryEnabled(home, env)) return null;
  const cfg = loadTelemetryConfig(home);
  const payload = previewPayload({
    ...partial,
    installMethod: cfg.installMethod,
  });
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.appendFileSync(telemetryLogPath(home), JSON.stringify(payload) + "\n", {
    mode: 0o600,
  });
  const dest = env["SEAN_TELEMETRY_URL"]?.trim();
  if (dest) {
    void fetch(dest, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }
  return payload;
}

export function readTelemetryLog(home: string): TelemetryPayload[] {
  const file = telemetryLogPath(home);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TelemetryPayload);
}

export function consentTelemetry(
  home: string,
  enabled: boolean,
  installMethod: string,
): TelemetryConfig {
  const config: TelemetryConfig = {
    enabled,
    consentedAt: new Date().toISOString(),
    installMethod,
  };
  saveTelemetryConfig(home, config);
  return config;
}
