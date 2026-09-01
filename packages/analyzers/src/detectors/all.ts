import type { CrawledPage } from "@agentsean/crawler";
import { nearDuplicate } from "@agentsean/crawler";
import { googleSupportedTypes, validateJsonLdBlocks, flattenTypes } from "../schemaorg.js";
import { checksByCategory } from "../catalogue.js";
import type { AuditContext, FindingDraft } from "../types.js";
import {
  absCanonical,
  byUrl,
  gini,
  hasReq,
  hops,
  htmlPages,
  inRange,
  isIndexable,
  nofollowOf,
  noindexOf,
  originPath,
  push,
  robotsTokens,
  selfCanonical,
  stripSlash,
} from "./predicates.js";

const GENERIC_ANCHORS = new Set([
  "click here",
  "read more",
  "here",
  "this",
  "learn more",
  "more",
]);
const FACET_PARAMS = /[?&](sort|order|orderby|view|display|limit|per_page|filter|color|size|price)=/i;
const SESSION_RE = /[?&](sid|sessionid|phpsessid|jsessionid)=/i;
const DATE_RE = /[?&](date|month|year|day)=/i;
const AI_BOTS = [
  "google-extended",
  "gptbot",
  "claudebot",
  "perplexitybot",
  "ccbot",
  "applebot-extended",
  "bytespider",
  "meta-externalagent",
];

export function detectResp(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = ctx.crawl.pages;
  const map = byUrl(ctx);
  push(out, "RESP.5XX_INTERNAL", pages.filter((p) => p.isInternal && inRange(p.statusCode, 500, 599)).map((p) => p.url), {});
  push(out, "RESP.4XX_INTERNAL", pages.filter((p) => p.isInternal && inRange(p.statusCode, 400, 499) && p.statusCode !== 429).map((p) => p.url), {});
  push(out, "RESP.429", pages.filter((p) => p.statusCode === 429).map((p) => p.url), {});
  push(out, "RESP.NO_RESPONSE", pages.filter((p) => p.statusCode === null).map((p) => p.url), {});
  push(out, "RESP.REDIRECT_CHAIN", pages.filter((p) => hops(p) >= 2).map((p) => p.url), {});
  push(out, "RESP.REDIRECT_CHAIN_LONG", pages.filter((p) => hops(p) >= 5).map((p) => p.url), {});
  push(out, "RESP.REDIRECT_LOOP", pages.filter((p) => p.redirectLoop).map((p) => p.url), {});
  const internal3xx: string[] = [];
  for (const p of htmlPages(ctx)) {
    for (const l of p.extract?.links ?? []) {
      if (!l.isInternal) continue;
      const t = map.get(l.absUrl);
      if (t && inRange(t.statusCode, 300, 399)) internal3xx.push(p.url);
    }
  }
  push(out, "RESP.INTERNAL_3XX", internal3xx, {});
  push(out, "RESP.302_PERMANENT", pages.filter((p) => p.statusCode === 302 || p.statusCode === 307).map((p) => p.url), {}, 0.5);
  push(out, "RESP.META_REFRESH", htmlPages(ctx).filter((p) => Boolean(p.extract?.metaRefresh)).map((p) => p.url), {});
  push(out, "RESP.HTTP_REFRESH", pages.filter((p) => Boolean(p.headers.refresh)).map((p) => p.url), {});
  push(out, "RESP.JS_REDIRECT", pages.filter((p) => p.rendered && p.renderedExtract && p.finalUrl !== p.url && hops(p) === 0 && !p.extract?.metaRefresh).map((p) => p.url), {});
  push(out, "RESP.REDIRECT_TO_404", pages.filter((p) => hops(p) >= 1 && inRange(p.statusCode, 400, 599)).map((p) => p.url), {});
  push(out, "RESP.REDIRECT_TO_NOINDEX", pages.filter((p) => hops(p) >= 1 && noindexOf(p)).map((p) => p.url), {});
  const toHome = pages.filter((p) => hops(p) >= 1 && originPath(p.finalUrl) === "/");
  if (toHome.length >= 20) push(out, "RESP.SOFT_REDIRECT_HOME", toHome.map((p) => p.url), { count: toHome.length });
  push(out, "RESP.MIXED_PROTOCOL_CHAIN", pages.filter((p) => {
    const urls = p.redirectChain.map((h) => h.url);
    const proto = urls.some((u) => u.startsWith("http:")) && urls.some((u) => u.startsWith("https:"));
    const host = new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return u; } })).size > 1;
    return proto && host;
  }).map((p) => p.url), {});
  const ext4: string[] = [];
  const ext5: string[] = [];
  for (const p of pages) {
    if (p.isInternal) continue;
    if (inRange(p.statusCode, 400, 499)) ext4.push(p.url);
    if (inRange(p.statusCode, 500, 599)) ext5.push(p.url);
  }
  push(out, "RESP.EXT_4XX", ext4, {});
  push(out, "RESP.EXT_5XX", ext5, {});
  push(out, "RESP.BLOCKED_ROBOTS", pages.filter((p) => p.isInternal && !p.robotsAllowed && p.inlinkCount > 0).map((p) => p.url), {});
  push(out, "RESP.BLOCKED_RESOURCE", pages.filter((p) => p.extract?.scripts.some((s) => s.absUrl && !pageAllowed(ctx, s.absUrl))).map((p) => p.url), {});
  push(out, "RESP.SLOW_TTFB", pages.filter((p) => p.ttfbMs > 600).map((p) => p.url), {});
  push(out, "RESP.NO_304", pages.filter((p) => p.supports304 === false).map((p) => p.url), {});
  push(out, "RESP.BAD_CONTENT_TYPE", pages.filter((p) => p.html !== null && p.contentType !== "" && !/html|xml/i.test(p.contentType)).map((p) => p.url), {});
  push(out, "RESP.OVER_2MB_HTML", pages.filter((p) => p.html !== null && p.decodedBytes > 2_097_152).map((p) => p.url), {});
  push(out, "RESP.OVER_15MB", pages.filter((p) => p.decodedBytes > 15_728_640).map((p) => p.url), {});
  return out;
}

function pageAllowed(ctx: AuditContext, url: string): boolean {
  if (!ctx.crawl.robots) return true;
  const p = ctx.crawl.pages.find((x) => x.url === url);
  if (p) return p.robotsAllowed;
  return true;
}

export function detectCanon(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  const map = byUrl(ctx);
  const sitemap = sitemapSet(ctx);
  push(out, "CANON.MISSING", pages.filter((p) => p.statusCode === 200 && (p.extract?.canonicalHtml.length ?? 0) === 0 && (p.extract?.canonicalHeader.length ?? 0) === 0).map((p) => p.url), {});
  push(out, "CANON.MULTIPLE_CONFLICT", pages.filter((p) => {
    const vals = new Set([...(p.extract?.canonicalHtml ?? []), ...(p.extract?.canonicalHeader ?? [])].map((c) => absMaybe(c, p.finalUrl)));
    return vals.size > 1;
  }).map((p) => p.url), {});
  push(out, "CANON.MULTIPLE_SAME", pages.filter((p) => (p.extract?.canonicalHtml.length ?? 0) > 1).map((p) => p.url), {});
  push(out, "CANON.HTML_HEADER_MISMATCH", pages.filter((p) => {
    const h = p.extract?.canonicalHtml[0];
    const d = p.extract?.canonicalHeader[0];
    return Boolean(h && d && absMaybe(h, p.finalUrl) !== absMaybe(d, p.finalUrl));
  }).map((p) => p.url), {});
  push(out, "CANON.OUTSIDE_HEAD", pages.filter((p) => p.extract?.canonicalOutsideHead).map((p) => p.url), {});
  push(out, "CANON.HEAD_BROKEN_EARLY", pages.filter((p) => p.extract?.headBrokenEarly).map((p) => p.url), {});
  push(out, "CANON.RELATIVE", pages.filter((p) => (p.extract?.canonicalHtml[0] ?? "").length > 0 && !/^https?:/i.test(p.extract?.canonicalHtml[0] ?? "")).map((p) => p.url), {});
  push(out, "CANON.FRAGMENT", pages.filter((p) => (p.extract?.canonicalHtml[0] ?? "").includes("#")).map((p) => p.url), {});
  push(out, "CANON.EMPTY_MALFORMED", pages.filter((p) => p.extract?.canonicalHtml.some((c) => !c.trim() || !absMaybe(c, p.finalUrl))).map((p) => p.url), {});
  push(out, "CANON.TO_NON_200", pages.filter((p) => {
    const c = absCanonical(p);
    const t = c ? map.get(c) : undefined;
    return Boolean(t && t.statusCode !== null && t.statusCode >= 400);
  }).map((p) => p.url), {});
  push(out, "CANON.TO_REDIRECT", pages.filter((p) => {
    const c = absCanonical(p);
    const t = c ? map.get(c) : undefined;
    return Boolean(t && inRange(t.statusCode, 300, 399));
  }).map((p) => p.url), {});
  push(out, "CANON.TO_NOINDEX", pages.filter((p) => {
    const c = absCanonical(p);
    const t = c ? map.get(c) : undefined;
    return Boolean(t && noindexOf(t));
  }).map((p) => p.url), {});
  push(out, "CANON.TO_DISALLOWED", pages.filter((p) => {
    const c = absCanonical(p);
    const t = c ? map.get(c) : undefined;
    return Boolean(t && !t.robotsAllowed);
  }).map((p) => p.url), {});
  push(out, "CANON.CHAIN", pages.filter((p) => {
    const c = absCanonical(p);
    if (!c) return false;
    const t = map.get(c);
    if (!t) return false;
    const cc = absCanonical(t);
    return Boolean(cc && stripSlash(cc) !== stripSlash(t.finalUrl));
  }).map((p) => p.url), {});
  push(out, "CANON.LOOP", pages.filter((p) => {
    const a = absCanonical(p);
    if (!a) return false;
    const t = map.get(a);
    return Boolean(t && stripSlash(absCanonical(t) ?? "") === stripSlash(p.finalUrl) && stripSlash(a) !== stripSlash(p.finalUrl));
  }).map((p) => p.url), {});
  push(out, "CANON.TO_HTTP", pages.filter((p) => p.finalUrl.startsWith("https:") && (absCanonical(p) ?? "").startsWith("http:")).map((p) => p.url), {});
  push(out, "CANON.TO_HOMEPAGE", pages.filter((p) => {
    const c = absCanonical(p);
    if (!c) return false;
    try {
      return new URL(c).pathname === "/" && new URL(p.finalUrl).pathname !== "/";
    } catch { return false; }
  }).map((p) => p.url), {});
  push(out, "CANON.CANONICALISED", pages.filter((p) => absCanonical(p) && !selfCanonical(p)).map((p) => p.url), {});
  push(out, "CANON.CANONICALISED_IN_SITEMAP", pages.filter((p) => absCanonical(p) && !selfCanonical(p) && sitemap.has(p.url)).map((p) => p.url), {});
  push(out, "CANON.NOINDEX_AND_CANONICAL", pages.filter((p) => noindexOf(p) && absCanonical(p) && !selfCanonical(p)).map((p) => p.url), {});
  push(out, "CANON.RENDER_MISMATCH", pages.filter((p) => p.renderedExtract && (p.extract?.canonicalHtml[0] ?? "") !== (p.renderedExtract.canonicalHtml[0] ?? "")).map((p) => p.url), {});
  push(out, "CANON.RENDER_ONLY", pages.filter((p) => p.renderedExtract && (p.extract?.canonicalHtml.length ?? 0) === 0 && p.renderedExtract.canonicalHtml.length > 0).map((p) => p.url), {});
  push(out, "CANON.UNLINKED", pages.filter((p) => {
    const c = absCanonical(p);
    const t = c ? map.get(c) : undefined;
    return Boolean(t && t.inlinkCount === 0 && !selfCanonical(p));
  }).map((p) => p.url), {});
  push(out, "CANON.CROSS_DOMAIN", pages.filter((p) => {
    const c = absCanonical(p);
    if (!c) return false;
    try { return new URL(c).hostname !== new URL(p.finalUrl).hostname; } catch { return false; }
  }).map((p) => p.url), {});
  push(out, "CANON.PARAM_VARIANT", pages.filter((p) => /[?&](utm_|gclid|fbclid|msclkid|_ga)/i.test(p.url) && selfCanonical(p)).map((p) => p.url), {});
  if (ctx.crawl.originProbe.wwwSplit) push(out, "CANON.WWW_SPLIT", [ctx.crawl.origin], {});
  if (ctx.crawl.originProbe.trailingSlashSplit) push(out, "CANON.TRAILING_SLASH_SPLIT", [ctx.crawl.origin], {});
  push(out, "CANON.CASE_SPLIT", pages.filter((p) => p.url !== p.url.toLowerCase() && p.statusCode === 200).map((p) => p.url), {});
  push(out, "CANON.INDEX_HTML_SPLIT", pages.filter((p) => /\/index\.html?$/i.test(p.url) && p.statusCode === 200).map((p) => p.url), {});
  return out;
}

function absMaybe(href: string, base: string): string {
  try { return new URL(href, base).href; } catch { return href; }
}

function sitemapSet(ctx: AuditContext): Set<string> {
  return new Set(ctx.crawl.sitemaps.flatMap((s) => s.urls.map((u) => u.loc)));
}

export function detectRobots(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const r = ctx.crawl.robots;
  const origin = ctx.crawl.origin;
  if (!r || r.statusCode === 404 || r.mode === "allow-all" && (r.raw ?? "") === "") {
    push(out, "ROBOTS.MISSING", [origin], { status: r?.statusCode ?? null });
  }
  if (r && (r.statusCode ?? 0) >= 500) push(out, "ROBOTS.5XX", [origin], { status: r.statusCode });
  if (r && r.redirectHops > 0) push(out, "ROBOTS.REDIRECTS", [origin], { hops: r.redirectHops });
  if (r && r.contentType && !/text\/plain/i.test(r.contentType) && r.statusCode === 200) {
    push(out, "ROBOTS.WRONG_CONTENT_TYPE", [origin], { contentType: r.contentType });
  }
  if (r && r.bytes > 512_000) push(out, "ROBOTS.OVER_500KIB", [origin], { bytes: r.bytes });
  if (r?.disallowAll) push(out, "ROBOTS.DISALLOW_ALL", [origin], {});
  if (r?.hasNoindexDirective) push(out, "ROBOTS.NOINDEX_DIRECTIVE", [origin], {});
  if (r?.hasCrawlDelay) push(out, "ROBOTS.CRAWL_DELAY", [origin], { crawlDelay: r.crawlDelay });
  if (r && r.sitemaps.length === 0 && r.statusCode === 200) push(out, "ROBOTS.NO_SITEMAP_LINE", [origin], {});
  if (r) {
    for (const sm of r.sitemaps) {
      if (!/^https?:\/\//i.test(sm)) push(out, "ROBOTS.SITEMAP_RELATIVE", [origin], { sitemap: sm });
    }
  }
  const sm404 = ctx.crawl.sitemaps.filter((s) => s.statusCode === 404);
  if (sm404.length) push(out, "ROBOTS.SITEMAP_LINE_404", sm404.map((s) => s.url), {});
  if (r && r.unknownDirectives.length) push(out, "ROBOTS.SYNTAX_ERROR", [origin], { lines: r.unknownDirectives.slice(0, 10) });
  if (r && r.groups.some((g) => g.agents.includes("*")) && r.groups.some((g) => g.agents.some((a) => a.includes("googlebot")))) {
    const starIdx = r.raw.toLowerCase().indexOf("user-agent: *");
    const gIdx = r.raw.toLowerCase().indexOf("user-agent: googlebot");
    if (starIdx >= 0 && gIdx > starIdx) push(out, "ROBOTS.UA_ORDER_TRAP", [origin], {});
  }
  if (r && AI_BOTS.some((b) => r.raw.toLowerCase().includes(b) && /disallow:\s*\//i.test(r.raw))) {
    push(out, "ROBOTS.BLOCKS_AI_UNINTENDED", [origin], {});
  }
  if (ctx.previousRobotsHash && r && ctx.previousRobotsHash !== r.hash) {
    push(out, "ROBOTS.CHANGED", [origin], { previous: ctx.previousRobotsHash, current: r.hash });
  }
  const blockedCss = htmlPages(ctx).filter((p) =>
    (p.extract?.stylesheets.some((s) => s.absUrl && !pageAllowed(ctx, s.absUrl)) ?? false) ||
    (p.extract?.scripts.some((s) => s.absUrl && !pageAllowed(ctx, s.absUrl)) ?? false),
  );
  push(out, "ROBOTS.BLOCKS_CSS_JS", blockedCss.map((p) => p.url), {});
  push(out, "ROBOTS.BLOCKS_IMAGES", htmlPages(ctx).filter((p) => p.extract?.images.some((i) => i.absUrl && !pageAllowed(ctx, i.absUrl))).map((p) => p.url), {});
  const smBlocked = [...sitemapSet(ctx)].filter((u) => {
    const p = ctx.crawl.pages.find((x) => x.url === u);
    return p ? !p.robotsAllowed : false;
  });
  push(out, "ROBOTS.BLOCKS_SITEMAP_URLS", smBlocked, {});
  return out;
}

export function detectDirect(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  const sitemap = sitemapSet(ctx);
  if (hasReq(ctx, "gsc") && ctx.gsc?.clicksByUrl) {
    push(out, "DIRECT.NOINDEX_INDEXABLE_TEMPLATE", pages.filter((p) => noindexOf(p) && (ctx.gsc?.clicksByUrl?.[p.url] ?? 0) > 0).map((p) => p.url), {});
  }
  push(out, "DIRECT.NOINDEX_UNEXPECTED", pages.filter((p) => noindexOf(p) && sitemap.has(p.url)).map((p) => p.url), {});
  push(out, "DIRECT.NOINDEX_HTML_HEADER_MISMATCH", pages.filter((p) => {
    const html = (p.extract?.robotsMeta.join(",") ?? "").toLowerCase().includes("noindex");
    const header = (p.extract?.xRobotsTag ?? "").toLowerCase().includes("noindex");
    return html !== header && (html || header);
  }).map((p) => p.url), {});
  push(out, "DIRECT.MULTIPLE_NOINDEX", pages.filter((p) => (p.extract?.robotsMeta.filter((m) => /noindex/i.test(m)).length ?? 0) > 1).map((p) => p.url), {});
  push(out, "DIRECT.OUTSIDE_HEAD", pages.filter((p) => (p.extract?.robotsMeta.length ?? 0) > 0 && !p.extract?.robotsMetaInHead).map((p) => p.url), {});
  push(out, "DIRECT.RENDER_ONLY_NOINDEX", pages.filter((p) => p.renderedExtract && noindexOf(p) && !/\bnoindex\b/i.test(p.renderedExtract.robotsMeta.join(","))).map((p) => p.url), {});
  push(out, "DIRECT.JS_ADDED_NOINDEX", pages.filter((p) => p.renderedExtract && !noindexOf(p) && /\bnoindex\b/i.test(p.renderedExtract.robotsMeta.join(","))).map((p) => p.url), {});
  push(out, "DIRECT.NOFOLLOW_SITEWIDE", pages.filter((p) => nofollowOf(p) && (p.extract?.links.some((l) => l.isInternal) ?? false)).map((p) => p.url), {});
  push(out, "DIRECT.NONE", pages.filter((p) => robotsTokens(p).includes("none")).map((p) => p.url), {});
  push(out, "DIRECT.UNAVAILABLE_AFTER_PAST", pages.filter((p) => robotsTokens(p).some((t) => t.startsWith("unavailable_after"))).map((p) => p.url), {}, 0.6);
  if (hasReq(ctx, "gsc")) {
    push(out, "DIRECT.NOSNIPPET_ON_MONEY_PAGE", pages.filter((p) => robotsTokens(p).includes("nosnippet") && (ctx.gsc?.clicksByUrl?.[p.url] ?? 0) > 0).map((p) => p.url), {});
  }
  push(out, "DIRECT.MAX_SNIPPET_ZERO", pages.filter((p) => robotsTokens(p).includes("max-snippet:0")).map((p) => p.url), {});
  push(out, "DIRECT.NO_MAX_IMAGE_PREVIEW", pages.filter((p) => p.extract?.jsonLd.some((j) => /Article|Product/i.test(JSON.stringify(j.parsed))) && !robotsTokens(p).some((t) => t.includes("max-image-preview"))).map((p) => p.url), {});
  push(out, "DIRECT.NOIMAGEINDEX", pages.filter((p) => robotsTokens(p).includes("noimageindex")).map((p) => p.url), {});
  const known = new Set(["index", "noindex", "follow", "nofollow", "none", "noarchive", "nosnippet", "noimageindex", "notranslate", "unavailable_after", "max-snippet", "max-image-preview", "max-video-preview", "all", "noodp"]);
  push(out, "DIRECT.INVALID_VALUE", pages.filter((p) => robotsTokens(p).some((t) => t && !known.has(t.split(":")[0] ?? t))).map((p) => p.url), {});
  push(out, "DIRECT.DISALLOW_MASKS_NOINDEX", pages.filter((p) => !p.robotsAllowed && noindexOf(p)).map((p) => p.url), {});
  return out;
}

export function detectSmap(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const sms = ctx.crawl.sitemaps;
  const origin = ctx.crawl.origin;
  if (sms.every((s) => s.statusCode === 404 || s.statusCode === null)) {
    push(out, "SMAP.MISSING", [origin], {});
  }
  for (const sm of sms) {
    if (sm.urls.length > 50_000) push(out, "SMAP.OVER_50K", [sm.url], { count: sm.urls.length });
    if (sm.bytes > 50 * 1024 * 1024) push(out, "SMAP.OVER_50MB", [sm.url], { bytes: sm.bytes });
    if (sm.malformed) push(out, "SMAP.MALFORMED_XML", [sm.url], { error: sm.error });
    if (sm.namespace && sm.namespace !== "http://www.sitemaps.org/schemas/sitemap/0.9") {
      push(out, "SMAP.WRONG_NAMESPACE", [sm.url], { namespace: sm.namespace });
    }
    if (sm.statusCode && sm.statusCode !== 200 && sm.statusCode !== 404) push(out, "SMAP.NON_200", [sm.url], { status: sm.statusCode });
    if (sm.gzipBroken) push(out, "SMAP.GZIP_BROKEN", [sm.url], {});
    if (sm.relativeLocs.length) push(out, "SMAP.RELATIVE_URLS", [sm.url], { sample: sm.relativeLocs.slice(0, 5) });
    const host = (() => { try { return new URL(sm.url).host; } catch { return ""; } })();
    const cross = sm.urls.filter((u) => { try { return new URL(u.loc).host !== host; } catch { return false; } });
    if (cross.length) push(out, "SMAP.CROSS_HOST", [sm.url], { count: cross.length });
    if (origin.startsWith("https:") && sm.urls.some((u) => u.loc.startsWith("http:"))) {
      push(out, "SMAP.MIXED_PROTOCOL", [sm.url], {});
    }
    if (sm.urls.some((u) => /[&<>'"]/.test(u.loc) && !/&amp;|&lt;|&gt;|&apos;|&quot;/.test(u.loc))) {
      push(out, "SMAP.UNESCAPED_ENTITIES", [sm.url], {});
    }
    if (sm.urls.length && sm.urls.every((u) => !u.lastmod)) push(out, "SMAP.LASTMOD_MISSING", [sm.url], {});
    const badLast = sm.urls.filter((u) => u.lastmod && !/^\d{4}-\d{2}-\d{2}/.test(u.lastmod));
    if (badLast.length) push(out, "SMAP.LASTMOD_INVALID_FORMAT", [sm.url], {});
    const future = sm.urls.filter((u) => u.lastmod && Date.parse(u.lastmod) > Date.now());
    if (future.length) push(out, "SMAP.LASTMOD_FUTURE", [sm.url], {});
    const lastmods = new Set(sm.urls.map((u) => u.lastmod).filter(Boolean));
    if (sm.urls.length > 50 && lastmods.size === 1) push(out, "SMAP.LASTMOD_ALL_IDENTICAL", [sm.url], {});
    const today = new Date().toISOString().slice(0, 10);
    if (sm.urls.length > 10 && sm.urls.filter((u) => u.lastmod?.startsWith(today)).length / sm.urls.length > 0.9) {
      push(out, "SMAP.LASTMOD_ALL_TODAY", [sm.url], {});
    }
    if (sm.urls.some((u) => u.priority)) push(out, "SMAP.PRIORITY_PRESENT", [sm.url], {});
    if (sm.urls.some((u) => u.changefreq)) push(out, "SMAP.CHANGEFREQ_PRESENT", [sm.url], {});
    if (sm.nestedIndex) push(out, "SMAP.INDEX_NESTED_TOO_DEEP", [sm.url], {});
    if (sm.urls.some((u) => u.videoValid === false)) push(out, "SMAP.VIDEO_EXT_INVALID", [sm.url], {});
  }
  const map = byUrl(ctx);
  const locs = [...sitemapSet(ctx)];
  push(out, "SMAP.CONTAINS_NON_200", locs.filter((u) => {
    const p = map.get(u);
    return p && p.statusCode !== 200 && p.statusCode !== null;
  }), {});
  push(out, "SMAP.CONTAINS_NOINDEX", locs.filter((u) => {
    const p = map.get(u);
    return p && noindexOf(p);
  }), {});
  push(out, "SMAP.CONTAINS_CANONICALISED", locs.filter((u) => {
    const p = map.get(u);
    return p && absCanonical(p) && !selfCanonical(p);
  }), {});
  push(out, "SMAP.CONTAINS_DISALLOWED", locs.filter((u) => {
    const p = map.get(u);
    return p && !p.robotsAllowed;
  }), {});
  const counts = new Map<string, number>();
  for (const sm of sms) for (const u of sm.urls) counts.set(u.loc, (counts.get(u.loc) ?? 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([u]) => u);
  push(out, "SMAP.DUP_ACROSS_SITEMAPS", dups, {});
  if (sms.some((s) => s.statusCode === 200) && (ctx.crawl.robots?.sitemaps.length ?? 0) === 0) {
    push(out, "SMAP.NOT_IN_ROBOTS", [origin], {});
  }
  if (hasReq(ctx, "gsc")) {
    if (ctx.gsc && !ctx.gsc.submittedSitemaps?.length) push(out, "SMAP.NOT_SUBMITTED_GSC", [origin], {});
    if (ctx.gsc?.sitemapErrors) push(out, "SMAP.GSC_ERRORS", [origin], {});
    if (ctx.gsc?.lastDownloaded) {
      const age = Date.now() - Date.parse(ctx.gsc.lastDownloaded);
      if (age > 30 * 86400000) push(out, "SMAP.STALE_DOWNLOAD", [origin], {});
    }
  }
  const imageHeavy = htmlPages(ctx).filter((p) => (p.extract?.images.length ?? 0) > 5).length > htmlPages(ctx).length / 2;
  if (imageHeavy && sms.every((s) => s.urls.every((u) => u.images.length === 0))) {
    push(out, "SMAP.IMAGE_EXT_MISSING", [origin], {});
  }
  push(out, "SMAP.LASTMOD_CONTRADICTS_CONTENT", [], {});
  push(out, "SMAP.HREFLANG_MISMATCH", [], {});
  return out;
}

export function detectCrawl(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = ctx.crawl.pages.filter((p) => p.isInternal);
  push(out, "CRAWL.DEPTH_GT_3", pages.filter((p) => p.depth > 3).map((p) => p.url), {});
  push(out, "CRAWL.DEPTH_GT_5", pages.filter((p) => p.depth > 5).map((p) => p.url), {});
  push(out, "CRAWL.ORPHAN", pages.filter((p) => p.followInlinkCount === 0 && p.depth > 0 && p.statusCode === 200).map((p) => p.url), {});
  push(out, "CRAWL.INFINITE_SPACE", pages.filter((p) => {
    const segs = originPath(p.url).split("/").filter(Boolean);
    const counts = new Map<string, number>();
    for (const s of segs) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [...counts.values()].some((n) => n >= 3);
  }).map((p) => p.url), {});
  push(out, "CRAWL.CALENDAR_TRAP", pages.filter((p) => DATE_RE.test(p.url)).map((p) => p.url), {});
  push(out, "CRAWL.SESSION_ID", pages.filter((p) => SESSION_RE.test(p.url)).map((p) => p.url), {});
  push(out, "CRAWL.FACET_EXPLOSION", pages.filter((p) => (p.url.match(/[?&]/g)?.length ?? 0) >= 3).map((p) => p.url), {});
  push(out, "CRAWL.SORT_PARAMS", pages.filter((p) => FACET_PARAMS.test(p.url)).map((p) => p.url), {});
  const indexable = pages.filter(isIndexable).length;
  if (pages.length && 1 - indexable / pages.length > 0.4) {
    push(out, "CRAWL.THIN_RATIO", [ctx.crawl.origin], { ratio: 1 - indexable / pages.length });
  }
  if (hasReq(ctx, "gsc")) {
    push(out, "CRAWL.DISCOVERED_NOT_INDEXED", Object.entries(ctx.gsc?.coverageStateByUrl ?? {}).filter(([, s]) => /discovered/i.test(s)).map(([u]) => u), {});
    push(out, "CRAWL.STALE_IMPORTANT", Object.entries(ctx.gsc?.clicksByUrl ?? {}).filter(([, c]) => c > 0).map(([u]) => u).filter(() => false), {});
    push(out, "CRAWL.LOW_VALUE_CRAWL_SHARE", [], {});
  }
  push(out, "CRAWL.SLOW_UNDER_LOAD", [], {});
  return out;
}

export function detectLink(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  const map = byUrl(ctx);
  if (hasReq(ctx, "gsc")) push(out, "LINK.PR_STARVED_MONEY_PAGE", [], {});
  const wasted = pages.filter((p) => !isIndexable(p) && p.inlinkCount > 5);
  push(out, "LINK.PR_WASTED", wasted.map((p) => p.url), {});
  push(out, "LINK.HUB_OVERLOAD", pages.filter((p) => (p.extract?.links.filter((l) => l.isInternal).length ?? 0) > 300).map((p) => p.url), {});
  push(out, "LINK.NO_OUTLINKS", pages.filter((p) => (p.extract?.links.filter((l) => l.isInternal).length ?? 0) === 0 && p.statusCode === 200).map((p) => p.url), {});
  push(out, "LINK.NOFOLLOW_INTERNAL", pages.filter((p) => p.extract?.links.some((l) => l.isInternal && l.isNofollow)).map((p) => p.url), {});
  push(out, "LINK.NOFOLLOW_ONLY_INLINKS", pages.filter((p) => p.inlinkCount > 0 && p.followInlinkCount === 0).map((p) => p.url), {});
  push(out, "LINK.JS_ONLY_LINKS", pages.filter((p) => p.renderedExtract && (p.renderedExtract.links.length - (p.extract?.links.length ?? 0)) / Math.max(1, p.renderedExtract.links.length) > 0.3).map((p) => p.url), {});
  push(out, "LINK.EMPTY_ANCHOR", pages.filter((p) => p.extract?.links.some((l) => l.isInternal && !l.anchorText)).map((p) => p.url), {});
  push(out, "LINK.GENERIC_ANCHOR", pages.filter((p) => p.extract?.links.some((l) => GENERIC_ANCHORS.has(l.anchorText.toLowerCase()))).map((p) => p.url), {});
  const g = gini(pages.map((p) => p.inlinkCount));
  if (g > 0.85) push(out, "LINK.INLINK_CONCENTRATION", [ctx.crawl.origin], { gini: g });
  const broken: string[] = [];
  for (const p of pages) {
    for (const l of p.extract?.links ?? []) {
      if (!l.isInternal) continue;
      const t = map.get(l.absUrl);
      if (t && t.statusCode !== null && t.statusCode >= 400) broken.push(p.url);
    }
  }
  push(out, "LINK.BROKEN_INTERNAL", broken, {});
  push(out, "LINK.BROKEN_FRAGMENT", pages.filter((p) => p.extract?.links.some((l) => l.href.includes("#") && l.href.split("#")[1])).map((p) => p.url), {}, 0.4);
  push(out, "LINK.LOCALHOST", pages.filter((p) => p.extract?.links.some((l) => /localhost|127\.0\.0\.1|\.local/i.test(l.absUrl))).map((p) => p.url), {});
  push(out, "LINK.UNSAFE_CROSS_ORIGIN", pages.filter((p) => (p.extract?.unsafeTargetBlanks ?? 0) > 0).map((p) => p.url), {});
  push(out, "LINK.PROTOCOL_RELATIVE", pages.filter((p) => p.extract?.links.some((l) => l.href.startsWith("//"))).map((p) => p.url), {});
  return out;
}

export function detectPage(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  const paginated = pages.filter((p) => /[?&]page=\d+/i.test(p.url) || /\/page\/\d+/i.test(p.url));
  push(out, "PAGE.CANON_TO_P1", paginated.filter((p) => {
    const c = absCanonical(p);
    return Boolean(c && /page=1\b|\/page\/1\b/i.test(c) && !/page=1\b|\/page\/1\b/i.test(p.url));
  }).map((p) => p.url), {});
  push(out, "PAGE.NOT_IN_ANCHOR", [], {});
  push(out, "PAGE.NON_200", paginated.filter((p) => p.statusCode !== 200).map((p) => p.url), {});
  push(out, "PAGE.UNLINKED", paginated.filter((p) => p.inlinkCount === 0).map((p) => p.url), {});
  push(out, "PAGE.LOOP", paginated.filter((p) => p.extract?.paginationRel.next === p.url).map((p) => p.url), {});
  push(out, "PAGE.SEQUENCE_ERROR", [], {});
  push(out, "PAGE.NOINDEX", paginated.filter(noindexOf).map((p) => p.url), {});
  push(out, "PAGE.INFINITE_SCROLL_NO_URLS", pages.filter((p) => p.extract?.spaRootEmpty && !/[?&]page=/.test(p.url)).map((p) => p.url), {}, 0.4);
  const titles = new Map<string, string[]>();
  for (const p of paginated) {
    const t = p.extract?.title ?? "";
    titles.set(t, [...(titles.get(t) ?? []), p.url]);
  }
  push(out, "PAGE.DUPLICATE_TITLES", [...titles.values()].filter((v) => v.length > 1).flat(), {});
  push(out, "PAGE.VIEW_ALL_MISSING", [], {});
  return out;
}

export function detectParam(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = ctx.crawl.pages.filter((p) => p.isInternal);
  push(out, "PARAM.TRACKING_INDEXABLE", pages.filter((p) => /[?&](utm_|gclid|fbclid|msclkid|_ga)/i.test(p.url) && isIndexable(p)).map((p) => p.url), {});
  push(out, "PARAM.NON_STANDARD_SEPARATOR", pages.filter((p) => /[[\];,]/.test(new URL(p.url, ctx.crawl.origin).search)).map((p) => p.url), {});
  push(out, "PARAM.ORDER_VARIANTS", [], {});
  push(out, "PARAM.CASE_VARIANTS", pages.filter((p) => /[A-Z]/.test(new URL(p.url, ctx.crawl.origin).search)).map((p) => p.url), {});
  push(out, "PARAM.EMPTY_VALUE", pages.filter((p) => /[?&][^=&]+=(&|$)/.test(p.url)).map((p) => p.url), {});
  push(out, "PARAM.DUPLICATE_KEY", pages.filter((p) => {
    try {
      const keys = [...new URL(p.url).searchParams.keys()];
      return keys.length !== new Set(keys).size;
    } catch { return false; }
  }).map((p) => p.url), {});
  const combos = new Set(pages.map((p) => new URL(p.url, ctx.crawl.origin).search));
  if (combos.size > 1000) push(out, "PARAM.FACET_COMBO_COUNT", [ctx.crawl.origin], { count: combos.size });
  push(out, "PARAM.FACET_ZERO_RESULTS", htmlPages(ctx).filter((p) => /no results|0 products|nothing found/i.test(p.extract?.mainText ?? "") && p.statusCode === 200).map((p) => p.url), {});
  push(out, "PARAM.FACET_NOT_DISALLOWED", pages.filter((p) => FACET_PARAMS.test(p.url) && p.robotsAllowed && selfCanonical(p)).map((p) => p.url), {});
  const sm = sitemapSet(ctx);
  push(out, "PARAM.FACET_IN_SITEMAP", pages.filter((p) => FACET_PARAMS.test(p.url) && sm.has(p.url)).map((p) => p.url), {});
  push(out, "PARAM.FRAGMENT_OK", pages.filter((p) => p.url.includes("#") && FACET_PARAMS.test(p.url)).map((p) => p.url), {});
  return out;
}

export function detectDup(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx).filter((p) => p.statusCode === 200);
  const byHash = group(pages, (p) => p.contentHash ?? "");
  push(out, "DUP.EXACT_HTML", [...byHash.values()].filter((g) => g.length > 1 && g[0]?.contentHash).flatMap((g) => g.map((p) => p.url)), {});
  const byBody = group(pages, (p) => p.extract?.mainText ?? "");
  push(out, "DUP.EXACT_BODY", [...byBody.values()].filter((g) => g.length > 1 && (g[0]?.extract?.mainText.length ?? 0) > 80).flatMap((g) => g.map((p) => p.url)), {});
  const near: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const a = pages[i];
    if (!a?.simhash) continue;
    for (let j = i + 1; j < Math.min(pages.length, i + 25); j++) {
      const b = pages[j];
      if (!b?.simhash) continue;
      if (nearDuplicate(a.simhash, b.simhash, 3)) {
        near.push(a.url, b.url);
      }
    }
  }
  push(out, "DUP.NEAR", near, {}, 0.8);
  push(out, "DUP.SEMANTIC", [], {});
  push(out, "DUP.TITLE", dupField(pages, (p) => p.extract?.title ?? ""), {});
  push(out, "DUP.META_DESC", dupField(pages, (p) => p.extract?.metaDescription ?? ""), {});
  push(out, "DUP.H1", dupField(pages, (p) => p.extract?.h1[0] ?? ""), {});
  push(out, "DUP.CROSS_DOMAIN", [], {});
  push(out, "DUP.BOILERPLATE_RATIO", pages.filter((p) => (p.extract?.boilerplateRatio ?? 0) > 0.75).map((p) => p.url), {});
  push(out, "DUP.PAGINATED_DUP", [], {});
  push(out, "DUP.PRINT_VERSION", pages.filter((p) => /[?&]print=|\/print\//i.test(p.url)).map((p) => p.url), {});
  if (ctx.crawl.originProbe.https && ctx.crawl.originProbe.httpRedirectsToHttps === false) {
    push(out, "DUP.HTTP_AND_HTTPS", [ctx.crawl.origin], {});
  }
  return out;
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) {
    const k = key(i);
    if (!k) continue;
    const arr = m.get(k) ?? [];
    arr.push(i);
    m.set(k, arr);
  }
  return m;
}

function dupField(pages: CrawledPage[], key: (p: CrawledPage) => string): string[] {
  const m = group(pages, key);
  return [...m.values()].filter((g) => g.length > 1).flatMap((g) => g.map((p) => p.url));
}

export function detectThin(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx).filter((p) => p.statusCode === 200);
  const words = pages.map((p) => p.extract?.mainWordCount ?? 0).toSorted((a, b) => a - b);
  const median = words[Math.floor(words.length / 2)] ?? 0;
  const floor = Math.max(200, 0.4 * median);
  push(out, "THIN.LOW_WORDCOUNT", pages.filter((p) => (p.extract?.mainWordCount ?? 0) < floor).map((p) => p.url), { floor, median });
  push(out, "THIN.NO_MAIN_CONTENT", pages.filter((p) => (p.extract?.mainWordCount ?? 0) < 50).map((p) => p.url), {});
  push(out, "THIN.TEMPLATE_ONLY", pages.filter((p) => (p.extract?.boilerplateRatio ?? 0) > 0.9).map((p) => p.url), {});
  push(out, "THIN.LOREM_IPSUM", pages.filter((p) => p.extract?.loremIpsum).map((p) => p.url), {});
  if (hasReq(ctx, "gsc")) {
    push(out, "THIN.ZERO_IMPRESSIONS", pages.filter((p) => (ctx.gsc?.impressionsByUrl?.[p.url] ?? 0) === 0).map((p) => p.url), {});
    push(out, "THIN.NO_INTERNAL_VALUE", pages.filter((p) => (p.extract?.mainWordCount ?? 0) < 50 && p.inlinkCount === 0).map((p) => p.url), {});
  }
  push(out, "THIN.AUTOGEN_PATTERN", [], {});
  return out;
}

export function detectJs(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  const rendered = pages.filter((p) => p.renderedExtract);
  push(out, "JS.CONTENT_ONLY_RENDERED", rendered.filter((p) => {
    const raw = p.extract?.mainWordCount ?? 0;
    const rend = p.renderedExtract?.mainWordCount ?? 0;
    return rend > 0 && (rend - raw) / rend > 0.5;
  }).map((p) => p.url), {});
  push(out, "JS.NO_RAW_CONTENT", rendered.filter((p) => (p.extract?.mainWordCount ?? 0) < 100 && (p.renderedExtract?.mainWordCount ?? 0) > 500).map((p) => p.url), {});
  push(out, "JS.TITLE_RENDER_ONLY", rendered.filter((p) => !p.extract?.title && p.renderedExtract?.title).map((p) => p.url), {});
  push(out, "JS.TITLE_UPDATED_BY_JS", rendered.filter((p) => p.extract?.title && p.renderedExtract?.title && p.extract.title !== p.renderedExtract.title).map((p) => p.url), {});
  push(out, "JS.META_DESC_RENDER_ONLY", rendered.filter((p) => !p.extract?.metaDescription && p.renderedExtract?.metaDescription).map((p) => p.url), {});
  push(out, "JS.META_DESC_UPDATED", rendered.filter((p) => p.extract?.metaDescription && p.renderedExtract?.metaDescription && p.extract.metaDescription !== p.renderedExtract.metaDescription).map((p) => p.url), {});
  push(out, "JS.H1_RENDER_ONLY", rendered.filter((p) => (p.extract?.h1.length ?? 0) === 0 && (p.renderedExtract?.h1.length ?? 0) > 0).map((p) => p.url), {});
  push(out, "JS.H1_UPDATED", rendered.filter((p) => (p.extract?.h1[0] ?? "") !== (p.renderedExtract?.h1[0] ?? "") && (p.renderedExtract?.h1.length ?? 0) > 0).map((p) => p.url), {});
  push(out, "JS.CANONICAL_RENDER_ONLY", rendered.filter((p) => (p.extract?.canonicalHtml.length ?? 0) === 0 && (p.renderedExtract?.canonicalHtml.length ?? 0) > 0).map((p) => p.url), {});
  push(out, "JS.CANONICAL_MISMATCH", rendered.filter((p) => (p.extract?.canonicalHtml[0] ?? "") !== (p.renderedExtract?.canonicalHtml[0] ?? "") && (p.renderedExtract?.canonicalHtml.length ?? 0) > 0).map((p) => p.url), {});
  push(out, "JS.NOINDEX_RAW_ONLY", rendered.filter((p) => noindexOf(p) && !/\bnoindex\b/i.test(p.renderedExtract?.robotsMeta.join(",") ?? "")).map((p) => p.url), {});
  push(out, "JS.NOFOLLOW_RAW_ONLY", rendered.filter((p) => nofollowOf(p) && !/\bnofollow\b/i.test(p.renderedExtract?.robotsMeta.join(",") ?? "")).map((p) => p.url), {});
  push(out, "JS.LINKS_RENDER_ONLY", rendered.filter((p) => {
    const raw = p.extract?.links.filter((l) => l.isInternal).length ?? 0;
    const rend = p.renderedExtract?.links.filter((l) => l.isInternal).length ?? 0;
    return rend > 0 && (rend - raw) / rend > 0.3;
  }).map((p) => p.url), {});
  push(out, "JS.NO_HREF_LINKS", pages.filter((p) => (p.extract?.links.length ?? 0) === 0 && /onclick=/i.test(p.html ?? "")).map((p) => p.url), {});
  push(out, "JS.HASH_ROUTING", pages.filter((p) => p.url.includes("#/")).map((p) => p.url), {});
  push(out, "JS.OLD_AJAX_SCHEME", pages.filter((p) => p.url.includes("#!") || p.extract?.hashFragmentMeta).map((p) => p.url), {});
  push(out, "JS.BLOCKED_RESOURCES", pages.filter((p) => p.extract?.scripts.some((s) => s.absUrl && !pageAllowed(ctx, s.absUrl))).map((p) => p.url), {});
  push(out, "JS.CONSOLE_ERRORS", [], {});
  push(out, "JS.FAILED_REQUESTS", [], {});
  push(out, "JS.RENDER_TIMEOUT", pages.filter((p) => p.error === "render_timeout").map((p) => p.url), {});
  push(out, "JS.JSONLD_RENDER_ONLY", rendered.filter((p) => (p.extract?.jsonLd.length ?? 0) === 0 && (p.renderedExtract?.jsonLd.length ?? 0) > 0).map((p) => p.url), {});
  push(out, "JS.HYDRATION_MISMATCH", rendered.filter((p) => {
    const a = p.extract?.mainText ?? "";
    const b = p.renderedExtract?.mainText ?? "";
    return a.length > 50 && b.length > 50 && jaccard(a, b) < 0.5;
  }).map((p) => p.url), {});
  push(out, "JS.COOKIE_DEPENDENT", [], {});
  push(out, "JS.LOCALSTORAGE_DEPENDENT", [], {});
  push(out, "JS.CONSENT_WALL", pages.filter((p) => (p.extract?.mainWordCount ?? 0) < 100 && /onetrust|usercentrics|cookiebot|didomi|cky-consent/i.test(p.html ?? "")).map((p) => p.url), {});
  push(out, "JS.GEO_REDIRECT", [], {});
  push(out, "JS.CLOAKING_RISK", [], {});
  push(out, "JS.INFINITE_SCROLL_NO_SSR", [], {});
  return out;
}

function jaccard(a: string, b: string): number {
  const A = new Set(a.split(/\s+/));
  const B = new Set(b.split(/\s+/));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function detectCwv(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  if (!hasReq(ctx, "crux") || !ctx.crux) return out;
  const origin = ctx.crawl.origin;
  if ((ctx.crux.lcpP75Ms ?? 0) > 2500) push(out, "CWV.LCP_FAIL", [origin], { p75: ctx.crux.lcpP75Ms });
  if ((ctx.crux.inpP75Ms ?? 0) > 200) push(out, "CWV.INP_FAIL", [origin], { p75: ctx.crux.inpP75Ms });
  if ((ctx.crux.clsP75 ?? 0) > 0.1) push(out, "CWV.CLS_FAIL", [origin], { p75: ctx.crux.clsP75 });
  if (ctx.crux.urlLevel === false) push(out, "CWV.NO_FIELD_DATA", [origin], {});
  if (ctx.crux.phoneLcpP75Ms && ctx.crux.desktopLcpP75Ms && ctx.crux.phoneLcpP75Ms > 1.5 * ctx.crux.desktopLcpP75Ms) {
    push(out, "CWV.MOBILE_DESKTOP_GAP", [origin], {});
  }
  push(out, "CWV.REGRESSION", [], {});
  return out;
}

export function detectPerf(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = ctx.crawl.pages;
  if (hasReq(ctx, "crux") && ctx.crux?.ttfbP75Ms && ctx.crux.ttfbP75Ms > 800) {
    push(out, "PERF.TTFB", [ctx.crawl.origin], { p75: ctx.crux.ttfbP75Ms });
  } else {
    push(out, "PERF.TTFB", pages.filter((p) => p.ttfbMs > 800).map((p) => p.url), {});
  }
  const lh = ctx.lighthouse;
  const failAudit = (id: string) => (lh?.audits[id]?.score ?? 1) < 1;
  if (hasReq(ctx, "lighthouse") && lh) {
    if (failAudit("lcp-discovery-insight")) push(out, "PERF.LCP_IS_IMAGE_NO_PRELOAD", [ctx.crawl.origin], {});
    if (failAudit("render-blocking-insight")) push(out, "PERF.RENDER_BLOCKING", [ctx.crawl.origin], {});
    if (failAudit("legacy-javascript-insight")) push(out, "PERF.LEGACY_JS", [ctx.crawl.origin], {});
    if (failAudit("duplicated-javascript-insight")) push(out, "PERF.DUPLICATE_JS", [ctx.crawl.origin], {});
    if (failAudit("dom-size-insight")) push(out, "PERF.DOM_SIZE", [ctx.crawl.origin], {});
    if (failAudit("third-parties-insight")) push(out, "PERF.THIRD_PARTY_BLOCKING", [ctx.crawl.origin], {});
  }
  push(out, "PERF.LCP_LAZY_LOADED", htmlPages(ctx).filter((p) => p.extract?.images.some((i) => i.loading === "lazy")).map((p) => p.url), {}, 0.4);
  push(out, "PERF.NO_CACHE_HEADERS", pages.filter((p) => /\.(js|css|woff2|png|jpe?g|webp|avif)(\?|$)/i.test(p.url) && !/(max-age|immutable)/i.test(p.headers["cache-control"] ?? "")).map((p) => p.url), {});
  push(out, "PERF.NO_COMPRESSION", pages.filter((p) => /html|javascript|json|css|text\//i.test(p.contentType) && !p.headers["content-encoding"]).map((p) => p.url), {});
  push(out, "PERF.NO_CDN", pages.filter((p) => p.depth === 0 && !/(cf-ray|x-amz-cf-id|x-vercel-cache|x-cache|fastly)/i.test(Object.keys(p.headers).join(" "))).map((p) => p.url), {});
  push(out, "PERF.CACHE_MISS_RATE", [], {});
  if (ctx.crawl.originProbe.alpn && !/h2|h3|http\/2|http\/3/i.test(ctx.crawl.originProbe.alpn)) {
    push(out, "PERF.HTTP1_ONLY", [ctx.crawl.origin], { alpn: ctx.crawl.originProbe.alpn });
  }
  push(out, "PERF.NO_UNSIZED_IMG", htmlPages(ctx).filter((p) => p.extract?.images.some((i) => !i.width && !i.height)).map((p) => p.url), {});
  push(out, "PERF.FONT_NO_DISPLAY_SWAP", htmlPages(ctx).filter((p) => /@font-face/i.test(p.html ?? "") && !/font-display/i.test(p.html ?? "")).map((p) => p.url), {});
  push(out, "PERF.PAGE_WEIGHT", pages.filter((p) => p.wireBytes > 3 * 1024 * 1024).map((p) => p.url), {});
  return out;
}

export function detectSec(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = ctx.crawl.pages;
  const origin = ctx.crawl.origin;
  push(out, "SEC.HTTP_URLS", pages.filter((p) => p.isInternal && p.url.startsWith("http:")).map((p) => p.url), {});
  if (ctx.crawl.originProbe.https && ctx.crawl.originProbe.httpRedirectsToHttps === false) {
    push(out, "SEC.NO_HTTPS_REDIRECT", [origin], {});
  }
  push(out, "SEC.MIXED_ACTIVE", htmlPages(ctx).filter((p) => (p.extract?.mixedActive.length ?? 0) > 0).map((p) => p.url), {});
  push(out, "SEC.MIXED_PASSIVE", htmlPages(ctx).filter((p) => (p.extract?.mixedPassive.length ?? 0) > 0).map((p) => p.url), {});
  push(out, "SEC.PROTOCOL_RELATIVE", htmlPages(ctx).filter((p) => p.extract?.links.some((l) => l.href.startsWith("//"))).map((p) => p.url), {});
  if (ctx.crawl.originProbe.certDaysRemaining !== null && ctx.crawl.originProbe.certDaysRemaining < 30) {
    push(out, "SEC.CERT_EXPIRING", [origin], { days: ctx.crawl.originProbe.certDaysRemaining });
  }
  if (ctx.crawl.originProbe.certError) push(out, "SEC.CERT_INVALID", [origin], { error: ctx.crawl.originProbe.certError });
  push(out, "SEC.TLS_OLD", [], {});
  const home = pages.find((p) => p.depth === 0) ?? pages[0];
  if (home && !home.headers["strict-transport-security"] && !ctx.crawl.originProbe.hsts) {
    push(out, "SEC.NO_HSTS", [origin], {});
  }
  const hsts = home?.headers["strict-transport-security"] ?? ctx.crawl.originProbe.hsts ?? "";
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
  if (hsts && maxAge < 31536000) push(out, "SEC.HSTS_SHORT", [origin], { maxAge });
  push(out, "SEC.FORM_INSECURE", htmlPages(ctx).filter((p) => p.extract?.forms.some((f) => f.absAction.startsWith("http:"))).map((p) => p.url), {});
  push(out, "SEC.FORM_ON_HTTP", htmlPages(ctx).filter((p) => p.url.startsWith("http:") && (p.extract?.forms.length ?? 0) > 0).map((p) => p.url), {});
  if (home && !home.headers["content-security-policy"]) push(out, "SEC.NO_CSP", [origin], {});
  if (home && home.headers["x-content-type-options"]?.toLowerCase() !== "nosniff") push(out, "SEC.NO_XCTO", [origin], {});
  if (home && !home.headers["x-frame-options"] && !/frame-ancestors/.test(home.headers["content-security-policy"] ?? "")) {
    push(out, "SEC.NO_XFO", [origin], {});
  }
  if (home && !home.headers["referrer-policy"]) push(out, "SEC.NO_REFERRER_POLICY", [origin], {});
  push(out, "SEC.UNSAFE_TARGET_BLANK", htmlPages(ctx).filter((p) => (p.extract?.unsafeTargetBlanks ?? 0) > 0).map((p) => p.url), {});
  push(out, "SEC.CANONICAL_HTTP", htmlPages(ctx).filter((p) => p.url.startsWith("https:") && (absCanonical(p) ?? "").startsWith("http:")).map((p) => p.url), {});
  push(out, "SEC.HREFLANG_HTTP", htmlPages(ctx).filter((p) => p.extract?.hreflang.some((h) => h.absUrl.startsWith("http:"))).map((p) => p.url), {});
  if (ctx.crawl.sitemaps.some((s) => s.urls.some((u) => u.loc.startsWith("http:")))) {
    push(out, "SEC.SITEMAP_HTTP", [origin], {});
  }
  return out;
}

export function detectHref(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx).filter((p) => (p.extract?.hreflang.length ?? 0) > 0);
  const map = byUrl(ctx);
  const iso639 = /^(?:[a-z]{2,3})(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$|^x-default$/;
  push(out, "HREF.MISSING_SELF", pages.filter((p) => !(p.extract?.hreflang.some((h) => stripSlash(h.absUrl) === stripSlash(p.finalUrl)))).map((p) => p.url), {});
  const missingReturn: string[] = [];
  for (const p of pages) {
    for (const h of p.extract?.hreflang ?? []) {
      const t = map.get(h.absUrl);
      if (t?.extract && !t.extract.hreflang.some((x) => stripSlash(x.absUrl) === stripSlash(p.finalUrl))) {
        missingReturn.push(p.url);
      }
    }
  }
  push(out, "HREF.MISSING_RETURN", missingReturn, {});
  push(out, "HREF.NON_RECIPROCAL_CODE", [], {});
  push(out, "HREF.INVALID_LANG_CODE", pages.filter((p) => p.extract?.hreflang.some((h) => h.lang !== "x-default" && !/^[a-z]{2,3}/i.test(h.lang))).map((p) => p.url), {});
  push(out, "HREF.INVALID_REGION_CODE", pages.filter((p) => p.extract?.hreflang.some((h) => /-(UK|EU|UN|EN)$/i.test(h.lang))).map((p) => p.url), {});
  push(out, "HREF.REGION_ONLY", pages.filter((p) => p.extract?.hreflang.some((h) => /^[A-Z]{2}$/.test(h.lang))).map((p) => p.url), {});
  push(out, "HREF.MALFORMED", pages.filter((p) => p.extract?.hreflang.some((h) => !iso639.test(h.lang) && h.lang !== "x-default")).map((p) => p.url), {});
  push(out, "HREF.RELATIVE_URL", pages.filter((p) => p.extract?.hreflang.some((h) => !/^https?:/i.test(h.href))).map((p) => p.url), {});
  push(out, "HREF.NON_200", pages.filter((p) => p.extract?.hreflang.some((h) => {
    const t = map.get(h.absUrl);
    return t && t.statusCode !== 200 && t.statusCode !== null;
  })).map((p) => p.url), {});
  push(out, "HREF.TO_REDIRECT", pages.filter((p) => p.extract?.hreflang.some((h) => {
    const t = map.get(h.absUrl);
    return t && hops(t) >= 1;
  })).map((p) => p.url), {});
  push(out, "HREF.TO_NOINDEX", pages.filter((p) => p.extract?.hreflang.some((h) => {
    const t = map.get(h.absUrl);
    return t && noindexOf(t);
  })).map((p) => p.url), {});
  push(out, "HREF.TO_CANONICALISED", pages.filter((p) => p.extract?.hreflang.some((h) => {
    const t = map.get(h.absUrl);
    return t && absCanonical(t) && !selfCanonical(t);
  })).map((p) => p.url), {});
  push(out, "HREF.CANON_CONFLICT", pages.filter((p) => {
    const c = absCanonical(p);
    if (!c) return false;
    return !(p.extract?.hreflang.some((h) => stripSlash(h.absUrl) === stripSlash(c)));
  }).map((p) => p.url), {});
  push(out, "HREF.MULTIPLE_SAME_CODE", pages.filter((p) => {
    const codes = p.extract?.hreflang.map((h) => h.lang) ?? [];
    return codes.length !== new Set(codes).size;
  }).map((p) => p.url), {});
  push(out, "HREF.DUPLICATE_ENTRIES", pages.filter((p) => {
    const keys = p.extract?.hreflang.map((h) => `${h.lang}|${h.absUrl}`) ?? [];
    return keys.length !== new Set(keys).size;
  }).map((p) => p.url), {});
  push(out, "HREF.OUTSIDE_HEAD", pages.filter((p) => p.extract?.hreflang.some((h) => !h.inHead)).map((p) => p.url), {});
  push(out, "HREF.MISSING_X_DEFAULT", pages.filter((p) => !(p.extract?.hreflang.some((h) => h.lang === "x-default"))).map((p) => p.url), {});
  push(out, "HREF.MULTIPLE_X_DEFAULT", pages.filter((p) => (p.extract?.hreflang.filter((h) => h.lang === "x-default").length ?? 0) > 1).map((p) => p.url), {});
  push(out, "HREF.UNLINKED_ALTERNATE", pages.filter((p) => p.extract?.hreflang.some((h) => (map.get(h.absUrl)?.inlinkCount ?? 0) === 0)).map((p) => p.url), {});
  push(out, "HREF.MIXED_IMPLEMENTATION", [], {});
  push(out, "HREF.HTTP_ALTERNATE", pages.filter((p) => p.extract?.hreflang.some((h) => h.absUrl.startsWith("http:"))).map((p) => p.url), {});
  push(out, "HREF.CLUSTER_ASYMMETRY", [], {});
  push(out, "HREF.LANG_MISMATCH", [], {});
  push(out, "HREF.HTML_LANG_MISMATCH", pages.filter((p) => {
    const self = p.extract?.hreflang.find((h) => stripSlash(h.absUrl) === stripSlash(p.finalUrl));
    return Boolean(self && p.extract?.htmlLang && !p.extract.htmlLang.toLowerCase().startsWith(self.lang.split("-")[0] ?? ""));
  }).map((p) => p.url), {});
  push(out, "HREF.CURRENCY_MISMATCH", [], {});
  return out;
}

export function detectSd(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  const gallery = googleSupportedTypes();
  for (const p of pages) {
    const issues = validateJsonLdBlocks(p.extract?.jsonLd ?? []);
    const codes = new Set(issues.map((i) => i.code));
    if (codes.has("PARSE_ERROR")) push(out, "SD.PARSE_ERROR", [p.url], { issues });
    if (codes.has("MISSING_CONTEXT")) push(out, "SD.MISSING_CONTEXT", [p.url], { issues });
    if (codes.has("MISSING_TYPE")) push(out, "SD.MISSING_TYPE", [p.url], { issues });
    if (codes.has("UNKNOWN_TYPE")) push(out, "SD.UNKNOWN_TYPE", [p.url], { issues });
    if (codes.has("TYPE_DEPRECATED")) push(out, "SD.TYPE_DEPRECATED", [p.url], { issues });
    if (codes.has("MISSING_REQUIRED_PROP")) push(out, "SD.MISSING_REQUIRED_PROP", [p.url], { issues });
    if (codes.has("MISSING_RECOMMENDED_PROP")) push(out, "SD.MISSING_RECOMMENDED_PROP", [p.url], { issues });
    if (codes.has("INVALID_ENUM")) push(out, "SD.INVALID_ENUM", [p.url], { issues });
    if (codes.has("INVALID_DATE")) push(out, "SD.INVALID_DATE", [p.url], { issues });
    if (codes.has("INVALID_DURATION")) push(out, "SD.INVALID_DURATION", [p.url], { issues });
    const types = (p.extract?.jsonLd ?? []).flatMap((b) => flattenTypes(b.parsed));
    const text = p.extract?.allText ?? "";
    for (const b of p.extract?.jsonLd ?? []) {
      if (typeof b.parsed === "object" && b.parsed) {
        const rec = b.parsed as Record<string, unknown>;
        for (const key of ["name", "headline", "description"]) {
          const v = rec[key];
          if (typeof v === "string" && v.length > 20 && !text.includes(v.slice(0, 20))) {
            push(out, "SD.HIDDEN_CONTENT", [p.url], { property: key });
          }
        }
      }
    }
    if (types.includes("FAQPage") && !gallery.supported.includes("FAQPage")) {
      push(out, "SD.TYPE_DEPRECATED", [p.url], { type: "FAQPage" });
    }
    const urls = JSON.stringify(p.extract?.jsonLd ?? []);
    if (/https?:\/\/[^"'\s]+/.test(urls) === false) {
      /* skip */
    }
    push(out, "SD.INVALID_URL_PROP", (p.extract?.jsonLd ?? []).some((b) => JSON.stringify(b.parsed).includes('"url":"/"')) ? [p.url] : [], {});
    if (p.depth >= 2 && !types.includes("BreadcrumbList")) push(out, "SD.NO_BREADCRUMB", [p.url], {});
    if (p.renderedExtract && (p.extract?.jsonLd.length ?? 0) === 0 && p.renderedExtract.jsonLd.length > 0) {
      push(out, "SD.JS_INJECTED", [p.url], {});
    }
    if ((p.extract?.jsonLd.length ?? 0) > 1 && !(p.extract?.jsonLd.some((b) => JSON.stringify(b.parsed).includes("@id")))) {
      push(out, "SD.MULTIPLE_ENTITIES_NO_GRAPH", [p.url], {});
    }
    if ((p.extract?.jsonLd.length ?? 0) > 0 && p.extract?.jsonLd.every((b) => !b.inHead) === true) {
      /* still valid in body */
    }
  }
  const home = pages.find((p) => originPath(p.url) === "/") ?? pages[0];
  if (home && !home.extract?.jsonLd.some((b) => flattenTypes(b.parsed).includes("Organization"))) {
    push(out, "SD.NO_ORGANIZATION", [home.url], {});
  }
  const ratings = pages.map((p) => JSON.stringify(p.extract?.jsonLd ?? "")).filter((s) => s.includes("aggregateRating"));
  if (ratings.length > 5 && new Set(ratings).size === 1) push(out, "SD.SITEWIDE_AGG_RATING", [ctx.crawl.origin], {});
  push(out, "SD.IRRELEVANT", [], {});
  push(out, "SD.MISLEADING", pages.filter((p) => JSON.stringify(p.extract?.jsonLd ?? "").includes("aggregateRating") && !/review/i.test(p.extract?.allText ?? "")).map((p) => p.url), {});
  push(out, "SD.SELF_SERVING_REVIEW", [], {});
  push(out, "SD.IMAGE_TOO_SMALL", [], {});
  push(out, "SD.PRICE_MISMATCH", [], {});
  push(out, "SD.ORG_INCONSISTENT", [], {});
  push(out, "SD.MICRODATA_JSONLD_CONFLICT", [], {});
  push(out, "SD.NOT_IN_HEAD_OR_BODY", [], {});
  push(out, "SD.MISSING_ON_ELIGIBLE_TEMPLATE", pages.filter((p) => {
    const path = originPath(p.url);
    const types = (p.extract?.jsonLd ?? []).flatMap((b) => flattenTypes(b.parsed));
    return /\/(blog|article|post)\//i.test(path) && !types.some((t) => /Article/.test(t));
  }).map((p) => p.url), {});
  return out;
}

export function detectOnp(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx).filter((p) => p.statusCode === 200);
  push(out, "ONP.TITLE_MISSING", pages.filter((p) => !p.extract?.title).map((p) => p.url), {});
  push(out, "ONP.TITLE_MULTIPLE", pages.filter((p) => (p.extract?.titles.length ?? 0) > 1).map((p) => p.url), {});
  push(out, "ONP.TITLE_OUTSIDE_HEAD", pages.filter((p) => p.extract?.title && !p.extract.titleInHead).map((p) => p.url), {});
  push(out, "ONP.TITLE_DUPLICATE", dupField(pages, (p) => p.extract?.title ?? ""), {});
  push(out, "ONP.TITLE_TOO_LONG", pages.filter((p) => (p.extract?.title?.length ?? 0) > 60).map((p) => p.url), {});
  push(out, "ONP.TITLE_TOO_SHORT", pages.filter((p) => { const n = p.extract?.title?.length ?? 0; return n > 0 && n < 30; }).map((p) => p.url), {});
  push(out, "ONP.TITLE_PIXEL_OVER", pages.filter((p) => (p.extract?.title?.length ?? 0) > 70).map((p) => p.url), {});
  push(out, "ONP.TITLE_SAME_AS_H1", pages.filter((p) => p.extract?.title && p.extract.title === p.extract.h1[0]).map((p) => p.url), {});
  if (hasReq(ctx, "gsc")) push(out, "ONP.TITLE_REWRITTEN_BY_GOOGLE", [], {});
  push(out, "ONP.META_DESC_MISSING", pages.filter((p) => !p.extract?.metaDescription).map((p) => p.url), {});
  push(out, "ONP.META_DESC_MULTIPLE", pages.filter((p) => (p.extract?.metaDescriptions.length ?? 0) > 1).map((p) => p.url), {});
  push(out, "ONP.META_DESC_DUPLICATE", dupField(pages, (p) => p.extract?.metaDescription ?? ""), {});
  push(out, "ONP.META_DESC_TOO_LONG", pages.filter((p) => (p.extract?.metaDescription?.length ?? 0) > 155).map((p) => p.url), {});
  push(out, "ONP.META_DESC_TOO_SHORT", pages.filter((p) => { const n = p.extract?.metaDescription?.length ?? 0; return n > 0 && n < 70; }).map((p) => p.url), {});
  push(out, "ONP.META_DESC_OUTSIDE_HEAD", pages.filter((p) => p.extract?.metaDescription && !p.extract.metaDescInHead).map((p) => p.url), {});
  push(out, "ONP.H1_MISSING", pages.filter((p) => (p.extract?.h1.length ?? 0) === 0).map((p) => p.url), {});
  push(out, "ONP.H1_MULTIPLE", pages.filter((p) => (p.extract?.h1.length ?? 0) > 1).map((p) => p.url), {});
  push(out, "ONP.H1_DUPLICATE", dupField(pages, (p) => p.extract?.h1[0] ?? ""), {});
  push(out, "ONP.H1_TOO_LONG", pages.filter((p) => (p.extract?.h1[0]?.length ?? 0) > 70).map((p) => p.url), {});
  push(out, "ONP.H_NON_SEQUENTIAL", pages.filter((p) => {
    const levels = p.extract?.headings.map((h) => h.level) ?? [];
    for (let i = 1; i < levels.length; i++) {
      if ((levels[i] ?? 0) > (levels[i - 1] ?? 0) + 1) return true;
    }
    return false;
  }).map((p) => p.url), {});
  push(out, "ONP.ALT_TEXT_IN_H1", pages.filter((p) => /<h1[^>]*>\s*<img/i.test(p.html ?? "")).map((p) => p.url), {});
  push(out, "ONP.NO_VIEWPORT", pages.filter((p) => !p.extract?.viewport).map((p) => p.url), {});
  push(out, "ONP.VIEWPORT_FIXED_WIDTH", pages.filter((p) => /width\s*=\s*1024|user-scalable\s*=\s*no/i.test(p.extract?.viewport ?? "")).map((p) => p.url), {});
  push(out, "ONP.NO_LANG", pages.filter((p) => !p.extract?.lang).map((p) => p.url), {});
  push(out, "ONP.NO_CHARSET", pages.filter((p) => !p.extract?.charsetInFirst1024).map((p) => p.url), {});
  push(out, "ONP.SPELLING", [], {});
  push(out, "ONP.GRAMMAR", [], {});
  push(out, "ONP.READABILITY", [], {});
  push(out, "ONP.URL_OVER_115_CHARS", pages.filter((p) => p.url.length > 115).map((p) => p.url), {});
  push(out, "ONP.URL_UPPERCASE", pages.filter((p) => /[A-Z]/.test(originPath(p.url))).map((p) => p.url), {});
  push(out, "ONP.URL_UNDERSCORES", pages.filter((p) => originPath(p.url).includes("_")).map((p) => p.url), {});
  push(out, "ONP.URL_SPACES", pages.filter((p) => p.url.includes("%20") || p.url.includes(" ")).map((p) => p.url), {});
  push(out, "ONP.URL_NON_ASCII", pages.filter((p) => /[^\u0020-\u007e]/.test(p.url)).map((p) => p.url), {});
  push(out, "ONP.URL_MULTIPLE_SLASHES", pages.filter((p) => originPath(p.url).includes("//")).map((p) => p.url), {});
  push(out, "ONP.URL_REPETITIVE_PATH", pages.filter((p) => {
    const segs = originPath(p.url).split("/").filter(Boolean);
    return new Set(segs).size < segs.length / 2 && segs.length > 4;
  }).map((p) => p.url), {});
  return out;
}

export function detectImg(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  push(out, "IMG.MISSING_ALT_ATTR", pages.filter((p) => p.extract?.images.some((i) => !i.hasAltAttr)).map((p) => p.url), {});
  push(out, "IMG.MISSING_ALT_TEXT", pages.filter((p) => p.extract?.images.some((i) => i.hasAltAttr && i.alt === "")).map((p) => p.url), {});
  push(out, "IMG.ALT_TOO_LONG", pages.filter((p) => p.extract?.images.some((i) => (i.alt?.length ?? 0) > 100)).map((p) => p.url), {});
  push(out, "IMG.ALT_KEYWORD_STUFFED", pages.filter((p) => p.extract?.images.some((i) => {
    const words = (i.alt ?? "").toLowerCase().split(/\s+/);
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    return [...freq.values()].some((n) => n >= 4);
  })).map((p) => p.url), {});
  push(out, "IMG.NO_DIMENSIONS", pages.filter((p) => p.extract?.images.some((i) => !i.width && !i.height)).map((p) => p.url), {});
  push(out, "IMG.OVER_100KB", [], {});
  push(out, "IMG.INCORRECTLY_SIZED", [], {});
  push(out, "IMG.LEGACY_FORMAT", pages.filter((p) => p.extract?.images.some((i) => /\.(jpe?g|png)(\?|$)/i.test(i.src))).map((p) => p.url), {}, 0.4);
  push(out, "IMG.NO_SRCSET", pages.filter((p) => p.extract?.images.some((i) => !i.srcset)).map((p) => p.url), {});
  push(out, "IMG.LCP_LAZY", pages.filter((p) => p.extract?.images[0]?.loading === "lazy").map((p) => p.url), {});
  push(out, "IMG.BELOW_FOLD_EAGER", pages.filter((p) => p.extract?.images.slice(2).some((i) => i.loading !== "lazy")).map((p) => p.url), {}, 0.4);
  push(out, "IMG.BROKEN", [], {});
  push(out, "IMG.BACKGROUND_CONTENT", pages.filter((p) => /background-image:\s*url/i.test(p.html ?? "")).map((p) => p.url), {}, 0.3);
  push(out, "IMG.NOT_IN_SITEMAP", [], {});
  return out;
}

export function detectMob(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  push(out, "MOB.NO_VIEWPORT", pages.filter((p) => !p.extract?.viewport).map((p) => p.url), {});
  push(out, "MOB.CONTENT_WIDER_THAN_SCREEN", [], {});
  push(out, "MOB.FONT_TOO_SMALL", [], {});
  push(out, "MOB.TAP_TARGETS", [], {});
  push(out, "MOB.UNSUPPORTED_PLUGIN", pages.filter((p) => p.extract?.plugins).map((p) => p.url), {});
  push(out, "MOB.HORIZONTAL_SCROLL", [], {});
  push(out, "MOB.MOBILE_DESKTOP_CONTENT_GAP", [], {});
  push(out, "MOB.MOBILE_MISSING_SD", [], {});
  push(out, "MOB.MOBILE_MISSING_HREFLANG", [], {});
  push(out, "MOB.SEPARATE_M_DOT", pages.filter((p) => /^m\./i.test(new URL(p.url).hostname)).map((p) => p.url), {});
  push(out, "MOB.INTERSTITIAL", pages.filter((p) => /interstitial|modal-overlay|cookie-banner/i.test(p.html ?? "")).map((p) => p.url), {}, 0.4);
  return out;
}

export function detectLog(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  if (!hasReq(ctx, "logs") || !ctx.logs) return out;
  const origin = ctx.crawl.origin;
  const mix = ctx.logs.googlebotStatusMix ?? {};
  const total = Object.values(mix).reduce((s, n) => s + n, 0) || 1;
  const non2xx = Object.entries(mix).filter(([k]) => !k.startsWith("2")).reduce((s, [, n]) => s + n, 0);
  if (non2xx / total > 0.2) push(out, "LOG.STATUS_MIX", [origin], { mix });
  if ((mix["500"] ?? mix["5xx"] ?? 0) > 0) push(out, "LOG.5XX_TO_BOT", [origin], {});
  push(out, "LOG.CRAWL_WASTE", [], {});
  push(out, "LOG.UNCRAWLED_IMPORTANT", [], {});
  push(out, "LOG.ORPHAN_IN_LOGS", [], {});
  push(out, "LOG.CRAWL_FREQ_BY_TEMPLATE", [], {});
  push(out, "LOG.FRESHNESS_MISMATCH", [], {});
  push(out, "LOG.CRAWL_DEPTH_DECAY", [], {});
  push(out, "LOG.SPIKE", [], {});
  push(out, "LOG.DROP", [], {});
  push(out, "LOG.PARAM_WASTE", [], {});
  push(out, "LOG.SLOW_RESPONSES_TO_BOT", [], {});
  if ((ctx.logs.fakeBotHits ?? 0) > 0) push(out, "LOG.FAKE_BOT", [origin], { hits: ctx.logs.fakeBotHits });
  push(out, "LOG.AI_CRAWLER_VOLUME", [], {});
  push(out, "LOG.MOBILE_VS_DESKTOP_BOT", [], {});
  push(out, "LOG.LAST_CRAWLED_AGE", [], {});
  return out;
}

export function detectMig(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  if (!hasReq(ctx, "migration") || !ctx.migration) return out;
  const map = ctx.migration.urlMap ?? {};
  const origin = ctx.crawl.origin;
  push(out, "MIG.MAP_COVERAGE", Object.keys(map).length === 0 ? [origin] : [], {});
  push(out, "MIG.MAP_ONE_HOP", [], {});
  push(out, "MIG.MAP_RELEVANCE", [], {});
  const homes = Object.values(map).filter((v) => originPath(v) === "/").length;
  if (Object.keys(map).length && homes / Object.keys(map).length > 0.05) {
    push(out, "MIG.NO_MASS_HOMEPAGE", [origin], { ratio: homes / Object.keys(map).length });
  }
  push(out, "MIG.OLD_SITEMAP_RETAINED", [], {});
  push(out, "MIG.CANONICAL_UPDATED", htmlPages(ctx).filter((p) => absCanonical(p) && !selfCanonical(p)).map((p) => p.url), {});
  push(out, "MIG.HREFLANG_UPDATED", [], {});
  push(out, "MIG.INTERNAL_LINKS_UPDATED", [], {});
  if (ctx.crawl.robots?.disallowAll) push(out, "MIG.ROBOTS_MIGRATED", [origin], {});
  push(out, "MIG.NOINDEX_LEAK", htmlPages(ctx).filter(noindexOf).map((p) => p.url), {});
  if (hasReq(ctx, "gsc")) {
    push(out, "MIG.GSC_NEW_PROPERTY", [], {});
    push(out, "MIG.CHANGE_OF_ADDRESS", [], {});
    push(out, "MIG.TRAFFIC_DELTA", [], {});
  }
  push(out, "MIG.ANALYTICS_CONTINUITY", htmlPages(ctx).filter((p) => !/gtag|googletagmanager|ga4/i.test(p.html ?? "")).map((p) => p.url), {});
  push(out, "MIG.STRUCTURED_DATA_PARITY", [], {});
  if (hasReq(ctx, "crux")) push(out, "MIG.PERF_PARITY", [], {});
  push(out, "MIG.BACKLINK_TARGETS_ALIVE", [], {});
  push(out, "MIG.REDIRECT_EXPIRY", [], {});
  return out;
}

export function detectConf(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = htmlPages(ctx);
  const sm = sitemapSet(ctx);
  push(out, "CONF.NOINDEX_IN_SITEMAP", pages.filter((p) => noindexOf(p) && sm.has(p.url)).map((p) => p.url), {});
  push(out, "CONF.DISALLOW_PLUS_NOINDEX", pages.filter((p) => !p.robotsAllowed && noindexOf(p)).map((p) => p.url), {});
  push(out, "CONF.CANON_VS_HREFLANG", pages.filter((p) => {
    const c = absCanonical(p);
    if (!c || (p.extract?.hreflang.length ?? 0) === 0) return false;
    return !p.extract?.hreflang.some((h) => stripSlash(h.absUrl) === stripSlash(c));
  }).map((p) => p.url), {});
  push(out, "CONF.CANON_VS_REDIRECT", pages.filter((p) => hops(p) >= 1 && absCanonical(p)).map((p) => p.url), {});
  if (hasReq(ctx, "gsc") && ctx.gsc?.googleCanonicalByUrl) {
    push(out, "CONF.GOOGLE_CHOSE_OTHER", Object.entries(ctx.gsc.googleCanonicalByUrl).filter(([u, g]) => {
      const p = pages.find((x) => x.url === u);
      if (!p) return false;
      const user = absCanonical(p);
      return Boolean(user && stripSlash(g) !== stripSlash(user));
    }).map(([u]) => u), {});
  }
  push(out, "CONF.SITEMAP_VS_NOINDEX_HEADER", pages.filter((p) => sm.has(p.url) && (p.extract?.xRobotsTag ?? "").toLowerCase().includes("noindex")).map((p) => p.url), {});
  push(out, "CONF.PAGINATED_CANON_TO_P1", pages.filter((p) => /[?&]page=\d+/i.test(p.url) && /page=1/i.test(absCanonical(p) ?? "")).map((p) => p.url), {});
  return out;
}

export function detectGap(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const pages = ctx.crawl.pages.filter((p) => p.isInternal);
  const sm = sitemapSet(ctx);
  push(out, "GAP.NOT_IN_SITEMAP", pages.filter((p) => isIndexable(p) && !sm.has(p.url) && !p.inSitemap).map((p) => p.url), {});
  push(out, "GAP.ORPHAN_SITEMAP", pages.filter((p) => p.inSitemap && p.followInlinkCount === 0).map((p) => p.url), {});
  if (hasReq(ctx, "gsc")) {
    push(out, "GAP.ORPHAN_INDEXED", [], {});
    push(out, "GAP.INDEXED_NOT_SUBMITTED", [], {});
    push(out, "GAP.SUBMITTED_NOT_INDEXED", [], {});
  }
  if (hasReq(ctx, "logs")) push(out, "GAP.ORPHAN_LOGS", [], {});
  return out;
}

export function detectSoft404(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  const phrase = /\b(page not found|not found|404|no results|nothing found|this page (doesn't|does not) exist|error 404|no longer available|coming soon|under construction)\b/i;
  if (ctx.crawl.originProbe.randomSoft404) {
    push(out, "SOFT404.RANDOM_URL_200", [ctx.crawl.originProbe.randomSoft404Url ?? ctx.crawl.origin], {});
  }
  push(out, "SOFT404.PHRASE", htmlPages(ctx).filter((p) => p.statusCode === 200 && phrase.test((p.extract?.mainText ?? "").slice(0, 500))).map((p) => p.url), {});
  push(out, "SOFT404.EMPTY_LISTING", htmlPages(ctx).filter((p) => p.statusCode === 200 && /0 products|no products|no results/i.test(p.extract?.mainText ?? "")).map((p) => p.url), {});
  if (hasReq(ctx, "gsc")) {
    const confirmed = Object.entries(ctx.gsc?.coverageStateByUrl ?? {}).filter(([, s]) => /soft 404/i.test(s)).map(([u]) => u);
    push(out, "SOFT404.GSC_CONFIRMED", confirmed, {});
  }
  push(out, "SOFT404.SPA_ROUTE", htmlPages(ctx).filter((p) => p.statusCode === 200 && p.extract?.spaRootEmpty && phrase.test(p.extract?.allText ?? "")).map((p) => p.url), {});
  push(out, "SOFT404.REDIRECT_TO_HOME", ctx.crawl.pages.filter((p) => hops(p) >= 1 && originPath(p.finalUrl) === "/" && originPath(p.url) !== "/").map((p) => p.url), {});
  push(out, "SOFT404.OOS_PRODUCT", htmlPages(ctx).filter((p) => /out of stock|sold out/i.test(p.extract?.allText ?? "") && /\/product\//i.test(p.url)).map((p) => p.url), {});
  return out;
}

export const FAMILY_DETECTORS: Record<string, (ctx: AuditContext) => FindingDraft[]> = {
  RESP: detectResp,
  CANON: detectCanon,
  ROBOTS: detectRobots,
  DIRECT: detectDirect,
  SMAP: detectSmap,
  CRAWL: detectCrawl,
  LINK: detectLink,
  PAGE: detectPage,
  PARAM: detectParam,
  DUP: detectDup,
  THIN: detectThin,
  JS: detectJs,
  CWV: detectCwv,
  PERF: detectPerf,
  SEC: detectSec,
  HREF: detectHref,
  SD: detectSd,
  ONP: detectOnp,
  IMG: detectImg,
  MOB: detectMob,
  LOG: detectLog,
  MIG: detectMig,
  CONF: detectConf,
  GAP: detectGap,
  SOFT404: detectSoft404,
};

export function detectAll(ctx: AuditContext): FindingDraft[] {
  const out: FindingDraft[] = [];
  for (const [cat, fn] of Object.entries(FAMILY_DETECTORS)) {
    const n = checksByCategory(cat).length;
    if (n === 0) continue;
    out.push(...fn(ctx));
  }
  const byRule = new Map<string, FindingDraft>();
  for (const f of out) {
    const prev = byRule.get(f.ruleId);
    if (!prev) {
      byRule.set(f.ruleId, f);
      continue;
    }
    prev.urls = [...new Set([...prev.urls, ...f.urls])];
  }
  return [...byRule.values()].filter((f) => f.urls.length > 0);
}

export function detectorFor(id: string): (ctx: AuditContext) => FindingDraft[] {
  const cat = id.split(".")[0] ?? "";
  const fn = FAMILY_DETECTORS[cat];
  if (!fn) return () => [];
  return (ctx) => fn(ctx).filter((f) => f.ruleId === id);
}
