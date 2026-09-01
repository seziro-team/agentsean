import type { FindingDraft, PillarScore, SiteScore } from "./types.js";
import type { CrawlResult } from "@agentsean/crawler";
import { selfCanonical } from "./detectors/predicates.js";

/** Published, versioned Site Score formula. Never retro-compute old scores. */
export const SITE_SCORE_VERSION = "ss-1.0.0";

export const SITE_SCORE_FORMULA = `SiteScore = round(100 × Σ(wᵢ × sᵢ)) where Σwᵢ = 1, each sᵢ ∈ [0,1]
Pillars (ss-1.0.0):
  1. Indexability & crawlability  w=0.25
  2. On-page fundamentals         w=0.20
  3. Structured data              w=0.10
  4. Internal linking             w=0.10
  5. Performance / CWV            w=0.10
  6. Search performance trend     w=0.15  (redistributed when no GSC)
  7. AI visibility                w=0.05  (robots AI-bot access until Phase 9)
  8. Content freshness & quality  w=0.05
Bands: 0–30 Poor · 31–70 Needs work · 71–90 Good · 91–100 Excellent.
A pillar with no applicable signal is excluded and weights renormalised.
<50 crawled URLs → provisional. No GSC → partial.`;

const PILLARS: { id: string; name: string; weight: number }[] = [
  { id: "indexability", name: "Indexability & crawlability", weight: 0.25 },
  { id: "onpage", name: "On-page fundamentals", weight: 0.2 },
  { id: "structured", name: "Structured data & rich results", weight: 0.1 },
  { id: "linking", name: "Internal linking", weight: 0.1 },
  { id: "performance", name: "Performance / CWV", weight: 0.1 },
  { id: "search", name: "Search performance trend", weight: 0.15 },
  { id: "ai", name: "AI visibility", weight: 0.05 },
  { id: "content", name: "Content freshness & quality", weight: 0.05 },
];

export function computeSiteScore(
  crawl: CrawlResult,
  findings: FindingDraft[],
  opts?: { hasGsc?: boolean | undefined; hasCrux?: boolean | undefined },
): SiteScore {
  const notes: string[] = [];
  const htmlPages = crawl.pages.filter((p) => p.extract && p.statusCode === 200);
  const n = Math.max(1, htmlPages.length);
  const ids = new Set(findings.map((f) => f.ruleId));

  const errorUrls = crawl.pages.filter(
    (p) =>
      p.isInternal &&
      p.statusCode !== null &&
      (p.statusCode >= 400 || p.redirectChain.length >= 3 || !p.robotsAllowed),
  ).length;
  const indexability = clamp01(1 - errorUrls / Math.max(1, crawl.pages.length));

  const onpagePass = htmlPages.filter((p) => {
    const t = p.extract?.title ?? "";
    const d = p.extract?.metaDescription ?? "";
    return (
      t.length >= 15 &&
      t.length <= 60 &&
      d.length >= 70 &&
      d.length <= 160 &&
      (p.extract?.h1.length ?? 0) === 1 &&
      selfCanonical(p)
    );
  }).length;
  const onpage = onpagePass / n;

  const schemaPages = htmlPages.filter((p) => (p.extract?.jsonLd.length ?? 0) > 0);
  const schemaErrors = findings.filter((f) => f.ruleId.startsWith("SD.") && f.severity === "critical").length;
  const structured =
    htmlPages.length === 0
      ? 0
      : clamp01(schemaPages.length / n - schemaErrors / Math.max(1, schemaPages.length));

  const orphans = findings.find((f) => f.ruleId === "CRAWL.ORPHAN")?.urls.length ?? 0;
  const deep = htmlPages.filter((p) => p.depth > 3).length;
  const linking = clamp01(1 - orphans / n - 0.5 * (deep / n));

  let performance = 0.7;
  let performanceApplied = false;
  let performanceNote: string | null = "No CrUX or Lighthouse data; using crawl TTFB proxy.";
  if (opts?.hasCrux) {
    performanceApplied = true;
    performanceNote = null;
    const fail = ["CWV.LCP_FAIL", "CWV.INP_FAIL", "CWV.CLS_FAIL"].filter((id) => ids.has(id)).length;
    performance = clamp01(1 - fail / 3);
  } else {
    const slow = crawl.pages.filter((p) => p.ttfbMs > 800).length;
    performance = clamp01(1 - slow / Math.max(1, crawl.pages.length));
    performanceApplied = true;
  }

  const searchApplied = Boolean(opts?.hasGsc);
  const search = searchApplied ? 0.5 : 0;

  const aiBlocked = ids.has("ROBOTS.BLOCKS_AI_UNINTENDED");
  const ai = aiBlocked ? 0.3 : 0.8;

  const thin = findings.find((f) => f.ruleId === "THIN.LOW_WORDCOUNT")?.urls.length ?? 0;
  const content = clamp01(1 - thin / n);

  const raw: PillarScore[] = [
    { id: "indexability", name: PILLARS[0]!.name, weight: 0.25, score: indexability, applied: true, note: null },
    { id: "onpage", name: PILLARS[1]!.name, weight: 0.2, score: onpage, applied: true, note: null },
    { id: "structured", name: PILLARS[2]!.name, weight: 0.1, score: structured, applied: true, note: null },
    { id: "linking", name: PILLARS[3]!.name, weight: 0.1, score: linking, applied: true, note: null },
    {
      id: "performance",
      name: PILLARS[4]!.name,
      weight: 0.1,
      score: performance,
      applied: performanceApplied,
      note: performanceNote,
    },
    {
      id: "search",
      name: PILLARS[5]!.name,
      weight: 0.15,
      score: search,
      applied: searchApplied,
      note: searchApplied ? null : "No GSC data; weight redistributed.",
    },
    { id: "ai", name: PILLARS[6]!.name, weight: 0.05, score: ai, applied: true, note: "AI-crawler robots.txt only (Phase 1)." },
    { id: "content", name: PILLARS[7]!.name, weight: 0.05, score: content, applied: true, note: null },
  ];

  const applied = raw.filter((p) => p.applied);
  const weightSum = applied.reduce((s, p) => s + p.weight, 0) || 1;
  const pillars = raw.map((p) =>
    p.applied ? { ...p, weight: p.weight / weightSum } : { ...p, weight: 0 },
  );
  const value = Math.round(
    100 * pillars.filter((p) => p.applied).reduce((s, p) => s + p.weight * p.score, 0),
  );
  const partial = !searchApplied;
  const provisional = crawl.pages.length < 50;
  if (partial) notes.push("Partial score: Search Console is not connected.");
  if (provisional) notes.push("Provisional: fewer than 50 URLs crawled.");
  if (!opts?.hasCrux) notes.push("Performance pillar uses crawl TTFB until CrUX is connected.");

  return {
    version: SITE_SCORE_VERSION,
    value,
    band: band(value),
    pillars,
    partial,
    provisional,
    notes,
  };
}

function band(value: number): SiteScore["band"] {
  if (value <= 30) return "Poor";
  if (value <= 70) return "Needs work";
  if (value <= 90) return "Good";
  return "Excellent";
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}


