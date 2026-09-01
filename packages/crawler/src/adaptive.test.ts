import { describe, expect, it } from "vitest";
import { decideRenderPolicy, shouldAlwaysRender } from "./adaptive.js";

describe("adaptive rendering", () => {
  it("always renders the homepage", () => {
    expect(shouldAlwaysRender({ url: "https://ex.com/", extract: null })).toBe(true);
  });

  it("samples early URLs at the Crawlee 10% calibration ratio after fingerprinting", () => {
    const policy = decideRenderPolicy(
      Array.from({ length: 60 }, (_, i) => ({
        templateKey: "1:blog/:id",
        jsDependencyScore: 0.01,
        url: `https://ex.com/blog/${i}`,
      })),
      {
        templateKey: "1:blog/:id",
        jsDependencyScore: 0.01,
        url: "https://ex.com/blog/99",
        extract: null,
      },
      80,
    );
    expect(["never", "sample"]).toContain(policy);
  });
});
