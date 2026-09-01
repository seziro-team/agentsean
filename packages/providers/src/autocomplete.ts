import type { KeywordRow, ProviderCall } from "./types.js";
import { freeEstimate } from "./rates.js";

/**
 * Public suggest endpoints. Expansion, not rank checking.
 * Not Google HTML SERP scraping (T4).
 */
export async function autocomplete(
  seed: string,
  opts?: { fetch?: typeof fetch; endpoint?: "google" | "duckduckgo" },
): Promise<KeywordRow[]> {
  const fetchFn = opts?.fetch ?? fetch;
  const kind = opts?.endpoint ?? "google";
  if (kind === "duckduckgo") {
    const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(seed)}`;
    const res = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`autocomplete HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const rows = Array.isArray(json) ? json : [];
    return rows
      .map((row) => {
        const rec = row && typeof row === "object" ? (row as { phrase?: string }) : null;
        return rec?.phrase?.trim() ?? "";
      })
      .filter(Boolean)
      .map((query) => ({ query, source: "autocomplete", relatedTo: seed }));
  }
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}`;
  const res = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`autocomplete HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  const suggestions = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
  return suggestions
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((query) => ({ query, source: "autocomplete", relatedTo: seed }));
}

export function autocompleteCall(
  seed: string,
  opts?: { fetch?: typeof fetch; endpoint?: "google" | "duckduckgo" },
): ProviderCall<KeywordRow[]> {
  return {
    estimate: freeEstimate("autocomplete", "keywords", "suggest", 1, "public suggest endpoint"),
    run: () => autocomplete(seed, opts),
  };
}
