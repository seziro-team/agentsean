import { describe, expect, it } from "vitest";
import { prioritize } from "./priority.js";
import { computeSiteScore, SITE_SCORE_VERSION } from "./score.js";
import type { CrawlResult } from "@agentsean/crawler";
import type { FindingDraft } from "./types.js";

function emptyCrawl(): CrawlResult {
  return {
    origin: "https://ex.com",
    startUrl: "https://ex.com/",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    pages: [],
    robots: null,
    sitemaps: [],
    originProbe: {
      https: true,
      httpRedirectsToHttps: true,
      wwwSplit: false,
      wwwPreferred: "https://ex.com",
      trailingSlashSplit: false,
      randomSoft404: false,
      randomSoft404Url: null,
      randomSoft404Hash: null,
      certValidTo: null,
      certDaysRemaining: 200,
      certError: null,
      alpn: "h2",
      hsts: "max-age=31536000",
    },
    pagesSeen: 0,
    pagesChanged: 0,
    maxPages: 10,
    truncated: false,
  };
}

describe("site score + priority", () => {
  it("versions the formula and redistributes GSC weight", () => {
    const score = computeSiteScore(emptyCrawl(), []);
    expect(score.version).toBe(SITE_SCORE_VERSION);
    expect(score.partial).toBe(true);
    expect(score.provisional).toBe(true);
    expect(score.pillars.find((p) => p.id === "search")?.applied).toBe(false);
    const applied = score.pillars.filter((p) => p.applied);
    const w = applied.reduce((s, p) => s + p.weight, 0);
    expect(w).toBeCloseTo(1, 5);
  });

  it("ranks critical indexable issues above low ones", () => {
    const findings: FindingDraft[] = [
      {
        ruleId: "ONP.TITLE_TOO_LONG",
        severity: "low",
        autonomyTier: "T1",
        title: "long",
        explanation: "",
        fixTemplate: "",
        urls: ["https://ex.com/a"],
        evidence: {},
        confidence: 1,
      },
      {
        ruleId: "RESP.5XX_INTERNAL",
        severity: "critical",
        autonomyTier: "T3",
        title: "5xx",
        explanation: "",
        fixTemplate: "",
        urls: ["https://ex.com/b"],
        evidence: {},
        confidence: 1,
      },
    ];
    const ranked = prioritize(findings, 10);
    expect(ranked[0]?.ruleId).toBe("RESP.5XX_INTERNAL");
  });
});
