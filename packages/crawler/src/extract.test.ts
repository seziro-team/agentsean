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
});
