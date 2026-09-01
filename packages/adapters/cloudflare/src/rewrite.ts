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
export function rewriteHtml(html: string, overlay: Overlay | undefined): string {
  if (!overlay) return html;
  let out = html;
  if (overlay.title) out = patchHtmlTitle(out, overlay.title);
  if (overlay.metaDescription) {
    if (/<meta\s+name=["']description["'][^>]*>/i.test(out)) {
      out = out.replace(
        /<meta\s+name=["']description["'][^>]*>/i,
        `<meta name="description" content="${overlay.metaDescription}">`,
      );
    } else if (/<head[^>]*>/i.test(out)) {
      out = out.replace(
        /<head[^>]*>/i,
        (h) => `${h}<meta name="description" content="${overlay.metaDescription}">`,
      );
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

/** Worker module text shipped to Cloudflare. No UA inspection. */
export const WORKER_SOURCE = `
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
    if (overlay.title) {
      if (/<title[^>]*>[\\s\\S]*?<\\/title>/i.test(out)) {
        out = out.replace(/<title[^>]*>[\\s\\S]*?<\\/title>/i, "<title>" + overlay.title + "</title>");
      }
    }
    const headers = new Headers(originResp.headers);
    return new Response(out, { status: originResp.status, headers });
  }
};
`;
