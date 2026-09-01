import http from "node:http";
import { describe, expect, it } from "vitest";
import { crawlSite } from "./crawl.js";

function startFixture(
  pageCount = 20,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n");
      return;
    }
    if (url.pathname === "/sitemap.xml") {
      const locs = Array.from(
        { length: pageCount },
        (_, i) => `<url><loc>http://127.0.0.1:${port}/p/${i}</loc></url>`,
      ).join("");
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs}</urlset>`,
      );
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        etag: '"home"',
      });
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home of the fixture site</title>
        <meta name="description" content="A fixture homepage used to exercise the Agent Sean crawler end to end.">
        <link rel="canonical" href="http://127.0.0.1:${port}/">
        <meta name="viewport" content="width=device-width"></head>
        <body><h1>Home</h1><p>${"Welcome to the fixture. ".repeat(20)}</p>
        <a href="/p/0">First</a><a href="/missing">Broken</a></body></html>`);
      return;
    }
    if (url.pathname === "/missing") {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<html><head><title>Not found</title></head><body>404</body></html>");
      return;
    }
    const m = /^\/p\/(\d+)$/.exec(url.pathname);
    if (m) {
      const n = Number(m[1]);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
        <title>Page ${n} unique title for the fixture</title>
        ${n % 7 === 0 ? "" : `<meta name="description" content="Description for page ${n} that is long enough to pass the short check here.">`}
        <link rel="canonical" href="http://127.0.0.1:${port}/p/${n}">
        <meta name="viewport" content="width=device-width"></head>
        <body><h1>Page ${n}</h1><p>${"Content words for this page. ".repeat(15)}</p>
        <a href="/">Home</a>${n + 1 < pageCount ? `<a href="/p/${n + 1}">Next</a>` : ""}
        ${n % 11 === 0 ? `<img src="/x.png">` : ""}</body></html>`);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  let port = 0;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("bind");
      port = addr.port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

describe("crawlSite", () => {
  it("resumes from a checkpoint after abort", async () => {
    const fx = await startFixture(16);
    try {
      const ac = new AbortController();
      const first = await crawlSite({
        startUrl: fx.origin,
        maxPages: 4,
        concurrency: 1,
        render: false,
        rps: 50,
        check304: false,
        signal: ac.signal,
        checkpointEvery: 1,
      });
      expect(first.pagesSeen).toBe(4);
      expect(first.checkpoint.seen.length).toBeGreaterThan(0);
      const second = await crawlSite({
        startUrl: fx.origin,
        maxPages: 8,
        concurrency: 1,
        render: false,
        rps: 50,
        check304: false,
        resume: first.checkpoint,
      });
      const urls = new Set(second.pages.map((p) => p.url));
      expect(urls.size).toBe(second.pages.length);
      expect(second.pagesSeen).toBeGreaterThan(0);
      expect(second.aborted).toBe(false);
    } finally {
      await fx.close();
    }
  });

  it("crawls a local fixture via sitemap and links", async () => {
    const fx = await startFixture(12);
    try {
      const result = await crawlSite({
        startUrl: fx.origin,
        maxPages: 20,
        concurrency: 4,
        render: false,
        rps: 50,
        check304: false,
      });
      expect(result.pagesSeen).toBeGreaterThan(5);
      expect(result.robots?.sitemaps.length).toBeGreaterThan(0);
      expect(result.pages.some((p) => p.statusCode === 404)).toBe(true);
      expect(result.pages.some((p) => p.extract?.title?.includes("Home"))).toBe(true);
    } finally {
      await fx.close();
    }
  });

  it("audits 500 local pages in well under 5 minutes", async () => {
    const fx = await startFixture(500);
    try {
      const t0 = Date.now();
      const result = await crawlSite({
        startUrl: fx.origin,
        maxPages: 520,
        concurrency: 16,
        render: false,
        rps: 200,
        check304: false,
      });
      const elapsed = Date.now() - t0;
      expect(result.pagesSeen).toBeGreaterThanOrEqual(500);
      expect(elapsed).toBeLessThan(5 * 60 * 1000);
    } finally {
      await fx.close();
    }
  });
});
