import type { EntityHit } from "./types.js";

const WD = "https://www.wikidata.org/w/api.php";

export async function wikidataSearch(
  q: string,
  opts?: { fetch?: typeof fetch; limit?: number },
): Promise<EntityHit[]> {
  const fetchFn = opts?.fetch ?? fetch;
  const url = new URL(WD);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", q);
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(opts?.limit ?? 5));
  const res = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = (await res.json()) as {
    search?: Array<{
      id: string;
      label?: string;
      description?: string;
      concepturi?: string;
    }>;
  };
  return (json.search ?? []).map((hit) => {
    const row: EntityHit = { id: hit.id, label: hit.label ?? hit.id };
    if (hit.description) row.description = hit.description;
    if (hit.concepturi) row.url = hit.concepturi;
    return row;
  });
}
