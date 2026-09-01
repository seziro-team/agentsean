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

  it("stripHtml is linear on a long comment-free tag soup", () => {
    const html = "<div " + " ".repeat(200_000) + ">text</div>";
    underBudget("stripHtml tag soup", () => stripHtml(html));
  });

  it("stripHtml decodes each entity exactly once (no double unescape)", () => {
    // `&amp;lt;` must decode to the literal `&lt;`, not to `<`.
    expect(stripHtml("a &amp;lt; b")).toBe("a &lt; b");
  });

  it("extractHeadings is linear on an unterminated <h1> and a space-only line", () => {
    const htmlHeading = "<h1 " + "x".repeat(200_000);
    const mdHeading = "#" + " ".repeat(200_000);
    underBudget("extractHeadings html", () => extractHeadings(htmlHeading));
    underBudget("extractHeadings md", () => extractHeadings(mdHeading));
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
