import { describe, expect, it } from "vitest";
import { attrValue, eachOpenTag, findMetaByName, findOpenTag } from "./tagscan.js";
import { patchHtmlTitle } from "./html.js";

/**
 * These scanners exist because `\b` does not linearize an open-tag regex.
 *
 * `/<head\b[^>]*>/i` was committed with a comment claiming it was linear. It is
 * not: on input with many `<head` and no `>` the engine runs the negated class
 * to end-of-input, backtracks, restarts at the next `<head`, and rescans. That
 * measured **18,588 ms** at 60,000 repetitions. The `\b` only fixes the
 * `<header>` overmatch.
 *
 * Bounding the run trades correctness for speed — cost scales with the bound,
 * and any bound fast enough is small enough to stop matching a legitimately
 * long tag (at 200, a 307-character `<head>` silently stops matching). A
 * forward scan has neither problem.
 */
const BUDGET_MS = 1000;

function underBudget(label: string, fn: () => void): void {
  const start = performance.now();
  fn();
  const elapsed = performance.now() - start;
  expect(elapsed, `${label} took ${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
}

describe("findOpenTag", () => {
  it("is linear where the regex was 18.5 seconds", () => {
    const evil = "<head".repeat(60_000);
    underBudget("findOpenTag 60k <head", () => findOpenTag(evil, "head"));
  });

  it("matches what /<head\\b[^>]*>/i matched", () => {
    const reference = /<head\b[^>]*>/i;
    const cases = [
      "<head>",
      "<head >",
      '<head class="a">',
      "<HEAD lang=en>",
      "<header>nope</header>",
      "no head at all",
      "<head " + "x".repeat(50) + ">",
      "<head " + "x".repeat(2000) + ">",
      "<html><head><title>t</title></head></html>",
      "<head",
      "",
    ];
    for (const c of cases) {
      expect(Boolean(findOpenTag(c, "head")), JSON.stringify(c.slice(0, 30))).toBe(
        reference.test(c),
      );
    }
  });

  it("reports the span and attributes of the tag it found", () => {
    const m = findOpenTag('<html><head lang="en">x</head>', "head");
    expect(m).not.toBeNull();
    expect(m?.attrs.trim()).toBe('lang="en"');
    expect('<html><head lang="en">'.length).toBe(m?.end);
  });

  it("does not treat a longer tag name as a match", () => {
    expect(findOpenTag("<header>x</header>", "head")).toBeNull();
    expect(findOpenTag("<head2>x</head2>", "head")).toBeNull();
    // ...but finds a real one that follows a look-alike.
    expect(findOpenTag("<header></header><head>", "head")).not.toBeNull();
  });

  it("returns null for an unterminated tag rather than scanning forever", () => {
    expect(findOpenTag("<head " + "x".repeat(100_000), "head")).toBeNull();
  });
});

describe("findMetaByName", () => {
  it("is linear where the two-run regex was 9.9 seconds", () => {
    const evil = "<meta ".repeat(40_000);
    underBudget("findMetaByName 40k <meta", () => findMetaByName(evil, "description"));
  });

  it("finds the right meta among several", () => {
    const html =
      '<head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width">' +
      '<meta name="description" content="the real one">' +
      "</head>";
    const m = findMetaByName(html, "description");
    expect(m).not.toBeNull();
    expect(attrValue(m?.attrs ?? "", "content")).toBe("the real one");
    expect(findMetaByName(html, "robots")).toBeNull();
  });

  it("handles single quotes and attribute order", () => {
    const html = "<meta content='x' name='description'>";
    expect(findMetaByName(html, "description")).not.toBeNull();
  });

  it("does not match a name that merely contains the target", () => {
    expect(
      findMetaByName('<meta name="descriptionx" content="a">', "description"),
    ).toBeNull();
  });
});

describe("eachOpenTag", () => {
  it("walks every tag once, left to right", () => {
    const html = "<meta a><meta b><meta c>";
    expect([...eachOpenTag(html, "meta")].map((t) => t.attrs.trim())).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("patchHtmlTitle head insertion", () => {
  it("is linear on the input that stalled the regex", () => {
    const evil = "<head".repeat(60_000);
    underBudget("patchHtmlTitle 60k <head", () => patchHtmlTitle(evil, "T"));
  });

  it("still inserts after the head open tag", () => {
    const out = patchHtmlTitle('<html><head lang="en"></head></html>', "New");
    expect(out).toBe('<html><head lang="en"><title>New</title></head></html>');
  });
});
