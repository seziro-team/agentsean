import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { CSRF_HEADER, TOKEN_HEADER } from "./security.js";

const PORT = 7777;
const TOKEN = "test-token-value";

async function app() {
  return createServer({
    host: "127.0.0.1",
    port: PORT,
    token: TOKEN,
    authEnabled: true,
    seanHome: "/tmp/sean-test-unused",
  });
}

describe("security middleware", () => {
  it("returns 403 for Host: evil.com (DNS rebinding)", async () => {
    const server = await app();
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "evil.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden_host" });
    await server.close();
  });

  it("returns 200 for Host: 127.0.0.1:7777 on health", async () => {
    const server = await app();
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "127.0.0.1:7777" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().name).toBe("sean");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await server.close();
  });

  it("returns 403 for a cross-origin Origin header", async () => {
    const server = await app();
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:7777",
        origin: "https://evil.example",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden_origin" });
    await server.close();
  });

  it("returns 403 for Sec-Fetch-Site: cross-site", async () => {
    const server = await app();
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:7777",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(res.statusCode).toBe(403);
    await server.close();
  });

  it("rejects mutating requests without the CSRF custom header", async () => {
    const server = await app();
    const res = await server.inject({
      method: "POST",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "missing_csrf_header" });
    await server.close();
  });

  it("rejects mutating requests with CSRF header but no token (fail-closed)", async () => {
    const server = await app();
    const res = await server.inject({
      method: "POST",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:7777",
        [CSRF_HEADER]: "1",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    await server.close();
  });

  it("sets SameSite=Strict cookie on a valid session", async () => {
    const server = await app();
    const res = await server.inject({
      method: "GET",
      url: "/api/session",
      headers: {
        host: "127.0.0.1:7777",
        [TOKEN_HEADER]: TOKEN,
      },
    });
    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers["set-cookie"] ?? "");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("HttpOnly");
    await server.close();
  });
});
