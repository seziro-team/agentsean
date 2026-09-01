import os from "node:os";
import type { Agent } from "undici";
import { createCrawlerAgent, fetchUrl, ROBOTS_MAX_REDIRECTS } from "./http.js";
import { extractPage, parseLinkHeaderCanonicals } from "./extract.js";
import { parseSitemapXml } from "./sitemap.js";
import { isAllowedByRobots, robotsFromFetch } from "./robots.js";
import { contentHash } from "./hash.js";
import { simhashHex } from "./simhash.js";
import { originOf, templateKey, isInternalUrl, normalizeUrl } from "./url.js";
import { decideRenderPolicy, scoreFromHtml } from "./adaptive.js";
import { renderPage } from "./render.js";
import { probeOrigin } from "./probe.js";
import { SEAN_UA } from "./ua.js";
import type {
  CrawledPage,
  CrawlCheckpoint,
  CrawlOptions,
  CrawlResult,
  ParsedSitemap,
  RobotsOutcome,
} from "./types.js";

export function ramConcurrency(): number {
  const freeMb = os.freemem() / (1024 * 1024);
  const cores = Math.max(1, os.cpus().length);
  const fromRam = Math.floor((freeMb - 400) / 50);
  return Math.max(2, Math.min(fromRam || cores, cores * 2, 16));
}

export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const startUrl = normalizeUrl(options.startUrl);
  const origin = originOf(startUrl);
  const maxPages = options.maxPages ?? 5000;
  const concurrency = options.concurrency ?? ramConcurrency();
  const rps = options.rps ?? 4;
  const render = options.render ?? true;
  const userAgent = options.userAgent ?? SEAN_UA;
  const startedAt = new Date().toISOString();
  const agent = createCrawlerAgent(2);

  const robots = await fetchRobots(origin, agent, userAgent);
  const sitemaps = await fetchSitemaps(origin, robots, agent, userAgent);

  const seen = new Set<string>(options.resume?.seen ?? []);
  const queue: { url: string; depth: number }[] = options.resume?.queue
    ? options.resume.queue.map((q) => ({ url: q.url, depth: q.depth }))
    : [];
  const enqueue = (url: string, depth: number) => {
    let abs: string;
    try {
      abs = normalizeUrl(url);
    } catch {
      return;
    }
    if (!isInternalUrl(abs, origin) && !options.followExternal) return;
    if (seen.has(abs)) return;
    if (!isAllowedByRobots(robots, abs, userAgent)) {
      seen.add(abs);
      blocked.push(abs);
      return;
    }
    seen.add(abs);
    queue.push({ url: abs, depth });
  };

  const blocked: string[] = [];
  if (!options.resume) {
    enqueue(startUrl, 0);
    for (const sm of sitemaps) {
      for (const u of sm.urls) enqueue(u.loc, 1);
    }
  }

  const sitemapLocs = new Set(
    sitemaps.flatMap((s) => s.urls.map((u) => normalizeUrlSafe(u.loc))),
  );
  const pages: CrawledPage[] = [];
  const inlinks = new Map<string, number>();
  const followInlinks = new Map<string, number>();
  const minInterval = 1000 / Math.max(0.1, rps);
  let lastFetch = 0;
  let nextIndex = 0;
  let active = 0;

  const snapshot = (): CrawlCheckpoint => ({
    seen: [...seen],
    queue: queue.map((q) => ({ url: q.url, depth: q.depth })),
    pagesSeen: pages.length,
  });
  const emitCheckpoint = () => {
    const every = options.checkpointEvery ?? 10;
    if (pages.length % every !== 0) return;
    options.onCheckpoint?.(snapshot());
  };
  let aborted = false;

  const workers = Array.from({ length: Math.min(concurrency, maxPages) }, async () => {
    while (pages.length < maxPages) {
      if (options.signal?.aborted) {
        aborted = true;
        return;
      }
      const item = queue.shift();
      if (!item) {
        if (active === 0) return;
        await sleep(20);
        continue;
      }
      active++;
      try {
        const wait = lastFetch + minInterval - Date.now();
        if (wait > 0) await sleep(wait);
        lastFetch = Date.now();
        const page = await crawlOne({
          url: item.url,
          depth: item.depth,
          origin,
          agent,
          userAgent,
          timeoutMs: options.timeoutMs ?? 20_000,
          robots,
          sitemapLocs,
          render,
          index: nextIndex++,
          prior: pages,
          check304: options.check304 ?? true,
        });
        pages.push(page);
        emitCheckpoint();
        if (page.extract) {
          for (const link of page.extract.links) {
            if (!link.isInternal) continue;
            inlinks.set(link.absUrl, (inlinks.get(link.absUrl) ?? 0) + 1);
            if (!link.isNofollow) {
              followInlinks.set(link.absUrl, (followInlinks.get(link.absUrl) ?? 0) + 1);
            }
            if (pages.length + queue.length < maxPages * 2) {
              enqueue(link.absUrl, item.depth + 1);
            }
          }
        }
      } finally {
        active--;
      }
    }
  });

  await Promise.all(workers);

  for (const p of pages) {
    p.inlinkCount = inlinks.get(p.url) ?? 0;
    p.followInlinkCount = followInlinks.get(p.url) ?? 0;
  }

  let originProbe;
  try {
    originProbe = await probeOrigin(startUrl, agent);
  } catch {
    originProbe = {
      https: startUrl.startsWith("https:"),
      httpRedirectsToHttps: null,
      wwwSplit: null,
      wwwPreferred: null,
      trailingSlashSplit: null,
      randomSoft404: false,
      randomSoft404Url: null,
      randomSoft404Hash: null,
      certValidTo: null,
      certDaysRemaining: null,
      certError: null,
      alpn: null,
      hsts: null,
    };
  }

  await agent.close();

  const checkpoint = snapshot();
  options.onCheckpoint?.(checkpoint);

  return {
    origin,
    startUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    pages,
    robots,
    sitemaps,
    originProbe,
    pagesSeen: pages.length,
    pagesChanged: pages.filter((p) => !p.notModified).length,
    maxPages,
    truncated: queue.length > 0 || seen.size > pages.length,
    aborted,
    checkpoint,
  };
}

async function crawlOne(opts: {
  url: string;
  depth: number;
  origin: string;
  agent: Agent;
  userAgent: string;
  timeoutMs: number;
  robots: RobotsOutcome;
  sitemapLocs: Set<string>;
  render: boolean;
  index: number;
  prior: CrawledPage[];
  check304: boolean;
}): Promise<CrawledPage> {
  const fetched = await fetchUrl(opts.url, {
    agent: opts.agent,
    userAgent: opts.userAgent,
    timeoutMs: opts.timeoutMs,
  });
  const isHtml =
    /html|xml|xhtml/i.test(fetched.contentType) || looksLikeHtml(fetched.decoded);
  const html = isHtml ? fetched.decoded.toString("utf8") : null;
  const headerCanonical = parseLinkHeaderCanonicals(fetched.headers.link);
  const xRobots = fetched.headers["x-robots-tag"] ?? null;
  const extract = html
    ? extractPage(html, fetched.finalUrl, headerCanonical, xRobots)
    : null;
  const hash = fetched.decoded.length ? contentHash(fetched.decoded) : null;
  const sh = extract ? simhashHex(extract.mainText || extract.allText) : null;
  const jsScore = html && extract ? scoreFromHtml(html, extract) : 0;
  const tmpl = templateKey(opts.url);

  let supports304: boolean | null = null;
  if (
    opts.check304 &&
    fetched.statusCode === 200 &&
    (fetched.etag || fetched.lastModified)
  ) {
    const again = await fetchUrl(opts.url, {
      agent: opts.agent,
      userAgent: opts.userAgent,
      timeoutMs: opts.timeoutMs,
      etag: fetched.etag ?? undefined,
      lastModified: fetched.lastModified ?? undefined,
      maxRedirects: 0,
    });
    supports304 = again.statusCode === 304;
  }

  const draft: CrawledPage = {
    url: opts.url,
    finalUrl: fetched.finalUrl,
    statusCode: fetched.statusCode,
    error: fetched.error,
    contentType: fetched.contentType,
    headers: fetched.headers,
    ttfbMs: fetched.ttfbMs,
    totalMs: fetched.totalMs,
    wireBytes: fetched.wireBytes,
    decodedBytes: fetched.decodedBytes,
    httpVersion: null,
    redirectChain: fetched.redirectChain,
    redirectLoop: fetched.redirectLoop,
    exceedsGoogleRedirectLimit: fetched.exceedsGoogleRedirectLimit,
    html,
    renderedHtml: null,
    extract,
    renderedExtract: null,
    contentHash: hash,
    simhash: sh,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    notModified: fetched.notModified,
    supports304,
    inSitemap: opts.sitemapLocs.has(opts.url) || opts.sitemapLocs.has(fetched.finalUrl),
    robotsAllowed: isAllowedByRobots(opts.robots, opts.url, opts.userAgent),
    depth: opts.depth,
    inlinkCount: 0,
    outlinkCount: extract?.links.filter((l) => l.isInternal).length ?? 0,
    followInlinkCount: 0,
    isInternal: isInternalUrl(opts.url, opts.origin),
    fetchedAt: new Date().toISOString(),
    renderPolicy: "skipped",
    rendered: false,
    jsDependencyScore: jsScore,
    templateKey: tmpl,
  };

  if (opts.render && html && extract && fetched.statusCode === 200) {
    const policy = decideRenderPolicy(opts.prior, draft, opts.index);
    draft.renderPolicy = policy === "never" ? "never" : policy;
    if (policy === "always" || policy === "sample") {
      const rendered = await renderPage(opts.url, html);
      if (rendered && !rendered.errors.includes("playwright_unavailable")) {
        draft.renderedHtml = rendered.html;
        draft.renderedExtract = rendered.extract;
        draft.rendered = true;
        if (rendered.timedOut) draft.error = draft.error ?? "render_timeout";
      } else {
        draft.renderPolicy = "skipped";
      }
    }
  }

  return draft;
}

async function fetchRobots(
  origin: string,
  agent: Agent,
  userAgent: string,
): Promise<RobotsOutcome> {
  const url = `${origin}/robots.txt`;
  const res = await fetchUrl(url, {
    agent,
    userAgent,
    timeoutMs: 10_000,
    maxRedirects: ROBOTS_MAX_REDIRECTS,
    accept: "text/plain,*/*;q=0.1",
  });
  return robotsFromFetch({
    statusCode: res.statusCode,
    raw: res.decoded.toString("utf8"),
    contentType: res.contentType,
    bytes: res.decodedBytes,
    redirectHops: Math.max(0, res.redirectChain.length - 1),
    error: res.error,
  });
}

async function fetchSitemaps(
  origin: string,
  robots: RobotsOutcome,
  agent: Agent,
  userAgent: string,
): Promise<ParsedSitemap[]> {
  const candidates = [
    ...robots.sitemaps,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];
  const seen = new Set<string>();
  const out: ParsedSitemap[] = [];
  for (const loc of candidates) {
    let url: string;
    try {
      url = new URL(loc, origin).href;
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await fetchUrl(url, {
      agent,
      userAgent,
      timeoutMs: 15_000,
      accept: "application/xml,text/xml,*/*;q=0.1",
    });
    if (res.statusCode === 404 || res.statusCode === null) {
      if (!robots.sitemaps.includes(loc) && !robots.sitemaps.includes(url)) continue;
    }
    const parsed = await parseSitemapXml(
      res.decoded,
      url,
      url.endsWith(".gz") || (res.headers["content-type"] ?? "").includes("gzip"),
    );
    const sm: ParsedSitemap = {
      ...parsed,
      statusCode: res.statusCode,
      contentType: res.contentType,
      error: parsed.error ?? res.error,
    };
    out.push(sm);
    for (const child of sm.childSitemaps) {
      if (!seen.has(child) && out.length < 50) candidates.push(child);
    }
  }
  return out;
}

function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.slice(0, 256).toString("utf8").toLowerCase();
  return (
    head.includes("<html") || head.includes("<!doctype html") || head.includes("<head")
  );
}

function normalizeUrlSafe(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
