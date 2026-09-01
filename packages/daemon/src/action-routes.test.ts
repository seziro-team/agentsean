import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSqlite } from "@agentsean/db";
import { openCredentialStore } from "@agentsean/credentials";
import { createPendingStore } from "@agentsean/google";
import { createServer } from "./server.js";
import { TOKEN_HEADER } from "./security.js";

const TOKEN = "test-token-value";

describe("action routes", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  async function app() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-a-"));
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

  it("serves the activity dashboard", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "GET",
      url: "/activity",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("One click reverts it");
    expect(res.body).toContain("The LLM never holds credentials");
    await server.close();
    sqlite.close();
  });

  it("lists empty changes", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "GET",
      url: "/api/changes",
      headers: { host: "127.0.0.1:7777", [TOKEN_HEADER]: TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ changes: [] });
    await server.close();
    sqlite.close();
  });

  it("requires csrf on apply", async () => {
    const { server, sqlite } = await app();
    const res = await server.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    await server.close();
    sqlite.close();
  });
});
