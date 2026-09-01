import type { KeywordRow, KeywordsCapability, ProviderCall } from "./types.js";
import { freeEstimate } from "./rates.js";

/** Query demand from GSC Search Analytics. 25k rows, 1,200 QPM/site. $0. */
export function createGscKeywords(rows: KeywordRow[]): KeywordsCapability {
  return {
    id: "gsc",
    demand(): ProviderCall<KeywordRow[]> {
      return {
        estimate: freeEstimate("gsc", "keywords", "search_analytics", rows.length, "GSC query demand"),
        async run() {
          return rows.map((r) => ({ ...r, source: r.source || "gsc" }));
        },
      };
    },
    related(seed: string): ProviderCall<KeywordRow[]> {
      const needle = seed.toLowerCase();
      const hits = rows.filter((r) => r.query.toLowerCase().includes(needle) && r.query.toLowerCase() !== needle);
      return {
        estimate: freeEstimate("gsc", "keywords", "related_from_demand", hits.length),
        async run() {
          return hits.map((r) => Object.assign({}, r, { source: "gsc", relatedTo: seed }));
        },
      };
    },
  };
}
