import { describe, expect, it } from "vitest";
import { createProviderStack } from "./registry.js";
import { scrapeGoogleSerp } from "./refuse.js";

describe("provider stack", () => {
  it("gives keyword demand from GSC with zero paid keys", async () => {
    const stack = createProviderStack({
      gsc: [{ query: "seo tools", source: "gsc", clicks: 12, impressions: 400, position: 9 }],
    });
    expect(stack.paidUpgrade).toBe(false);
    expect(stack.serp.available).toBe(false);
    const demand = stack.keywords.demand({ queries: [] });
    expect(demand.estimate.free).toBe(true);
    expect(demand.estimate.estimatedUsd).toBe(0);
    const rows = await demand.run();
    expect(rows[0]?.query).toBe("seo tools");
    await expect(stack.serp.serp("seo tools").run()).rejects.toThrow(/licensed SERP/);
  });

  it("upgrades SERP and volume in place when a DataForSEO key is present", () => {
    const stack = createProviderStack({
      keys: { dataforseo: "login:password" },
      gsc: [{ query: "seo tools", source: "gsc", clicks: 12 }],
    });
    expect(stack.paidUpgrade).toBe(true);
    expect(stack.serp.available).toBe(true);
    expect(stack.serp.id).toBe("dataforseo");
    expect(stack.volume.id).toBe("dataforseo");
    const quote = stack.serp.serp("seo tools").estimate;
    expect(quote.free).toBe(false);
    expect(quote.estimatedUsd).toBeGreaterThan(0);
    expect(quote.notes).toMatch(/\$0\.60\/1k/);
  });

  it("uses Bing Webmaster as the free volume proxy", () => {
    const stack = createProviderStack({ keys: { bing: "bing-key" } });
    expect(stack.volume.id).toBe("bing");
    expect(stack.volume.volume(["seo"]).estimate.free).toBe(true);
    expect(stack.serp.available).toBe(false);
  });

  it("never exposes a Google scrape path", () => {
    expect(() => scrapeGoogleSerp()).toThrow(/never scrapes Google/);
  });
});
