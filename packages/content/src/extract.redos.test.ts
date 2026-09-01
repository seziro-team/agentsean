import { describe, expect, it } from "vitest";
import { extractHeadings, numericClaims, stripHtml } from "./extract.js";

/**
 * ReDoS regression guards. Every function here runs on attacker-authored HTML
 * (a crawler's input diet), so a quadratic regex is a crawler stall triggered
 * by a crafted page. Each case feeds a pathological string that would take
 * seconds-to-minutes under the pre-hardening patterns and asserts it finishes
 * well under budget. A generous 1s bound avoids CI flakiness while still being
 * orders of magnitude below any true O(n^2) blow-up on these sizes.
 */
const BUDGET_MS = 1000;

function underBudget(label: string, fn: () => void): void {
  const start = performance.now();
  fn();
  const elapsed = performance.now() - start;
  expect(elapsed, `${label} took ${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
}

describe("extract ReDoS hardening", () => {
  it("stripHtml is linear on an unterminated <script>", () => {
    // Bad-tag-filter + ReDoS: script that never closes must not hang and must
    // strip through to end-of-input (no script bytes leak into extracted text).
    const html = "<script>" + "a".repeat(200_000);
    let out = "";
    underBudget("stripHtml unterminated script", () => {
      out = stripHtml(html);
    });
    expect(out).toBe("");
  });

  it("stripHtml strips a script closed with whitespace before '>'", () => {
    // `</script >` (whitespace before '>') must still be treated as the end
    // tag, so no script bytes survive (js/bad-tag-filter). The element collapses
    // to a single separating space.
    const out = stripHtml("keep<script>evil()</script >tail");
    expect(out).not.toContain("evil");
    expect(out).toBe("keep tail");
  });

  it("stripHtml strips a script whose close tag carries junk/attributes", () => {
    // Parsers ignore attributes on an end tag, so `</script foo=bar>` and
    // `</script\t\nx>` both close the element. A close pattern of `</script\s*>`
    // missed these and let the body leak (js/bad-tag-filter, alert 103).
    expect(stripHtml("keep<script>evil()</script foo=bar>tail")).toBe("keep tail");
    expect(stripHtml("keep<script>evil()</script\t\nx>tail")).toBe("keep tail");
    // The same for <style>.
    expect(stripHtml("keep<style>.a{}</style bar>tail")).toBe("keep tail");
    // A word-boundary look-alike is NOT a script and must be left to the generic
    // tag stripper (its text content survives).
    expect(stripHtml("a<scriptish>keep</scriptish>b")).toBe("a keep b");
  });

  it("stripHtml is linear on a long comment-free tag soup", () => {
    const html = "<div " + " ".repeat(200_000) + ">text</div>";
    underBudget("stripHtml tag soup", () => stripHtml(html));
  });

  it("stripHtml decodes each entity exactly once (no double unescape)", () => {
    // `&amp;lt;` must decode to the literal `&lt;`, not to `<`.
    expect(stripHtml("a &amp;lt; b")).toBe("a &lt; b");
  });

  it("extractHeadings is linear on many repeated unterminated <h1> tokens", () => {
    // The real quadratic shape (alert 101): matchAll restarts at every `<h1`,
    // and without the `|$` close fallback each restart rescans to end-of-input
    // looking for a close that never comes — O(n^2). 60k repetitions took ~13s
    // before the fallback. A single long-attribute `<h1` (one start position) is
    // linear even under the old pattern, so it did NOT exercise the bug; the
    // repeated token below does.
    const manyH1 = "<h1>".repeat(60_000);
    underBudget("extractHeadings many <h1>", () => extractHeadings(manyH1));

    const singleLong = "<h1 " + "x".repeat(200_000);
    const mdHeading = "#" + " ".repeat(200_000);
    underBudget("extractHeadings single long <h1", () => extractHeadings(singleLong));
    underBudget("extractHeadings md", () => extractHeadings(mdHeading));
  });

  it("extractHeadings reads a heading whose close tag carries attributes", () => {
    // `</h1 foo>` closes an <h1> for a real parser; the close must tolerate junk
    // before ">" (js/bad-tag-filter). Well-formed headings are unchanged.
    expect(extractHeadings("<h1>Hello</h1>")).toContain("Hello");
    expect(extractHeadings("<h1>Attr close</h1 data-x>")).toContain("Attr close");
    expect(extractHeadings("<h2 class=x>Nested <span>bit</span></h2>")).toContain(
      "Nested bit",
    );
  });

  it("numericClaims is linear on an unterminated HTML comment", () => {
    const text = "<!--" + "a".repeat(200_000);
    underBudget("numericClaims comment", () => numericClaims(text));
  });

  it("numericClaims is linear on a long grouped-thousands run", () => {
    const text = "1" + ",234".repeat(50_000) + "x";
    underBudget("numericClaims grouped thousands", () => numericClaims(text));
  });
});
