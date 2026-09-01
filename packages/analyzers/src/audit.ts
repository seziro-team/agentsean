import { createHash } from "node:crypto";
import type { CrawlResult } from "@agentsean/crawler";
import { CHECKS } from "./catalogue.js";
import { detectAll } from "./detectors/all.js";
import { prioritize } from "./priority.js";
import { computeSiteScore, SITE_SCORE_FORMULA, SITE_SCORE_VERSION } from "./score.js";
import { PRIORITY_FORMULA } from "./priority.js";
import { isIndexable } from "./detectors/predicates.js";
import type { AuditContext, AuditReport, PrioritizedFinding } from "./types.js";

export function analyzeCrawl(
  crawl: CrawlResult,
  extra?: Omit<AuditContext, "crawl">,
): {
  findings: PrioritizedFinding[];
  score: ReturnType<typeof computeSiteScore>;
} {
  const ctx: AuditContext = { crawl, ...extra };
  const drafts = detectAll(ctx);
  const indexable = new Set(crawl.pages.filter(isIndexable).map((p) => p.url));
  const findings = prioritize(drafts, crawl.pages.length, {
    gscClicksByUrl: extra?.gsc?.clicksByUrl,
    indexableUrls: indexable,
  });
  const score = computeSiteScore(crawl, drafts, {
    hasGsc: Boolean(extra?.gsc),
    hasCrux: Boolean(extra?.crux),
  });
  return { findings, score };
}

export function buildReport(
  crawl: CrawlResult,
  elapsedMs: number,
  extra?: Omit<AuditContext, "crawl">,
): AuditReport {
  const { findings, score } = analyzeCrawl(crawl, extra);
  return {
    url: crawl.startUrl,
    origin: crawl.origin,
    pages: crawl.pagesSeen,
    elapsedMs,
    score,
    findings,
    formula: {
      siteScore: `${SITE_SCORE_VERSION}: ${SITE_SCORE_FORMULA.split("\n")[0]}`,
      priority: PRIORITY_FORMULA,
    },
  };
}

export function findingFingerprint(
  siteId: string,
  ruleId: string,
  url: string | null,
): string {
  return createHash("sha256")
    .update(`${siteId}|${ruleId}|${url ?? "*"}`)
    .digest("hex")
    .slice(0, 32);
}

export function flattenForDb(
  siteId: string,
  findings: PrioritizedFinding[],
): {
  pageUrl: string | null;
  ruleId: string;
  severity: string;
  autonomyTier: string;
  title: string;
  explanation: string | null;
  evidence: unknown;
  fingerprint: string;
}[] {
  const rows = [];
  for (const f of findings) {
    if (f.urls.length <= 1) {
      const url = f.urls[0] ?? null;
      rows.push({
        pageUrl: url,
        ruleId: f.ruleId,
        severity: f.severity,
        autonomyTier: f.autonomyTier,
        title: f.title,
        explanation: f.explanation,
        evidence: { ...asObj(f.evidence), priority: f.priority },
        fingerprint: findingFingerprint(siteId, f.ruleId, url),
      });
      continue;
    }
    rows.push({
      pageUrl: null,
      ruleId: f.ruleId,
      severity: f.severity,
      autonomyTier: f.autonomyTier,
      title: f.title,
      explanation: f.explanation,
      evidence: {
        ...asObj(f.evidence),
        urls: f.urls,
        priority: f.priority,
        count: f.urls.length,
      },
      fingerprint: findingFingerprint(siteId, f.ruleId, null),
    });
  }
  return rows;
}

function asObj(evidence: unknown): Record<string, unknown> {
  if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
    return evidence as Record<string, unknown>;
  }
  return { value: evidence };
}

export function catalogueSize(): number {
  return CHECKS.length;
}
