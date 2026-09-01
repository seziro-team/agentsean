import type { CostEstimate, KeywordRow } from "@agentsean/providers";
import { clusterQueries, urlsFromSerp } from "./cluster.js";
import { trainDifficulty } from "./difficulty.js";
import { createEmbeddings } from "./embeddings.js";
import {
  demandOpportunities,
  expansionOpportunities,
  strikingDistance,
} from "./opportunities.js";
import { saveClusters, saveKeywords, saveRanks } from "./persist.js";
import { runRankCheck } from "./ranks.js";
import type { KeywordsJobOptions, KeywordsJobResult, Opportunity } from "./types.js";
import type { SqliteDatabase } from "@agentsean/db";

export async function runKeywordsJob(
  db: SqliteDatabase,
  opts: KeywordsJobOptions,
): Promise<KeywordsJobResult> {
  const now = opts.now ?? new Date();
  const quotes: CostEstimate[] = [];
  const embeddings = opts.embeddings ?? createEmbeddings();
  const demand = demandOpportunities(opts.gsc);
  const strike = strikingDistance(opts.gsc);
  const known = new Set(demand.map((d) => d.query.toLowerCase()));
  const related: KeywordRow[] = [];

  const seeds = opts.expandSeeds ?? strike.slice(0, 5).map((s) => s.query);
  for (const seed of seeds.slice(0, 5)) {
    const fromGsc = opts.stack.keywords.related(seed);
    quotes.push(fromGsc.estimate);
    related.push(...(await fromGsc.run()));
    if (opts.expand) {
      try {
        related.push(...(await opts.expand(seed)));
      } catch {
        // expansion (Bing / autocomplete) is best-effort; GSC demand still stands
      }
    }
  }

  const expansion = expansionOpportunities(related, known);
  const difficulty = trainDifficulty(opts.gsc, opts.brandTerms ?? []);
  const merged: Opportunity[] = [];
  const seen = new Set<string>();
  for (const row of [...strike, ...demand, ...expansion]) {
    const key = row.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...row,
      difficulty: difficulty.predict(row.query, row.impressions),
    });
  }

  saveKeywords(db, opts.siteId, merged, now);

  const serpMap = new Map<string, string[]>();
  if (opts.serpForCluster && opts.stack.serp.available) {
    for (const q of merged.slice(0, 10).map((m) => m.query)) {
      const result = await opts.serpForCluster(q);
      if (result) serpMap.set(q, urlsFromSerp(result));
    }
  }

  const clusters = await clusterQueries(
    merged.map((m) => m.query),
    embeddings,
    serpMap.size ? { serp: serpMap } : undefined,
  );
  saveClusters(db, opts.siteId, clusters, now);

  const track = merged
    .filter((m) => m.kind === "striking_distance" || m.kind === "demand")
    .slice(0, opts.trackLimit ?? 50)
    .map((m) => m.query);
  const ranks = await runRankCheck({
    db,
    siteId: opts.siteId,
    origin: opts.origin,
    queries: track,
    stack: opts.stack,
    now,
    ...(opts.dailyBudgetUsd !== undefined ? { dailyBudgetUsd: opts.dailyBudgetUsd } : {}),
  });
  quotes.push(...ranks.quotes);
  if (!ranks.skipped) saveRanks(db, opts.siteId, ranks.ranks, now);

  return {
    paidUpgrade: opts.stack.paidUpgrade,
    opportunities: merged,
    clusters,
    strikingDistance: strike.map((s) =>
      Object.assign({}, s, { difficulty: difficulty.predict(s.query, s.impressions) }),
    ),
    ranks: ranks.ranks,
    quotes,
    embeddingsModel: embeddings.model,
    difficultyNote: difficulty.note,
    ...(ranks.reason ? { reason: ranks.reason } : {}),
  };
}
