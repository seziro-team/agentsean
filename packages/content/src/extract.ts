import type { BriefFact, QueryDaily } from "./types.js";

const STOP = new Set(
  "a an the and or of to for in on with without from by at as is are was were be been being this that these those it its you your we our they their not but if then than too very just into over after before about into up out so no yes can will".split(
    " ",
  ),
);

// Strip a raw element and its content. The end tag is `<\/script[^>]*>`, which
// tolerates ANY junk before ">" — whitespace, newlines, or attributes
// (`</script >`, `</script\t\nbar>`, `</script foo=bar>`). HTML parsers close
// on all of these, so a stricter close (`</script\s*>`) lets attacker script or
// style content survive into the extracted text that later reaches an LLM
// (CodeQL js/bad-tag-filter). If the element is never closed we fall through to
// end-of-input so nothing after an unterminated `<script>` leaks. The inner
// branches are disjoint (`[^<]` vs. a `<` not starting the close) so the match
// is linear and cannot backtrack quadratically (js/polynomial-redos).
const SCRIPT_EL = /<script\b[^>]*>(?:[^<]|<(?!\/script[\s>]))*(?:<\/script[^>]*>|$)/gi;
const STYLE_EL = /<style\b[^>]*>(?:[^<]|<(?!\/style[\s>]))*(?:<\/style[^>]*>|$)/gi;

// Single-pass entity decode. A sequential chain that expands `&amp;` before
// `&lt;`/`&gt;` double-unescapes: `&amp;lt;` would become `&lt;` and then `<`
// (CodeQL js/double-escaping). One replace with a lookup table decodes each
// entity exactly once.
const ENTITY = /&(nbsp|amp|lt|gt|quot|#39);/g;
const ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
};

export function stripHtml(html: string): string {
  return html
    .replace(SCRIPT_EL, " ")
    .replace(STYLE_EL, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(ENTITY, (_, name: string) => ENTITY_MAP[name] ?? _)
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  const t = stripHtml(text);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

// Heading inner is a negated-close class ((?:[^<]|<(?!\/h\1))*) rather than a
// lazy `[\s\S]*?`: the two branches are disjoint at each position, so there is
// no backtracking on the inner (js/polynomial-redos). The `|$` close fallback
// is what actually makes the whole match linear: without it, an unterminated
// `<h1` forces matchAll to rescan to end-of-input from every `<h1` start and
// fail, which is O(n^2) — a 60k-repetition input took 13s before this fallback,
// 7ms after. The close `<\/h\1[^>]*>` also tolerates attributes/whitespace
// before ">" (js/bad-tag-filter), matching how parsers close a heading.
const HTML_HEADING = /<h([1-6])[^>]*>((?:[^<]|<(?!\/h\1[\s>]))*)(?:<\/h\1[^>]*>|$)/gi;

export function extractHeadings(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HTML_HEADING)) {
    const inner = stripHtml(m[2] ?? "");
    if (inner) out.push(inner);
  }
  // Separator is horizontal whitespace `[^\S\r\n]+` and the text must start
  // with a non-space `(\S.*)`. The old `\s+(.+)` let `\s+` and `.+` both match
  // a run of spaces, an ambiguous split that backtracks quadratically on a line
  // of only spaces (js/polynomial-redos). Result is unchanged for real
  // headings.
  for (const m of text.matchAll(/^(#{1,6})[^\S\r\n]+(\S.*)$/gm)) {
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
  const phrases = [...plain.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)].map(
    (m) => m[1] ?? "",
  );
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
    if (
      /\b(who|what|when|where|why|how|should|can)\b/i.test(row.query) ||
      row.query.includes("?")
    ) {
      q.add(row.query.trim());
    }
  }
  for (const h of headings) {
    if (h.includes("?")) q.add(h);
  }
  return [...q].slice(0, 12);
}

// Matches currency, grouped thousands, percentages, and bare numbers. The
// grouped-thousands branch ends with a negative lookahead `(?![\d,])` instead
// of `\b` + an optional decimal that could backtrack against following digits;
// this makes each alternative consume a maximal run once, so the whole pattern
// is linear on adversarial input like `1,234,234,…` (js/polynomial-redos).
const NUMBER_RE =
  /\$[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|\b\d+(?:\.\d+)?%|\b\d{2,}(?:\.\d+)?\b/g;

// Comment inner is `(?:[^-]|-(?!->))*` — any non-hyphen, or a hyphen not
// starting the `-->` close — which is disjoint at each position and cannot
// backtrack, unlike the lazy `[\s\S]*?-->` that CodeQL flags as polynomial on
// `<!--` with no terminator (js/polynomial-redos). Falls through to end-of-input
// for an unclosed comment so trailing content is still stripped.
const HTML_COMMENT_RE = /<!--(?:[^-]|-(?!->))*(?:-->|$)/g;

export function numericClaims(text: string): string[] {
  const cleaned = text.replace(HTML_COMMENT_RE, " ");
  const hits = cleaned.match(NUMBER_RE) ?? [];
  return [...new Set(hits.map((h) => h.trim()))];
}

export function factsFromText(text: string, sourceUrl: string): BriefFact[] {
  return numericClaims(text).map((claim) => ({ claim, sourceUrl }));
}
