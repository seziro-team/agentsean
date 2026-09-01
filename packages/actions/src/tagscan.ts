/**
 * Linear scanners for HTML open tags.
 *
 * Why these are not regexes.
 *
 * `/<head\b[^>]*>/i` looks safe — it has one quantifier over a negated class,
 * and adding `\b` fixes the `<header>` overmatch. It is still O(n^2). On input
 * with many `<head` occurrences and no `>` anywhere, the engine matches the
 * literal, runs `[^>]*` to end-of-input, fails to find `>`, backtracks, fails,
 * then restarts at the next `<head` and rescans the whole remaining string.
 * Measured: **18,588 ms** at 60,000 repetitions.
 *
 * Bounding the run (`[^>]{0,N}`) fixes the timing but trades correctness for
 * it — cost scales linearly with N, and any N small enough to be fast is small
 * enough to stop matching a legitimately long tag. At N=200 a 307-character
 * `<head>` stops matching; at N=1024 the same input costs 101 ms.
 *
 * A forward scan has neither problem: find the literal, then walk to the next
 * `>` with `indexOf`. Each byte is visited at most twice regardless of input,
 * with no arbitrary limit on tag length.
 *
 * These run on HTML fetched back from a customer's live site to verify a write,
 * and inside the edge worker that rewrites their pages, so the input is not
 * ours and a stall is a stall in front of their whole site.
 */

export type TagMatch = {
  /** Index of the `<`. */
  start: number;
  /** Index just past the `>`. */
  end: number;
  /** The attribute text between the tag name and the `>`. */
  attrs: string;
};

/**
 * Find the first `<name ...>` open tag.
 *
 * Matches the same inputs `/<name\b[^>]*>/i` does: the character after the tag
 * name must not be a word character, so `<header>` is not a `<head>`.
 */
export function findOpenTag(html: string, name: string): TagMatch | null {
  const lowerHtml = html.toLowerCase();
  const needle = `<${name.toLowerCase()}`;
  let from = 0;

  for (;;) {
    const start = lowerHtml.indexOf(needle, from);
    if (start === -1) return null;

    const after = start + needle.length;
    const next = lowerHtml.charCodeAt(after);
    // Word boundary: the tag name must end here. NaN (end of input) is fine.
    const isWordChar =
      (next >= 97 && next <= 122) || // a-z
      (next >= 48 && next <= 57) || // 0-9
      next === 95; // _
    if (isWordChar) {
      from = after;
      continue;
    }

    const close = html.indexOf(">", after);
    if (close === -1) {
      // Unterminated. A regex would backtrack and retry from the next
      // occurrence; there is nothing further to find, so stop.
      return null;
    }
    return { start, end: close + 1, attrs: html.slice(after, close) };
  }
}

/** Iterate every `<name ...>` open tag, left to right. */
export function* eachOpenTag(html: string, name: string): Generator<TagMatch> {
  let offset = 0;
  for (;;) {
    const m = findOpenTag(html.slice(offset), name);
    if (!m) return;
    yield { start: m.start + offset, end: m.end + offset, attrs: m.attrs };
    offset += m.end;
  }
}

/**
 * Find the first `<meta>` whose attributes carry `name="<metaName>"`.
 *
 * The regex form — `/<meta\b[^>]*\bname=["']x["'][^>]*>/i` — has TWO unbounded
 * runs in one pattern, which is a slow product on top of the restart problem.
 * Measured 9,913 ms on 40,000 `<meta ` repetitions. Scanning each tag once and
 * testing its (already bounded) attribute text is linear.
 */
export function findMetaByName(html: string, metaName: string): TagMatch | null {
  const attrRe = new RegExp(`\\bname=["']${escapeRegExp(metaName)}["']`, "i");
  for (const tag of eachOpenTag(html, "meta")) {
    if (attrRe.test(tag.attrs)) return tag;
  }
  return null;
}

/** Read one attribute's value out of an open tag's attribute text. */
export function attrValue(attrs: string, attrName: string): string | null {
  const m = new RegExp(`\\b${escapeRegExp(attrName)}=["']([^"']*)["']?`, "i").exec(
    attrs,
  );
  return m?.[1] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
