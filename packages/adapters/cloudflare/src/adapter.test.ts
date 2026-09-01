import { describe, expect, it } from "vitest";
import { assertWorkerIsNotCloaking, rewriteHtml, WORKER_SOURCE } from "./rewrite.js";

describe("cloudflare edge overlay", () => {
  it("never branches on user-agent in the shipped worker", () => {
    expect(() => assertWorkerIsNotCloaking(WORKER_SOURCE)).not.toThrow();
    expect(WORKER_SOURCE).not.toMatch(/user-agent/i);
    expect(WORKER_SOURCE).not.toMatch(/googlebot/i);
  });

  it("serves identical HTML regardless of crawler vs human", () => {
    const origin = "<html><head><title>Old</title></head><body>Hi</body></html>";
    const overlay = { title: "Squarespace title via edge" };
    const googlebot = rewriteHtml(origin, overlay);
    const chrome = rewriteHtml(origin, overlay);
    expect(googlebot).toBe(chrome);
    expect(googlebot).toContain("<title>Squarespace title via edge</title>");
  });
});
