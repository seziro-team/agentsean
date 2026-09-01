import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KIND_TIER } from "@agentsean/actions";
import { openSqlite, pages, sites } from "@agentsean/db";
import { analyzeAiRobots } from "@agentsean/analyzers";
import { parseBingAiCsv } from "./bing-ai.js";
import {
  applyGbpEdit,
  GbpNotApprovedError,
  GbpQuotaError,
  GBP_EDITS_PER_MIN,
  refuseCityServicePages,
  refuseGbpTitleWrite,
  refuseReviewGeneration,
  upsertGbpLocation,
} from "./gbp.js";
import {
  AEO_REFUSALS,
  refuseAeoLever,
  PANEL_COST_USD,
  PANEL_PROMPTS,
} from "./honest.js";
import {
  discoverMentions,
  findInbound404s,
  refuseDisavowWithoutManualAction,
  refuseUnauthedSend,
} from "./offpage.js";
import {
  citationShare,
  defaultPrompts,
  parseCitations,
  runPromptPanel,
} from "./panel.js";
import {
  contentGenerationBlocked,
  detectVertical,
  ONBOARDING_QUESTIONS,
  scoreSignals,
} from "./verticals.js";
import { runSurfacesJob } from "./engine.js";

function seedSite() {
  const { db, sqlite } = openSqlite(":memory:");
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(sites)
    .values({
      id,
      origin: "https://acme.example",
      name: "Acme",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(pages)
    .values({
      id: randomUUID(),
      siteId: id,
      url: "https://acme.example/pricing",
      urlHash: "p",
      title: "Pricing",
      firstSeenAt: now,
      inlinkCount: 0,
      outlinkCount: 0,
    })
    .run();
  db.insert(pages)
    .values({
      id: randomUUID(),
      siteId: id,
      url: "https://acme.example/demo",
      urlHash: "d",
      title: "Demo",
      firstSeenAt: now,
      inlinkCount: 0,
      outlinkCount: 0,
    })
    .run();
  return { db, sqlite, id };
}

describe("Phase 9 surfaces", () => {
  it("reports citation share from a 20×2 prompt panel", async () => {
    expect(defaultPrompts("Acme", "CRM").length).toBe(PANEL_PROMPTS);
    const origin = "https://acme.example";
    const parsed = parseCitations(
      "See https://acme.example/docs and https://rival.test/x",
      "acme.example",
    );
    expect(parsed.some((p) => p.isOurs)).toBe(true);
    const panel = await runPromptPanel({
      origin,
      brand: "Acme",
      generate: async ({ prompt }) => ({
        text: prompt.includes("What is")
          ? "Acme is a CRM. https://acme.example/"
          : "Others. https://other.test/",
        model: "test",
        class: "cheap",
        provider: "ollama",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
        cached: false,
      }),
    });
    expect(panel.estimatedUsd).toBe(PANEL_COST_USD);
    expect(panel.hits.length).toBeGreaterThan(0);
    expect(citationShare(panel.hits)).toBeGreaterThanOrEqual(0);
  });

  it("refuses schema/length/llms.txt as AEO levers and splits training vs citation crawlers", () => {
    expect(AEO_REFUSALS).toHaveLength(3);
    expect(refuseAeoLever("Add schema markup to win AI citations")).toMatch(
      /no measurable effect/i,
    );
    const split = analyzeAiRobots(
      `User-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n`,
    );
    expect(split.conflatesTrainingAndCitation).toBe(true);
    expect(split.blockedCitation.length).toBeGreaterThan(0);
    const ok = analyzeAiRobots(
      `User-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n`,
    );
    expect(ok.conflatesTrainingAndCitation).toBe(false);
  });

  it("ingests Bing AI Performance CSV (no API)", () => {
    const rows = parseBingAiCsv(`date,grounding_query,citations,citation_share
2026-08-01,best crm,10,0.2
2026-08-01,acme crm,5,0.5`);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.groundingQuery).toBe("best crm");
  });

  it("manages GBP within the 10 edits/min cap and refuses title/review/city pages", async () => {
    const { db, sqlite, id } = seedSite();
    const locId = upsertGbpLocation(db, id, {
      locationName: "locations/123",
      title: "Acme",
      primaryCategory: "Software company",
      approvalStatus: "none",
    });
    await expect(
      applyGbpEdit(db, id, {
        locationId: locId,
        kind: "hours",
        payload: { open: true },
      }),
    ).rejects.toBeInstanceOf(GbpNotApprovedError);
    upsertGbpLocation(db, id, {
      id: locId,
      locationName: "locations/123",
      title: "Acme",
      primaryCategory: "Software company",
      approvalStatus: "approved",
    });
    await expect(
      applyGbpEdit(db, id, {
        locationId: locId,
        kind: "title",
        payload: { title: "Acme CRM Seattle" },
      }),
    ).rejects.toThrow(/title/);
    const now = new Date("2026-09-01T00:00:00Z");
    for (let i = 0; i < GBP_EDITS_PER_MIN; i++) {
      await applyGbpEdit(
        db,
        id,
        { locationId: locId, kind: "hours", payload: { n: i } },
        now,
      );
    }
    await expect(
      applyGbpEdit(
        db,
        id,
        { locationId: locId, kind: "hours", payload: { n: 99 } },
        now,
      ),
    ).rejects.toBeInstanceOf(GbpQuotaError);
    expect(() => refuseReviewGeneration()).toThrow(/T4/);
    expect(() => refuseCityServicePages()).toThrow(/doorway/);
    expect(() => refuseGbpTitleWrite()).toThrow(/title/);
    expect(KIND_TIER.create_city_service_page).toBe(4);
    expect(KIND_TIER.gate_reviews).toBe(4);
    sqlite.close();
  });

  it("surfaces unlinked brand mentions and inbound-404 recovery; outreach send is T3", () => {
    const found = discoverMentions({
      brand: "acme",
      originHost: "acme.example",
      pages: [
        {
          url: "https://news.test/post",
          text: "We used Acme for onboarding.",
          links: ["https://other.test/"],
        },
      ],
    });
    expect(found[0]?.linked).toBe(false);
    const broken = findInbound404s([
      {
        url: "https://acme.example/old",
        statusCode: 404,
        inlinks: ["https://acme.example/"],
      },
    ]);
    expect(broken).toHaveLength(1);
    expect(() => refuseUnauthedSend()).toThrow(/T3/);
    expect(() => refuseDisavowWithoutManualAction()).toThrow(/manual action/);
    expect(KIND_TIER.send_outreach_email).toBe(3);
  });

  it("auto-detects B2B SaaS, blocks affiliate/YMYL generation, and asks six questions", () => {
    expect(ONBOARDING_QUESTIONS).toHaveLength(6);
    const input = {
      urls: [
        "https://acme.example/pricing",
        "https://acme.example/demo",
        "https://acme.example/vs/foo",
      ],
      titles: ["Pricing"],
      jsonLdTypes: ["SoftwareApplication"],
      outboundSponsoredShare: 0,
      telLinkShare: 0,
      gscNewsRows: 0,
      gscDiscoverShare: 0,
      newsSitemap: false,
      publishVelocity30d: 0,
      jobPostingCount: 0,
      sitemapUrlCount: 40,
      productSellerVaries: false,
      profileUrlCount: 0,
      localityCount: 0,
      eeaTrafficShare: 0,
      hasPricing: true,
      hasDemoOrSignup: true,
      hasComparePaths: true,
      medicalLexiconShare: 0,
    };
    expect(scoreSignals(input)).toHaveLength(24);
    const saas = detectVertical(input);
    expect(saas.preset).toBe("b2b_saas");
    expect(saas.v1).toBe(true);
    expect(contentGenerationBlocked("affiliate_review")).toBe(true);
    expect(contentGenerationBlocked("ymyl")).toBe(true);
    expect(contentGenerationBlocked("b2b_saas")).toBe(false);
  });

  it("exit: citation share + GBP-in-quota + mentions + vertical rules in one job", async () => {
    const { db, sqlite, id } = seedSite();
    upsertGbpLocation(db, id, {
      locationName: "locations/1",
      title: "Acme",
      primaryCategory: "Software company",
      approvalStatus: "approved",
    });
    const result = await runSurfacesJob(db, {
      siteId: id,
      origin: "https://acme.example",
      brand: "Acme",
      bingCsv: "date,q,c,s\n2026-08-01,best crm,8,0.25",
      mentionPages: [
        { url: "https://news.test/x", text: "Acme shipped a CRM", links: [] },
      ],
      generate: async () => ({
        text: "Acme https://acme.example/pricing",
        model: "t",
        class: "cheap",
        provider: "ollama",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
        cached: false,
      }),
    });
    expect(result.citationShare).toBeGreaterThan(0);
    expect(result.vertical).toBe("b2b_saas");
    expect(result.gbpLocations).toBe(1);
    expect(result.mentions).toBeGreaterThan(0);
    expect(result.generationBlocked).toBe(false);
    sqlite.close();
  });
});
