import type {
  CostEstimate,
  KeywordRow,
  ProviderStack,
  SerpResult,
} from "@agentsean/providers";

export type QueryDaily = {
  date: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
  page?: string | null;
};

export type Opportunity = {
  query: string;
  kind: "striking_distance" | "demand" | "expansion";
  clicks: number;
  impressions: number;
  position: number | null;
  page: string | null;
  volume: number | null;
  difficulty: number | null;
  source: string;
};

export type Cluster = {
  id: string;
  label: string;
  members: string[];
  serpConfirmed: boolean;
};

export type RankRow = {
  query: string;
  url: string | null;
  position: number | null;
  provider: string;
  estimatedUsd: number;
  actualUsd: number;
};

export type Embeddings = {
  model: string;
  dim: number;
  embed(text: string): number[] | Promise<number[]>;
};

export type VectorHit = { id: string; score: number };

export type VectorStore = {
  upsert(id: string, vector: number[]): void;
  knn(vector: number[], k: number): VectorHit[];
};

export type DifficultyModel = {
  trained: boolean;
  samples: number;
  note: string;
  predict(query: string, impressions: number): number | null;
};

export type KeywordsJobResult = {
  skipped?: boolean;
  reason?: string;
  paidUpgrade: boolean;
  opportunities: Opportunity[];
  clusters: Cluster[];
  strikingDistance: Opportunity[];
  ranks: RankRow[];
  quotes: CostEstimate[];
  embeddingsModel: string;
  difficultyNote: string;
};

export type KeywordsJobOptions = {
  siteId: string;
  origin: string;
  now?: Date;
  stack: ProviderStack;
  gsc: QueryDaily[];
  brandTerms?: string[];
  embeddings?: Embeddings;
  serpForCluster?: (query: string) => Promise<SerpResult | null>;
  expandSeeds?: string[];
  expand?: (seed: string) => Promise<KeywordRow[]>;
  dailyBudgetUsd?: number;
  trackLimit?: number;
};

export type { KeywordRow };
