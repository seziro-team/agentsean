import { describe, expect, it } from "vitest";
import { DEAD_PROVIDERS, isDeadProvider, refuseDeadProvider, scrapeGoogleSerp } from "./refuse.js";

describe("refused providers", () => {
  it("lists the dead options from PLAN Phase 6", () => {
    const ids = DEAD_PROVIDERS.map((p) => p.id);
    expect(ids).toContain("bing_search_api");
    expect(ids).toContain("google_cse");
    expect(ids).toContain("brave_search");
    expect(ids).toContain("pytrends");
    expect(ids).toContain("google_trends_api");
    expect(ids).toContain("serpapi");
  });

  it("refuses the decommissioned Bing Search API", () => {
    expect(isDeadProvider("bing-search-api")).toBe(true);
    expect(() => refuseDeadProvider("bing_search_api")).toThrow(/decommissioned 2025-08-11/);
  });

  it("T4-refuses Google SERP scraping", () => {
    expect(() => scrapeGoogleSerp()).toThrow(/never scrapes Google/);
  });
});
