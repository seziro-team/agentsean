import { describe, expect, it } from "vitest";
import { rewriteBody, rewriteTitle, titleInSource } from "./rewrite.js";

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

  it("replaces markdown after frontmatter", () => {
    const src = `---\ntitle: Old\n---\n\nHello world.\n`;
    const out = rewriteBody(src, "# New\n\nBody with 12% lift.\n");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.after.startsWith("---\ntitle: Old\n---")).toBe(true);
      expect(out.after).toContain("# New");
      expect(out.after).not.toContain("Hello world");
    }
  });

  it("rewrites <title> in HTML", () => {
    const src = `<html><head><title>Old</title></head></html>`;
    const out = rewriteTitle(src, "New Title For The Page Here");
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.after).toContain("<title>New Title For The Page Here</title>");
  });
});
