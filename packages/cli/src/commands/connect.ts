import fs from "node:fs";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { openSqlite, sites } from "@agentsean/db";
import { upsertAdapterConnection } from "@agentsean/actions";
import {
  defaultSeanHome,
  dbPath,
  ensureSeanHome,
  isPidAlive,
  loadOrCreateToken,
  openDaemonStore,
  readPid,
} from "@agentsean/daemon";
import { parseDesktopClientJson, saveApiKey, saveByoClient } from "@agentsean/google";
import { Secret } from "@agentsean/credentials";
import {
  DEAD_PROVIDERS,
  PROVIDER_ACCOUNTS,
  isDeadProvider,
  refuseDeadProvider,
} from "@agentsean/providers";
import { startCommand } from "./start.js";
import {
  isCmsWriteKind,
  isHostedMode,
  refuseHostedCmsCredential,
} from "@agentsean/hosted";
import { emit, emitError } from "../output.js";

function openBrowser(url: string): void {
  if (process.env["SEAN_NO_BROWSER"] === "1") return;
  const plat = process.platform;
  try {
    if (plat === "darwin")
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    else if (plat === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        stdio: "ignore",
        detached: true,
      }).unref();
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
  const paid = ["dataforseo", "bing", "openpagerank", "openseo"] as const;
  if (isDeadProvider(provider)) {
    try {
      refuseDeadProvider(provider);
    } catch (err) {
      emitError(
        opts.json,
        { command: "connect", error: "dead_provider", provider },
        err instanceof Error ? err.message : String(err),
      );
      return 2;
    }
  }
  if ((paid as readonly string[]).includes(provider)) {
    if (!opts.apiKey) {
      emitError(
        opts.json,
        { command: "connect", error: "missing_key", provider },
        `Pass --api-key. ${provider === "dataforseo" ? "Use login:password." : ""}`.trim(),
      );
      return 2;
    }
    const home = ensureSeanHome(opts.home ?? defaultSeanHome());
    const store = openDaemonStore(home);
    const account =
      provider === "dataforseo"
        ? PROVIDER_ACCOUNTS.dataforseo
        : provider === "bing"
          ? PROVIDER_ACCOUNTS.bing
          : provider === "openpagerank"
            ? PROVIDER_ACCOUNTS.openpagerank
            : PROVIDER_ACCOUNTS.openseo;
    await store.set(account, new Secret(opts.apiKey));
    emit(
      opts.json,
      { ok: true, command: "connect", provider, configured: true },
      `${provider} key stored. Keyword jobs will upgrade in place. Sean never scrapes Google.`,
    );
    return 0;
  }
  const platforms = [
    "wordpress",
    "shopify",
    "cloudflare",
    "webflow",
    "ghost",
    "wix",
    "bigcommerce",
    "contentful",
    "sanity",
    "strapi",
    "payload",
  ] as const;
  if ((platforms as readonly string[]).includes(provider)) {
    if (isHostedMode() && isCmsWriteKind(provider)) {
      try {
        refuseHostedCmsCredential(provider);
      } catch (err) {
        emitError(
          opts.json,
          { command: "connect", error: "hosted_connector", provider },
          err instanceof Error ? err.message : String(err),
        );
        return 2;
      }
    }
    if (!opts.apiKey) {
      emitError(
        opts.json,
        { command: "connect", error: "missing_key", provider },
        provider === "wordpress"
          ? "Pass --api-key USER:APPLICATION_PASSWORD and the site origin."
          : `Pass --api-key for ${provider}.`,
      );
      return 2;
    }
    const home = ensureSeanHome(opts.home ?? defaultSeanHome());
    const { db, sqlite } = openSqlite(dbPath(home));
    try {
      const site = opts.target
        ? db.select().from(sites).where(eq(sites.origin, opts.target)).get()
        : db.select().from(sites).all()[0];
      if (!site) {
        emitError(
          opts.json,
          { command: "connect", error: "unknown_site" },
          "No site in the database. Run `sean audit https://example.com` first.",
        );
        return 2;
      }
      const config: Record<string, unknown> = {
        origin: opts.target ?? site.origin,
        token: opts.apiKey,
      };
      if (provider === "wordpress") {
        const [username, ...rest] = opts.apiKey.split(":");
        config["username"] = username ?? "";
        config["appPassword"] = rest.join(":");
      }
      if (provider === "shopify") {
        config["shop"] = opts.target ?? site.origin;
        config["accessToken"] = opts.apiKey;
      }
      upsertAdapterConnection(db, site.id, provider, config);
      emit(
        opts.json,
        { ok: true, command: "connect", provider, siteId: site.id },
        `${provider} connected. The same title-tag Action now writes through this adapter and is verified by re-fetching live HTML.`,
      );
      return 0;
    } finally {
      sqlite.close();
    }
  }
  if (provider !== "google") {
    emitError(
      opts.json,
      {
        command: "connect",
        error: "unknown_provider",
        provider,
        dead: DEAD_PROVIDERS.map((p) => p.id),
      },
      `Unknown provider ${provider}. Try \`sean connect google\`, a demand provider, or a platform (wordpress, shopify, cloudflare).`,
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
    emitError(
      opts.json,
      { command: "connect", error: "not_running" },
      "Sean is not running.",
    );
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
