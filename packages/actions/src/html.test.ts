import { describe, expect, it } from "vitest";
import { htmlTitle, patchHtmlTitle, verifyLiveTitle } from "./html.js";

describe("live HTML title", () => {
  it("extracts and patches <title>", () => {
    const html = "<html><head><title>Old</title></head></html>";
    expect(htmlTitle(html)).toBe("Old");
    expect(htmlTitle(patchHtmlTitle(html, "New Title For The Page"))).toBe("New Title For The Page");
  });

  it("verifies by re-fetching live HTML, not the write-API status", async () => {
    const live = { html: "<html><head><title>Old</title></head></html>" };
    const fetchFn = (async () => new Response(live.html, { status: 200 })) as typeof fetch;
    const miss = await verifyLiveTitle("https://example.com/", "New Title For The Page", fetchFn);
    expect(miss.ok).toBe(false);
    live.html = patchHtmlTitle(live.html, "New Title For The Page");
    const hit = await verifyLiveTitle("https://example.com/", "New Title For The Page", fetchFn);
    expect(hit.ok).toBe(true);
  });
});
