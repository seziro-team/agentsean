import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openSqlite, gscQueryDaily, sites } from "@agentsean/db";
import { createProviderStack } from "@agentsean/providers";
import { createHashEmbeddings } from "./embeddings.js";
import { runKeywordsJob } from "./engine.js";
import { listClusters, listKeywords } from "./persist.js";
import { runRankCheck } from "./ranks.js";
import { scrapeGoogleSerp } from "@agentsean/providers";

describe("keywords engine", () => {
  it("gets opportunities, clusters, and striking distance from GSC + Bing with zero paid keys", async () => {
    const { db, sqlite } = openSqlite(":memory:");
    const siteId = randomUUID();
    const now = new Date("2026-08-20T12:00:00.000Z");
    db.insert(sites)
      .values({
        id: siteId,
        origin: "https://example.com",
        name: "Example",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .run();
    const gscRows = [
      gsc("seo tools", 12, 400, 9, "https://example.com/tools"),
      gsc("seo tool", 8, 220, 11, "https://example.com/tools"),
      gsc("seo audit checklist", 3, 90, 14, "https://example.com/audit"),
      gsc("brand widgets", 40, 200, 2, "https://example.com/"),
    ];
    for (const r of gscRows) {
      db.insert(gscQueryDaily)
        .values({
          id: randomUUID(),
          siteId,
          date: "2026-08-18",
          query: r.query,
          searchType: "web",
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })
        .run();
    }

    const stack = createProviderStack({
      gsc: gscRows.map((r) => ({
        query: r.query,
        source: "gsc",
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
        page: r.page,
      })),
    });
    expect(stack.paidUpgrade).toBe(false);

    const result = await runKeywordsJob(db, {
      siteId,
      origin: "https://example.com",
      now,
      stack,
      gsc: gscRows,
      brandTerms: ["brand"],
      embeddings: createHashEmbeddings(),
      expand: async (seed) => [
        { query: `${seed} software`, source: "bing", relatedTo: seed, volume: 880 },
      ],
    });

    expect(result.paidUpgrade).toBe(false);
    expect(result.strikingDistance.some((r) => r.query === "seo tools")).toBe(true);
    expect(result.opportunities.some((r) => r.kind === "expansion" && r.source === "bing")).toBe(true);
    expect(result.clusters.length).toBeGreaterThan(0);
    expect(result.embeddingsModel).toBe("local_hash");
    expect(result.ranks).toEqual([]);
    expect(result.reason).toBe("no_licensed_rank_provider");
    expect(listKeywords(db, siteId).length).toBeGreaterThan(0);
    expect(listClusters(db, siteId).length).toBe(result.clusters.length);
    sqlite.close();
  });

  it("upgrades rank tracking in place when a DataForSEO key is present, with visible cost", async () => {
    const { db, sqlite } = openSqlite(":memory:");
    const siteId = randomUUID();
    const now = new Date("2026-08-20T12:00:00.000Z");
    db.insert(sites)
      .values({
        id: siteId,
        origin: "https://example.com",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .run();

    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("task_post") && (init?.method ?? "GET") === "POST") {
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
              status_code: 20000,
              result: [
                {
                  items: [
                    { type: "organic", rank_group: 4, url: "https://example.com/tools", title: "Tools" },
                    { type: "organic", rank_group: 1, url: "https://other.test/", title: "Other" },
                  ],
                },
              ],
            },
          ],
        });
      }
      throw new Error(url);
    };

    const stack = createProviderStack({
      keys: { dataforseo: "login:password" },
      fetch: fetchFn,
    });
    expect(stack.paidUpgrade).toBe(true);
    const quote = stack.serp.serp("seo tools").estimate;
    expect(quote.estimatedUsd).toBeGreaterThan(0);

    const ranks = await runRankCheck({
      db,
      siteId,
      origin: "https://example.com",
      queries: ["seo tools"],
      stack,
      now,
    });
    expect(ranks.skipped).toBe(false);
    expect(ranks.provider).toBe("dataforseo");
    expect(ranks.ranks[0]?.position).toBe(4);
    expect(ranks.quotes[0]?.estimatedUsd).toBeGreaterThan(0);
    expect(() => scrapeGoogleSerp()).toThrow(/never scrapes Google/);
    sqlite.close();
  });
});

function gsc(
  query: string,
  clicks: number,
  impressions: number,
  position: number,
  page: string,
) {
  return { date: "2026-08-18", query, clicks, impressions, position, page };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
