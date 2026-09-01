/** Live HTML is the only verify surface. Never trust a 200 from a write API. */

export function htmlTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1] ? m[1].trim() : null;
}

export function patchHtmlTitle(html: string, title: string): string {
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (h) => `${h}<title>${escapeHtml(title)}</title>`);
  }
  return `<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body></body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function fetchHtml(
  url: string,
  fetchFn: typeof fetch = fetch,
  headers?: Record<string, string>,
): Promise<string> {
  const res = await fetchFn(url, { headers: headers ?? {} });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

export async function verifyLiveTitle(
  url: string,
  expected: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string; html: string }> {
  const html = await fetchHtml(url, fetchFn);
  const got = htmlTitle(html);
  if (got === expected) {
    return { ok: true, detail: `live <title> is ${expected}`, html };
  }
  return {
    ok: false,
    detail: `live <title> is ${got ?? "(missing)"}; expected ${expected}`,
    html,
  };
}

export function titleFromPayload(payload: { title?: string }): string | null {
  return typeof payload.title === "string" ? payload.title : null;
}

export function requireTitle(payload: unknown): string {
  if (payload && typeof payload === "object" && "title" in payload && typeof payload.title === "string") {
    return payload.title;
  }
  throw new Error("action payload has no title");
}
