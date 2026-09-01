import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "./cli.js";

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sean-audit-"));
}

async function captureRun(argv: string[]): Promise<{ code: number; out: string }> {
  const chunks: string[] = [];
  const wrap = (s: string | Uint8Array) => {
    chunks.push(String(s));
    return true;
  };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = wrap as typeof process.stdout.write;
  process.stderr.write = wrap as typeof process.stderr.write;
  try {
    const code = await run(argv);
    return { code, out: chunks.join("") };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

function startSite(n: number): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/robots.txt") {
      res.end("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n");
      return;
    }
    if (url.pathname === "/sitemap.xml") {
      const locs = Array.from({ length: n }, (_, i) => `<url><loc>http://127.0.0.1:${port}/p/${i}</loc></url>`).join("");
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs}</urlset>`);
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Audit fixture home page title</title>
        <meta name="description" content="Homepage description that is long enough to be a real snippet for search results.">
        <link rel="canonical" href="http://127.0.0.1:${port}/"><meta name="viewport" content="width=device-width"></head>
        <body><h1>Home</h1><p>${"Hello. ".repeat(40)}</p><a href="/p/0">start</a></body></html>`);
      return;
    }
    const m = /^\/p\/(\d+)$/.exec(url.pathname);
    if (m) {
      const i = Number(m[1]);
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unique title for fixture page ${i}</title>
        ${i % 5 === 0 ? "" : `<meta name="description" content="A unique description for fixture page ${i} that clears seventy characters easily here.">`}
        <link rel="canonical" href="http://127.0.0.1:${port}/p/${i}">
        <meta name="viewport" content="width=device-width"></head>
        <body><h1>Page ${i}</h1><p>${"Words for the page body. ".repeat(12)}</p>
        <a href="/">home</a>${i + 1 < n ? `<a href="/p/${i + 1}">next</a>` : ""}
        ${i === 3 ? `<img src="/missing.png">` : ""}</body></html>`);
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

describe("sean audit", () => {
  it("returns a scored JSON audit with zero credentials", async () => {
    const fx = await startSite(30);
    const home = tmpHome();
    try {
      const { code, out } = await captureRun([
        "node",
        "sean",
        "audit",
        fx.origin,
        "--json",
        "--no-js",
        "--max-pages",
        "40",
        "--home",
        home,
      ]);
      expect(code).toBe(0);
      const parsed = JSON.parse(out.trim()) as {
        ok: boolean;
        command: string;
        pages: number;
        score: { value: number; version: string };
        findingCount: number;
        credentialsRequired: boolean;
        formula: { siteScore: string; priority: string };
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe("audit");
      expect(parsed.pages).toBeGreaterThan(10);
      expect(parsed.score.version).toMatch(/^ss-/);
      expect(parsed.credentialsRequired).toBe(false);
      expect(parsed.formula.priority).toMatch(/severity/);
      expect(parsed.findingCount).toBeGreaterThan(0);
    } finally {
      await fx.close();
    }
  });
});
