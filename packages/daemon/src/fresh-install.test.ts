import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDaemon } from "./boot.js";
import { loadOrCreateToken, openDaemonStore } from "./token.js";

/**
 * What a brand-new install looks like over HTTP.
 *
 * Eight read endpoints answered `400 unknown_site` when no site was connected,
 * so a freshly-installed dashboard rendered errors across half its views. The
 * owner's report was "a lot of features don't seem to be working" — they were
 * working; they were being asked for a site that did not exist yet, at the
 * exact moment a new user forms their opinion of the product.
 *
 * A read with nothing to read is an empty result, not a client error. Reads
 * return 200 with `site: null` and empty collections so the UI can honestly
 * say "connect a site first". Mutations still 400: you cannot act on a site
 * that is not there.
 */
let home: string;
let running: Awaited<ReturnType<typeof startDaemon>>;
let token: string;

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "sean-fresh-"));
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

function request(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        method,
        host: "127.0.0.1",
        port: running.port,
        path: pathname,
        headers: {
          host: `127.0.0.1:${running.port}`,
          "x-sean-token": token,
          ...(payload
            ? { "content-type": "application/json", "x-sean-csrf": "1" }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = JSON.parse(text) as Record<string, unknown>;
          } catch {
            json = { _raw: text };
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Every read the dashboard makes before a site exists, and the keys it needs. */
const READS: Array<[string, string[]]> = [
  ["/api/keywords", ["keywords", "clusters", "ranks", "strikingDistance"]],
  ["/api/search", ["pages", "queries", "days"]],
  ["/api/claims", ["claims"]],
  ["/api/experiments", ["experiments"]],
  ["/api/mentions", ["mentions", "outreach"]],
  ["/api/local", ["qpm"]],
  ["/api/vertical", ["questions", "rules"]],
  ["/api/measure/power", ["monthlyClicks", "pageCount"]],
  ["/api/overview", []],
  ["/api/sites", []],
  ["/api/findings", []],
  ["/api/changes", []],
  ["/api/settings", []],
  ["/api/health", []],
];

describe("a fresh install with no site connected", () => {
  for (const [route, keys] of READS) {
    it(`GET ${route} answers 200, not an error`, async () => {
      const { status, json } = await request("GET", route);
      expect(status, `${route} should not error on a fresh install`).toBe(200);
      expect(json["error"], `${route} returned an error payload`).toBeUndefined();
      for (const k of keys) {
        expect(json, `${route} is missing "${k}"`).toHaveProperty(k);
      }
    });
  }

  it("marks site-scoped reads with site: null so the UI can explain why", async () => {
    for (const route of ["/api/keywords", "/api/search", "/api/claims"]) {
      const { json } = await request("GET", route);
      expect(json["site"], route).toBeNull();
    }
  });

  it("returns empty collections rather than omitting them", async () => {
    // The dashboard maps over these; undefined would throw at render time.
    const { json } = await request("GET", "/api/keywords");
    for (const k of ["keywords", "clusters", "ranks", "strikingDistance"]) {
      expect(Array.isArray(json[k]), `${k} should be an array`).toBe(true);
      expect((json[k] as unknown[]).length).toBe(0);
    }
  });

  it("still refuses MUTATIONS without a site", async () => {
    // Acting on a site that does not exist is a genuine client error.
    const { status, json } = await request("POST", "/api/measure", {});
    expect(status).toBe(400);
    expect(json).toEqual({ error: "unknown_site" });
  });
});
