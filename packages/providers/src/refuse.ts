/**
 * Dead options (PLAN Phase 6) and T4: Sean never scrapes Google itself.
 * Google's spam policy names "scraping results for rank-checking purposes".
 */

export const DEAD_PROVIDERS = [
  {
    id: "bing_search_api",
    reason: "Bing Search API was decommissioned 2025-08-11",
  },
  {
    id: "google_cse",
    reason:
      "Google Custom Search JSON API is closed to new customers with a hard shutdown 2027-01-01",
  },
  {
    id: "brave_search",
    reason: "Brave removed its free tier in Feb 2026 and forbids storing results",
  },
  {
    id: "pytrends",
    reason: "pytrends was archived 2025-04-17",
  },
  {
    id: "google_trends_api",
    reason: "Google Trends API remains invite-only alpha with no self-serve key",
  },
  {
    id: "serpapi",
    reason: "Google sued SerpApi on 2025-12-19; Sean does not scrape Google",
  },
] as const;

export class ProviderRefusedError extends Error {
  override name = "ProviderRefusedError";
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function isDeadProvider(id: string): boolean {
  const key = id.toLowerCase().replace(/[\s-]+/g, "_");
  return DEAD_PROVIDERS.some((p) => p.id === key || key.includes(p.id));
}

export function refuseDeadProvider(id: string): never {
  const key = id.toLowerCase().replace(/[\s-]+/g, "_");
  const hit = DEAD_PROVIDERS.find((p) => p.id === key || key.includes(p.id));
  throw new ProviderRefusedError(
    "dead_provider",
    hit?.reason ?? `Provider ${id} is not supported.`,
  );
}

/** T4 — SERP scraping bundled by default is refused. No setting exists. */
export function scrapeGoogleSerp(): never {
  throw new ProviderRefusedError(
    "serp_scrape_refused",
    "Sean never scrapes Google. Rank data comes from a licensed vendor you configure (DataForSEO), or not at all. Autocomplete is expansion, not rank checking.",
  );
}
