import { defaultSeanHome, ensureSeanHome } from "@agentsean/daemon";
import {
  consentTelemetry,
  isTelemetryEnabled,
  loadTelemetryConfig,
  previewPayload,
  readInstallMethod,
  readTelemetryLog,
} from "@agentsean/launch";
import { emit, emitError } from "../output.js";

export async function telemetryCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const action = (opts.target ?? "status").toLowerCase();
  const method = readInstallMethod(home);

  if (action === "log") {
    const events = readTelemetryLog(home);
    emit(
      opts.json,
      { ok: true, command: "telemetry", action: "log", events },
      events.length === 0
        ? "No telemetry events recorded."
        : events.map((e) => JSON.stringify(e)).join("\n"),
    );
    return 0;
  }

  if (action === "on" || action === "off") {
    const cfg = consentTelemetry(home, action === "on", method);
    emit(
      opts.json,
      { ok: true, command: "telemetry", enabled: cfg.enabled, preview: previewPayload({ installMethod: method }) },
      cfg.enabled
        ? `Telemetry on. Payload preview:\n${JSON.stringify(previewPayload({ installMethod: method }), null, 2)}\nOpt out: sean telemetry off · DO_NOT_TRACK=1`
        : "Telemetry off. Nothing is sent.",
    );
    return 0;
  }

  if (action === "status" || action === "preview") {
    const cfg = loadTelemetryConfig(home);
    const enabled = isTelemetryEnabled(home);
    const preview = previewPayload({ installMethod: cfg.installMethod || method });
    emit(
      opts.json,
      {
        ok: true,
        command: "telemetry",
        enabled,
        consentedAt: cfg.consentedAt,
        preview,
      },
      `Telemetry ${enabled ? "on" : "off"}. Preview:\n${JSON.stringify(preview, null, 2)}`,
    );
    return 0;
  }

  emitError(
    opts.json,
    { command: "telemetry", error: "unknown_action" },
    "Usage: sean telemetry [status|log|on|off]",
  );
  return 2;
}
