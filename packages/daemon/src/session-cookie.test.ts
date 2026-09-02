import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDaemon } from "./boot.js";
import { loadOrCreateToken, openDaemonStore } from "./token.js";

/**
 * Reopening the dashboard must not lock you out.
 *
 * `sean open` launches the browser at `/#token=…`. The SPA posts that token to
 * /api/session, which sets the session cookie, and then — by design — strips
 * the token from the URL so it cannot leak via history or a shared link.
 *
 * That made the very next page load fail. /api/session read only the
 * `x-sean-token` header, never the cookie it had just issued, so a reload,
 * a bookmark, or any deep link answered 401. The SPA took that as "not
 * authenticated" and showed its "Open this from the daemon" gate over every
 * route, while the cookie sitting in the browser was perfectly valid and every
 * other endpoint accepted it.
 *
 * The gate is the whole dashboard, so the symptom is "nothing works after the
 * first page load" — one refresh away from anyone who opens it.
 */
let home: string;
let running: Awaited<ReturnType<typeof startDaemon>>;
let token: string;

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "sean-session-"));
  running = await startDaemon({
    host: "127.0.0.1",
    port: 0,
    seanHome: home,
    registerSignals: false,
  });
  token = (await loadOrCreateToken(openDaemonStore(home))).unwrap();
});

afterAll(async () => {
  await running.close();
  fs.rmSync(home, { recursive: true, force: true });
});

function get(
  pathname: string,
  headers: Record<string, string>,
): Promise<{ status: number; setCookie: string[] }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "GET",
        host: "127.0.0.1",
        port: running.port,
        path: pathname,
        headers: { host: `127.0.0.1:${running.port}`, ...headers },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            setCookie: res.headers["set-cookie"] ?? [],
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("session cookie", () => {
  it("issues a cookie when the token is presented in the header", async () => {
    const res = await get("/api/session", { "x-sean-token": token });
    expect(res.status).toBe(200);
    expect(res.setCookie.join(";")).toContain("sean_token=");
  });

  it("accepts that cookie on the next load, with no token in the URL", async () => {
    // This is a reload: the SPA already stripped #token= from the address bar,
    // so the cookie is the only credential the browser still has.
    const first = await get("/api/session", { "x-sean-token": token });
    const cookie = (first.setCookie[0] ?? "").split(";")[0] ?? "";
    expect(cookie).toContain("sean_token=");

    const reload = await get("/api/session", { cookie });
    expect(reload.status, "a valid session cookie must re-establish").toBe(200);
  });

  it("still refuses a request carrying no credential at all", async () => {
    const res = await get("/api/session", {});
    expect(res.status).toBe(401);
  });

  it("still refuses a forged cookie", async () => {
    const res = await get("/api/session", { cookie: "sean_token=not-the-token" });
    expect(res.status).toBe(401);
  });
});
