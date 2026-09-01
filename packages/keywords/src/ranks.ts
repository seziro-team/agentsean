import type { ProviderStack } from "@agentsean/providers";
import {
  debitProvider,
  remainingBudgetUsd,
  type CostEstimate,
} from "@agentsean/providers";
import type { SqliteDatabase } from "@agentsean/db";
import type { RankRow } from "./types.js";
import { scrapeGoogleSerp } from "@agentsean/providers";

export type RankCheckResult = {
  skipped: boolean;
  reason?: string;
  cadence: "weekly";
  provider: string;
  ranks: RankRow[];
  quotes: CostEstimate[];
};

/**
 * Weekly licensed rank check. Sean never scrapes Google.
 * GSC position remains the free proxy; DataForSEO is the paid upgrade.
 */
export async function runRankCheck(opts: {
  db: SqliteDatabase;
  siteId: string;
  origin: string;
  queries: string[];
  stack: ProviderStack;
  now?: Date;
  dailyBudgetUsd?: number;
  scrapeGoogle?: boolean;
}): Promise<RankCheckResult> {
  if (opts.scrapeGoogle) scrapeGoogleSerp();
  const now = opts.now ?? new Date();
  if (!opts.stack.serp.available) {
    return {
      skipped: true,
      reason: "no_licensed_rank_provider",
      cadence: "weekly",
      provider: "gsc",
      ranks: [],
      quotes: [],
    };
  }
  const quotes: CostEstimate[] = [];
  const ranks: RankRow[] = [];
  const host = hostOf(opts.origin);
  let remaining = remainingBudgetUsd(
    opts.db,
    opts.siteId,
    opts.dailyBudgetUsd ?? 8,
    now,
  );
  for (const query of opts.queries) {
    const call = opts.stack.serp.serp(query);
    quotes.push(call.estimate);
    if (call.estimate.estimatedUsd > remaining) {
      return {
        skipped: ranks.length === 0,
        reason: ranks.length === 0 ? "over_budget" : "partial_budget",
        cadence: "weekly",
        provider: opts.stack.serp.id,
        ranks,
        quotes,
      };
    }
    const result = await call.run();
    debitProvider(opts.db, call.estimate, {
      siteId: opts.siteId,
      actualUsd: call.estimate.estimatedUsd,
    });
    remaining -= call.estimate.estimatedUsd;
    const hit = result.items.find((i) => hostOf(i.url) === host) ?? null;
    ranks.push({
      query,
      url: hit?.url ?? null,
      position: hit?.rank ?? null,
      provider: result.provider,
      estimatedUsd: call.estimate.estimatedUsd,
      actualUsd: call.estimate.estimatedUsd,
    });
  }
  return {
    skipped: false,
    cadence: "weekly",
    provider: opts.stack.serp.id,
    ranks,
    quotes,
  };
}

function hostOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return value.replace(/^www\./, "");
  }
}
