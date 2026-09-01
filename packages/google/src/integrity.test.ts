import { describe, expect, it } from "vitest";
import {
  decideMetric,
  impressionsContaminated,
  num100Straddle,
  preferredMetric,
} from "./integrity.js";

describe("GSC metric integrity", () => {
  it("defaults every metric to clicks", () => {
    const d = preferredMetric(undefined, "2026-06-01", "2026-06-30");
    expect(d.metric).toBe("clicks");
    expect(d.allowed).toBe(true);
  });

  it("blocks impressions across the 2025-05-13 → 2026-04-27 logging error", () => {
    expect(impressionsContaminated("2025-01-01", "2026-08-01")).toBe(true);
    const d = decideMetric("impressions", "2025-06-01", "2026-06-01");
    expect(d.allowed).toBe(false);
    expect(d.metric).toBe("clicks");
    expect(d.reasons.join(" ")).toMatch(/logging error/i);
  });

  it("allows impressions after the bug window", () => {
    const d = decideMetric("impressions", "2026-05-01", "2026-08-01");
    expect(d.allowed).toBe(true);
    expect(d.metric).toBe("impressions");
  });

  it("blocks impression YoY across the &num=100 removal", () => {
    expect(num100Straddle("2024-09-01", "2025-10-01")).toBe(true);
    const d = decideMetric("impressions", "2024-09-01", "2025-10-01");
    expect(d.allowed).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/num=100/);
  });

  it("never blocks clicks", () => {
    const d = decideMetric("clicks", "2025-05-13", "2026-04-27");
    expect(d.allowed).toBe(true);
    expect(d.metric).toBe("clicks");
  });
});
