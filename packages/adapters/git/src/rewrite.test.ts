import { describe, expect, it } from "vitest";
import { rewriteTitle, titleInSource } from "./rewrite.js";

describe("rewriteTitle", () => {
  it("rewrites Next.js metadata title", () => {
    const src = `export const metadata = { title: "Hi" };\nexport default function Page() { return null; }\n`;
    const out = rewriteTitle(src, "About our running shoes today");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(titleInSource(out.after)).toBe("About our running shoes today");
      expect(out.after).toContain("About our running shoes today");
    }
  });

  it("rewrites <title> in HTML", () => {
    const src = `<html><head><title>Old</title></head></html>`;
    const out = rewriteTitle(src, "New Title For The Page Here");
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.after).toContain("<title>New Title For The Page Here</title>");
  });
});
