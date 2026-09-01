import { jsDependencyScore } from "./render.js";
import type { CrawledPage, PageExtract } from "./types.js";

export type RenderPolicy = "always" | "never" | "sample";

const DETECTION_RATIO = 0.1;
const FINGERPRINT_N = 50;

export function decideRenderPolicy(
  pages: Pick<CrawledPage, "templateKey" | "jsDependencyScore" | "url">[],
  page: Pick<CrawledPage, "templateKey" | "jsDependencyScore" | "url" | "extract">,
  index: number,
): RenderPolicy {
  if (shouldAlwaysRender(page)) return "always";
  if (index < FINGERPRINT_N) return "sample";
  const same = pages.filter((p) => p.templateKey === page.templateKey);
  if (same.length < 3) return "sample";
  const scores = same.map((p) => p.jsDependencyScore).toSorted((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)] ?? 0;
  const p95 = scores[Math.floor(scores.length * 0.95)] ?? median;
  if (median > 0.35) return "always";
  if (p95 < 0.05) return "never";
  return Math.random() < DETECTION_RATIO ? "sample" : "never";
}

export function shouldAlwaysRender(page: {
  url: string;
  extract: PageExtract | null;
}): boolean {
  try {
    const u = new URL(page.url);
    if (u.pathname === "/" || u.pathname === "") return true;
  } catch {
    /* ignore */
  }
  if (!page.extract) return false;
  if (page.extract.spaRootEmpty) return true;
  if (page.extract.hasNoscriptJsWarning) return true;
  if (page.extract.mainWordCount < 200 && page.extract.spaRootEmpty) return true;
  return false;
}

export function scoreFromHtml(html: string, extract: PageExtract): number {
  return jsDependencyScore(html, extract);
}
