import type { BacklinkOverview, BacklinksCapability, ProviderCall } from "./types.js";
import { freeEstimate } from "./rates.js";

const OPR_URL = "https://openpagerank.com/api/v1.0/getPageRank";

export async function fetchOpenPageRank(
  domain: string,
  opts: { apiKey: string; fetch?: typeof fetch },
): Promise<BacklinkOverview> {
  const fetchFn = opts.fetch ?? fetch;
  const url = new URL(OPR_URL);
  url.searchParams.append("domains[]", domain);
  const res = await fetchFn(url, { headers: { "API-OPR": opts.apiKey, accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenPageRank HTTP ${res.status}`);
  const json = (await res.json()) as {
    response?: Array<{ domain?: string; page_rank_decimal?: number; rank?: string }>;
  };
  const row = json.response?.[0];
  return {
    target: domain,
    provider: "openpagerank",
    kind: "authority_proxy",
    pageRank: typeof row?.page_rank_decimal === "number" ? row.page_rank_decimal : null,
    rank: row?.rank && Number.isFinite(Number(row.rank)) ? Number(row.rank) : null,
  };
}

/** 30k free domain lookups/month. Authority proxy, not a backlink graph. */
export function createOpenPageRank(opts: {
  apiKey: string;
  fetch?: typeof fetch;
}): BacklinksCapability {
  return {
    id: "openpagerank",
    available: true,
    overview(target: string): ProviderCall<BacklinkOverview> {
      const host = hostOf(target);
      return {
        estimate: freeEstimate(
          "openpagerank",
          "backlinks",
          "getPageRank",
          1,
          "authority proxy · 30k free lookups/month",
        ),
        run: () => fetchOpenPageRank(host, opts),
      };
    },
  };
}

function hostOf(target: string): string {
  try {
    return new URL(target.includes("://") ? target : `https://${target}`).hostname.replace(/^www\./, "");
  } catch {
    return target.replace(/^www\./, "");
  }
}
