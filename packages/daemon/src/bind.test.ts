import { describe, expect, it } from "vitest";
import { assertBindAllowed, BindError, isLoopbackHost } from "./bind.js";

describe("bind policy", () => {
  it("treats loopback addresses as loopback", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.0.0.2")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("1.2.3.4")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
  });

  it("refuses off-loopback bind without auth", () => {
    expect(() => assertBindAllowed("0.0.0.0", false)).toThrow(BindError);
    expect(() => assertBindAllowed("1.2.3.4", false)).toThrow(/off-loopback/);
    expect(() => assertBindAllowed("127.0.0.1", false)).not.toThrow();
    expect(() => assertBindAllowed("0.0.0.0", true)).not.toThrow();
  });
});
