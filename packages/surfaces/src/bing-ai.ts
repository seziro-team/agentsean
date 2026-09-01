/** Bing Webmaster AI Performance has no API. Ingest a CSV export. */

export type BingAiRow = {
  date: string;
  groundingQuery: string;
  citations: number;
  citationShare: number;
};

export function parseBingAiCsv(csv: string): BingAiRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = (lines[0] ?? "").toLowerCase();
  const out: BingAiRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsv(line);
    const date = cols[0] ?? "";
    const groundingQuery = cols[1] ?? "";
    const citations = Number(cols[2] ?? 0);
    const citationShare = Number(cols[3] ?? 0);
    if (!groundingQuery) continue;
    out.push({
      date,
      groundingQuery,
      citations: Number.isFinite(citations) ? citations : 0,
      citationShare: Number.isFinite(citationShare) ? citationShare : 0,
    });
  }
  void header;
  return out;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function bingCitationShare(rows: BingAiRow[]): number {
  if (rows.length === 0) return 0;
  let w = 0;
  let n = 0;
  for (const r of rows) {
    w += r.citationShare * Math.max(r.citations, 1);
    n += Math.max(r.citations, 1);
  }
  return n === 0 ? 0 : w / n;
}
