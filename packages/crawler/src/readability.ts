/**
 * Vendored main-content extractor.
 *
 * @mozilla/readability 0.6.0 last published 2025-03-03 (stale). We vendor a
 * focused extractor rather than taking the unmaintained runtime dep.
 *
 * IMPORTANT: Mozilla Readability sources `title` from attacker-controlled
 * JSON-LD `headline` and `excerpt` from `og:description`. Both MUST be
 * treated as untrusted. This implementation never reads JSON-LD or Open
 * Graph for title/excerpt.
 */
import { parseHTML } from "linkedom";

const STRIP = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "NAV",
  "FOOTER",
  "ASIDE",
  "FORM",
  "IFRAME",
  "SVG",
  "HEADER",
]);

export type ReadabilityResult = {
  title: string;
  text: string;
  wordCount: number;
};

export function extractMainContent(
  html: string,
  documentTitle: string,
): ReadabilityResult {
  let text = "";
  try {
    const { document } = parseHTML(html);
    for (const el of document.querySelectorAll("*")) {
      if (STRIP.has(el.tagName)) el.remove();
    }
    const main =
      document.querySelector("article") ??
      document.querySelector("main") ??
      document.querySelector("[role='main']") ??
      document.querySelector("body");
    text = (main?.textContent ?? "").replace(/\s+/g, " ").trim();
  } catch {
    // Fallback when the DOM parser throws. This text feeds the analysis plane
    // and ultimately an LLM, so script/style content MUST NOT survive. The end
    // tag is `<\/script[^>]*>`, tolerating any junk before ">" — whitespace,
    // newlines, or attributes (`</script >`, `</script\t\nbar>`). A stricter
    // close lets script bodies leak past the filter (js/bad-tag-filter). It
    // falls through to end-of-input for an unclosed element. The inner is a
    // negated-close class, not a lazy `[\s\S]*?`, so crafted input with many
    // "<" cannot backtrack quadratically (js/polynomial-redos).
    text = html
      .replace(
        /<script\b[^>]*>(?:[^<]|<(?!\/script[\s>]))*(?:<\/script[^>]*>|$)/gi,
        " ",
      )
      .replace(/<style\b[^>]*>(?:[^<]|<(?!\/style[\s>]))*(?:<\/style[^>]*>|$)/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return {
    title: documentTitle,
    text,
    wordCount: words(text),
  };
}

export function words(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function loremIpsumIn(text: string): boolean {
  return /lorem ipsum|dolor sit amet|placeholder text|\bTODO\b|\bFIXME\b|\[insert/i.test(
    text,
  );
}
