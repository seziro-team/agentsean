/** Highest-ROI migration feature: catch preview hosts that index. */

export const VERCEL_BYPASS_HEADER = "x-vercel-protection-bypass";
export const CF_ACCESS_CLIENT_ID = "CF-Access-Client-Id";
export const CF_ACCESS_CLIENT_SECRET = "CF-Access-Client-Secret";

export type PreviewIndexationInput = {
  host: string;
  productionHost?: string | undefined;
  isProduction?: boolean | undefined;
  headers: Record<string, string>;
  html?: string | undefined;
};

export type PreviewIndexationResult = {
  ok: boolean;
  leaks: string[];
  note: string;
};

function header(headers: Record<string, string>, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

/**
 * Vercel silently omits X-Robots-Tag: noindex when a custom domain is assigned
 * to a non-production branch. Nobody else checks for this.
 */
export function assertPreviewNotIndexed(
  input: PreviewIndexationInput,
): PreviewIndexationResult {
  const leaks: string[] = [];
  const production =
    input.isProduction ??
    (input.productionHost ? input.host === input.productionHost : false);
  if (production) {
    return {
      ok: true,
      leaks,
      note: "Production host — indexation expected.",
    };
  }
  const xrobots = header(input.headers, "x-robots-tag") ?? "";
  const meta = input.html
    ? (/<meta\b[^>]*\bname=["']robots["'][^>]*?\bcontent=["']([^"']*)/i.exec(
        input.html,
      )?.[1] ?? "")
    : "";
  const noindex = /noindex/i.test(xrobots) || /noindex/i.test(meta);
  if (!noindex) {
    leaks.push(
      `${input.host} is a non-production host without X-Robots-Tag: noindex (Vercel drops this header when a custom domain is assigned to a preview branch).`,
    );
  }
  return {
    ok: leaks.length === 0,
    leaks,
    note: leaks.length ? leaks[0]! : "Preview is noindexed.",
  };
}

export const CRAWLER_BYPASS = {
  vercel: VERCEL_BYPASS_HEADER,
  cloudflareAccessId: CF_ACCESS_CLIENT_ID,
  cloudflareAccessSecret: CF_ACCESS_CLIENT_SECRET,
} as const;
