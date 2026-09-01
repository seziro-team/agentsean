export const EVIDENCE_TIERS = ["A", "B", "C", "D", "E"] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export const EVIDENCE_MEANING: Record<EvidenceTier, string> = {
  A: "Controlled experiment with a matched cohort, pre-registered, sufficient power",
  B: "Matched-cohort observational, effect exceeds MDE",
  C: "Pre/post with a Google-update annotation join, effect exceeds MDE",
  D: "Directional signal only, below MDE",
  E: "Applied; not measurable at this site's traffic volume",
};

export const DEFAULT_EVIDENCE_TIER: EvidenceTier = "E";

export const EXPERIMENT_STATUSES = [
  "planned",
  "running",
  "analysing",
  "concluded",
  "abandoned",
  "refused",
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const EXPERIMENT_DESIGNS = ["split_cohort", "its_with_control_pool", "uncontrolled"] as const;
export type ExperimentDesign = (typeof EXPERIMENT_DESIGNS)[number];

export const EXPERIMENT_UNITS = ["page_group", "template", "section"] as const;
export type ExperimentUnit = (typeof EXPERIMENT_UNITS)[number];

export const COHORT_ARMS = ["treatment", "control", "reserve"] as const;
export type CohortArm = (typeof COHORT_ARMS)[number];

export const SUPPRESSION_RULES = [
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
] as const;
export type SuppressionRule = (typeof SUPPRESSION_RULES)[number];

export type PageSeries = {
  url: string;
  preClicks: number;
  postClicks: number;
  preImpressions?: number | undefined;
  postImpressions?: number | undefined;
};

export type Estimate = {
  lift: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  probPositive: number;
  nBoot: number;
};

export type PowerBrief = {
  monthlyClicks: number;
  pageCount: number;
  windowDays: number;
  pagesPerArm: number;
  prePostMde: number;
  splitMde: number;
  belowIndustryBar: boolean;
  underpowered: boolean;
  typicalTier: EvidenceTier;
  message: string;
};

export type ClaimRecord = {
  id: string;
  siteId: string;
  changeId: string | null;
  experimentId: string | null;
  evidenceTier: EvidenceTier;
  statement: string;
  metric: string;
  causationClaimed: boolean;
  refusedReason: string | null;
  createdAt: string;
};

export type ExperimentSpec = {
  siteId: string;
  hypothesis: string;
  interventionKind: string;
  design: ExperimentDesign;
  unit: ExperimentUnit;
  preStart: string;
  preEnd: string;
  postStart: string;
  plannedEnd: string;
  primaryMetric?: string | undefined;
  powerTarget?: number | undefined;
  alpha?: number | undefined;
  randomisationSeed?: number | undefined;
  clusterKey?: string | undefined;
  treatmentUrls: string[];
  controlUrls: string[];
  reserveUrls?: string[] | undefined;
  preClicks?: Record<string, number> | undefined;
  preImpressions?: Record<string, number> | undefined;
  contentHashAtStart?: Record<string, string> | undefined;
};

export type AnalysisInput = {
  experimentId: string;
  now: Date;
  treatment: PageSeries[];
  control: PageSeries[];
  reserve?: PageSeries[] | undefined;
  overlappingIncidentTitles?: string[] | undefined;
  overlappingAnomalies?: Array<{ id: string; metrics: string[] }> | undefined;
  metric?: string | undefined;
};
