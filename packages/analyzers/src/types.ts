import type { CrawlResult } from "@agentsean/crawler";

export type Severity = "critical" | "high" | "medium" | "low" | "insight";
export type AutonomyTier = "T0" | "T1" | "T2" | "T3" | "T4";
export type DetectScope = "url" | "site" | "template" | "resource" | "domain";

export type CheckDefinition = {
  id: string;
  category: string;
  name: string;
  severity: Severity;
  detectScope: DetectScope;
  requires: readonly string[];
  autonomyTier: AutonomyTier;
  fixKind: string;
  fixTemplate: string;
  explanation: string;
};

export type FindingDraft = {
  ruleId: string;
  severity: Severity;
  autonomyTier: AutonomyTier;
  title: string;
  explanation: string;
  fixTemplate: string;
  urls: string[];
  evidence: unknown;
  confidence: number;
};

export type PrioritizedFinding = FindingDraft & {
  priority: number;
  coverage: number;
  indexability: number;
  traffic: number;
  effort: number;
};

export type GscData = {
  clicksByUrl?: Record<string, number> | undefined;
  impressionsByUrl?: Record<string, number> | undefined;
  googleCanonicalByUrl?: Record<string, string> | undefined;
  coverageStateByUrl?: Record<string, string> | undefined;
  submittedSitemaps?: string[] | undefined;
  sitemapErrors?: boolean | undefined;
  lastDownloaded?: string | undefined;
};

export type CruxData = {
  lcpP75Ms?: number | undefined;
  inpP75Ms?: number | undefined;
  clsP75?: number | undefined;
  ttfbP75Ms?: number | undefined;
  phoneLcpP75Ms?: number | undefined;
  desktopLcpP75Ms?: number | undefined;
  urlLevel?: boolean | undefined;
};

export type LighthouseData = {
  version: string;
  audits: Record<string, { score: number | null; id: string }>;
};

export type LogData = {
  googlebotHitsByUrl?: Record<string, number> | undefined;
  googlebotStatusMix?: Record<string, number> | undefined;
  fakeBotHits?: number | undefined;
};

export type MigrationData = {
  urlMap?: Record<string, string> | undefined;
  oldOrigin?: string | undefined;
  newOrigin?: string | undefined;
};

export type AuditContext = {
  crawl: CrawlResult;
  gsc?: GscData | undefined;
  crux?: CruxData | undefined;
  lighthouse?: LighthouseData | undefined;
  logs?: LogData | undefined;
  migration?: MigrationData | undefined;
  previousRobotsHash?: string | undefined;
  now?: Date | undefined;
};

export type PillarScore = {
  id: string;
  name: string;
  weight: number;
  score: number;
  applied: boolean;
  note: string | null;
};

export type SiteScore = {
  version: string;
  value: number;
  band: "Poor" | "Needs work" | "Good" | "Excellent";
  pillars: PillarScore[];
  partial: boolean;
  provisional: boolean;
  notes: string[];
};

export type AuditReport = {
  url: string;
  origin: string;
  pages: number;
  elapsedMs: number;
  score: SiteScore;
  findings: PrioritizedFinding[];
  formula: {
    siteScore: string;
    priority: string;
  };
};
