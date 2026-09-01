import { describe, expect, it } from "vitest";
import { createQuotaManager } from "./quota.js";
import { defaultSleep, type GoogleHttp } from "./http.js";
import { createGscClient, monthChunks } from "./gsc.js";
import { encodeSiteUrl, normalizeGscSiteUrl } from "./scopes.js";

describe("GSC client", () => {
  it("keeps the trailing slash on URL-prefix properties and encodes siteUrl", () => {
    expect(normalizeGscSiteUrl("https://example.com")).toBe("https://example.com/");
    expect(normalizeGscSiteUrl("sc-domain:example.com")).toBe("sc-domain:example.com");
    expect(encodeSiteUrl("https://example.com/")).toBe(
      encodeURIComponent("https://example.com/"),
    );
  });

  it("paginates searchAnalytics at 25k until the 50k ceiling", async () => {
    const calls: unknown[] = [];
    const http: GoogleHttp = {
      fetch: async (url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        const body = JSON.parse(String(init?.body)) as { startRow?: number };
        const start = body.startRow ?? 0;
        const rows =
          start === 0
            ? Array.from({ length: 25000 }, () => ({
                keys: ["q"],
                clicks: 1,
                impressions: 2,
                ctr: 0.5,
                position: 3,
              }))
            : [{ keys: ["z"], clicks: 1, impressions: 1, ctr: 1, position: 1 }];
        return new Response(JSON.stringify({ rows }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      quota: createQuotaManager(null),
      maxRetries: 0,
      sleep: defaultSleep,
      maxBackoffMs: 1,
    };
    const client = createGscClient({ http, getToken: async () => "tok" });
    const { rows } = await client.querySearchAnalyticsAllPages("https://example.com/", {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      dimensions: ["query"],
      type: "web",
    });
    expect(rows.length).toBe(25001);
    expect(calls.length).toBe(2);
    expect((calls[0] as { rowLimit: number }).rowLimit).toBe(25000);
  });

  it("chunks a 16-month window into calendar months (load-quota-safe)", () => {
    const chunks = monthChunks("2025-01-15", "2025-03-02");
    expect(chunks[0]).toEqual({ startDate: "2025-01-15", endDate: "2025-01-31" });
    expect(chunks.at(-1)?.endDate).toBe("2025-03-02");
    expect(chunks.length).toBe(3);
  });
});
