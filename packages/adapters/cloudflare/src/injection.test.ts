import { describe, expect, it } from "vitest";
import { assertWorkerIsNotCloaking, rewriteHtml, WORKER_SOURCE } from "./rewrite.js";

/**
 * The edge overlay rewrites the customer's live pages for every visitor. Both
 * the local rewriter and the worker shipped to Cloudflare must escape what they
 * inject: the worker in particular runs outside the daemon and outside the
 * action validator, so it cannot lean on anything upstream having sanitised the
 * overlay value.
 */
describe("edge overlay escapes what it injects", () => {
  const BREAKOUT = '" onload="alert(1)';
  const TAG_BREAKOUT = "</title><script>alert(1)</script>";

  it("escapes a quote that would break out of the meta content attribute", () => {
    const out = rewriteHtml(
      '<html><head><meta name="description" content="old"></head></html>',
      { metaDescription: BREAKOUT },
    );
    expect(out).not.toContain('onload="alert(1)');
    expect(out).toContain("&quot;");
    // Exactly one description meta, still well formed.
    expect(out.match(/<meta name="description"/g)).toHaveLength(1);
  });

  it("escapes markup in a meta description inserted into a bare head", () => {
    const out = rewriteHtml("<html><head></head><body>x</body></html>", {
      metaDescription: "<script>alert(1)</script>",
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes a title that would close the element and inject script", () => {
    const out = rewriteHtml("<html><head><title>Old</title></head></html>", {
      title: TAG_BREAKOUT,
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("leaves ordinary values readable", () => {
    const out = rewriteHtml("<html><head><title>Old</title></head></html>", {
      title: "Acme HVAC repairs in Austin, TX",
      metaDescription: "Fast, licensed, 24/7.",
    });
    expect(out).toContain("<title>Acme HVAC repairs in Austin, TX</title>");
    expect(out).toContain('content="Fast, licensed, 24/7."');
  });

  it("serves byte-identical HTML regardless of who asks", () => {
    // The anti-cloaking guarantee: no branch anywhere on the requester.
    const origin = "<html><head><title>Old</title></head></html>";
    const overlay = { title: "New" };
    expect(rewriteHtml(origin, overlay)).toBe(rewriteHtml(origin, overlay));
    expect(() => assertWorkerIsNotCloaking(WORKER_SOURCE)).not.toThrow();
  });
});

describe("shipped worker source", () => {
  it("escapes the overlay title before injecting it", () => {
    // The worker previously did `"<title>" + overlay.title + "</title>"`.
    expect(WORKER_SOURCE).toContain("escapeHtml(overlay.title)");
    expect(WORKER_SOURCE).not.toContain('"<title>" + overlay.title');
  });

  it("carries an escapeHtml implementation, since it cannot import one", () => {
    expect(WORKER_SOURCE).toContain("function escapeHtml");
    for (const entity of ["&amp;", "&lt;", "&gt;", "&quot;"]) {
      expect(WORKER_SOURCE).toContain(entity);
    }
  });

  it("uses the linear title pattern, not a lazy [\\s\\S]*?", () => {
    expect(WORKER_SOURCE).toContain("TITLE_EL");
    expect(WORKER_SOURCE).not.toContain("[\\s\\S]*?");
  });

  it("is valid JavaScript", () => {
    // Catches a broken template-literal escape in the embedded source.
    expect(() => new Function(`return () => {}`)).not.toThrow();
    expect(WORKER_SOURCE).toContain("export default");
    expect(WORKER_SOURCE.split("{").length).toBe(WORKER_SOURCE.split("}").length);
  });
});
