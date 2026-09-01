import { googleFetch, type GoogleHttp } from "./http.js";
import { QuotaExceededError } from "./errors.js";

const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type PsiResult = {
  url: string;
  strategy: "mobile" | "desktop";
  performanceScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  lighthouseVersion: string | null;
  raw: unknown;
};

function scoreOf(audits: unknown, id: string): number | null {
  if (!audits || typeof audits !== "object") return null;
  const a = (audits as Record<string, { numericValue?: number; score?: number }>)[id];
  if (!a) return null;
  if (typeof a.numericValue === "number") return a.numericValue;
  return typeof a.score === "number" ? a.score : null;
}

export async function runPsi(opts: {
  http: GoogleHttp;
  url: string;
  strategy?: "mobile" | "desktop" | undefined;
  apiKey?: string | null | undefined;
}): Promise<PsiResult> {
  const strategy = opts.strategy ?? "mobile";
  const params = new URLSearchParams({
    url: opts.url,
    strategy,
    category: "performance",
  });
  params.append("category", "seo");
  if (opts.apiKey) params.set("key", opts.apiKey);
  const res = await googleFetch(
    opts.http,
    "psi",
    opts.apiKey ? "key" : "ip",
    `${PSI}?${params.toString()}`,
    {},
  );
  if (res.status === 429) {
    throw new QuotaExceededError("psi", "PageSpeed Insights 429", 60_000);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PSI error (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    lighthouseResult?: {
      lighthouseVersion?: string;
      categories?: {
        performance?: { score?: number };
        seo?: { score?: number };
      };
      audits?: Record<string, { numericValue?: number; score?: number }>;
    };
  };
  const lr = json.lighthouseResult;
  const audits = lr?.audits;
  return {
    url: opts.url,
    strategy,
    performanceScore: lr?.categories?.performance?.score ?? null,
    seoScore: lr?.categories?.seo?.score ?? null,
    lcpMs: scoreOf(audits, "largest-contentful-paint"),
    inpMs: scoreOf(audits, "interaction-to-next-paint"),
    cls: scoreOf(audits, "cumulative-layout-shift"),
    lighthouseVersion: lr?.lighthouseVersion ?? null,
    raw: json,
  };
}
