import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const SPA_PATHS = new Set([
  "/",
  "/findings",
  "/crawls",
  "/changes",
  "/approvals",
  "/automations",
  "/content",
  "/search",
  "/keywords",
  "/evidence",
  "/ai",
  "/local",
  "/mentions",
  "/reports",
  "/billing",
  "/settings",
  "/onboarding",
]);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function dashboardDist(): string | null {
  const candidates: string[] = [];
  try {
    const pkg = fileURLToPath(import.meta.resolve("@agentsean/dashboard/package.json"));
    candidates.push(path.join(path.dirname(pkg), "dist"));
  } catch {
    // not resolvable
  }
  candidates.push(path.resolve(fileURLToPath(new URL("../../../dashboard/dist", import.meta.url))));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}

function fallbackHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Agent Sean</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{font:16px/1.45 system-ui,sans-serif;margin:2rem;background:#f6f7f9;color:#111}
  a{color:#0b57d0}
</style></head>
<body>
<h1>Agent Sean</h1>
<p>The SEO engineer that never sleeps. URL → 90-second crawl → first findings → then Google.</p>
<p><a href="/connect">Connect Google</a> · <a href="/activity">Activity</a> — One click reverts it.</p>
<p>Build <code>packages/dashboard</code> for the full SPA. The daemon already serves the JSON API on this origin — no CORS.</p>
</body></html>`;
}

function sendFile(reply: FastifyReply, file: string): void {
  const ext = path.extname(file);
  reply.type(MIME[ext] ?? "application/octet-stream");
  reply.send(fs.readFileSync(file));
}

export function registerSpa(app: FastifyInstance): void {
  const dist = dashboardDist();

  const serveIndex = (_req: FastifyRequest, reply: FastifyReply) => {
    if (!dist) {
      reply.type("text/html").send(fallbackHtml());
      return;
    }
    sendFile(reply, path.join(dist, "index.html"));
  };

  for (const p of SPA_PATHS) {
    app.get(p, serveIndex);
  }

  app.get("/assets/*", (req, reply) => {
    if (!dist) return reply.code(404).send({ error: "no_dashboard" });
    const rel = req.url.split("?")[0] ?? "";
    const file = path.resolve(dist, rel.replace(/^\/+/, ""));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return reply.code(404).send({ error: "not_found" });
    }
    sendFile(reply, file);
  });
}
