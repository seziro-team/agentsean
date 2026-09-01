import type { KeywordRow, VolumeCapability, VolumeRow, ProviderCall } from "./types.js";
import { freeEstimate } from "./rates.js";

const BING_JSON = "https://ssl.bing.com/webmaster/api.svc/json";

export type BingClient = {
  getKeywordStats(
    query: string,
    opts?: { country?: string; language?: string },
  ): Promise<VolumeRow>;
  getRelatedKeywords(
    query: string,
    opts?: { country?: string; language?: string },
  ): Promise<KeywordRow[]>;
};

/**
 * Bing Webmaster GetKeywordStats / GetRelatedKeywords — the best free demand proxy.
 * Requires a Webmaster API key the user owns. Not the decommissioned Bing Search API.
 */
export function createBingClient(opts: {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}): BingClient {
  const fetchFn = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? BING_JSON;

  async function getJson(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${base}/${path}`);
    url.searchParams.set("apikey", opts.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Bing Webmaster HTTP ${res.status} on ${path}`);
    }
    return res.json();
  }

  return {
    async getKeywordStats(query, extra) {
      const json = await getJson("GetKeywordStats", {
        q: query,
        country: extra?.country ?? "us",
        language: extra?.language ?? "en-US",
      });
      return {
        query,
        volume: parseVolume(json, query),
        source: "bing",
        country: extra?.country ?? "us",
      };
    },
    async getRelatedKeywords(query, extra) {
      const json = await getJson("GetRelatedKeywords", {
        q: query,
        country: extra?.country ?? "us",
        language: extra?.language ?? "en-US",
      });
      return parseRelated(json, query);
    },
  };
}

export function createBingVolume(client: BingClient): VolumeCapability {
  return {
    id: "bing",
    volume(queries, extra): ProviderCall<VolumeRow[]> {
      return {
        estimate: freeEstimate(
          "bing",
          "volume",
          "GetKeywordStats",
          queries.length,
          "Bing Webmaster",
        ),
        async run() {
          const out: VolumeRow[] = [];
          for (const q of queries) {
            out.push(await client.getKeywordStats(q, extra));
          }
          return out;
        },
      };
    },
  };
}

export async function bingRelated(
  client: BingClient,
  seed: string,
): Promise<KeywordRow[]> {
  return client.getRelatedKeywords(seed);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function rowsOf(json: unknown): unknown[] {
  const rec = asRecord(json);
  if (!rec) return [];
  if (Array.isArray(rec["d"])) return rec["d"];
  const d = asRecord(rec["d"]);
  if (d && Array.isArray(d["results"])) return d["results"];
  if (Array.isArray(rec["results"])) return rec["results"];
  return [];
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return null;
}

function parseVolume(json: unknown, fallback: string): number | null {
  const rec = asRecord(json);
  if (rec) {
    const direct = num(
      rec["Count"] ?? rec["count"] ?? rec["Impressions"] ?? rec["volume"],
    );
    if (direct !== null) return Math.round(direct);
  }
  for (const row of rowsOf(json)) {
    const r = asRecord(row);
    if (!r) continue;
    const q = String(r["Query"] ?? r["query"] ?? fallback);
    if (q.toLowerCase() !== fallback.toLowerCase() && rowsOf(json).length > 1) continue;
    const v = num(r["Count"] ?? r["count"] ?? r["Impressions"] ?? r["volume"]);
    if (v !== null) return Math.round(v);
  }
  return null;
}

function parseRelated(json: unknown, seed: string): KeywordRow[] {
  const out: KeywordRow[] = [];
  for (const row of rowsOf(json)) {
    const r = asRecord(row);
    if (!r) continue;
    const query = String(r["Query"] ?? r["query"] ?? r["Keyword"] ?? "").trim();
    if (!query) continue;
    out.push({
      query,
      source: "bing",
      relatedTo: seed,
      volume: num(r["Count"] ?? r["count"] ?? r["volume"]),
    });
  }
  return out;
}
