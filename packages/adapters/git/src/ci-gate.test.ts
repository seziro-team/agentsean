import { describe, expect, it } from "vitest";
import { assertPreviewNotIndexed, CRAWLER_BYPASS } from "./ci-gate.js";

describe("CI/CD assertion gate", () => {
  it("flags a Vercel preview custom domain missing noindex", () => {
    const r = assertPreviewNotIndexed({
      host: "preview.example.com",
      productionHost: "example.com",
      headers: {},
    });
    expect(r.ok).toBe(false);
    expect(r.leaks[0]).toMatch(/Vercel/);
  });

  it("passes when preview sends X-Robots-Tag noindex", () => {
    const r = assertPreviewNotIndexed({
      host: "preview.example.com",
      productionHost: "example.com",
      headers: { "X-Robots-Tag": "noindex" },
    });
    expect(r.ok).toBe(true);
  });

  it("documents crawler bypass credentials", () => {
    expect(CRAWLER_BYPASS.vercel).toBe("x-vercel-protection-bypass");
    expect(CRAWLER_BYPASS.cloudflareAccessId).toBe("CF-Access-Client-Id");
  });
});
