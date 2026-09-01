import { eq } from "drizzle-orm";
import { aiRuns, findings, pages, sites, type SqliteDatabase } from "@agentsean/db";
import { listClusters, listKeywords, listRanks } from "@agentsean/keywords";
import { listClaims, sitePowerBrief, monthlyClicksForSite } from "@agentsean/measure";
import { AEO_REFUSALS, listInbound404s, listMentions } from "@agentsean/surfaces";
import {
  CAPABILITIES,
  DFS_RATES,
  freeEstimate,
  paidEstimate,
  keywordsDataTasks,
} from "@agentsean/providers";
import { mcpResponse, type CallToolResult } from "./formatters.js";
import { formatMcpTable } from "./table.js";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: "keyword_opportunities",
    description:
      "Keyword opportunities from GSC demand, striking distance, and free expansion. Zero paid keys required.",
    inputSchema: {
      type: "object",
      properties: { origin: { type: "string" } },
    },
  },
  {
    name: "keyword_clusters",
    description:
      "Semantic-then-SERP keyword clusters (cosine ≈ 0.78, then ≥3 shared top-10 URLs when a licensed SERP is configured).",
    inputSchema: {
      type: "object",
      properties: { origin: { type: "string" } },
    },
  },
  {
    name: "striking_distance",
    description: "Queries in average position 8–20 from GSC. Default metric is clicks.",
    inputSchema: {
      type: "object",
      properties: { origin: { type: "string" } },
    },
  },
  {
    name: "rank_snapshots",
    description:
      "Weekly licensed rank snapshots. Empty unless a DataForSEO key is configured — Sean never scrapes Google.",
    inputSchema: {
      type: "object",
      properties: { origin: { type: "string" } },
    },
  },
  {
    name: "estimate_provider_cost",
    description:
      "Return the DataForSEO cost estimate for a capability *before* any call. Free stack is $0.",
    inputSchema: {
      type: "object",
      properties: {
        capability: {
          type: "string",
          enum: ["serp", "keywords", "backlinks", "volume"],
        },
        units: { type: "number" },
        paid: { type: "boolean" },
      },
      required: ["capability"],
    },
  },
  {
    name: "list_findings",
    description: "Open SEO findings for a site.",
    inputSchema: {
      type: "object",
      properties: { origin: { type: "string" } },
    },
  },
  {
    name: "list_claims",
    description:
      "Every applied change with its evidence tier. Sean will not claim causation it cannot support.",
    inputSchema: {
      type: "object",
      properties: { origin: { type: "string" } },
    },
  },
  {
    name: "estimate_mde",
    description:
      "Minimum detectable effect at this site's traffic. Small sites are told most changes land in tier E.",
    inputSchema: {
      type: "object",
      properties: { origin: { type: "string" } },
    },
  },
  {
    name: "ai_citation_share",
    description:
      "AI citation share from the prompt panel and/or Bing Webmaster AI Performance CSV. Schema and llms.txt are not sold as AEO levers.",
    inputSchema: { type: "object", properties: { origin: { type: "string" } } },
  },
  {
    name: "brand_mentions",
    description:
      "Unlinked brand mentions and inbound-404 recovery. Outreach send is T3.",
    inputSchema: { type: "object", properties: { origin: { type: "string" } } },
  },
];

export type ToolContext = {
  db: SqliteDatabase;
};

export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  switch (name) {
    case "keyword_opportunities":
      return keywordOpportunities(ctx, args);
    case "keyword_clusters":
      return keywordClustersTool(ctx, args);
    case "striking_distance":
      return strikingDistanceTool(ctx, args);
    case "rank_snapshots":
      return rankSnapshotsTool(ctx, args);
    case "estimate_provider_cost":
      return estimateCost(args);
    case "list_findings":
      return listFindingsTool(ctx, args);
    case "list_claims":
      return listClaimsTool(ctx, args);
    case "estimate_mde":
      return estimateMdeTool(ctx, args);
    case "ai_citation_share":
      return aiCitationShareTool(ctx, args);
    case "brand_mentions":
      return brandMentionsTool(ctx, args);
    default:
      return mcpResponse({
        text: `Unknown tool ${name}`,
        structuredContent: { error: "unknown_tool", name },
      });
  }
}

function siteOf(ctx: ToolContext, args: Record<string, unknown>) {
  const origin = typeof args["origin"] === "string" ? args["origin"] : undefined;
  if (origin)
    return ctx.db.select().from(sites).where(eq(sites.origin, origin)).get() ?? null;
  return ctx.db.select().from(sites).all()[0] ?? null;
}

function keywordOpportunities(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({
      text: "No site. Run sean audit first.",
      structuredContent: { opportunities: [] },
    });
  const rows = listKeywords(ctx.db, site.id);
  const text = formatMcpTable(rows, [
    { header: "query", value: (r) => r.query },
    { header: "source", value: (r) => r.source },
    { header: "clicks", value: (r) => r.clicks },
    { header: "position", value: (r) => r.position },
    { header: "volume", value: (r) => r.volume },
  ]);
  return mcpResponse({
    text: rows.length ? text : "No keyword opportunities stored. Run sean keywords.",
    structuredContent: { origin: site.origin, opportunities: rows },
  });
}

function keywordClustersTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({ text: "No site.", structuredContent: { clusters: [] } });
  const rows = listClusters(ctx.db, site.id);
  const text = formatMcpTable(rows, [
    { header: "label", value: (r) => r.label },
    { header: "members", value: (r) => r.memberCount },
    { header: "serp_confirmed", value: (r) => Boolean(r.serpConfirmed) },
  ]);
  return mcpResponse({
    text: rows.length ? text : "No clusters stored. Run sean keywords.",
    structuredContent: { origin: site.origin, clusters: rows },
  });
}

function strikingDistanceTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({
      text: "No site.",
      structuredContent: { strikingDistance: [] },
    });
  const rows = listKeywords(ctx.db, site.id).filter(
    (r) => r.position !== null && r.position >= 8 && r.position <= 20,
  );
  const text = formatMcpTable(rows, [
    { header: "query", value: (r) => r.query },
    { header: "position", value: (r) => r.position },
    { header: "clicks", value: (r) => r.clicks },
  ]);
  return mcpResponse({
    text: rows.length ? text : "No striking-distance queries.",
    structuredContent: {
      origin: site.origin,
      strikingDistance: rows,
      metric: "clicks",
    },
  });
}

function rankSnapshotsTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site) return mcpResponse({ text: "No site.", structuredContent: { ranks: [] } });
  const rows = listRanks(ctx.db, site.id);
  const text = rows.length
    ? formatMcpTable(rows, [
        { header: "query", value: (r) => r.query },
        { header: "position", value: (r) => r.position },
        { header: "provider", value: (r) => r.provider },
        { header: "estimated_usd", value: (r) => r.estimatedUsd },
      ])
    : "No licensed rank snapshots. Sean never scrapes Google. Add a DataForSEO key to upgrade in place.";
  return mcpResponse({
    text,
    structuredContent: { origin: site.origin, ranks: rows },
  });
}

function estimateCost(args: Record<string, unknown>): CallToolResult {
  const capability = String(args["capability"] ?? "");
  if (!CAPABILITIES.includes(capability as (typeof CAPABILITIES)[number])) {
    return mcpResponse({
      text: `Unknown capability ${capability}`,
      structuredContent: { error: "unknown_capability" },
    });
  }
  const units = typeof args["units"] === "number" ? args["units"] : 1;
  const paid = args["paid"] === true;
  const cap = capability as (typeof CAPABILITIES)[number];
  const estimate = !paid
    ? freeEstimate("gsc", cap, "free_stack", units)
    : cap === "serp"
      ? paidEstimate({
          provider: "dataforseo",
          capability: "serp",
          operation: "organic_standard",
          units,
          unitUsd: DFS_RATES.serpPerKeyword,
          notes: "SERP $0.60/1k standard queue",
        })
      : cap === "volume" || cap === "keywords"
        ? paidEstimate({
            provider: "dataforseo",
            capability: cap,
            operation: "keywords_data",
            units: keywordsDataTasks(units),
            unitUsd: DFS_RATES.keywordsDataPerTask,
          })
        : paidEstimate({
            provider: "dataforseo",
            capability: "backlinks",
            operation: "summary",
            units,
            unitUsd: DFS_RATES.backlinksPerRequest,
          });
  return mcpResponse({
    text: `${estimate.provider} ${estimate.capability}/${estimate.operation}: $${estimate.estimatedUsd.toFixed(4)} (${estimate.free ? "free" : "paid"})`,
    structuredContent: { estimate },
    meta: { creditsCharged: estimate.estimatedUsd },
  });
}

function listFindingsTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({ text: "No site.", structuredContent: { findings: [] } });
  const rows = ctx.db.select().from(findings).where(eq(findings.siteId, site.id)).all();
  const text = formatMcpTable(rows, [
    { header: "rule", value: (r) => r.ruleId },
    { header: "severity", value: (r) => r.severity },
    { header: "title", value: (r) => r.title },
    { header: "status", value: (r) => r.status },
  ]);
  return mcpResponse({
    text: rows.length ? text : "No findings.",
    structuredContent: { origin: site.origin, findings: rows },
  });
}

function listClaimsTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({ text: "No site.", structuredContent: { claims: [] } });
  const rows = listClaims(ctx.db, site.id);
  const text = formatMcpTable(rows, [
    { header: "tier", value: (r) => r.evidenceTier },
    { header: "causation", value: (r) => r.causationClaimed },
    { header: "statement", value: (r) => r.statement },
  ]);
  return mcpResponse({
    text: rows.length ? text : "No claims stored. Run sean measure.",
    structuredContent: { origin: site.origin, claims: rows },
  });
}

function estimateMdeTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({ text: "No site.", structuredContent: { power: null } });
  const monthly = monthlyClicksForSite(ctx.db, site.id);
  const pageCount = ctx.db
    .select()
    .from(pages)
    .where(eq(pages.siteId, site.id))
    .all().length;
  const power = sitePowerBrief({ monthlyClicks: monthly, pageCount });
  return mcpResponse({
    text: power.message,
    structuredContent: { origin: site.origin, power },
  });
}

function aiCitationShareTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({
      text: "No site. Run sean audit first.",
      structuredContent: { citationShare: 0 },
    });
  const runs = ctx.db.select().from(aiRuns).where(eq(aiRuns.siteId, site.id)).all();
  const latest = runs.toSorted((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
  if (!latest) {
    return mcpResponse({
      text: "No AI visibility run stored. Run sean visibility. Schema, content length, and llms.txt are not sold as AEO levers. Training crawlers ≠ citation crawlers.",
      structuredContent: {
        origin: site.origin,
        citationShare: 0,
        shareOfVoice: 0,
        refusals: AEO_REFUSALS,
      },
    });
  }
  const pct = Math.round(latest.citationShare * 100);
  return mcpResponse({
    text: `AI citation share ${pct}% · share of voice ${Math.round(latest.shareOfVoice * 100)}% · ~$${latest.estimatedUsd.toFixed(2)}/run on ${latest.engine}. Schema/llms.txt/length are not AEO levers.`,
    structuredContent: {
      origin: site.origin,
      citationShare: latest.citationShare,
      shareOfVoice: latest.shareOfVoice,
      estimatedUsd: latest.estimatedUsd,
      engine: latest.engine,
      ranAt: latest.ranAt,
      refusals: AEO_REFUSALS,
    },
  });
}

function brandMentionsTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
): CallToolResult {
  const site = siteOf(ctx, args);
  if (!site)
    return mcpResponse({ text: "No site.", structuredContent: { mentions: [] } });
  const rows = listMentions(ctx.db, site.id);
  const broken = listInbound404s(ctx.db, site.id);
  const text = rows.length
    ? formatMcpTable(rows, [
        { header: "url", value: (r) => r.url },
        { header: "kind", value: (r) => r.kind },
        { header: "linked", value: (r) => Boolean(r.linked) },
        { header: "score", value: (r) => r.score },
      ])
    : "No mention opportunities stored. Run sean visibility. Outreach send is T3.";
  return mcpResponse({
    text,
    structuredContent: {
      origin: site.origin,
      mentions: rows,
      inbound404s: broken,
      sendRequiresApproval: true,
    },
  });
}
