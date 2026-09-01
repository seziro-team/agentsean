/** Live HTML is the only verify surface. Never trust a 200 from a write API. */

/**
 * Matches a `<title>` element and captures its content.
 *
 * The inner is a negated-close class rather than a lazy `[\s\S]*?`. Its two
 * branches — "not a `<`" and "a `<` that does not begin the close tag" — are
 * disjoint at every position, so the engine has nothing to reconsider and
 * cannot backtrack quadratically on crafted input full of `<`
 * (CodeQL js/polynomial-redos).
 *
 * The `|$` fallback is what makes the whole match linear: without it an
 * unterminated `<title` forces a rescan to end-of-input from every `<title`
 * start, which is O(n²) across many starts.
 *
 * The close is `</title[^>]*>` because parsers ignore attributes on an end tag
 * — `</title >` and `</title foo=bar>` both close the element. A stricter close
 * leaves the real title unmatched, so we would "verify" a write against text
 * that is not the title (js/bad-tag-filter).
 *
 * This runs on HTML fetched back from the customer's live site to confirm a
 * write landed, so the input is not ours and may carry user-generated content.
 */
import { findOpenTag } from "./tagscan.js";

const TITLE_EL = /<title\b[^>]*>((?:[^<]|<(?!\/title[\s>]))*)(?:<\/title[^>]*>|$)/i;

export function htmlTitle(html: string): string | null {
  const inner = TITLE_EL.exec(html)?.[1]?.trim();
  return inner ? inner : null;
}

export function patchHtmlTitle(html: string, title: string): string {
  if (TITLE_EL.test(html)) {
    return html.replace(TITLE_EL, `<title>${escapeHtml(title)}</title>`);
  }
  // Forward scan, not a regex: `/<head\b[^>]*>/` is O(n^2) on input with many
  // `<head` and no `>` (measured 18.5s at 60k). See tagscan.ts.
  const head = findOpenTag(html, "head");
  if (head) {
    return (
      html.slice(0, head.end) +
      `<title>${escapeHtml(title)}</title>` +
      html.slice(head.end)
    );
  }
  return `<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body></body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function fetchHtml(
  url: string,
  fetchFn: typeof fetch = fetch,
  headers?: Record<string, string>,
): Promise<string> {
  const res = await fetchFn(url, { headers: headers ?? {} });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

export async function verifyLiveTitle(
  url: string,
  expected: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string; html: string }> {
  const html = await fetchHtml(url, fetchFn);
  const got = htmlTitle(html);
  if (got === expected) {
    return { ok: true, detail: `live <title> is ${expected}`, html };
  }
  return {
    ok: false,
    detail: `live <title> is ${got ?? "(missing)"}; expected ${expected}`,
    html,
  };
}

export function titleFromPayload(payload: { title?: string }): string | null {
  return typeof payload.title === "string" ? payload.title : null;
}

export function requireTitle(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "title" in payload &&
    typeof payload.title === "string"
  ) {
    return payload.title;
  }
  throw new Error("action payload has no title");
}
