import { describe, expect, it } from "vitest";
import { H1_WITH_LEADING_IMG, PARAM_EMPTY_VALUE } from "./all.js";

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

// ReDoS regression for PARAM.EMPTY_VALUE, which tests every crawled URL. The
// worst case is `&` followed by many `?`: before the fix, the key run `[^=&]+`
// and the leading `[?&]` both matched every `?` and backtracked from each start
// when the `=` never came — a 100k-`?` URL took ~10s. The key class now excludes
// `?`, which removes the overlap.
describe("PARAM_EMPTY_VALUE ReDoS hardening", () => {
  it("is linear on '&' followed by a huge run of '?'", () => {
    const url = "&" + "?".repeat(300_000);
    const start = performance.now();
    const matched = PARAM_EMPTY_VALUE.test(url);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(matched).toBe(false); // no `key=` empty-value param present
  });

  it("still flags an empty-value param and ignores populated ones", () => {
    // Empty value: `key=` at end or before `&`.
    expect(PARAM_EMPTY_VALUE.test("https://x.com/p?utm=")).toBe(true);
    expect(PARAM_EMPTY_VALUE.test("https://x.com/p?a=1&empty=&b=2")).toBe(true);
    // Populated / no empty param.
    expect(PARAM_EMPTY_VALUE.test("https://x.com/p?a=1&b=2")).toBe(false);
    expect(PARAM_EMPTY_VALUE.test("https://x.com/plain")).toBe(false);
  });
});
