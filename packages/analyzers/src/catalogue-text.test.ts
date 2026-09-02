import { describe, expect, it } from "vitest";
import { CHECKS } from "./catalogue.js";

/**
 * The catalogue is what the product says out loud.
 *
 * catalogue-data.ts is generated from research/01-technical-seo.md, and the
 * generator that produced the checked-in copy did two things wrong: it deleted
 * inline code spans instead of unwrapping them, and it read table columns by
 * fixed index across a document with six different table shapes. So
 * "Missing `X-Content-Type-Options: nosniff`" became "Missing", and on the
 * narrower tables the severity column landed in the name field — nine separate
 * checks rendered as "Low", six as "Low–Medium".
 *
 * The Findings table is the product's primary output. Rows reading "Missing",
 * "Low", and "No on homepage" are not a cosmetic problem: the user cannot tell
 * what was found, and two different checks look like the same check.
 *
 * These assertions describe what a name has to be, so a future regeneration
 * cannot quietly reintroduce the same damage. Regenerate with
 * `node scripts/build-catalogue.mjs --write`.
 */
const SEVERITY_ONLY =
  /^(critical|high|medium|low|insight)(\s*[–—-]\s*(critical|high|medium|low|insight))?$/i;

/** Left behind when a trailing code span is deleted: "Responsive images without". */
const DANGLING = /\b(without|with|to|for|in|on|or|and|of|the|a|an|via|using)\s*$/i;

describe("check catalogue text", () => {
  it("gives every check a name", () => {
    const nameless = CHECKS.filter((c) => !c.name || !c.name.trim());
    expect(nameless.map((c) => c.id)).toEqual([]);
  });

  it("never leaves a severity sitting in the name field", () => {
    // The column-drift signature.
    const drifted = CHECKS.filter((c) => SEVERITY_ONLY.test(c.name.trim()));
    expect(drifted.map((c) => c.id)).toEqual([]);
  });

  it("never ends a name on a dangling preposition", () => {
    // The code-span-deletion signature: "Text asset served without".
    const cut = CHECKS.filter((c) => DANGLING.test(c.name.trim()));
    expect(cut.map((c) => c.id)).toEqual([]);
  });

  it("keeps names long enough to identify the check", () => {
    // "Missing", "No", "present", "used" — true of the old data, useless.
    const stub = CHECKS.filter((c) => c.name.trim().split(/\s+/).length < 2);
    expect(stub.map((c) => c.id)).toEqual([]);
  });

  /**
   * Two pairs share a name because they genuinely are the same check twice,
   * registered under two categories with byte-identical predicates:
   *
   *   DUP.META_DESC / ONP.META_DESC_DUPLICATE  dupField(p.extract.metaDescription)
   *   LINK.UNSAFE_CROSS_ORIGIN / SEC.UNSAFE_TARGET_BLANK  unsafeTargetBlanks > 0
   *
   * Giving them different words would hide that, and they would still both
   * fire on one defect and both count toward the score. Retiring one of each
   * pair changes scoring, so it is deliberately not bundled with a text fix —
   * it is listed here so the redundancy stays visible until it is resolved.
   */
  const KNOWN_REDUNDANT = new Set([
    "DUP.META_DESC/ONP.META_DESC_DUPLICATE",
    "LINK.UNSAFE_CROSS_ORIGIN/SEC.UNSAFE_TARGET_BLANK",
  ]);

  it("does not give two checks the same name", () => {
    // Nine checks called "Low" were indistinguishable in the UI.
    const seen = new Map<string, string[]>();
    for (const c of CHECKS) {
      const key = c.name.trim().toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), c.id]);
    }
    const clashes = [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .filter(([, ids]) => !KNOWN_REDUNDANT.has(ids.toSorted().join("/")));
    expect(clashes.map(([name, ids]) => `${name}: ${ids.join(", ")}`)).toEqual([]);
  });

  it("keeps the markup that identifies what is missing", () => {
    // These were the worst of the stripped names; each needs its subject back.
    const want: Record<string, string> = {
      "SEC.NO_XCTO": "X-Content-Type-Options",
      "SEC.NO_CSP": "Content-Security-Policy",
      "ONP.NO_CHARSET": "<meta charset>",
      "ONP.NO_LANG": "<html lang>",
      "SD.NO_ORGANIZATION": "Organization",
      "IMG.NO_SRCSET": "srcset",
      "ROBOTS.NO_SITEMAP_LINE": "Sitemap:",
    };
    for (const [id, needle] of Object.entries(want)) {
      const check = CHECKS.find((c) => c.id === id);
      expect(check, id).toBeDefined();
      expect(check?.name, `${id} should still mention ${needle}`).toContain(needle);
    }
  });
});
