import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSqlite } from "@agentsean/db";
import { openCredentialStore } from "@agentsean/credentials";
import { createPendingStore } from "@agentsean/google";
import { createServer } from "./server.js";
import { CSRF_HEADER, TOKEN_HEADER } from "./security.js";

const TOKEN = "test-token-value";

describe("google connect routes", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  async function app() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-g-"));
    dirs.push(dir);
    const { db, sqlite } = openSqlite(":memory:");
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
    return { server, sqlite };
  }

  it("serves the connect dashboard on GET /connect", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "GET",
      url: "/connect",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain("Connect Google");
    expect(res.body).toContain("hosted broker never talks to this machine");
    await server.close();
    sqlite.close();
  });

  it("serves the SPA shell on GET / with no CORS", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "GET",
      url: "/",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain("Agent Sean");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await server.close();
    sqlite.close();
  });

  it("starts a broker authorization without a client secret in the repo", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "POST",
      url: "/api/google/connect/start",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      payload: { origin: "https://example.com", mode: "broker" },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json() as { authorizationUrl: string; mode: string };
    expect(json.mode).toBe("broker");
    expect(json.authorizationUrl).toContain("oauth.agentsean.com");
    expect(json.authorizationUrl).toContain("127.0.0.1");
    expect(json.authorizationUrl).not.toMatch(/client_secret=/);
    await server.close();
    sqlite.close();
  });
});
