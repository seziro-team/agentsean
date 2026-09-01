import type { WaybackCapture } from "./types.js";

const CDX = "https://web.archive.org/cdx/search/cdx";

export async function waybackCdx(
  url: string,
  opts?: { fetch?: typeof fetch; limit?: number },
): Promise<WaybackCapture[]> {
  const fetchFn = opts?.fetch ?? fetch;
  const endpoint = new URL(CDX);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("output", "json");
  endpoint.searchParams.set("limit", String(opts?.limit ?? 5));
  endpoint.searchParams.set("fl", "original,timestamp,statuscode");
  const res = await fetchFn(endpoint, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Wayback CDX HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || json.length < 2) return [];
  const rows = json.slice(1) as string[][];
  return rows.map((row) => {
    const cap: WaybackCapture = { url, timestamp: row[1] ?? "" };
    if (row[0]) cap.original = row[0];
    if (row[2]) cap.status = row[2];
    return cap;
  });
}
