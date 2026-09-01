import { describe, expect, it } from "vitest";
import { htmlTitle, patchHtmlTitle } from "./html.js";
import { extractUrls } from "./urls.js";

/**
 * ReDoS regression guards for the verify surface.
 *
 * These run on HTML fetched back from a customer's live site to confirm a write
 * landed, and on strings pulled out of crawled content. Neither is ours. A
 * quadratic regex here stalls the executor mid-change — after the write, before
 * the verify — which is the worst moment to hang.
 *
 * A generous 1s bound keeps CI stable while staying orders of magnitude below a
 * genuine O(n^2) blow-up at these sizes.
 */
const BUDGET_MS = 1000;

function underBudget(label: string, fn: () => void): void {
  const start = performance.now();
  fn();
  const elapsed = performance.now() - start;
  expect(elapsed, `${label} took ${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
}

describe("html verify surface — ReDoS hardening", () => {
  // --- Measured exploit reproduction ---------------------------------------
  // Only this shape actually blew up. Under the old
  // `/<title[^>]*>([\s\S]*?)<\/title>/` this input took **3,983 ms**; it now
  // takes 2.9 ms — a 1,389x difference. Every `<title` is a start position, and
  // with no `|$` close fallback each one rescans to end-of-input hunting a close
  // that never arrives. That is the O(n^2).
  it("htmlTitle is linear on many unterminated <title> tokens", () => {
    const many = "<title>".repeat(60_000);
    underBudget("htmlTitle many <title>", () => htmlTitle(many));
  });

  it("patchHtmlTitle is linear on the same input", () => {
    const many = "<title>".repeat(60_000);
    underBudget("patchHtmlTitle many <title>", () => patchHtmlTitle(many, "New"));
  });

  // --- Regression guards, NOT exploit reproductions -------------------------
  // Honesty about what these prove: the old patterns were measured at 0.2 ms on
  // both inputs below, so these would have passed before the fix too. They are
  // here to stop a future rewrite from introducing a blow-up on shapes the
  // hardened patterns are designed to absorb — not evidence of a bug that was.
  it("htmlTitle stays linear on a single enormous attribute run", () => {
    // One start position, so linear even under the old regex.
    const long = "<title " + "x".repeat(200_000);
    underBudget("htmlTitle long attrs", () => htmlTitle(long));
  });

  it("htmlTitle stays linear on a body full of '<'", () => {
    // Exercises the negated-close inner: `<` that does not begin `</title`.
    const soup = "<title>" + "<".repeat(200_000);
    underBudget("htmlTitle < soup", () => htmlTitle(soup));
  });

  it("extractUrls stays linear on a URL with a huge punctuation tail", () => {
    // CodeQL flagged `/[),.;]+$/` as polynomial. Measured, V8 handled it in
    // 0.2 ms at this size, so the scan-based rewrite is a hardening of the
    // shape rather than a fix for an observed stall. Recorded as such.
    const url = "https://example.com/a" + ")".repeat(200_000);
    underBudget("extractUrls punctuation tail", () => extractUrls({ note: url }));
  });

  describe("behaviour is unchanged", () => {
    it("reads a well-formed title", () => {
      expect(htmlTitle("<html><head><title>Hello</title></head></html>")).toBe("Hello");
    });

    it("reads a title whose tags carry attributes", () => {
      // Parsers ignore attributes on an end tag, so these close the element.
      expect(htmlTitle('<title data-x="1">Attrs</title >')).toBe("Attrs");
      expect(htmlTitle("<title>Junk close</title foo=bar>")).toBe("Junk close");
    });

    it("returns null when there is no title or it is empty", () => {
      expect(htmlTitle("<html><head></head></html>")).toBeNull();
      expect(htmlTitle("<title>   </title>")).toBeNull();
    });

    it("does not treat <titlebar> as a title", () => {
      expect(htmlTitle("<titlebar>nope</titlebar>")).toBeNull();
    });

    it("replaces an existing title and inserts one when absent", () => {
      expect(patchHtmlTitle("<head><title>Old</title></head>", "New")).toContain(
        "<title>New</title>",
      );
      expect(patchHtmlTitle("<head><title>Old</title></head>", "New")).not.toContain(
        "Old",
      );
      expect(patchHtmlTitle("<html><head></head></html>", "New")).toContain(
        "<title>New</title>",
      );
      expect(patchHtmlTitle("plain text", "New")).toContain("<title>New</title>");
    });

    it("escapes the injected title", () => {
      const out = patchHtmlTitle("<head></head>", "<script>alert(1)</script>");
      expect(out).not.toContain("<script>");
      expect(out).toContain("&lt;script&gt;");
    });

    it("still trims trailing prose punctuation off a URL", () => {
      expect(extractUrls({ a: "see https://example.com/x." })).toEqual([
        "https://example.com/x",
      ]);
      expect(extractUrls({ a: "(https://example.com/y)" })).toEqual([
        "https://example.com/y",
      ]);
      // A path that legitimately ends in a slash keeps it.
      expect(extractUrls({ a: "https://example.com/dir/" })).toEqual([
        "https://example.com/dir/",
      ]);
    });
  });
});
