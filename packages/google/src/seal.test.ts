import { describe, expect, it } from "vitest";
import { randomWrapKey } from "./pkce.js";
import { generatePkce } from "./pkce.js";
import { seal, unseal } from "./seal.js";

describe("pkce + sealed handoff", () => {
  it("generates S256 challenge that is not the verifier", () => {
    const p = generatePkce();
    expect(p.method).toBe("S256");
    expect(p.verifier).not.toBe(p.challenge);
    expect(p.verifier.length).toBeGreaterThan(20);
  });

  it("round-trips a refresh token", () => {
    const key = randomWrapKey();
    const payload = seal(key, JSON.stringify({ refresh_token: "rt-1" }));
    expect(payload).not.toContain("rt-1");
    expect(JSON.parse(unseal(key, payload)).refresh_token).toBe("rt-1");
  });

  it("rejects a tampered payload", () => {
    const key = randomWrapKey();
    const payload = seal(key, "hello");
    expect(() => unseal(key, payload.slice(0, -2) + "aa")).toThrow();
  });
});
