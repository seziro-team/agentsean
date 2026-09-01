import { describe, expect, it } from "vitest";
import { decayingPages } from "./decay.js";
import { contentScore } from "./score.js";

describe("decay (clicks, 28 vs previous 28)", () => {
  it("flags a page whose clicks dropped 20%+ and ignores impressions", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const rows = [];
    for (let i = 1; i <= 56; i++) {
      const date = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      const previousWindow = i > 28;
      rows.push({
        date,
        page: "https://example.com/guide",
        clicks: previousWindow ? 10 : 4,
      });
    }
    const found = decayingPages(rows, now);
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe("https://example.com/guide");
    expect(found[0]?.previousClicks).toBeGreaterThan(found[0]?.currentClicks ?? 0);
  });

  it("does not flag a stable page", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const rows = [];
    for (let i = 1; i <= 56; i++) {
      const date = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      rows.push({ date, page: "https://example.com/", clicks: 12 });
    }
    expect(decayingPages(rows, now)).toEqual([]);
  });
});

describe("content score", () => {
  it("is Σ min(2, mentions) over topics, scaled 0-100", () => {
    const text = "widgets widgets gadgets";
    expect(contentScore(text, ["widgets", "gadgets"])).toBe(75);
    expect(contentScore(text, [])).toBe(0);
  });
});
