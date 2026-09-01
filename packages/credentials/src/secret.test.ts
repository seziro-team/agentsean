import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { Secret } from "./secret.js";

describe("Secret", () => {
  it("redacts in string, JSON, and inspect, but unwraps the real value", () => {
    const s = new Secret("super-secret-token");
    expect(s.unwrap()).toBe("super-secret-token");
    expect(String(s)).toBe("[redacted]");
    expect(JSON.stringify({ token: s })).toBe('{"token":"[redacted]"}');
    expect(inspect(s)).toBe("[redacted]");
    expect(`${s}`).toBe("[redacted]");
  });
});
