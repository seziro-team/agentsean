import { describe, expect, it } from "vitest";
import { createBingClient } from "./bing.js";
import { autocomplete } from "./autocomplete.js";
import { waybackCdx } from "./wayback.js";
import { wikidataSearch } from "./wikidata.js";
import { jinaRead } from "./jina.js";

describe("free stack clients", () => {
  it("parses Bing Webmaster GetKeywordStats and GetRelatedKeywords", async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("GetKeywordStats")) {
        expect(url).toContain("language=en-US");
        expect(url).toContain("country=us");
        return json({ d: [{ Query: "seo tools", Count: 2400 }] });
      }
      if (url.includes("GetRelatedKeywords")) {
        return json({ d: [{ Query: "seo software", Count: 880 }] });
      }
      throw new Error(url);
    };
    const client = createBingClient({ apiKey: "k", fetch: fetchFn });
    const vol = await client.getKeywordStats("seo tools");
    expect(vol.volume).toBe(2400);
    expect(vol.source).toBe("bing");
    const related = await client.getRelatedKeywords("seo tools");
    expect(related[0]?.query).toBe("seo software");
  });

  it("parses Google suggest, Wayback CDX, Wikidata, and Jina Reader", async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("suggestqueries.google.com")) {
        return json(["seo", ["seo tools", "seo audit"]]);
      }
      if (url.includes("web.archive.org")) {
        return json([
          ["original", "timestamp", "statuscode"],
          ["https://example.com/", "20260101120000", "200"],
        ]);
      }
      if (url.includes("wikidata.org")) {
        return json({
          search: [{ id: "Q123", label: "SEO", description: "search engine optimization" }],
        });
      }
      if (url.includes("r.jina.ai")) {
        return new Response("Title: Example\n\nHello world", { status: 200 });
      }
      throw new Error(url);
    };
    const ac = await autocomplete("seo", { fetch: fetchFn });
    expect(ac.map((r) => r.query)).toEqual(["seo tools", "seo audit"]);
    const wb = await waybackCdx("https://example.com/", { fetch: fetchFn });
    expect(wb[0]?.timestamp).toBe("20260101120000");
    const ents = await wikidataSearch("SEO", { fetch: fetchFn });
    expect(ents[0]?.id).toBe("Q123");
    const page = await jinaRead("https://example.com/", { fetch: fetchFn });
    expect(page.title).toBe("Example");
    expect(page.provider).toBe("jina");
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
