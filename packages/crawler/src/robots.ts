/**
 * Vendored robots.txt matcher.
 *
 * `robots-parser` 3.0.1 last published 2023-02-21 (stale). We do not depend
 * on it. This implements RFC 9309 matching (most-octets wins, allow wins ties)
 * with Google-style group selection (single most-specific user-agent group,
 * no merge across product tokens).
 *
 * Status handling (both modes are RFC 9309 compliant):
 * - 4xx except 429 → allow-all (RFC §2.3.1.3)
 * - 5xx / 429 / network → polite-crawl: disallow-all (RFC §2.3.1.4 MUST)
 */
import { contentHash } from "./hash.js";
import { pathOf } from "./url.js";
import type { RobotsGroup, RobotsOutcome } from "./types.js";

const KNOWN = new Set([
  "user-agent",
  "allow",
  "disallow",
  "sitemap",
  "crawl-delay",
]);

export function parseRobotsTxt(raw: string): Omit<
  RobotsOutcome,
  "statusCode" | "contentType" | "bytes" | "redirectHops" | "error" | "mode"
> {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const unknownDirectives: string[] = [];
  let hasNoindexDirective = false;
  let current: RobotsGroup | null = null;
  let pendingAgents: string[] = [];

  const flushAgents = () => {
    if (pendingAgents.length === 0) return;
    current = { agents: pendingAgents, rules: [], crawlDelay: null };
    groups.push(current);
    pendingAgents = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 1) {
      unknownDirectives.push(rawLine.trim());
      continue;
    }
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (current && current.rules.length + (current.crawlDelay ? 1 : 0) > 0) {
        pendingAgents = [value.toLowerCase()];
        current = null;
      } else if (pendingAgents.length > 0 && current === null) {
        pendingAgents.push(value.toLowerCase());
      } else if (current && current.rules.length === 0 && !current.crawlDelay) {
        current.agents.push(value.toLowerCase());
      } else {
        pendingAgents = [value.toLowerCase()];
        current = null;
      }
      continue;
    }

    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }

    if (field === "noindex") {
      hasNoindexDirective = true;
      continue;
    }

    if (!KNOWN.has(field)) {
      unknownDirectives.push(`${field}: ${value}`);
      continue;
    }

    flushAgents();
    if (!current) {
      current = { agents: ["*"], rules: [], crawlDelay: null };
      groups.push(current);
    }

    if (field === "allow") {
      current.rules.push({ type: "allow", pattern: value });
    } else if (field === "disallow") {
      current.rules.push({ type: "disallow", pattern: value });
    } else if (field === "crawl-delay") {
      const n = Number(value);
      current.crawlDelay = Number.isFinite(n) ? n : current.crawlDelay;
    }
  }

  const hasCrawlDelay = groups.some((g) => g.crawlDelay !== null);
  const crawlDelay = groups.find((g) => g.crawlDelay !== null)?.crawlDelay ?? null;
  const disallowAll = groups.some(
    (g) =>
      (g.agents.includes("*") || g.agents.includes("googlebot")) &&
      g.rules.some((r) => r.type === "disallow" && (r.pattern === "/" || r.pattern === "/*")),
  );

  return {
    raw,
    groups,
    sitemaps,
    unknownDirectives,
    hasNoindexDirective,
    hasCrawlDelay,
    crawlDelay,
    disallowAll,
    hash: contentHash(raw),
  };
}

export function robotsFromFetch(opts: {
  statusCode: number | null;
  raw: string;
  contentType: string;
  bytes: number;
  redirectHops: number;
  error: string | null;
}): RobotsOutcome {
  const serverError =
    opts.error !== null ||
    opts.statusCode === 429 ||
    (opts.statusCode !== null && opts.statusCode >= 500);
  if (serverError) {
    const parsed = parseRobotsTxt(opts.raw || "");
    return {
      ...parsed,
      ...opts,
      mode: "disallow-all",
      groups: parsed.groups,
    };
  }
  if (
    opts.statusCode !== null &&
    opts.statusCode >= 400 &&
    opts.statusCode < 500
  ) {
    const parsed = parseRobotsTxt("");
    return { ...parsed, ...opts, raw: opts.raw, mode: "allow-all" };
  }
  const parsed = parseRobotsTxt(opts.raw);
  return { ...parsed, ...opts, mode: "parsed" };
}

export function isAllowedByRobots(
  robots: RobotsOutcome,
  url: string,
  userAgent = "seanbot",
): boolean {
  if (robots.mode === "allow-all") return true;
  if (robots.mode === "disallow-all") return false;
  const path = pathOf(url);
  const group = selectGroup(robots.groups, userAgent);
  if (!group) return true;
  return mostSpecificAllows(group, path);
}

function selectGroup(groups: RobotsGroup[], ua: string): RobotsGroup | undefined {
  const uaLower = ua.toLowerCase();
  const matching = groups.filter((g) =>
    g.agents.some((a) => a === "*" || uaLower.includes(a)),
  );
  const specific = matching.filter((g) => g.agents.some((a) => a !== "*"));
  if (specific.length > 0) {
    specific.sort((a, b) => longestAgent(b) - longestAgent(a));
    return specific[0];
  }
  return matching.find((g) => g.agents.includes("*"));
}

function longestAgent(g: RobotsGroup): number {
  return Math.max(0, ...g.agents.map((a) => (a === "*" ? 0 : a.length)));
}

function mostSpecificAllows(group: RobotsGroup, path: string): boolean {
  let bestOctets = -1;
  let allowed = true;
  for (const rule of group.rules) {
    if (!rule.pattern) continue;
    if (!matchRule(rule.pattern, path)) continue;
    const octets = Buffer.byteLength(rule.pattern);
    if (octets > bestOctets) {
      bestOctets = octets;
      allowed = rule.type === "allow";
    } else if (octets === bestOctets && rule.type === "allow") {
      allowed = true;
    }
  }
  return allowed;
}

export function matchRule(pattern: string, path: string): boolean {
  let end = false;
  let p = pattern;
  if (p.endsWith("$")) {
    end = true;
    p = p.slice(0, -1);
  }
  let re = "^";
  for (const ch of p) {
    if (ch === "*") re += ".*";
    else re += escapeRe(ch);
  }
  if (end) re += "$";
  return new RegExp(re).test(path);
}

function escapeRe(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
