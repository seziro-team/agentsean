/** One interface per capability. Cost is quoted before the call. */

export const CAPABILITIES = ["serp", "keywords", "backlinks", "volume"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type CostEstimate = {
  provider: string;
  capability: Capability;
  operation: string;
  units: number;
  unitUsd: number;
  estimatedUsd: number;
  free: boolean;
  notes?: string;
};

export type ProviderCall<T> = {
  estimate: CostEstimate;
  run: () => Promise<T>;
};

export type KeywordRow = {
  query: string;
  source: string;
  clicks?: number;
  impressions?: number;
  position?: number | null;
  page?: string | null;
  volume?: number | null;
  relatedTo?: string;
};

export type VolumeRow = {
  query: string;
  volume: number | null;
  source: string;
  country?: string;
};

export type SerpItem = {
  rank: number;
  url: string;
  title: string;
  snippet?: string;
};

export type SerpResult = {
  query: string;
  provider: string;
  items: SerpItem[];
  paa?: string[];
  related?: string[];
};

export type BacklinkOverview = {
  target: string;
  provider: string;
  /** OpenPageRank is an authority proxy, not a backlink graph. */
  kind: "authority_proxy" | "backlinks";
  pageRank?: number | null;
  rank?: number | null;
  referringDomains?: number | null;
  backlinks?: number | null;
};

export type KeywordsCapability = {
  id: string;
  demand(opts: { queries: KeywordRow[] }): ProviderCall<KeywordRow[]>;
  related(seed: string, opts?: { limit?: number }): ProviderCall<KeywordRow[]>;
};

export type VolumeCapability = {
  id: string;
  volume(queries: string[], opts?: { country?: string }): ProviderCall<VolumeRow[]>;
};

export type SerpCapability = {
  id: string;
  available: boolean;
  serp(query: string, opts?: { location?: string }): ProviderCall<SerpResult>;
};

export type BacklinksCapability = {
  id: string;
  available: boolean;
  overview(target: string): ProviderCall<BacklinkOverview>;
};

export type ExtractPage = {
  url: string;
  title?: string;
  text: string;
  provider: string;
};

export type EntityHit = {
  id: string;
  label: string;
  description?: string;
  url?: string;
};

export type WaybackCapture = {
  url: string;
  timestamp: string;
  status?: string;
  original?: string;
};

export type ProviderKeys = {
  dataforseo?: string;
  bing?: string;
  openpagerank?: string;
};

export type ProviderStack = {
  keywords: KeywordsCapability;
  volume: VolumeCapability;
  serp: SerpCapability;
  backlinks: BacklinksCapability;
  keys: {
    dataforseo: boolean;
    bing: boolean;
    openpagerank: boolean;
  };
  paidUpgrade: boolean;
};
