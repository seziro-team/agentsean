import { describe, expect, it } from "vitest";
import { parseSitemapXml } from "./sitemap.js";

// ReDoS regression: sitemaps are fetched from the target site. The xhtml:link
// hreflang second-pass regex previously chained unbounded [^>]* runs and went
// polynomial on a crafted <xhtml:link …; the tag-body rewrite must stay linear.
describe("parseSitemapXml ReDoS hardening", () => {
  it("is linear on a giant unterminated <xhtml:link tag", async () => {
    const xml = Buffer.from(
      `<urlset><url><loc>https://ex.com/a</loc><xhtml:link rel="alternate" ` +
        "a".repeat(300_000),
    );
    const start = performance.now();
    await parseSitemapXml(xml, "https://ex.com/sitemap.xml", false);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("still extracts hreflang alternates", async () => {
    const xml = Buffer.from(
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">` +
        `<url><loc>https://ex.com/a</loc>` +
        `<xhtml:link rel="alternate" hreflang="de" href="https://ex.com/de"/>` +
        `</url></urlset>`,
    );
    const parsed = await parseSitemapXml(xml, "https://ex.com/sitemap.xml", false);
    expect(parsed.urls[0]?.hreflang).toContainEqual({
      lang: "de",
      href: "https://ex.com/de",
    });
  });
});

describe("parseSitemapXml", () => {
  it("parses urlset loc and lastmod", async () => {
    const xml = Buffer.from(`<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://ex.com/a</loc><lastmod>2026-01-02</lastmod></url>
        <url><loc>https://ex.com/b</loc></url>
      </urlset>`);
    const parsed = await parseSitemapXml(xml, "https://ex.com/sitemap.xml", false);
    expect(parsed.malformed).toBe(false);
    expect(parsed.urls.map((u) => u.loc)).toEqual([
      "https://ex.com/a",
      "https://ex.com/b",
    ]);
    expect(parsed.urls[0]?.lastmod).toBe("2026-01-02");
  });
});
