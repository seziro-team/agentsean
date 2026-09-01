import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startDaemon } from "./boot.js";
import { BindError } from "./bind.js";

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sean-home-"));
}

function request(opts: {
  host: string;
  port: number;
  path: string;
  headers?: http.OutgoingHttpHeaders | undefined;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: opts.host,
        port: opts.port,
        path: opts.path,
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("startDaemon", () => {
  it("boots on loopback, serves health, and 403s Host: evil.com", async () => {
    const home = tmpHome();
    const running = await startDaemon({
      host: "127.0.0.1",
      port: 0,
      seanHome: home,
      registerSignals: false,
    });

    try {
      const health = await request({
        host: "127.0.0.1",
        port: running.port,
        path: "/api/health",
        headers: { Host: `127.0.0.1:${running.port}` },
      });
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body).ok).toBe(true);

      const rebound = await request({
        host: "127.0.0.1",
        port: running.port,
        path: "/api/health",
        headers: { Host: "evil.com" },
      });
      expect(rebound.status).toBe(403);
      expect(JSON.parse(rebound.body).error).toBe("forbidden_host");

      expect(fs.existsSync(path.join(home, "sean.db"))).toBe(true);
    } finally {
      await running.close();
    }
  });

  it("refuses to start with auth disabled", async () => {
    await expect(
      startDaemon({
        host: "127.0.0.1",
        port: 0,
        seanHome: tmpHome(),
        authEnabled: false,
        registerSignals: false,
      }),
    ).rejects.toBeInstanceOf(BindError);
  });
});
