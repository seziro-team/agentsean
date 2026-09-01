import { describe, expect, it } from "vitest";
import { extractPage } from "./extract.js";
import { extractMainContent } from "./readability.js";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Widget shop</title>
  <meta name="description" content="Buy widgets, the best widgets on the internet for teams.">
  <link rel="canonical" href="https://ex.com/widgets">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Ex"}</script>
</head>
<body>
  <h1>Widgets</h1>
  <p>A long enough paragraph about widgets that counts as main content for the extractor to pick up.</p>
  <a href="/about">About</a>
  <img src="/w.png">
</body>
</html>`;

describe("extractPage", () => {
  it("extracts title, canonical, links, and flags missing alt", () => {
    const e = extractPage(HTML, "https://ex.com/widgets");
    expect(e.title).toBe("Widget shop");
    expect(e.canonicalHtml[0]).toBe("https://ex.com/widgets");
    expect(e.lang).toBe("en");
    expect(e.links.some((l) => l.absUrl === "https://ex.com/about")).toBe(true);
    expect(e.images[0]?.hasAltAttr).toBe(false);
    expect(e.jsonLd[0]?.error).toBeNull();
  });

  it("does not use JSON-LD headline as the document title", () => {
    const html = `<html><head><title>Real</title>
      <script type="application/ld+json">{"headline":"Attacker"}</script>
      </head><body><p>Hello world content here.</p></body></html>`;
    const main = extractMainContent(html, "Real");
    expect(main.title).toBe("Real");
    expect(main.title).not.toBe("Attacker");
  });

  it("only admits http(s) links, dropping javascript:/data:/vbscript:/mailto:", () => {
    const html = `<html><body>
      <a href="/ok">rel</a>
      <a href="https://ex.com/abs">abs</a>
      <a href="javascript:alert(1)">js</a>
      <a href="data:text/html,<script>bad</script>">data</a>
      <a href="vbscript:msgbox">vb</a>
      <a href="mailto:x@y.com">mail</a>
      <a href="JAVASCRIPT:alert(2)">jsUpper</a>
    </body></html>`;
    const e = extractPage(html, "https://ex.com/page");
    const hrefs = e.links.map((l) => l.href);
    expect(hrefs).toContain("/ok");
    expect(hrefs).toContain("https://ex.com/abs");
    // Non-http(s) schemes must never enter the crawl frontier.
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
    expect(hrefs.some((h) => h.toLowerCase().startsWith("data:"))).toBe(false);
    expect(hrefs.some((h) => h.toLowerCase().startsWith("vbscript:"))).toBe(false);
    expect(hrefs.some((h) => h.toLowerCase().startsWith("mailto:"))).toBe(false);
  });
});

// ReDoS regression: extractPage / extractMainContent run on attacker-authored
// HTML, so a quadratic regex is a crawler stall on a crafted page. The 1s bound
// is orders of magnitude above the linear cost and far below any O(n^2) blow-up
// at these input sizes.
describe("extract ReDoS hardening", () => {
  const BUDGET_MS = 1000;

  it("extractPage spaRootEmpty check is linear on a huge unclosed <div", () => {
    const html = "<div " + " ".repeat(200_000) + "x";
    const start = performance.now();
    extractPage(html, "https://ex.com/");
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it("extractMainContent fallback strips an unterminated <script> in linear time", () => {
    // Force the regex fallback path with input the DOM parser tolerates but that
    // carries a never-closed script; script bytes must not survive.
    const html = "<script>" + "leak ".repeat(50_000);
    const start = performance.now();
    const main = extractMainContent(html, "t");
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
    expect(main.text).not.toContain("leak");
  });

  it("extractMainContent fallback treats '</script >' and junk closes as end tags", () => {
    // Whitespace before '>' must still close the element (js/bad-tag-filter).
    expect(
      extractMainContent(`<p>keep</p><script>evil()</script >`, "t").text,
    ).not.toContain("evil");
    // Attributes/newlines on the end tag also close it (alert 104). A close of
    // `</script\s*>` missed these and leaked the body.
    expect(
      extractMainContent(`<p>keep</p><script>evil()</script foo=bar>`, "t").text,
    ).not.toContain("evil");
    expect(
      extractMainContent(`<p>keep</p><script>evil()</script\t\nx>`, "t").text,
    ).not.toContain("evil");
  });
});
