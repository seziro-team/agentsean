import { eq } from "drizzle-orm";
import { openSqlite, sites } from "@agentsean/db";
import { brandTermsFromOrigin } from "@agentsean/scheduler";
import {
  createBingClient,
  createProviderStack,
  loadProviderKeys,
} from "@agentsean/providers";
import {
  createHashEmbeddings,
  loadGscQueries,
  runKeywordsJob,
} from "@agentsean/keywords";
import {
  dbPath,
  defaultSeanHome,
  ensureSeanHome,
  getSettingNumber,
  openDaemonStore,
} from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function keywordsCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const { db, sqlite } = openSqlite(dbPath(home));
  try {
    const site = opts.target
      ? db.select().from(sites).where(eq(sites.origin, opts.target)).get()
      : db.select().from(sites).all()[0];
    if (!site) {
      emitError(
        opts.json,
        { command: "keywords", error: "unknown_site" },
        "No site in the database. Run `sean audit https://example.com` first.",
      );
      return 2;
    }
    const store = openDaemonStore(home);
    const keys = await loadProviderKeys(store);
    const gsc = loadGscQueries(db, site.id);
    const stack = createProviderStack({
      keys,
      gsc: gsc.map((r) => ({
        query: r.query,
        source: "gsc",
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      })),
    });
    const bing = keys.bing ? createBingClient({ apiKey: keys.bing }) : null;
    const result = await runKeywordsJob(db, {
      siteId: site.id,
      origin: site.origin,
      stack,
      gsc,
      brandTerms: brandTermsFromOrigin(site.origin),
      embeddings: createHashEmbeddings(),
      dailyBudgetUsd: getSettingNumber(db, "budgetUsdDaily", 8),
      ...(bing
        ? {
            expand: (seed: string) => bing.getRelatedKeywords(seed),
          }
        : {}),
    });
    emit(
      opts.json,
      {
        command: "keywords",
        ok: true,
        paidUpgrade: result.paidUpgrade,
        opportunities: result.opportunities.length,
        clusters: result.clusters.length,
        strikingDistance: result.strikingDistance.length,
        ranks: result.ranks.length,
        embeddingsModel: result.embeddingsModel,
        difficultyNote: result.difficultyNote,
        quotes: result.quotes,
        reason: result.reason ?? null,
      },
      result.paidUpgrade
        ? `Keywords: ${result.opportunities.length} opportunities, ${result.clusters.length} clusters, ${result.ranks.length} licensed ranks. DataForSEO upgrade is on.`
        : `Keywords: ${result.opportunities.length} opportunities, ${result.clusters.length} clusters from GSC + Bing (zero paid keys). Add a DataForSEO key to upgrade ranks in place.`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
