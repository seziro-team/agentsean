import { describe, expect, it } from "vitest";
import { categories, CHECKS, getCheck } from "./catalogue.js";
import { FAMILY_DETECTORS, detectorFor } from "./detectors/all.js";
import { OPENSEO_SEED_TO_CHECK } from "./openseo-seed.js";

describe("check catalogue", () => {
  it("ships the ~300-check catalogue with stable IDs", () => {
    expect(CHECKS.length).toBeGreaterThanOrEqual(300);
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHECKS) {
      expect(c.id).toMatch(/^[A-Z0-9]+\.[A-Z0-9_]+$/);
      expect(c.severity).toMatch(/critical|high|medium|low|insight/);
      expect(c.autonomyTier).toMatch(/^T[0-4]$/);
      expect(c.fixTemplate.length).toBeGreaterThan(0);
      expect(typeof detectorFor(c.id)).toBe("function");
    }
  });

  it("has a detector module per family", () => {
    for (const cat of categories()) {
      expect(FAMILY_DETECTORS[cat], cat).toBeTypeOf("function");
    }
  });

  it("maps all 27 OpenSEO seed issues onto catalogue IDs", () => {
    expect(Object.keys(OPENSEO_SEED_TO_CHECK).length).toBe(27);
    for (const id of Object.values(OPENSEO_SEED_TO_CHECK)) {
      expect(getCheck(id), id).toBeDefined();
    }
  });
});
