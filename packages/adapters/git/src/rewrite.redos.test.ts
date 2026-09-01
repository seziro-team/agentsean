import { describe, expect, it } from "vitest";
import { titleInSource } from "./rewrite.js";

/**
 * ReDoS regression guard for `titleInSource`.
 *
 * The adapter calls this on both the source it wrote AND the file it reads back
 * to verify the write landed (adapter.ts). The read-back is a fetched file, so
 * it is not ours. Its `<title>` reader used a lazy `[\s\S]*?` with no `|$` close
 * fallback, which rescanned to end-of-input from every `<title` start on
 * unterminated input — O(n^2). This is the same fix as TITLE_PATTERNS line 13
 * and `@agentsean/actions`.
 *
 * A generous 1s bound keeps CI stable while staying orders of magnitude under a
 * real O(n^2) blow-up at this size.
 */
const BUDGET_MS = 1000;

describe("titleInSource — ReDoS hardening", () => {
  // Measured exploit reproduction: under the old
  // `/<title[^>]*>([\s\S]*?)<\/title>/` this input took ~7,000 ms at n=80k; it
  // is now ~6 ms. Every `<title` is a start position and, with no `|$` close
  // fallback, each rescans to end-of-input hunting a close that never comes.
  it("is linear on many unterminated <title> tokens", () => {
    const many = "<title>".repeat(80_000);
    const start = performance.now();
    const got = titleInSource(many);
    const elapsed = performance.now() - start;
    expect(elapsed, `took ${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
    // No close tag anywhere: the `|$` branch consumes to EOF, so the "title"
    // is the whole run of `<title>` text, which trims to a non-empty string.
    expect(typeof got).toBe("string");
  });

  it("is linear on a title body full of '<'", () => {
    // Exercises the negated-close inner: `<` that does not begin `</title`.
    const soup = "<title>" + "<".repeat(200_000);
    const start = performance.now();
    titleInSource(soup);
    const elapsed = performance.now() - start;
    expect(elapsed, `took ${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
  });

  describe("behaviour is unchanged on well-formed input", () => {
    it("reads a well-formed <title>", () => {
      expect(titleInSource("<html><head><title>Hello</title></head></html>")).toBe(
        "Hello",
      );
    });

    it("reads a <title> whose close tag carries attributes/space", () => {
      // Parsers ignore attributes on an end tag, so these close the element.
      // The old lazy pattern missed them (js/bad-tag-filter); the new one reads
      // them the same way TITLE_EL in @agentsean/actions does.
      expect(titleInSource('<title data-x="1">Attrs</title >')).toBe("Attrs");
      expect(titleInSource("<title>Junk close</title foo=bar>")).toBe("Junk close");
    });

    it("falls through to the metadata form when there is no <title>", () => {
      expect(titleInSource(`export const metadata = { title: "Meta" };`)).toBe("Meta");
    });

    it("returns null when nothing matches", () => {
      expect(titleInSource("no title here")).toBeNull();
    });

    it("treats a whitespace-only <title> as absent", () => {
      // Trimmed capture is empty, so it does not shadow a later title: field.
      expect(titleInSource(`<title>   </title>\ntitle: "Real"`)).toBe("Real");
    });
  });
});
