import type { BriefFact, QueryDaily } from "./types.js";

const STOP = new Set(
  "a an the and or of to for in on with without from by at as is are was were be been being this that these those it its you your we our they their not but if then than too very just into over after before about into up out so no yes can will".split(
    " ",
  ),
);

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  const t = stripHtml(text);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function extractHeadings(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const inner = stripHtml(m[2] ?? "");
    if (inner) out.push(inner);
  }
  for (const m of text.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    const inner = (m[2] ?? "").trim();
    if (inner) out.push(inner);
  }
  return [...new Set(out)].slice(0, 20);
}

export function extractEntities(text: string, extra: string[] = []): string[] {
  const plain = stripHtml(text);
  const counts = new Map<string, number>();
  for (const raw of plain.split(/[^A-Za-z0-9]+/)) {
    const w = raw.trim();
    if (w.length < 4) continue;
    const lower = w.toLowerCase();
    if (STOP.has(lower)) continue;
    counts.set(lower, (counts.get(lower) ?? 0) + 1);
  }
  const phrases = [...plain.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)].map((m) => m[1] ?? "");
  for (const p of phrases) {
    if (p.split(" ").length < 2) continue;
    const lower = p.toLowerCase();
    counts.set(lower, (counts.get(lower) ?? 0) + 2);
  }
  for (const e of extra) {
    const lower = e.toLowerCase();
    if (lower.length >= 3) counts.set(lower, (counts.get(lower) ?? 0) + 3);
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 50);
}

export function extractQuestions(queries: QueryDaily[], headings: string[]): string[] {
  const q = new Set<string>();
  for (const row of queries) {
    if (/\b(who|what|when|where|why|how|should|can)\b/i.test(row.query) || row.query.includes("?")) {
      q.add(row.query.trim());
    }
  }
  for (const h of headings) {
    if (h.includes("?")) q.add(h);
  }
  return [...q].slice(0, 12);
}

const NUMBER_RE =
  /(?:\$[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?%|\b\d{2,}(?:\.\d+)?\b)/g;

export function numericClaims(text: string): string[] {
  const cleaned = text.replace(/<!--[\s\S]*?-->/g, " ");
  const hits = cleaned.match(NUMBER_RE) ?? [];
  return [...new Set(hits.map((h) => h.trim()))];
}

export function factsFromText(text: string, sourceUrl: string): BriefFact[] {
  return numericClaims(text).map((claim) => ({ claim, sourceUrl }));
}
