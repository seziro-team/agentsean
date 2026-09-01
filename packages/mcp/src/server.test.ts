import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openSqlite, sites } from "@agentsean/db";
import { saveKeywords } from "@agentsean/keywords";
import { handleMcpMessageAsync } from "./server.js";
import { createOpenSeoClient } from "./client.js";
import { MCP_TOOLS } from "./tools.js";

describe("stdio MCP server", () => {
  it("initializes, lists tools, and returns keyword opportunities without paid keys", async () => {
    const { db, sqlite } = openSqlite(":memory:");
    const siteId = randomUUID();
    const now = new Date().toISOString();
    db.insert(sites)
      .values({ id: siteId, origin: "https://example.com", createdAt: now, updatedAt: now })
      .run();
    saveKeywords(db, siteId, [
      {
        query: "seo tools",
        kind: "striking_distance",
        clicks: 12,
        impressions: 400,
        position: 9,
        page: "https://example.com/tools",
        volume: null,
        difficulty: null,
        source: "gsc",
      },
    ]);
    const init = await handleMcpMessageAsync({ db }, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(init?.result).toMatchObject({ serverInfo: { name: "agentsean" } });
    const listed = await handleMcpMessageAsync({ db }, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(listed).toBeTruthy();
    const listedResult = listed!.result as { tools: Array<{ name: string }> };
    const names = listedResult.tools.map((t) => t.name);
    expect(names).toEqual(MCP_TOOLS.map((t) => t.name));
    const call = await handleMcpMessageAsync(
      { db },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "striking_distance", arguments: { origin: "https://example.com" } },
      },
    );
    const result = call?.result as { structuredContent?: { strikingDistance?: Array<{ query: string }> } };
    expect(result.structuredContent?.strikingDistance?.[0]?.query).toBe("seo tools");
    const ai = await handleMcpMessageAsync(
      { db },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "ai_citation_share", arguments: { origin: "https://example.com" } },
      },
    );
    const aiResult = ai?.result as { structuredContent?: { citationShare?: number } };
    expect(aiResult.structuredContent?.citationShare).toBe(0);
    const mentions = await handleMcpMessageAsync(
      { db },
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "brand_mentions", arguments: { origin: "https://example.com" } },
      },
    );
    const mentionResult = mentions?.result as { structuredContent?: { sendRequiresApproval?: boolean } };
    expect(mentionResult.structuredContent?.sendRequiresApproval).toBe(true);
    sqlite.close();
  });

  it("talks to an OpenSEO MCP over JSON-RPC HTTP", async () => {
    const fetchFn: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "tools/list") {
        return json({ result: { tools: [{ name: "research_keywords", description: "OpenSEO research" }] } });
      }
      return json({ result: { ok: true } });
    };
    const client = createOpenSeoClient({
      url: "https://openseo.example/mcp",
      apiKey: "k",
      fetch: fetchFn,
    });
    const tools = await client.listTools();
    expect(tools[0]?.name).toBe("research_keywords");
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
