import { loadAdapterConnection, listAdapterConnections, type SiteAdapter } from "@agentsean/actions";
import type { SqliteDatabase } from "@agentsean/db";
import { createGitAdapter } from "@agentsean/adapter-git";
import { createWordpressAdapter } from "@agentsean/adapter-wordpress";
import { createShopifyAdapter } from "@agentsean/adapter-shopify";
import { createCloudflareAdapter } from "@agentsean/adapter-cloudflare";
import {
  createBigCommerceAdapter,
  createGhostAdapter,
  createHeadlessAdapter,
  createWebflowAdapter,
  createWixAdapter,
} from "@agentsean/adapter-saas";

export const PLATFORM_KINDS = [
  "git",
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

export type PlatformKind = (typeof PLATFORM_KINDS)[number];

export function isPlatformKind(value: string): value is PlatformKind {
  return (PLATFORM_KINDS as readonly string[]).includes(value);
}

export type FactoryOpts = {
  fetch?: typeof fetch | undefined;
};

function str(config: Record<string, unknown>, key: string): string | undefined {
  const v = config[key];
  return typeof v === "string" ? v : undefined;
}

export function createSiteAdapter(
  kind: string,
  config: Record<string, unknown>,
  opts?: FactoryOpts,
): SiteAdapter {
  const fetchFn = opts?.fetch;
  switch (kind) {
    case "git": {
      const repoPath = str(config, "repoPath");
      if (!repoPath) throw new Error("git adapter requires repoPath");
      const token = str(config, "token");
      return createGitAdapter({
        repoPath,
        ...(token ? { token } : {}),
        ...(fetchFn ? { fetch: fetchFn } : {}),
      });
    }
    case "wordpress": {
      const origin = str(config, "origin");
      const username = str(config, "username");
      const appPassword = str(config, "appPassword") ?? str(config, "token");
      if (!origin || !username || !appPassword) {
        throw new Error("wordpress adapter requires origin, username, appPassword");
      }
      return createWordpressAdapter({
        origin,
        username,
        appPassword,
        ...(fetchFn ? { fetch: fetchFn } : {}),
      });
    }
    case "shopify": {
      const shop = str(config, "shop") ?? str(config, "origin");
      const accessToken = str(config, "accessToken") ?? str(config, "token");
      if (!shop || !accessToken) throw new Error("shopify adapter requires shop and accessToken");
      const storefrontOrigin = str(config, "storefrontOrigin");
      return createShopifyAdapter({
        shop,
        accessToken,
        ...(storefrontOrigin ? { storefrontOrigin } : {}),
        ...(fetchFn ? { fetch: fetchFn } : {}),
      });
    }
    case "cloudflare": {
      const origin = str(config, "origin");
      if (!origin) throw new Error("cloudflare adapter requires origin");
      return createCloudflareAdapter({
        origin,
        ...(fetchFn ? { fetch: fetchFn } : {}),
      });
    }
    case "webflow": {
      const origin = str(config, "origin") ?? "https://api.webflow.com";
      const token = str(config, "token");
      if (!token) throw new Error("webflow adapter requires token");
      return createWebflowAdapter({ origin, token, ...(fetchFn ? { fetch: fetchFn } : {}) });
    }
    case "ghost": {
      const origin = str(config, "origin");
      const adminKey = str(config, "adminKey") ?? str(config, "token");
      if (!origin || !adminKey) throw new Error("ghost adapter requires origin and adminKey");
      return createGhostAdapter({ origin, adminKey, ...(fetchFn ? { fetch: fetchFn } : {}) });
    }
    case "wix": {
      const origin = str(config, "origin") ?? "https://www.wixapis.com";
      const token = str(config, "token");
      if (!token) throw new Error("wix adapter requires token");
      const siteId = str(config, "siteId");
      return createWixAdapter({
        origin,
        token,
        ...(siteId ? { siteId } : {}),
        ...(fetchFn ? { fetch: fetchFn } : {}),
      });
    }
    case "bigcommerce": {
      const storeHash = str(config, "storeHash");
      const token = str(config, "token");
      if (!storeHash || !token) throw new Error("bigcommerce adapter requires storeHash and token");
      return createBigCommerceAdapter({ storeHash, token, ...(fetchFn ? { fetch: fetchFn } : {}) });
    }
    case "contentful":
    case "sanity":
    case "strapi":
    case "payload": {
      const endpoint = str(config, "endpoint") ?? str(config, "origin");
      const token = str(config, "token");
      if (!endpoint || !token) throw new Error(`${kind} adapter requires endpoint and token`);
      return createHeadlessAdapter({
        kind,
        endpoint,
        token,
        ...(fetchFn ? { fetch: fetchFn } : {}),
      });
    }
    default:
      throw new Error(`unknown adapter kind ${kind}`);
  }
}

export function adapterForSite(
  db: SqliteDatabase,
  siteId: string,
  opts?: FactoryOpts & { prefer?: string | undefined },
): SiteAdapter {
  if (opts?.prefer) {
    const cfg = loadAdapterConnection(db, siteId, opts.prefer);
    if (cfg) return createSiteAdapter(opts.prefer, cfg, opts);
  }
  const rows = listAdapterConnections(db, siteId);
  const order = ["wordpress", "shopify", "git", "cloudflare", "webflow", "ghost", "wix", "bigcommerce"];
  for (const kind of order) {
    const row = rows.find((r) => r.kind === kind);
    if (row) return createSiteAdapter(row.kind, row.config, opts);
  }
  if (rows[0]) return createSiteAdapter(rows[0].kind, rows[0].config, opts);
  throw new Error("no adapter connected for this site");
}
