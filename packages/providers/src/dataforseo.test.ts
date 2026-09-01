import { describe, expect, it } from "vitest";
import { createDataForSeoClient } from "./dataforseo.js";
import { debitProvider } from "./ledger.js";
import { openSqlite } from "@agentsean/db";
import { DFS_RATES, paidEstimate } from "./rates.js";

describe("DataForSEO client", () => {
  it("estimates cost before the call and records the debit after", async () => {
    const { db, sqlite } = openSqlite(":memory:");
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("task_post") && method === "POST") {
        return json({
          cost: 0.0006,
          tasks: [{ id: "t1", status_code: 20100, cost: 0.0006 }],
        });
      }
      if (url.includes("task_get")) {
        return json({
          cost: 0.0006,
          tasks: [
            {
              id: "t1",
              status_code: 20000,
              result: [
                {
                  items: [
                    {
                      type: "organic",
                      rank_group: 1,
                      url: "https://example.com/",
                      title: "Home",
                    },
                    {
                      type: "organic",
                      rank_group: 2,
                      url: "https://other.test/",
                      title: "Other",
                    },
                  ],
                },
              ],
            },
          ],
        });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };
    const client = createDataForSeoClient({
      loginPassword: "login:pass",
      fetch: fetchFn,
    });
    const estimate = paidEstimate({
      provider: "dataforseo",
      capability: "serp",
      operation: "organic_standard",
      units: 1,
      unitUsd: DFS_RATES.serpPerKeyword,
    });
    expect(estimate.estimatedUsd).toBe(0.0006);
    const { result, actualUsd } = await client.serp("seo tools");
    expect(result.items[0]?.url).toBe("https://example.com/");
    debitProvider(db, estimate, { siteId: null, actualUsd });
    const { costLedger } = await import("@agentsean/db");
    const rows = db.select().from(costLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costUsd).toBe(0.0006);
    sqlite.close();
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
