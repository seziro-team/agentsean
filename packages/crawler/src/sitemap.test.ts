import { describe, expect, it } from "vitest";
import { parseSitemapXml } from "./sitemap.js";

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
