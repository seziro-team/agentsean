import { load, type CheerioAPI } from "cheerio";
import { parseDocument } from "htmlparser2";
import { extractMainContent, loremIpsumIn, words } from "./readability.js";
import { absolutize, originOf, sameOrigin } from "./url.js";
import type {
  ExtractedImage,
  ExtractedLink,
  HreflangAlt,
  JsonLdBlock,
  PageExtract,
} from "./types.js";

const BODY_FORCING =
  /<(?:img|div|iframe|p|table|h[1-6]|section|article|header|footer)\b/i;

export function extractPage(
  html: string,
  pageUrl: string,
  headerCanonical: string[] = [],
  xRobots: string | null = null,
): PageExtract {
  const dom = parseDocument(html);
  const $ = load(dom);
  const origin = originOf(pageUrl);

  const titles = $("title")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const titleInHead = $("head title").length > 0;

  const metaDescs = $('meta[name="description" i]')
    .toArray()
    .map((el) => $(el).attr("content")?.trim() ?? "")
    .filter(Boolean);
  const metaDescInHead = $('head meta[name="description" i]').length > 0;

  const headings = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: $(el).text().replace(/\s+/g, " ").trim(),
    }));

  const canonicalHtml = $('link[rel="canonical" i]')
    .toArray()
    .map((el) => $(el).attr("href")?.trim() ?? "")
    .filter(Boolean);
  const canonicalInHead = $('head link[rel="canonical" i]').length > 0;
  const canonicalOutsideHead =
    $('link[rel="canonical" i]').length > 0 && !canonicalInHead;

  const robotsMeta = $('meta[name="robots" i], meta[name="googlebot" i]')
    .toArray()
    .map((el) => $(el).attr("content")?.trim() ?? "")
    .filter(Boolean);
  const robotsMetaInHead =
    $('head meta[name="robots" i], head meta[name="googlebot" i]').length > 0;

  const hreflang: HreflangAlt[] = $('link[rel="alternate" i][hreflang]')
    .toArray()
    .map((el) => {
      const href = $(el).attr("href")?.trim() ?? "";
      const lang = $(el).attr("hreflang")?.trim() ?? "";
      const inHead = $(el).parents("head").length > 0;
      return {
        lang,
        href,
        absUrl: absolutize(href, pageUrl) ?? href,
        inHead,
        source: inHead ? "head" : "body",
      };
    });

  const jsonLd: JsonLdBlock[] = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => {
      const raw = $(el).text();
      const inHead = $(el).parents("head").length > 0;
      try {
        return { raw, parsed: JSON.parse(raw) as unknown, error: null, inHead };
      } catch (e) {
        return {
          raw,
          parsed: null,
          error: e instanceof Error ? e.message : "invalid json",
          inHead,
        };
      }
    });

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) openGraph[prop] = content;
  });
  const twitterCard: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) twitterCard[name] = content;
  });

  const links = extractLinks($, pageUrl, origin);
  const images = extractImages($, pageUrl);

  const scripts = $("script")
    .toArray()
    .map((el) => {
      const src = $(el).attr("src") ?? null;
      return {
        src,
        absUrl: src ? absolutize(src, pageUrl) : null,
        async: $(el).attr("async") !== undefined,
        defer: $(el).attr("defer") !== undefined,
      };
    });
  const stylesheets = $('link[rel="stylesheet" i]')
    .toArray()
    .map((el) => {
      const href = $(el).attr("href") ?? null;
      return { href, absUrl: href ? absolutize(href, pageUrl) : null };
    });

  const allText = $("body").text().replace(/\s+/g, " ").trim();
  const main = extractMainContent(html, titles[0] ?? "");
  const boilerplateRatio =
    allText.length === 0 ? 1 : 1 - Math.min(1, main.text.length / allText.length);

  const forms = $("form")
    .toArray()
    .map((el) => {
      const action = $(el).attr("action") ?? "";
      return { action, absAction: absolutize(action || pageUrl, pageUrl) ?? action };
    });

  const mixedActive: string[] = [];
  const mixedPassive: string[] = [];
  if (pageUrl.startsWith("https:")) {
    $("script[src], link[rel='stylesheet'][href], iframe[src]").each((_, el) => {
      const v = $(el).attr("src") ?? $(el).attr("href") ?? "";
      if (v.startsWith("http://")) mixedActive.push(v);
    });
    $("img[src], video[src], audio[src]").each((_, el) => {
      const v = $(el).attr("src") ?? "";
      if (v.startsWith("http://")) mixedPassive.push(v);
    });
  }

  let unsafeTargetBlanks = 0;
  $("a[target='_blank']").each((_, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    if (!rel.includes("noopener") && !rel.includes("noreferrer")) unsafeTargetBlanks++;
  });

  const next = $('link[rel="next" i]').attr("href") ?? null;
  const prev = $('link[rel="prev" i]').attr("href") ?? null;

  const charset =
    $("meta[charset]").attr("charset") ??
    $('meta[http-equiv="content-type" i]').attr("content") ??
    null;
  const first1024 = html.slice(0, 1024);
  const charsetInFirst1024 = /<meta[^>]+charset/i.test(first1024);

  // The marker test lives in a bounded lookahead `(?=[^>]{0,2048}…)`. The old
  // `[^>]+\b(?:…)` backtracked one character at a time when the attribute
  // alternation failed, giving quadratic blow-up on a long `<div …` open tag
  // with no ">" (js/polynomial-redos). A real element's attribute list fits
  // well under the bound. The `\b` after the tag name also fixes a latent
  // over-match (the old form matched `<divider id=…>` because `[^>]+` ate
  // `ider `); we only care about `div`/`app-root` root containers.
  const spaRootEmpty =
    /<(?:div|app-root)\b(?=[^>]{0,2048}(?:\bid=["'](?:root|app|__next)["']|\bdata-reactroot\b|\bng-version\b))/i.test(
      html,
    ) && main.wordCount < 30;

  return {
    title: titles[0] ?? null,
    titles,
    titleInHead,
    metaDescription: metaDescs[0] ?? null,
    metaDescriptions: metaDescs,
    metaDescInHead,
    h1: headings.filter((h) => h.level === 1).map((h) => h.text),
    h2: headings.filter((h) => h.level === 2).map((h) => h.text),
    headings,
    canonicalHtml,
    canonicalHeader: headerCanonical,
    canonicalInHead,
    canonicalOutsideHead,
    headBrokenEarly: detectHeadBroken(html),
    robotsMeta,
    robotsMetaInHead,
    xRobotsTag: xRobots,
    viewport: $('meta[name="viewport" i]').attr("content") ?? null,
    lang: $("html").attr("lang") ?? null,
    charset,
    charsetInFirst1024,
    hreflang,
    jsonLd,
    openGraph,
    twitterCard,
    links,
    images,
    scripts,
    stylesheets,
    wordCount: words(allText),
    mainWordCount: main.wordCount,
    mainText: main.text,
    allText,
    boilerplateRatio,
    metaRefresh: $('meta[http-equiv="refresh" i]').attr("content") ?? null,
    hasNoscriptJsWarning: /please enable javascript|enable js/i.test(
      $("noscript").text(),
    ),
    spaRootEmpty,
    hashFragmentMeta: $('meta[name="fragment"]').attr("content") === "!",
    forms,
    mixedActive,
    mixedPassive,
    unsafeTargetBlanks,
    plugins: $("object, embed").length > 0,
    loremIpsum: loremIpsumIn(allText) || loremIpsumIn(main.text),
    paginationRel: {
      next: next ? (absolutize(next, pageUrl) ?? next) : null,
      prev: prev ? (absolutize(prev, pageUrl) ?? prev) : null,
    },
    htmlLang: $("html").attr("lang") ?? null,
  };
}

/**
 * Index just past the first `<head …>` open tag, or -1.
 *
 * Deliberately not a regex. `/<head\b[^>]*>/` is O(n^2) on input carrying many
 * `<head` and no `>`: the engine runs the negated class to end-of-input, fails,
 * backtracks, then restarts at the next `<head` and rescans everything again —
 * 18.5 seconds measured at 60,000 repetitions. Adding `\b` fixes the
 * `<header>` overmatch but does nothing for the restart, which is the part that
 * costs. This runs on every crawled page, so the input is attacker-authored by
 * definition.
 *
 * Kept local rather than shared with `@agentsean/actions/tagscan`, which does
 * the same job: `actions` sits above `crawler` in the dependency graph, and
 * inverting that to save a dozen lines would be the wrong trade.
 */
function headOpenEnd(html: string): number {
  const lower = html.toLowerCase();
  let from = 0;
  for (;;) {
    const start = lower.indexOf("<head", from);
    if (start === -1) return -1;
    const after = start + 5;
    const next = lower.charCodeAt(after);
    // Word boundary, so `<header>` is not a `<head>`.
    if ((next >= 97 && next <= 122) || (next >= 48 && next <= 57) || next === 95) {
      from = after;
      continue;
    }
    const close = html.indexOf(">", after);
    return close === -1 ? -1 : close + 1;
  }
}

function detectHeadBroken(html: string): boolean {
  const openEnd = headOpenEnd(html);
  if (openEnd === -1) return false;
  const closeIdx = html.toLowerCase().indexOf("</head", openEnd);
  const head = closeIdx === -1 ? html.slice(openEnd) : html.slice(openEnd, closeIdx);
  if (!head) return false;
  const canon = head.search(/<link\b[^>]*rel\s*=\s*["']?canonical/i);
  const slice = canon >= 0 ? head.slice(0, canon) : head;
  return BODY_FORCING.test(slice);
}

function extractLinks($: CheerioAPI, pageUrl: string, origin: string): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim() ?? "";
    if (!href) return;
    const abs = absolutize(href, pageUrl);
    if (!abs) return;
    // Allowlist http(s) on the RESOLVED url rather than denylisting known-bad
    // scheme prefixes. This is a crawler's link-intake path, so it decides
    // which URLs enter the frontier; a `javascript:`/`data:`/`vbscript:` (or
    // `mailto:`/`tel:`) href must never become a crawlable link, and a denylist
    // silently misses schemes it does not enumerate (js/incomplete-url-scheme-
    // check). Relative hrefs still pass because they resolve to the page's
    // http(s) origin.
    const scheme = abs.slice(0, abs.indexOf(":") + 1).toLowerCase();
    if (scheme !== "http:" && scheme !== "https:") return;
    const rel = ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const position = classifyPosition($(el));
    out.push({
      href,
      absUrl: abs,
      anchorText: $(el).text().replace(/\s+/g, " ").trim(),
      rel,
      target: $(el).attr("target") ?? null,
      isNofollow: rel.includes("nofollow"),
      isUgc: rel.includes("ugc"),
      isSponsored: rel.includes("sponsored"),
      isInternal: sameOrigin(abs, origin),
      position,
    });
  });
  return out;
}

function extractImages($: CheerioAPI, pageUrl: string): ExtractedImage[] {
  return $("img")
    .toArray()
    .map((el) => {
      const src = $(el).attr("src") ?? "";
      const attribs = "attribs" in el ? (el.attribs as Record<string, string>) : {};
      return {
        src,
        absUrl: absolutize(src, pageUrl) ?? src,
        alt: $(el).attr("alt") ?? null,
        hasAltAttr: Object.prototype.hasOwnProperty.call(attribs, "alt"),
        width: $(el).attr("width") ?? null,
        height: $(el).attr("height") ?? null,
        loading: $(el).attr("loading") ?? null,
        srcset: $(el).attr("srcset") ?? null,
        decoding: $(el).attr("decoding") ?? null,
      };
    });
}

function classifyPosition(node: ReturnType<CheerioAPI>): ExtractedLink["position"] {
  if (node.closest("nav, [role='navigation']").length) return "nav";
  if (node.closest("header").length) return "header";
  if (node.closest("footer").length) return "footer";
  if (node.closest("aside").length) return "aside";
  if (node.closest("main, article, [role='main']").length) return "main";
  return "unknown";
}

export function parseLinkHeaderCanonicals(header: string | undefined): string[] {
  if (!header) return [];
  const out: string[] = [];
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?canonical"?/i);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}
