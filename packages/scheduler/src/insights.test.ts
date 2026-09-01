import { describe, expect, it } from "vitest";
import { brandTermsFromOrigin, computeGscInsights } from "./insights.js";

describe("GSC insights", () => {
  it("defaults to clicks, flags striking distance, decay, brand split, and contaminated impressions", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const insights = computeGscInsights({
      now,
      brandTerms: brandTermsFromOrigin("https://acme.com"),
      days: [
        { date: "2026-05-18", clicks: 40, impressions: 400 },
        { date: "2026-05-25", clicks: 10, impressions: 400 },
      ],
      pages: [
        {
          date: "2026-05-28",
          page: "https://acme.com/pricing",
          clicks: 8,
          impressions: 200,
          position: 12,
        },
        {
          date: "2026-05-28",
          page: "https://acme.com/",
          clicks: 30,
          impressions: 100,
          position: 2,
        },
      ],
      queries: [
        {
          date: "2026-05-28",
          query: "acme login",
          clicks: 12,
          impressions: 20,
          position: 1,
        },
        {
          date: "2026-05-28",
          query: "best widgets 2026",
          clicks: 1,
          impressions: 400,
          position: 18,
        },
      ],
    });
    expect(insights.metric).toBe("clicks");
    expect(insights.strikingDistance.map((r) => r.page)).toEqual([
      "https://acme.com/pricing",
    ]);
    expect(insights.decay.delta).toBeLessThan(0);
    expect(insights.brand.brandClicks).toBe(12);
    expect(insights.ctrOutliers[0]?.query).toBe("best widgets 2026");
    expect(insights.impressionsContaminated).toBe(false);
  });
});
