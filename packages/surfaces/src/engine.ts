import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  aiCitations,
  aiRuns,
  bingAiRows,
  pages,
  sites,
  verticalProfiles,
  type SqliteDatabase,
} from "@agentsean/db";
import { KIND_TIER } from "@agentsean/actions";
import type { GenerateFn } from "@agentsean/llm";
import { bingCitationShare, parseBingAiCsv } from "./bing-ai.js";
import { PANEL_COST_USD } from "./honest.js";
import { listGbpLocations, localCitationGap } from "./gbp.js";
import {
  discoverMentions,
  findInbound404s,
  listMentions,
  saveInbound404s,
  saveMentions,
} from "./offpage.js";
import { runPromptPanel } from "./panel.js";
import {
  contentGenerationBlocked,
  detectVertical,
  verticalRules,
  ymylCategoryFor,
  type VerticalInput,
  type VerticalPreset,
} from "./verticals.js";

export type SurfacesJobResult = {
  citationShare: number;
  shareOfVoice: number;
  estimatedUsd: number;
  bingShare: number | null;
  vertical: VerticalPreset;
  verticalConfidence: number;
  suppressedChecks: number;
  mentions: number;
  inbound404s: number;
  gbpLocations: number;
  aiCitationGap: boolean;
  generationBlocked: boolean;
  rules: string[];
};

export function runVerticalDetect(
  db: SqliteDatabase,
  siteId: string,
  extra?: Partial<VerticalInput>,
): ReturnType<typeof detectVertical> {
  const pageRows = db.select().from(pages).where(eq(pages.siteId, siteId)).all();
  const urls = pageRows.map((p) => p.url);
  const titles = pageRows.map((p) => p.title ?? "");
  const input: VerticalInput = {
    urls,
    titles,
    jsonLdTypes: extra?.jsonLdTypes ?? [],
    outboundSponsoredShare: extra?.outboundSponsoredShare ?? 0,
    telLinkShare: extra?.telLinkShare ?? 0,
    gscNewsRows: extra?.gscNewsRows ?? 0,
    gscDiscoverShare: extra?.gscDiscoverShare ?? 0,
    newsSitemap: extra?.newsSitemap ?? false,
    publishVelocity30d: extra?.publishVelocity30d ?? 0,
    jobPostingCount: extra?.jobPostingCount ?? 0,
    sitemapUrlCount: extra?.sitemapUrlCount ?? urls.length,
    productSellerVaries: extra?.productSellerVaries ?? false,
    profileUrlCount: extra?.profileUrlCount ?? 0,
    localityCount: extra?.localityCount ?? 0,
    eeaTrafficShare: extra?.eeaTrafficShare ?? 0,
    hasPricing: urls.some((u) => /\/pricing\b/i.test(u)),
    hasDemoOrSignup: urls.some((u) => /\/(demo|signup|free-trial)\b/i.test(u)),
    hasComparePaths: urls.some((u) =>
      /\/(vs|alternatives|compare|integrations)\b/i.test(u),
    ),
    medicalLexiconShare: extra?.medicalLexiconShare ?? 0,
  };
  const detected = detectVertical(input);
  const existing = db
    .select()
    .from(verticalProfiles)
    .where(eq(verticalProfiles.siteId, siteId))
    .get();
  const values = {
    preset: detected.preset,
    confidence: detected.confidence,
    signalsJson: JSON.stringify(detected.signals),
    answersJson: existing?.answersJson ?? "{}",
    suppressedChecks: detected.suppressedChecks,
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    db.update(verticalProfiles)
      .set(values)
      .where(eq(verticalProfiles.id, existing.id))
      .run();
  } else {
    db.insert(verticalProfiles)
      .values({ id: randomUUID(), siteId, ...values })
      .run();
  }
  const cat = ymylCategoryFor(detected.preset);
  if (cat) {
    db.update(sites)
      .set({ ymylCategory: cat, updatedAt: new Date().toISOString() })
      .where(eq(sites.id, siteId))
      .run();
  }
  return detected;
}

export async function runSurfacesJob(
  db: SqliteDatabase,
  opts: {
    siteId: string;
    origin: string;
    brand?: string | undefined;
    generate?: GenerateFn | undefined;
    bingCsv?: string | undefined;
    mentionPages?: Array<{ url: string; text: string; links: string[] }> | undefined;
    crawl404s?:
      Array<{ url: string; statusCode: number | null; inlinks: string[] }> | undefined;
    now?: Date | undefined;
  },
): Promise<SurfacesJobResult> {
  const now = opts.now ?? new Date();
  const brand =
    opts.brand ??
    new URL(opts.origin).hostname.replace(/^www\./, "").split(".")[0] ??
    "brand";
  const detected = runVerticalDetect(db, opts.siteId);

  let citationShare = 0;
  let shareOfVoice = 0;
  let estimatedUsd = 0;
  if (opts.generate) {
    const panel = await runPromptPanel({
      origin: opts.origin,
      brand,
      generate: opts.generate,
    });
    citationShare = panel.citationShare;
    shareOfVoice = panel.shareOfVoice;
    estimatedUsd = panel.estimatedUsd;
    const runId = randomUUID();
    db.insert(aiRuns)
      .values({
        id: runId,
        siteId: opts.siteId,
        engine: "panel",
        promptCount: panel.hits.length,
        citationShare,
        shareOfVoice,
        estimatedUsd,
        ranAt: now.toISOString(),
      })
      .run();
    for (const hit of panel.hits) {
      db.insert(aiCitations)
        .values({
          id: randomUUID(),
          runId,
          engine: hit.engine,
          prompt: hit.prompt,
          citedUrl: hit.citedUrl,
          citedDomain: hit.citedDomain,
          isOurs: hit.isOurs ? 1 : 0,
        })
        .run();
    }
  }

  let bingShare: number | null = null;
  if (opts.bingCsv) {
    const rows = parseBingAiCsv(opts.bingCsv);
    bingShare = bingCitationShare(rows);
    for (const row of rows) {
      db.insert(bingAiRows)
        .values({
          id: randomUUID(),
          siteId: opts.siteId,
          date: row.date,
          groundingQuery: row.groundingQuery,
          citations: row.citations,
          citationShare: row.citationShare,
          source: "csv",
        })
        .run();
    }
    if (!opts.generate) citationShare = bingShare;
  }

  const mentionPages = opts.mentionPages ?? [];
  const found = discoverMentions({
    brand,
    originHost: new URL(opts.origin).hostname,
    pages: mentionPages,
  });
  saveMentions(db, opts.siteId, found, now);
  const broken = findInbound404s(opts.crawl404s ?? []);
  const inboundN = saveInbound404s(db, opts.siteId, broken, now);

  const gbps = listGbpLocations(db, opts.siteId);
  const gap = localCitationGap({
    gbpListed: gbps.length > 0,
    aiMentions: listMentions(db, opts.siteId).length,
    localPackVisible: gbps.length > 0,
  });

  return {
    citationShare,
    shareOfVoice,
    estimatedUsd: estimatedUsd || (opts.generate ? PANEL_COST_USD : 0),
    bingShare,
    vertical: detected.preset,
    verticalConfidence: detected.confidence,
    suppressedChecks: detected.suppressedChecks,
    mentions: listMentions(db, opts.siteId).length,
    inbound404s: inboundN,
    gbpLocations: gbps.length,
    aiCitationGap: gap.gap,
    generationBlocked: contentGenerationBlocked(detected.preset),
    rules: verticalRules(detected.preset),
  };
}

export function saveOnboardingAnswers(
  db: SqliteDatabase,
  siteId: string,
  answers: Record<string, string>,
): ReturnType<typeof detectVertical> {
  const detected = runVerticalDetect(db, siteId);
  const existing = db
    .select()
    .from(verticalProfiles)
    .where(eq(verticalProfiles.siteId, siteId))
    .get();
  if (existing) {
    db.update(verticalProfiles)
      .set({
        answersJson: JSON.stringify(answers),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(verticalProfiles.id, existing.id))
      .run();
  }
  return detected;
}

export function t4CityServiceIsRefused(): boolean {
  return KIND_TIER.create_city_service_page === 4;
}
