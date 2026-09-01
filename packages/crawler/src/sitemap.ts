import { SaxesParser } from "saxes";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { absolutize } from "./url.js";
import type { ParsedSitemap, SitemapUrl } from "./types.js";

const gunzip = promisify(zlib.gunzip);
const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

export async function parseSitemapXml(
  raw: Buffer,
  sitemapUrl: string,
  gzipped: boolean,
): Promise<Omit<ParsedSitemap, "statusCode" | "contentType">> {
  let bytes = raw;
  let gzipBroken = false;
  if (gzipped || sitemapUrl.endsWith(".gz")) {
    try {
      bytes = await gunzip(raw);
    } catch {
      gzipBroken = true;
      return empty(sitemapUrl, "gzip_broken", gzipBroken, raw.length);
    }
  }
  const xml = bytes.toString("utf8");
  return parseXml(xml, sitemapUrl, bytes.length, gzipBroken);
}

function empty(
  url: string,
  error: string,
  gzipBroken: boolean,
  bytes: number,
): Omit<ParsedSitemap, "statusCode" | "contentType"> {
  return {
    url,
    error,
    bytes,
    gzipBroken,
    malformed: true,
    namespace: null,
    isIndex: false,
    nestedIndex: false,
    urls: [],
    childSitemaps: [],
    relativeLocs: [],
  };
}

function parseXml(
  xml: string,
  sitemapUrl: string,
  bytes: number,
  gzipBroken: boolean,
): Omit<ParsedSitemap, "statusCode" | "contentType"> {
  const parser = new SaxesParser({ xmlns: true, fragment: false });
  const urls: SitemapUrl[] = [];
  const childSitemaps: string[] = [];
  const relativeLocs: string[] = [];
  let namespace: string | null = null;
  let isIndex = false;
  let nestedIndex = false;
  let malformed = false;
  let error: string | null = null;
  let path: string[] = [];
  let text = "";
  let current: Partial<SitemapUrl> & { images: string[]; hreflang: { lang: string; href: string }[] } | null = null;
  let videoFields: Record<string, string> = {};

  parser.on("error", (e) => {
    malformed = true;
    error = e.message;
  });
  parser.on("opentag", (tag) => {
    const local = tag.local ?? tag.name.replace(/^.*:/, "");
    path.push(local.toLowerCase());
    text = "";
    if (local.toLowerCase() === "urlset") {
      namespace = tag.uri || tag.attributes?.xmlns?.value || NS;
    }
    if (local.toLowerCase() === "sitemapindex") {
      isIndex = true;
      namespace = tag.uri || tag.attributes?.xmlns?.value || NS;
      if (path.filter((p) => p === "sitemapindex").length > 1) nestedIndex = true;
    }
    if (local.toLowerCase() === "url") {
      current = { images: [], hreflang: [] };
      videoFields = {};
    }
  });
  parser.on("text", (t) => {
    text += t;
  });
  parser.on("closetag", (tag) => {
    const local = (tag.local ?? tag.name.replace(/^.*:/, "")).toLowerCase();
    const value = text.trim();
    if (current) {
      if (local === "loc" && path[path.length - 2] === "url") current.loc = value;
      if (local === "lastmod") current.lastmod = value;
      if (local === "changefreq") current.changefreq = value;
      if (local === "priority") current.priority = value;
      if (local === "loc" && path.includes("image")) current.images.push(value);
      if (local === "link") {
        /* xhtml:link handled via attributes in opentag — see below */
      }
      if (path.includes("video")) {
        videoFields[local] = value;
      }
      if (local === "url") {
        const loc = current.loc ?? "";
        if (loc && !/^https?:\/\//i.test(loc)) relativeLocs.push(loc);
        const videoValid = Object.keys(videoFields).length
          ? Boolean(
              videoFields["thumbnail_loc"] &&
                videoFields["title"] &&
                videoFields["description"] &&
                (videoFields["content_loc"] || videoFields["player_loc"]),
            )
          : null;
        urls.push({
          loc,
          lastmod: current.lastmod ?? null,
          changefreq: current.changefreq ?? null,
          priority: current.priority ?? null,
          images: current.images,
          videoValid,
          hreflang: current.hreflang,
        });
        current = null;
      }
    } else if (isIndex && local === "loc") {
      childSitemaps.push(value);
    }
    path.pop();
    text = "";
  });

  // saxes xmlns attributes: capture xhtml:link hreflang on opentag via a second pass
  const hrefLangRe =
    /<xhtml:link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  let hm: RegExpExecArray | null;
  const extras: { lang: string; href: string }[] = [];
  while ((hm = hrefLangRe.exec(xml))) {
    extras.push({ lang: hm[1] ?? "", href: hm[2] ?? "" });
  }

  try {
    parser.write(xml);
    parser.close();
  } catch (e) {
    malformed = true;
    error = e instanceof Error ? e.message : "parse";
  }

  if (extras.length && urls.length) {
    const first = urls[0];
    if (first) first.hreflang.push(...extras);
  }

  for (const u of urls) {
    if (u.loc && !u.loc.startsWith("http")) {
      const abs = absolutize(u.loc, sitemapUrl);
      if (abs) u.loc = abs;
    }
  }

  return {
    url: sitemapUrl,
    error,
    bytes,
    gzipBroken,
    malformed,
    namespace,
    isIndex,
    nestedIndex,
    urls,
    childSitemaps,
    relativeLocs,
  };
}
