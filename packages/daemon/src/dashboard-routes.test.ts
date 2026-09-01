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

  it("refuses to override the content rate caps", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "POST",
      url: "/api/settings",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      payload: { newPagesPerDay: 50 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("rate_limit_locked");
    await server.close();
    sqlite.close();
  });

  it("lists keyword opportunities and provider status with zero paid keys", async () => {
    const { server, sqlite } = await app();
    const keys = await server.inject({
      method: "GET",
      url: "/api/providers",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(keys.statusCode).toBe(200);
    expect(keys.json().paidUpgrade).toBe(false);
    expect(keys.json().neverScrapesGoogle).toBe(true);

    const kw = await server.inject({
      method: "GET",
      url: "/api/keywords?siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(kw.statusCode).toBe(200);
    expect(kw.json().keywords).toEqual([]);
    expect(kw.json().clusters).toEqual([]);
    await server.close();
    sqlite.close();
  });

  it("labels claims with an evidence tier and will not claim causation", async () => {
    const { server, sqlite } = await app();
    const power = await server.inject({
      method: "GET",
      url: "/api/measure/power?siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(power.statusCode).toBe(200);
    expect(power.json().typicalTier).toBe("E");
    expect(power.json().message).toMatch(/tier E/i);

    const run = await server.inject({
      method: "POST",
      url: "/api/measure",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      payload: { siteId: "s1" },
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().ok).toBe(true);

    const claims = await server.inject({
      method: "GET",
      url: "/api/claims?siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(claims.statusCode).toBe(200);
    expect(claims.json().meaning.E).toMatch(/not measurable/i);
    await server.close();
    sqlite.close();
  });

  it("reports AI citation share, GBP quota, mentions, and vertical rules", async () => {
    const { server, sqlite } = await app();
    const ai = await server.inject({
      method: "GET",
      url: "/api/ai?siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(ai.statusCode).toBe(200);
    expect(ai.json().citationShare).toBe(0);
    expect(ai.json().refusals).toHaveLength(3);

    const local = await server.inject({
      method: "GET",
      url: "/api/local?siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(local.statusCode).toBe(200);
    expect(local.json().editsPerMin).toBe(10);
    expect(local.json().reviewGeneration).toBe("t4_refused");

    const mentions = await server.inject({
      method: "GET",
      url: "/api/mentions?siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(mentions.statusCode).toBe(200);
    expect(mentions.json().sendRequiresApproval).toBe(true);

    const vertical = await server.inject({
      method: "GET",
      url: "/api/vertical?siteId=s1",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(vertical.statusCode).toBe(200);
    expect(vertical.json().preset).toBe("b2b_saas");
    expect(vertical.json().questions).toHaveLength(6);
    await server.close();
    sqlite.close();
  });

  it("serves self-host billing with $0 and no tenant", async () => {
    const { server, sqlite } = await app();
    const billing = await server.inject({
      method: "GET",
      url: "/api/billing",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(billing.statusCode).toBe(200);
    expect(billing.json().plan).toBe("self_host");
    expect(billing.json().priceUsd).toBe(0);
    await server.close();
    sqlite.close();
  });
});
