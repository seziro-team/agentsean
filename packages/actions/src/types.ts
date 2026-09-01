import type { ActionKind } from "./kinds.js";

export type AutonomyTier = 0 | 1 | 2 | 3 | 4;

export type ActionTarget = {
  pageId: string;
  url: string;
};

/** Default metric is clicks — GSC impressions were contaminated 2025-05-13 → 2026-04-27. */
export type Impact = {
  metric: "clicks";
  estimate: number;
  confidence: number;
};

export type TitlePayload = { title: string };
export type MetaPayload = { metaDescription: string };
export type AltPayload = { selector: string; alt: string };
export type HeadingPayload = { level: 1 | 2 | 3 | 4 | 5 | 6; text: string };
export type InternalLinkPayload = {
  hrefPageId: string;
  hrefUrl: string;
  anchor: string;
};
export type JsonLdPayload = { type: string; json: Record<string, unknown> };
export type ContentPayload = { body: string };
export type CreatePagePayload = { path: string; title: string; body: string };
export type RobotsTxtPayload = { body: string };
export type MetaRobotsPayload = { content: string };
export type RedirectPayload = {
  fromPageId: string;
  fromUrl: string;
  toPageId: string;
  toUrl: string;
  status: 301 | 410;
};
export type CanonicalPayload = { canonicalPageId: string; canonicalUrl: string };
export type HreflangPayload = {
  lang: string;
  hrefPageId: string;
  hrefUrl: string;
};
export type SitemapPayload = { sitemapUrl: string };
export type ImageDimPayload = { selector: string; width: number; height: number };
export type LangPayload = { lang: string };
export type ViewportPayload = { content: string };
export type EmptyPayload = Record<string, never>;
export type RefusedPayload = { reason: string };

export type ActionPayload =
  | TitlePayload
  | MetaPayload
  | AltPayload
  | HeadingPayload
  | InternalLinkPayload
  | JsonLdPayload
  | ContentPayload
  | CreatePagePayload
  | RobotsTxtPayload
  | MetaRobotsPayload
  | RedirectPayload
  | CanonicalPayload
  | HreflangPayload
  | SitemapPayload
  | ImageDimPayload
  | LangPayload
  | ViewportPayload
  | EmptyPayload
  | RefusedPayload;

export type Action = {
  id: string;
  siteId: string;
  kind: ActionKind;
  tier: AutonomyTier;
  target: ActionTarget;
  payload: ActionPayload;
  rationale: string[];
  findingIds: string[];
  estimatedImpact: Impact;
};

export type Veto = {
  check: number;
  code: string;
  detail: string;
};

export type ValidationOk = { ok: true };
export type ValidationReject = { ok: false; vetoes: Veto[] };
export type ValidationResult = ValidationOk | ValidationReject;

export type EntitySource = "crawl" | "user" | "third_party";

export type SitePolicy = {
  id: string;
  origin: string;
  autonomyMode: string;
  observeUntil: string | null;
  ymylCategory: string | null;
  killswitch: number;
  neverTouchGlobs: string[];
  createdAt: string;
};

export type PageRow = {
  id: string;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
};

export type EntityRow = {
  entity: string;
  source: EntitySource;
};

export type TwoKeyApproval = {
  actor: string;
  hmac: string;
};

export type ValidationContext = {
  now: Date;
  site: SitePolicy;
  pages: PageRow[];
  allowlist: string[];
  entities: EntityRow[];
  appliedThisRun: number;
  appliedThisHour: number;
  appliedThisDay: number;
  newPagesToday: number;
  spentUsdToday: number;
  budgetUsdDaily: number;
  estimatedCostUsd: number;
  twoKeyApprovals: TwoKeyApproval[];
  halted: boolean;
  beforeText: string;
  afterText: string;
  runId: string;
  /** HMAC key used to verify two-key signatures. */
  approvalKey: Buffer;
};

export type AdapterCapabilities = {
  kind: string;
  reads: boolean;
  writes: boolean;
  pullRequests: boolean;
  rollback: boolean;
};

export type AdapterRead = {
  targetRef: string;
  body: string;
  contentType: string;
};

export type AdapterDryRun = {
  targetRef: string;
  before: string;
  after: string;
  summary: string;
};

export type AdapterApplyResult = {
  targetRef: string;
  before: string;
  after: string;
  summary: string;
  branch?: string | undefined;
  commitSha?: string | undefined;
  prUrl?: string | undefined;
  diff?: string | undefined;
};

export type AppliedChange = {
  id: string;
  actionId: string;
  siteId: string;
  targetRef: string;
  before: string;
  after: string;
  summary: string;
  branch?: string | undefined;
  commitSha?: string | undefined;
  prUrl?: string | undefined;
};

export type AdapterVerifyResult = {
  ok: boolean;
  detail: string;
};

export type SiteAdapter = {
  kind: string;
  capabilities(): AdapterCapabilities;
  read(target: ActionTarget): Promise<AdapterRead>;
  dryRun(action: Action): Promise<AdapterDryRun>;
  apply(action: Action): Promise<AdapterApplyResult>;
  verify(change: AppliedChange): Promise<AdapterVerifyResult>;
  rollback(change: AppliedChange): Promise<AdapterApplyResult>;
};

export const DIFF_CAPS: Record<string, { maxBytes: number; maxPct: number }> = {
  rewrite_title: { maxBytes: 120, maxPct: 100 },
  rewrite_meta_description: { maxBytes: 400, maxPct: 100 },
  rewrite_og_title: { maxBytes: 120, maxPct: 100 },
  rewrite_og_description: { maxBytes: 400, maxPct: 100 },
  rewrite_alt_text: { maxBytes: 250, maxPct: 100 },
  fix_heading: { maxBytes: 200, maxPct: 20 },
  add_h1: { maxBytes: 200, maxPct: 20 },
  insert_internal_link: { maxBytes: 400, maxPct: 5 },
  add_jsonld: { maxBytes: 4000, maxPct: 20 },
  update_jsonld: { maxBytes: 4000, maxPct: 20 },
  refresh_content: { maxBytes: 40_000, maxPct: 40 },
  create_page: { maxBytes: 40_000, maxPct: 100 },
  default: { maxBytes: 2000, maxPct: 15 },
};

export const BLAST = {
  maxUrlsPerRun: 25,
  maxPerHour: 40,
  maxPerDay: 80,
  newPagesPerDay: 2,
} as const;

export const TITLE_MAX = 70;
export const META_MAX = 320;
export const ALT_MAX = 200;
export const ANCHOR_MAX = 80;
export const OBSERVE_MIN_MS = 24 * 60 * 60 * 1000;
export const OBSERVE_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;
