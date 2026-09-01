import { patchHtmlTitle } from "@agentsean/actions";

export type Overlay = {
  title?: string | undefined;
  metaDescription?: string | undefined;
};

export type OverlayMap = Record<string, Overlay>;

/**
 * Identical HTML for every visitor. The worker must never read User-Agent,
 * bot signals, or crawler class. That is cloaking under Google's spam policies
 * (page last updated 2026-08-28).
 */
/**
 * Anchored on `<meta`/`<head` with a word boundary, and the attribute run is a
 * single negated class. Without the boundary the engine retries the run from
 * every `<meta`-alike position in a large document (CodeQL js/polynomial-redos).
 */
const META_DESCRIPTION = /<meta\b[^>]*\bname=["']description["'][^>]*>/i;
const HEAD_OPEN = /<head\b[^>]*>/i;

/**
 * Escape a value being written into a double-quoted HTML attribute.
 *
 * `patchHtmlTitle` has always escaped what it injects; this file did not, and
 * interpolated `overlay.metaDescription` straight into `content="..."`. A
 * description containing a double quote closes the attribute early and
 * everything after it becomes markup — on every page served through the edge
 * overlay. The overlay is operator-set rather than crawler-derived, so this is
 * defence in depth rather than a live exploit, but the writer is the right
 * place to guarantee it.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function rewriteHtml(html: string, overlay: Overlay | undefined): string {
  if (!overlay) return html;
  let out = html;
  if (overlay.title) out = patchHtmlTitle(out, overlay.title);
  if (overlay.metaDescription) {
    const tag = `<meta name="description" content="${escapeAttribute(overlay.metaDescription)}">`;
    if (META_DESCRIPTION.test(out)) {
      out = out.replace(META_DESCRIPTION, tag);
    } else if (HEAD_OPEN.test(out)) {
      out = out.replace(HEAD_OPEN, (h) => `${h}${tag}`);
    }
  }
  return out;
}

export function overlayFor(url: string, map: OverlayMap): Overlay | undefined {
  const u = new URL(url);
  const key = `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}`;
  return map[key] ?? map[url];
}

export function assertWorkerIsNotCloaking(source: string): void {
  const banned = [
    /user-agent/i,
    /userAgent/,
    /googlebot/i,
    /isBot/,
    /botSignal/i,
    /sec-ch-ua/i,
    /crawlerClass/i,
  ];
  for (const re of banned) {
    if (re.test(source)) {
      throw new Error(
        `Edge worker source matches ${re}. Branching on user-agent or bot signals is cloaking and will not ship.`,
      );
    }
  }
}

/**
 * Worker module text shipped to Cloudflare. No UA inspection.
 *
 * This runs on every request to the customer's site, outside the daemon and
 * outside the action validator — so anything it does has to be safe on its own
 * terms. Two properties it must keep:
 *
 *  1. It escapes what it injects. It previously did
 *     `"<title>" + overlay.title + "</title>"`, so a title containing
 *     `</title><script>` would have injected script into every page served
 *     through the overlay. The overlay value is operator-set, not
 *     crawler-derived, but a rewriter that trusts its input is one bad KV write
 *     away from persistent XSS on the customer's site.
 *  2. The title regex is linear — negated-close inner plus a `|$` fallback —
 *     matching the hardening in `@agentsean/actions`. A stall here is a stall
 *     in front of the customer's whole site.
 */
export const WORKER_SOURCE = `
const TITLE_EL = /<title\\b[^>]*>(?:[^<]|<(?!\\/title[\\s>]))*(?:<\\/title[^>]*>|$)/i;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originResp = await fetch(request);
    const contentType = originResp.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return originResp;
    const html = await originResp.text();
    const key = url.origin + (url.pathname.replace(/\\/+$/, "") || "/");
    const raw = await env.SEAN_OVERLAY.get(key);
    if (!raw) {
      return new Response(html, originResp);
    }
    const overlay = JSON.parse(raw);
    let out = html;
    if (overlay.title && TITLE_EL.test(out)) {
      out = out.replace(TITLE_EL, "<title>" + escapeHtml(overlay.title) + "</title>");
    }
    const headers = new Headers(originResp.headers);
    return new Response(out, { status: originResp.status, headers });
  }
};
`;
