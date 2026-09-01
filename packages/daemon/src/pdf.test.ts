import { describe, expect, it } from "vitest";
import { textToPdf } from "./pdf.js";

describe("textToPdf", () => {
  it("emits a PDF with the snapshot title", () => {
    const buf = textToPdf("Agent Sean snapshot", '{"origin":"https://example.com"}');
    const text = buf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain("Agent Sean snapshot");
  });
});
