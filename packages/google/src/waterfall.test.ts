import { describe, expect, it } from "vitest";
import { DISCREPANCY_CAUSES, GSC_ANONYMIZED_SHARE } from "./causes.js";
import { buildWaterfall } from "./waterfall.js";

describe("GA4↔GSC waterfall", () => {
  it("names 17 causes and closes to an explicit residual", () => {
    expect(DISCREPANCY_CAUSES).toHaveLength(17);
    const w = buildWaterfall({
      gscClicks: 1000,
      queryDimensionClicks: 532,
      ga4OrganicSessions: 600,
      windowStart: "2026-07-01",
      windowEnd: "2026-07-28",
      timeZone: "Europe/Paris",
    });
    expect(w.steps).toHaveLength(17);
    expect(w.residual).toBe(-400);
    expect(w.anonymizedQueryShare).toBeCloseTo(0.468, 2);
    expect(w.euProperty).toBe(true);
    expect(w.euInvisibleShare).toBeGreaterThanOrEqual(0.4);
    expect(w.notes).toMatch(/residual/i);
    expect(w.steps.some((s) => s.code === "GSC_ANONYMIZED_QUERY" && s.applies)).toBe(true);
    expect(w.steps.some((s) => s.code === "GA4_CONSENT_DENIED" && s.applies)).toBe(true);
  });

  it("defaults anonymized share to the Ahrefs 46.8% when query rows are missing", () => {
    const w = buildWaterfall({
      gscClicks: 0,
      queryDimensionClicks: 0,
      ga4OrganicSessions: 0,
      windowStart: "2026-07-01",
      windowEnd: "2026-07-28",
    });
    expect(w.anonymizedQueryShare).toBe(GSC_ANONYMIZED_SHARE);
    expect(w.euProperty).toBe(false);
  });
});
