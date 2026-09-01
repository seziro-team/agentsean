import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findings, openSqlite, sites } from "@agentsean/db";
import { openCredentialStore } from "@agentsean/credentials";
import { createPendingStore } from "@agentsean/google";
import { createServer } from "./server.js";
import { CSRF_HEADER, TOKEN_HEADER } from "./security.js";
import { isHalted } from "./paths.js";

const TOKEN = "test-token-value";

describe("dashboard routes", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  async function app() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-d-"));
    dirs.push(dir);
    const { db, sqlite } = openSqlite(":memory:");
    const now = new Date().toISOString();
    db.insert(sites)
      .values({
        id: "s1",
        origin: "https://example.com",
        name: "Example",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(findings)
      .values({
        id: "f1",
        siteId: "s1",
        pageId: null,
        ruleId: "ONP.TITLE_MISSING",
        severity: "high",
        autonomyTier: "T1",
        title: "Missing title tag",
        explanation: "Add a unique title",
        evidence: null,
        status: "open",
        fingerprint: "fp-dash",
        firstDetectedAt: now,
        resolvedAt: null,
      })
      .run();
    const store = openCredentialStore({ dir, backend: "encrypted-file" });
    const pending = createPendingStore();
    const server = await createServer({
      host: "127.0.0.1",
      port: 7777,
      token: TOKEN,
      authEnabled: true,
      seanHome: dir,
      db,
      sqlite,
      store,
      pending,
    });
    return { server, sqlite, dir };
  }

  it("lists findings via FTS5 and freezes writes", async () => {
    const { server, sqlite, dir } = await app();
    const found = await server.inject({
      method: "GET",
      url: "/api/findings?q=title&siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().findings[0].title).toMatch(/title/i);

    const freeze = await server.inject({
      method: "POST",
      url: "/api/freeze",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      payload: { halted: true },
    });
    expect(freeze.statusCode).toBe(200);
    expect(freeze.json().halted).toBe(true);
    expect(isHalted(dir)).toBe(true);

    const health = await server.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(health.json().halted).toBe(true);
    expect(health.headers["access-control-allow-origin"]).toBeUndefined();

    await server.close();
    sqlite.close();
  });

  it("rejects onboard with a bad URL", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "POST",
      url: "/api/onboard",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      payload: { url: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
    sqlite.close();
  });

  it("requires a token on the SSE stream", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "GET",
      url: "/api/events",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(res.statusCode).toBe(401);
    await server.close();
    sqlite.close();
  });
});
