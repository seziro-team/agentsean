import { describe, expect, it } from "vitest";
import { crawlSite } from "@agentsean/crawler";
import { analyzeCrawl, catalogueSize } from "./audit.js";
import http from "node:http";

function startBrokenSite(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nDisallow:\n");
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><head></head><body>
        <p>thin</p><a href="/dup">dup</a><a href="/gone">gone</a>
        <img src="/a.png"><a href="http://insecure.example/x">ext</a></body></html>`);
      return;
    }
    if (url.pathname === "/dup") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><head></head><body>
        <p>thin</p><a href="/">home</a></body></html>`);
      return;
    }
    if (url.pathname === "/gone") {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<html><body>nope</body></html>");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("bind");
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

describe("analyzeCrawl", () => {
  it("returns prioritized findings for a local site with no credentials", async () => {
    expect(catalogueSize()).toBeGreaterThanOrEqual(300);
    const fx = await startBrokenSite();
    try {
      const crawl = await crawlSite({
        startUrl: fx.origin,
        maxPages: 10,
        render: false,
        rps: 40,
        check304: false,
        concurrency: 2,
      });
      const { findings, score } = analyzeCrawl(crawl);
      const ids = new Set(findings.map((f) => f.ruleId));
      expect(ids.has("ONP.TITLE_MISSING")).toBe(true);
      expect(ids.has("ONP.H1_MISSING")).toBe(true);
      expect(ids.has("RESP.4XX_INTERNAL") || ids.has("LINK.BROKEN_INTERNAL")).toBe(
        true,
      );
      expect(score.version).toMatch(/^ss-/);
      expect(findings[0]?.priority).toBeGreaterThan(0);
    } finally {
      await fx.close();
    }
  });
});
