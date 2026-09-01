import type { Opportunity, QueryDaily } from "./types.js";
import type { KeywordRow } from "@agentsean/providers";

const STRIKE_LO = 8;
const STRIKE_HI = 20;

export function aggregateQueries(rows: QueryDaily[]): Array<{
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
  page: string | null;
}> {
  const map = new Map<
    string,
    { query: string; clicks: number; impressions: number; position: number; n: number; page: string | null }
  >();
  for (const r of rows) {
    const cur = map.get(r.query) ?? {
      query: r.query,
      clicks: 0,
      impressions: 0,
      position: 0,
      n: 0,
      page: r.page ?? null,
    };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    if (r.position !== null) {
      cur.position += r.position;
      cur.n++;
    }
    if (!cur.page && r.page) cur.page = r.page;
    map.set(r.query, cur);
  }
  return [...map.values()].map((v) => ({
    query: v.query,
    clicks: v.clicks,
    impressions: v.impressions,
    position: v.n ? v.position / v.n : null,
    page: v.page,
  }));
}

export function strikingDistance(rows: QueryDaily[]): Opportunity[] {
  return aggregateQueries(rows)
    .filter((r) => r.position !== null && r.position >= STRIKE_LO && r.position <= STRIKE_HI)
    .toSorted((a, b) => b.clicks - a.clicks)
    .map((r) => ({
      query: r.query,
      kind: "striking_distance" as const,
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
      page: r.page,
      volume: null,
      difficulty: null,
      source: "gsc",
    }));
}

export function demandOpportunities(rows: QueryDaily[]): Opportunity[] {
  return aggregateQueries(rows)
    .filter((r) => r.clicks > 0 || r.impressions > 0)
    .toSorted((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .map((r) => ({
      query: r.query,
      kind: "demand" as const,
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
      page: r.page,
      volume: null,
      difficulty: null,
      source: "gsc",
    }));
}

export function expansionOpportunities(related: KeywordRow[], known: Set<string>): Opportunity[] {
  return related
    .filter((r) => !known.has(r.query.toLowerCase()))
    .map((r) => ({
      query: r.query,
      kind: "expansion" as const,
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? null,
      page: r.page ?? null,
      volume: r.volume ?? null,
      difficulty: null,
      source: r.source,
    }));
}
