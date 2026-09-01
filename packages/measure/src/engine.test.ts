import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  actions,
  changes,
  gscDaily,
  gscQueryDaily,
  ga4Daily,
  ga4Connections,
  openSqlite,
  pages,
  sites,
} from "@agentsean/db";
import { DISCREPANCY_CAUSES, seedCuratedChangepoints } from "@agentsean/google";
import { estimateLift } from "./estimator.js";
import { guardPeeking } from "./peek.js";
import { registerExperiment, startExperiment } from "./register.js";
import { analyzeExperiment } from "./analyze.js";
import { runMeasureJob } from "./engine.js";
import { refuseUrlAttribution } from "./ladder.js";

function seedSite(db: ReturnType<typeof openSqlite>["db"], now: Date) {
  const id = randomUUID();
  db.insert(sites)
    .values({
      id,
      origin: "https://example.com",
      name: "Example",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .run();
  return id;
}

function addPages(
  db: ReturnType<typeof openSqlite>["db"],
  siteId: string,
  urls: string[],
  now: Date,
) {
  for (const url of urls) {
    db.insert(pages)
      .values({
        id: randomUUID(),
        siteId,
        url,
        urlHash: url,
        firstSeenAt: now.toISOString(),
        inlinkCount: 0,
        outlinkCount: 0,
      })
      .run();
  }
}

describe("Phase 7 measurement honesty", () => {
  it("zero paid keys: GSC + GA4 produce a 17-cause residual and tier-E claims", () => {
    const { db, sqlite } = openSqlite(":memory:");
    const now = new Date("2026-08-20T12:00:00.000Z");
    const siteId = seedSite(db, now);
    addPages(db, siteId, ["https://example.com/"], now);
    db.insert(gscDaily)
      .values({
        id: randomUUID(),
        siteId,
        date: "2026-08-01",
        searchType: "web",
        clicks: 100,
        impressions: 1000,
      })
      .run();
    db.insert(gscQueryDaily)
      .values({
        id: randomUUID(),
        siteId,
        date: "2026-08-01",
        query: "widgets",
        searchType: "web",
        clicks: 53,
        impressions: 400,
      })
      .run();
    db.insert(ga4Daily)
      .values({
        id: randomUUID(),
        siteId,
        date: "2026-08-01",
        sessions: 90,
        organicSessions: 80,
        engagedSessions: 40,
        conversions: 1,
      })
      .run();
    db.insert(ga4Connections)
      .values({
        id: randomUUID(),
        siteId,
        propertyId: "properties/1",
        timeZone: "Europe/Berlin",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .run();
    db.insert(actions)
      .values({
        id: "a1",
        siteId,
        actionType: "rewrite_title",
        targetRef: "https://example.com/",
        risk: "low",
        tier: "1",
        state: "applied",
        createdAt: now.toISOString(),
      })
      .run();
    db.insert(changes)
      .values({
        id: "chg-1",
        actionId: "a1",
        siteId,
        appliedAt: now.toISOString(),
        actor: "sean",
        summary: "Rewrote title",
        revertible: 1,
        revertedAt: null,
      })
      .run();

    const result = runMeasureJob(db, { siteId, now });
    expect(result.power.typicalTier).toBe("E");
    expect(result.power.message).toMatch(/tier E/i);
    expect(result.waterfall).toBeTruthy();
    expect(result.waterfall!.steps).toHaveLength(DISCREPANCY_CAUSES.length);
    expect(result.waterfall!.steps).toHaveLength(17);
    expect(result.waterfall!.residual).toBe(-20);
    expect(result.waterfall!.anonymizedQueryShare).toBeCloseTo(0.47, 1);
    expect(result.waterfall!.euProperty).toBe(true);
    expect(result.waterfall!.euInvisibleShare).toBeGreaterThanOrEqual(0.4);
    expect(result.waterfall!.euInvisibleShare).toBeLessThanOrEqual(0.65);
    expect(
      result.claims.some((c) => c.changeId === "chg-1" && c.evidenceTier === "E"),
    ).toBe(true);
    expect(result.claims.every((c) => c.causationClaimed === false)).toBe(true);
    expect(result.headline).toMatch(/not measurable/i);
    sqlite.close();
  });

  it("blocks peeking before planned_end and refuses a verdict", () => {
    expect(guardPeeking("2026-09-01", new Date("2026-08-01T00:00:00Z")).allowed).toBe(
      false,
    );
    expect(guardPeeking("2026-09-01", new Date("2026-08-01T00:00:00Z")).reason).toMatch(
      /4\.7%/,
    );

    const { db, sqlite } = openSqlite(":memory:");
    const now = new Date("2026-07-01T12:00:00.000Z");
    const siteId = seedSite(db, now);
    const treatment = Array.from(
      { length: 20 },
      (_, i) => `https://example.com/t/${i}`,
    );
    const control = Array.from({ length: 20 }, (_, i) => `https://example.com/c/${i}`);
    addPages(db, siteId, [...treatment, ...control], now);
    const preClicks: Record<string, number> = {};
    for (const u of [...treatment, ...control]) preClicks[u] = 40;
    const registered = registerExperiment(db, {
      siteId,
      hypothesis: "Better titles lift clicks",
      interventionKind: "title",
      design: "split_cohort",
      unit: "page_group",
      preStart: "2026-05-01",
      preEnd: "2026-06-25",
      postStart: "2026-06-26",
      plannedEnd: "2026-08-20",
      treatmentUrls: treatment,
      controlUrls: control,
      preClicks,
    });
    expect(registered.status).toBe("planned");
    startExperiment(db, registered);
    const early = analyzeExperiment(db, {
      experimentId: registered.experiment.id,
      now: new Date("2026-07-01T12:00:00Z"),
      treatment: treatment.map((url) => ({ url, preClicks: 40, postClicks: 80 })),
      control: control.map((url) => ({ url, preClicks: 40, postClicks: 41 })),
    });
    expect(early.peeking).toBe(true);
    expect(early.evidenceTier).toBeNull();
    expect(early.causationClaimed).toBe(false);
    expect(early.statement).toMatch(/peeking blocked/i);
    sqlite.close();
  });

  it("concludes a powered split as tier A after the analysis date", () => {
    const { db, sqlite } = openSqlite(":memory:");
    const now = new Date("2026-08-21T12:00:00.000Z");
    const siteId = seedSite(db, now);
    seedCuratedChangepoints(db);
    const treatment = Array.from(
      { length: 100 },
      (_, i) => `https://example.com/t/${i}`,
    );
    const control = Array.from({ length: 100 }, (_, i) => `https://example.com/c/${i}`);
    addPages(db, siteId, [...treatment, ...control], now);
    const preClicks: Record<string, number> = {};
    for (const u of [...treatment, ...control]) preClicks[u] = 20;
    const registered = registerExperiment(db, {
      siteId,
      hypothesis: "Title rewrite on the blog template",
      interventionKind: "title",
      design: "split_cohort",
      unit: "template",
      preStart: "2026-05-01",
      preEnd: "2026-06-25",
      postStart: "2026-06-26",
      plannedEnd: "2026-08-20",
      treatmentUrls: treatment,
      controlUrls: control,
      preClicks,
      randomisationSeed: 42,
    });
    startExperiment(db, registered);
    const tSeries = treatment.map((url) => ({ url, preClicks: 20, postClicks: 32 }));
    const cSeries = control.map((url) => ({ url, preClicks: 20, postClicks: 21 }));
    const est = estimateLift(tSeries, cSeries, { seed: 42, nBoot: 400 });
    expect(est.lift).toBeGreaterThan(0.3);
    const done = analyzeExperiment(db, {
      experimentId: registered.experiment.id,
      now,
      treatment: tSeries,
      control: cSeries,
    });
    expect(done.peeking).toBe(false);
    expect(done.evidenceTier).toBe("A");
    expect(done.causationClaimed).toBe(true);
    expect(done.statement).not.toMatch(/\bnull\b/);
    sqlite.close();
  });

  it("refuses to start an underpowered test (MDE > 40%)", () => {
    const { db, sqlite } = openSqlite(":memory:");
    const now = new Date("2026-08-01T12:00:00.000Z");
    const siteId = seedSite(db, now);
    const treatment = ["https://example.com/a"];
    const control = ["https://example.com/b"];
    addPages(db, siteId, [...treatment, ...control], now);
    const registered = registerExperiment(db, {
      siteId,
      hypothesis: "Tiny cohort",
      interventionKind: "title",
      design: "split_cohort",
      unit: "page_group",
      preStart: "2026-07-01",
      preEnd: "2026-07-14",
      postStart: "2026-07-15",
      plannedEnd: "2026-07-28",
      treatmentUrls: treatment,
      controlUrls: control,
      preClicks: { "https://example.com/a": 2, "https://example.com/b": 2 },
    });
    expect(registered.status).toBe("refused");
    expect(registered.reason).toMatch(/40%/);
    sqlite.close();
  });

  it("never emits per-URL click attribution", () => {
    expect(() => refuseUrlAttribution("https://example.com/x")).toThrow(
      /never the URL/i,
    );
  });
});
