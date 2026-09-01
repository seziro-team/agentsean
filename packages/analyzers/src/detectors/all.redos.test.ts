import { describe, expect, it } from "vitest";
import { H1_WITH_LEADING_IMG } from "./all.js";

// ReDoS regression: this pattern runs over attacker-authored page HTML inside
// the ONP.ALT_TEXT_IN_H1 detector. A crafted `<h1 …` open tag that never closes
// must not stall the analyzer.
describe("H1_WITH_LEADING_IMG ReDoS hardening", () => {
  it("is linear on a huge unclosed <h1 tag", () => {
    const html = "<h1 " + " ".repeat(300_000) + "x";
    const start = performance.now();
    // Each .test() advances lastIndex for global regexes; this one is not
    // global, but reset defensively in case that changes.
    H1_WITH_LEADING_IMG.lastIndex = 0;
    const matched = H1_WITH_LEADING_IMG.test(html);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(matched).toBe(false);
  });

  it("still matches an <h1> whose first child is an <img>", () => {
    expect(H1_WITH_LEADING_IMG.test('<h1 class="x"> <img src="a.png"></h1>')).toBe(
      true,
    );
    expect(H1_WITH_LEADING_IMG.test("<h1>text</h1>")).toBe(false);
  });
});
