import { describe, expect, it } from "vitest";
import { PLAYBOOKS, adaptedFromOpenseo, getPlaybook } from "./index.js";

const REQUIRED = [
  "seo-audit",
  "keyword-research",
  "keyword-clustering",
  "local-seo",
  "link-prospecting",
  "competitor-analysis",
  "competitive-landscape",
  "seo-coach",
  "seo-project-setup",
  "content-refresh",
  "content-brief",
  "publish-gate",
  "brand-voice",
  "vertical-block",
];

describe("playbooks", () => {
  it("ships the nine adapted OpenSEO skills plus Sean content playbooks", () => {
    expect(PLAYBOOKS.map((p) => p.id).toSorted()).toEqual([...REQUIRED].toSorted());
    expect(adaptedFromOpenseo()).toHaveLength(9);
    for (const p of adaptedFromOpenseo()) {
      expect(p.source?.treatment).toBe("ADAPT");
      expect(p.source?.copyright).toMatch(/Ben Senescu/);
    }
  });

  it("versions every playbook and keeps a closed output schema", () => {
    for (const p of PLAYBOOKS) {
      expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(p.inputs.length).toBeGreaterThan(0);
      expect(p.decisionRules.length).toBeGreaterThan(0);
      expect(p.outputSchema.type).toBe("object");
      expect(p.outputSchema.required.length).toBeGreaterThan(0);
    }
    expect(getPlaybook("publish-gate")?.guardrails).toHaveLength(10);
    expect(getPlaybook("missing")).toBeUndefined();
  });

  it("defaults content work to refresh, not new URLs", () => {
    const refresh = getPlaybook("content-refresh");
    expect(refresh?.decisionRules.some((r) => r.id === "prefer-refresh")).toBe(true);
    expect(refresh?.guardrails.some((g) => /mint a new URL/i.test(g))).toBe(true);
  });
});
