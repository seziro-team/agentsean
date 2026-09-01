import { describe, expect, it } from "vitest";
import { createQuotaManager, LIMITS } from "./quota.js";
import { QuotaExceededError } from "./errors.js";

describe("quota manager", () => {
  it("caps URL Inspection at 2000/day/site", async () => {
    let t = Date.parse("2026-09-01T12:00:00Z");
    const q = createQuotaManager(null, () => new Date(t));
    for (let i = 0; i < LIMITS.gscUrlInspectionQpd; i++) {
      if (i > 0 && i % 500 === 0) t += 60_000;
      await q.acquire("gsc.urlInspection", "https://example.com/");
      q.record("gsc.urlInspection", "https://example.com/");
    }
    await expect(
      q.acquire("gsc.urlInspection", "https://example.com/"),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(q.remainingInspectionToday("https://example.com/")).toBe(0);
    expect(q.remainingInspectionToday("https://other.com/")).toBe(2000);
  });

  it("caps CrUX at 150 QPM and cannot be purchased", async () => {
    const q = createQuotaManager(null);
    for (let i = 0; i < 150; i++) {
      await q.acquire("crux", "project");
      q.record("crux", "project");
    }
    await expect(q.acquire("crux", "project")).rejects.toThrow(/crux/);
  });
});
