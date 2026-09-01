export type {
  QueryDaily,
  Opportunity,
  Cluster,
  RankRow,
  Embeddings,
  VectorStore,
  VectorHit,
  DifficultyModel,
  KeywordsJobResult,
  KeywordsJobOptions,
} from "./types.js";
export {
  createHashEmbeddings,
  createHttpEmbeddings,
  createEmbeddings,
  cosine,
  COSINE_MERGE,
  HASH_DIM,
} from "./embeddings.js";
export { createMemoryVectorStore, createLanceVectorStore } from "./vectors.js";
export { clusterQueries, confirmSerpMerges, urlsFromSerp } from "./cluster.js";
export { trainDifficulty, features } from "./difficulty.js";
export {
  strikingDistance,
  demandOpportunities,
  expansionOpportunities,
  aggregateQueries,
} from "./opportunities.js";
export { runRankCheck, type RankCheckResult } from "./ranks.js";
export { runKeywordsJob } from "./engine.js";
export { loadGscQueries } from "./gsc.js";
export {
  saveKeywords,
  saveClusters,
  saveRanks,
  listKeywords,
  listClusters,
  listRanks,
} from "./persist.js";
