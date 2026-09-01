import { describe, expect, it } from "vitest";
import { googleSupportedTypes, validateJsonLdBlocks } from "./schemaorg.js";

describe("schema.org validator", () => {
  it("loads a versioned Google-supported type list including the FAQ deprecation", () => {
    const g = googleSupportedTypes();
    expect(g.version).toMatch(/2026/);
    expect(g.supported).toContain("Product");
    expect(g.deprecated["FAQPage"]).toMatch(/2026-05-07/);
  });

  it("flags parse errors, missing type, and deprecated FAQPage", () => {
    const issues = validateJsonLdBlocks([
      { raw: "{", parsed: null, error: "invalid json", inHead: true },
      {
        raw: "{}",
        parsed: { "@context": "https://schema.org" },
        error: null,
        inHead: true,
      },
      {
        raw: "{}",
        parsed: { "@context": "https://schema.org", "@type": "FAQPage" },
        error: null,
        inHead: true,
      },
    ]);
    expect(issues.some((i) => i.code === "PARSE_ERROR")).toBe(true);
    expect(issues.some((i) => i.code === "MISSING_TYPE")).toBe(true);
    expect(issues.some((i) => i.code === "TYPE_DEPRECATED")).toBe(true);
  });
});
