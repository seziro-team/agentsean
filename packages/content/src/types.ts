import type { Action } from "@agentsean/actions";
import type { GenerateFn, LlmConfig } from "@agentsean/llm";

export type ContentKind = "refresh" | "create";

export type StyleProfile = {
  bannedPhrases: string[];
  preferredTerms: Record<string, string>;
  maxSentenceWords: number;
  disclosure: "none" | "html_comment" | "meta" | "visible";
};

export const DEFAULT_STYLE: StyleProfile = {
  bannedPhrases: [],
  preferredTerms: {},
  maxSentenceWords: 40,
  disclosure: "html_comment",
};

export type BriefFact = { claim: string; sourceUrl: string };
export type BriefSource = { url: string; text: string; kind: "page" | "gsc" | "crawl" };
export type BriefLink = { pageId: string; url: string; anchor: string };

export type ContentBrief = {
  version: string;
  playbookId: "content-brief";
  playbookVersion: string;
  kind: ContentKind;
  targetUrl: string;
  pageId: string;
  title: string;
  intent: string;
  topics: string[];
  entities: string[];
  headings: string[];
  questions: string[];
  internalLinks: BriefLink[];
  competitorOutline: string[];
  sources: BriefSource[];
  facts: BriefFact[];
  currentWordCount: number;
  targetWordCount: number;
  decay: {
    previousClicks: number;
    currentClicks: number;
    delta: number;
    deltaPct: number | null;
  } | null;
  contentScore: number;
  googleUpdateNote: string | null;
};

export type ContentDraft = {
  title: string;
  body: string;
  jsonld: Record<string, unknown> | null;
  disclosure: string;
  model: string;
  modelClass: string;
};

export type GateCheck = {
  id: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  code: string;
  ok: boolean;
  detail: string;
};

export type PublishGateResult = {
  ok: boolean;
  checks: GateCheck[];
};

export type EvidenceTier = "A" | "B" | "C" | "D" | "E";

export type DecayingPage = {
  url: string;
  previousClicks: number;
  currentClicks: number;
  delta: number;
  deltaPct: number | null;
};

export type PageDaily = {
  date: string;
  page: string;
  clicks: number;
};

export type QueryDaily = {
  date: string;
  query: string;
  clicks: number;
  page?: string | undefined;
};

export type ContentCandidate = {
  pageId: string;
  url: string;
  title: string | null;
  h1: string | null;
  wordCount: number;
  body: string;
  kind: ContentKind;
  decay: DecayingPage | null;
  findingIds: string[];
};

export type RunContentOptions = {
  siteId: string;
  origin: string;
  now?: Date | undefined;
  halted?: boolean | undefined;
  dryRun?: boolean | undefined;
  llm?: LlmConfig | null | undefined;
  generate?: GenerateFn | undefined;
  adapter?: import("@agentsean/actions").SiteAdapter | null | undefined;
  approvalKey: Buffer;
  ymylCategory?: string | null | undefined;
  style?: StyleProfile | undefined;
  newPagesToday?: number | undefined;
  contentRefreshToday?: number | undefined;
  corpus?: Array<{ url: string; body: string }> | undefined;
};

export type RunContentResult = {
  skipped?: boolean | undefined;
  reason?: string | undefined;
  briefs: number;
  drafts: number;
  gated: number;
  applied: number;
  rejected: number;
  queued: number;
  actions: Action[];
  evidenceTier: EvidenceTier;
};
