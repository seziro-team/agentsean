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
    text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
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
