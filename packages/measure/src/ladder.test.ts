import { describe, expect, it } from "vitest";
import {
  assignEvidenceTier,
  claimCausation,
  refuseUrlAttribution,
  statementFor,
} from "./ladder.js";

describe("evidence ladder", () => {
  it("assigns A only for a pre-registered controlled experiment with power", () => {
    expect(
      assignEvidenceTier({
        applied: true,
        preRegistered: true,
        design: "split_cohort",
        hasControl: true,
        powerOk: true,
        underpowered: false,
        peeking: false,
        suppressed: [],
        lift: 0.12,
        realisedMde: 0.18,
        googleUpdateJoined: true,
      }),
    ).toBe("A");
  });

  it("assigns E for applied unmeasured changes and refuses causation", () => {
    const tier = assignEvidenceTier({
      applied: true,
      preRegistered: false,
      design: null,
      hasControl: false,
      powerOk: false,
      underpowered: true,
      peeking: false,
      suppressed: ["S8"],
      lift: null,
      realisedMde: 0.8,
      googleUpdateJoined: false,
    });
    expect(tier).toBe("E");
    const cause = claimCausation(tier);
    expect(cause.allowed).toBe(false);
    expect(statementFor("E")).toMatch(/not measurable/i);
    expect(statementFor("E")).not.toMatch(/\bnull\b/i);
  });

  it("assigns C for pre/post that exceeds MDE with a Google-update join", () => {
    expect(
      assignEvidenceTier({
        applied: true,
        preRegistered: false,
        design: "uncontrolled",
        hasControl: false,
        powerOk: false,
        underpowered: false,
        peeking: false,
        suppressed: ["S4"],
        lift: 0.7,
        realisedMde: 0.55,
        googleUpdateJoined: true,
      }),
    ).toBe("C");
  });

  it("assigns D when the signal is below the MDE", () => {
    expect(
      assignEvidenceTier({
        applied: true,
        preRegistered: false,
        design: "uncontrolled",
        hasControl: false,
        powerOk: false,
        underpowered: false,
        peeking: false,
        suppressed: ["S4"],
        lift: 0.08,
        realisedMde: 0.55,
        googleUpdateJoined: true,
      }),
    ).toBe("D");
  });

  it("never allows per-URL click attribution", () => {
    expect(() => refuseUrlAttribution("https://example.com/page")).toThrow(/cohort/i);
  });

  it("allows causation only at tier A", () => {
    expect(claimCausation("A").allowed).toBe(true);
    expect(claimCausation("B").allowed).toBe(false);
    expect(claimCausation("C").allowed).toBe(false);
    expect(claimCausation("D").allowed).toBe(false);
    expect(claimCausation("E").allowed).toBe(false);
  });
});
