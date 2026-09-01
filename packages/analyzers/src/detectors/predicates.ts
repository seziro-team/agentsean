import type { CrawledPage } from "@agentsean/crawler";
import { getCheck } from "../catalogue.js";
import type { AuditContext, FindingDraft } from "../types.js";

export function hit(
  ruleId: string,
  urls: string[],
  evidence: unknown,
  confidence = 1,
): FindingDraft | null {
  if (urls.length === 0) return null;
  const check = getCheck(ruleId);
  if (!check) return null;
  return {
    ruleId,
    severity: check.severity,
    autonomyTier: check.autonomyTier,
    title: check.name,
    explanation: check.explanation,
    fixTemplate: check.fixTemplate,
    urls: [...new Set(urls)],
    evidence,
    confidence,
  };
}

export function push(
  out: FindingDraft[],
  ruleId: string,
  urls: string[],
  evidence: unknown,
  confidence = 1,
): void {
  const f = hit(ruleId, urls, evidence, confidence);
  if (f) out.push(f);
}

export function htmlPages(ctx: AuditContext): CrawledPage[] {
  return ctx.crawl.pages.filter((p) => p.extract !== null);
}

export function internalPages(ctx: AuditContext): CrawledPage[] {
  return ctx.crawl.pages.filter((p) => p.isInternal);
}

export function byUrl(ctx: AuditContext): Map<string, CrawledPage> {
  const m = new Map<string, CrawledPage>();
  for (const p of ctx.crawl.pages) {
    m.set(p.url, p);
    m.set(p.finalUrl, p);
  }
  return m;
}

export function statusOf(p: CrawledPage): number | null {
  return p.statusCode;
}

export function inRange(n: number | null, a: number, b: number): boolean {
  return n !== null && n >= a && n <= b;
}

export function hops(p: CrawledPage): number {
  return Math.max(0, p.redirectChain.length - 1);
}

export function noindexOf(p: CrawledPage): boolean {
  const parts = [...(p.extract?.robotsMeta ?? []), p.extract?.xRobotsTag ?? ""]
    .join(",")
    .toLowerCase();
  return /\bnoindex\b|\bnone\b/.test(parts);
}

export function nofollowOf(p: CrawledPage): boolean {
  const parts = [...(p.extract?.robotsMeta ?? []), p.extract?.xRobotsTag ?? ""]
    .join(",")
    .toLowerCase();
  return /\bnofollow\b|\bnone\b/.test(parts);
}

export function canonicalTarget(p: CrawledPage): string | null {
  const html = p.extract?.canonicalHtml[0];
  const header = p.extract?.canonicalHeader[0];
  return html || header || null;
}

export function absCanonical(p: CrawledPage): string | null {
  const c = canonicalTarget(p);
  if (!c) return null;
  try {
    return new URL(c, p.finalUrl).href;
  } catch {
    return c;
  }
}

export function selfCanonical(p: CrawledPage): boolean {
  const c = absCanonical(p);
  if (!c) return false;
  return stripSlash(c) === stripSlash(p.finalUrl);
}

export function stripSlash(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname.endsWith("/") && u.pathname !== "/")
      u.pathname = u.pathname.slice(0, -1);
    return u.href;
  } catch {
    return url;
  }
}

export function isIndexable(p: CrawledPage): boolean {
  return (
    p.isInternal &&
    p.statusCode === 200 &&
    p.robotsAllowed &&
    !noindexOf(p) &&
    (selfCanonical(p) || !canonicalTarget(p))
  );
}

export function hasReq(ctx: AuditContext, req: string): boolean {
  if (req === "gsc") return Boolean(ctx.gsc);
  if (req === "crux") return Boolean(ctx.crux);
  if (req === "logs") return Boolean(ctx.logs);
  if (req === "migration") return Boolean(ctx.migration);
  if (req === "lighthouse") return Boolean(ctx.lighthouse);
  return true;
}

export function robotsTokens(p: CrawledPage): string[] {
  return [...(p.extract?.robotsMeta ?? []), p.extract?.xRobotsTag ?? ""]
    .join(",")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
}

export function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (2 * (i + 1) - n - 1) * (sorted[i] ?? 0);
  return acc / (n * sum);
}

export function originPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
