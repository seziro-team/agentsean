import { describe, expect, it } from "vitest";
import { hamming64, nearDuplicate, simhash64, simhashHex } from "./simhash.js";

describe("simhash", () => {
  it("identical text has distance 0", () => {
    const a = simhash64("the quick brown fox jumps over the lazy dog");
    const b = simhash64("the quick brown fox jumps over the lazy dog");
    expect(hamming64(a, b)).toBe(0);
  });

  it("near-duplicates are closer than unrelated text", () => {
    const a = simhash64("the quick brown fox jumps over the lazy dog today");
    const b = simhash64("the quick brown fox jumps over the lazy dog tonight");
    const c = simhash64("completely different document about quantum chromodynamics");
    expect(hamming64(a, b)).toBeLessThan(hamming64(a, c));
    expect(
      nearDuplicate(
        simhashHex("aaaa bbbb cccc dddd eeee ffff"),
        simhashHex("zzzz yyyy xxxx wwww vvvv uuuu"),
        3,
      ),
    ).toBe(false);
  });
});
