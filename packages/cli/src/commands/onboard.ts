import {
  CSRF_HEADER,
  DEFAULT_HOST,
  DEFAULT_PORT,
  defaultSeanHome,
  ensureSeanHome,
  loadOrCreateToken,
  openDaemonStore,
  readPid,
  TOKEN_HEADER,
} from "@agentsean/daemon";
import {
  consentTelemetry,
  dntHonored,
  isOnboarded,
  markOnboarded,
  ONBOARD_QUESTIONS,
  parseCms,
  parseSiteUrl,
  previewPayload,
  provisionHome,
  readInstallMethod,
  SERVICE_HINT,
  type CmsKind,
} from "@agentsean/launch";
import { emit, emitError } from "../output.js";
import { startCommand } from "./start.js";

export async function onboardCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
  cms?: string | undefined;
  telemetry?: string | undefined;
  noStart?: boolean | undefined;
  host?: string | undefined;
  port?: number | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  provisionHome(home, readInstallMethod(home));
  const method = readInstallMethod(home);

  const url = parseSiteUrl(opts.target);
  if (opts.target && !url) {
    emitError(
      opts.json,
      { command: "onboard", error: "invalid_url", target: opts.target },
      `Invalid URL: ${opts.target}`,
    );
    return 2;
  }
  const cms: CmsKind = parseCms(opts.cms) ?? "other";
  const telemetryOff =
    dntHonored() ||
    opts.telemetry === "off" ||
    opts.telemetry === "0" ||
    opts.telemetry === "no";
  const telemetryOn = opts.telemetry === "on" || opts.telemetry === "yes";
  // Non-interactive default is off — never enable silently (GitHub CLI 2026).
  const enableTelemetry = telemetryOn && !telemetryOff;
  consentTelemetry(home, enableTelemetry, method);

  if (!opts.noStart) {
    const code = await startCommand({
      json: opts.json,
      foreground: false,
      host: opts.host,
      port: opts.port,
      home,
      quiet: true,
    });
    if (code !== 0) return code;
  }

  const info = readPid(home);
  const host = info?.host ?? opts.host ?? DEFAULT_HOST;
  const port = info?.port ?? opts.port ?? DEFAULT_PORT;
  const store = openDaemonStore(home);
  const token = await loadOrCreateToken(store);
  const dashboard = `http://${host}:${port}/#token=${token.unwrap()}`;

  let crawl: Record<string, unknown> | null = null;
  if (url && info) {
    try {
      const res = await fetch(`http://${host}:${port}/api/onboard`, {
        method: "POST",
        headers: {
          Host: `${host}:${port}`,
          [TOKEN_HEADER]: token.unwrap(),
          [CSRF_HEADER]: "1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ url, maxPages: 80, render: false }),
      });
      crawl = (await res.json()) as Record<string, unknown>;
    } catch (err) {
      emitError(
        opts.json,
        { command: "onboard", error: "crawl_failed", detail: String(err) },
        `Started Sean but the first crawl failed: ${String(err)}`,
      );
      return 1;
    }
  }

  const already = isOnboarded(home);
  markOnboarded(home);
  const preview = previewPayload({ installMethod: method, cmsType: cms });
  emit(
    opts.json,
    {
      ok: true,
      command: "onboard",
      already,
      url: url ?? null,
      cms,
      telemetry: enableTelemetry,
      questions: ONBOARD_QUESTIONS.map((q) => q.id),
      dashboard,
      preview,
      crawl,
      next: ["sean service install", "sean connect google", "sean doctor"],
    },
    [
      url
        ? `Sean is on ${url} (${cms}).`
        : "Sean is provisioned. Pass a URL to crawl now, or open the dashboard.",
      `Dashboard: ${dashboard}`,
      enableTelemetry
        ? `Telemetry on. Preview: ${JSON.stringify(preview)}`
        : "Telemetry off. sean telemetry on to share anonymous events.",
      SERVICE_HINT,
      "Connect Google when you want clicks: sean connect google",
    ].join("\n"),
  );
  return 0;
}
