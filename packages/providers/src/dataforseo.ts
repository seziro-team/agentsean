import type {
  BacklinkOverview,
  BacklinksCapability,
  KeywordRow,
  ProviderCall,
  SerpCapability,
  SerpItem,
  SerpResult,
  VolumeCapability,
  VolumeRow,
} from "./types.js";
import { DFS_RATES, keywordsDataTasks, paidEstimate } from "./rates.js";

const DFS_BASE = "https://api.dataforseo.com";

export type DataForSeoClient = {
  searchVolume: (
    queries: string[],
    locationCode?: number,
  ) => Promise<{ rows: VolumeRow[]; actualUsd: number }>;
  related: (seed: string) => Promise<{ rows: KeywordRow[]; actualUsd: number }>;
  serp: (
    query: string,
    locationCode?: number,
  ) => Promise<{ result: SerpResult; actualUsd: number }>;
  backlinks: (
    target: string,
  ) => Promise<{ overview: BacklinkOverview; actualUsd: number }>;
};

/**
 * DataForSEO HTTP client. ADAPT of OpenSEO endpoint coverage + cost-before-call.
 * Auth is HTTP Basic (login:password). The LLM never sees this secret.
 */
export function createDataForSeoClient(opts: {
  loginPassword: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}): DataForSeoClient {
  const fetchFn = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? DFS_BASE;
  const auth = `Basic ${Buffer.from(opts.loginPassword).toString("base64")}`;

  async function post(path: string, body: unknown): Promise<DfsEnvelope> {
    const res = await fetchFn(`${base}${path}`, {
      method: "POST",
      headers: {
        authorization: auth,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status} on ${path}`);
    return (await res.json()) as DfsEnvelope;
  }

  async function get(path: string): Promise<DfsEnvelope> {
    const res = await fetchFn(`${base}${path}`, {
      method: "GET",
      headers: { authorization: auth, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status} on ${path}`);
    return (await res.json()) as DfsEnvelope;
  }

  return {
    async searchVolume(queries, locationCode = 2840) {
      const env = await post("/v3/keywords_data/google_ads/search_volume/live", [
        { keywords: queries, location_code: locationCode, language_code: "en" },
      ]);
      const rows: VolumeRow[] = [];
      for (const item of taskItems(env)) {
        const rec = asRecord(item);
        if (!rec) continue;
        const q = String(rec["keyword"] ?? rec["search_query"] ?? "");
        if (!q) continue;
        rows.push({
          query: q,
          volume: num(rec["search_volume"]),
          source: "dataforseo",
        });
      }
      return { rows, actualUsd: env.cost ?? 0 };
    },
    async related(seed) {
      const env = await post(
        "/v3/keywords_data/google_ads/keywords_for_keywords/live",
        [{ keywords: [seed], location_code: 2840, language_code: "en" }],
      );
      const rows: KeywordRow[] = [];
      for (const item of taskItems(env)) {
        const rec = asRecord(item);
        if (!rec) continue;
        const q = String(rec["keyword"] ?? "");
        if (!q) continue;
        rows.push({
          query: q,
          source: "dataforseo",
          relatedTo: seed,
          volume: num(rec["search_volume"]),
        });
      }
      return { rows, actualUsd: env.cost ?? 0 };
    },
    async serp(query, locationCode = 2840) {
      const posted = await post("/v3/serp/google/organic/task_post", [
        { keyword: query, location_code: locationCode, language_code: "en" },
      ]);
      const taskId = posted.tasks?.[0]?.id;
      let env = posted;
      if (taskId && !taskReady(posted)) {
        env = await get(`/v3/serp/google/organic/task_get/regular/${taskId}`);
      }
      const items: SerpItem[] = [];
      const paa: string[] = [];
      const related: string[] = [];
      for (const item of serpItems(env)) {
        const rec = asRecord(item);
        if (!rec) continue;
        const type = String(rec["type"] ?? "");
        if (type === "organic" || rec["url"]) {
          const url = String(rec["url"] ?? "");
          if (!url) continue;
          items.push({
            rank: num(rec["rank_group"] ?? rec["rank_absolute"]) ?? items.length + 1,
            url,
            title: String(rec["title"] ?? ""),
            ...(typeof rec["description"] === "string"
              ? { snippet: rec["description"] }
              : {}),
          });
        }
        if (type === "people_also_ask" && Array.isArray(rec["items"])) {
          for (const q of rec["items"]) {
            const r = asRecord(q);
            const title = r && typeof r["title"] === "string" ? r["title"] : "";
            if (title) paa.push(title);
          }
        }
        if (type === "related_searches" && Array.isArray(rec["items"])) {
          for (const q of rec["items"]) {
            const r = asRecord(q);
            const title = r && typeof r["title"] === "string" ? r["title"] : "";
            if (title) related.push(title);
          }
        }
      }
      return {
        result: {
          query,
          provider: "dataforseo",
          items: items.toSorted((a, b) => a.rank - b.rank).slice(0, 10),
          ...(paa.length ? { paa } : {}),
          ...(related.length ? { related } : {}),
        },
        actualUsd: env.cost ?? posted.cost ?? 0,
      };
    },
    async backlinks(target) {
      const env = await post("/v3/backlinks/summary/live", [
        { target, include_subdomains: true },
      ]);
      const rec = asRecord(taskItems(env)[0]) ?? {};
      return {
        overview: {
          target,
          provider: "dataforseo",
          kind: "backlinks",
          referringDomains: num(rec["referring_domains"]),
          backlinks: num(rec["backlinks"]),
          rank: num(rec["rank"]),
        },
        actualUsd: env.cost ?? 0,
      };
    },
  };
}

export function createDataForSeoVolume(client: DataForSeoClient): VolumeCapability {
  return {
    id: "dataforseo",
    volume(queries): ProviderCall<VolumeRow[]> {
      const tasks = keywordsDataTasks(queries.length);
      return {
        estimate: paidEstimate({
          provider: "dataforseo",
          capability: "volume",
          operation: "search_volume",
          units: tasks,
          unitUsd: DFS_RATES.keywordsDataPerTask,
          notes: `Keywords Data $0.06/task · ${queries.length} keywords`,
        }),
        async run() {
          const { rows } = await client.searchVolume(queries);
          return rows;
        },
      };
    },
  };
}

export function createDataForSeoSerp(client: DataForSeoClient): SerpCapability {
  return {
    id: "dataforseo",
    available: true,
    serp(query): ProviderCall<SerpResult> {
      return {
        estimate: paidEstimate({
          provider: "dataforseo",
          capability: "serp",
          operation: "organic_standard",
          units: 1,
          unitUsd: DFS_RATES.serpPerKeyword,
          notes: "SERP $0.60/1k standard queue",
        }),
        async run() {
          const { result } = await client.serp(query);
          return result;
        },
      };
    },
  };
}

export function createDataForSeoBacklinks(
  client: DataForSeoClient,
): BacklinksCapability {
  return {
    id: "dataforseo",
    available: true,
    overview(target): ProviderCall<BacklinkOverview> {
      return {
        estimate: paidEstimate({
          provider: "dataforseo",
          capability: "backlinks",
          operation: "summary",
          units: 1,
          unitUsd: DFS_RATES.backlinksPerRequest,
          notes: "Backlinks $0.024/req + $0.000036/row",
        }),
        async run() {
          const { overview } = await client.backlinks(target);
          return overview;
        },
      };
    },
  };
}

export function dataforseoRelatedCall(
  client: DataForSeoClient,
  seed: string,
): ProviderCall<KeywordRow[]> {
  return {
    estimate: paidEstimate({
      provider: "dataforseo",
      capability: "keywords",
      operation: "keywords_for_keywords",
      units: 1,
      unitUsd: DFS_RATES.keywordsDataPerTask,
    }),
    async run() {
      const { rows } = await client.related(seed);
      return rows;
    },
  };
}

type DfsEnvelope = {
  cost?: number;
  tasks?: Array<{
    id?: string;
    status_code?: number;
    cost?: number;
    result?: unknown[];
  }>;
};

function taskReady(env: DfsEnvelope): boolean {
  const code = env.tasks?.[0]?.status_code;
  return code === 20000;
}

function taskItems(env: DfsEnvelope): unknown[] {
  const result = env.tasks?.[0]?.result;
  if (!Array.isArray(result) || result.length === 0) return [];
  const first = result[0];
  const rec = asRecord(first);
  if (rec && Array.isArray(rec["items"])) return rec["items"];
  return result;
}

function serpItems(env: DfsEnvelope): unknown[] {
  const result = env.tasks?.[0]?.result;
  if (!Array.isArray(result) || result.length === 0) return [];
  const first = asRecord(result[0]);
  if (first && Array.isArray(first["items"])) return first["items"];
  return [];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return null;
}
