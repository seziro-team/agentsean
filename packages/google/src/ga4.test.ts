import { describe, expect, it } from "vitest";
import { createQuotaManager } from "./quota.js";
import { defaultSleep, type GoogleHttp } from "./http.js";
import { createGa4Client } from "./ga4.js";

describe("GA4 sparse responses", () => {
  it("treats omitted rows as empty, not an error", async () => {
    const http: GoogleHttp = {
      fetch: async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      quota: createQuotaManager(null),
      maxRetries: 0,
      sleep: defaultSleep,
      maxBackoffMs: 1,
    };
    const client = createGa4Client({ http, getToken: async () => "tok" });
    const report = await client.runReport({
      propertyId: "properties/1",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      dimensions: ["date"],
      metrics: ["sessions"],
    });
    expect(report.rows).toEqual([]);
  });
});
