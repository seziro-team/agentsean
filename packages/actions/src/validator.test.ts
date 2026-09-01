import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KIND_TIER } from "./kinds.js";
import { parseAction } from "./payloads.js";
import { validateAction } from "./validator.js";
import { proposeTitle } from "./planner.js";
import type { Action, ValidationContext } from "./types.js";

const pageId = "11111111-1111-4111-8111-111111111111";
const siteId = "22222222-2222-4222-8222-222222222222";
const findingId = "33333333-3333-4333-8333-333333333333";
const hrefId = "44444444-4444-4444-8444-444444444444";
const KEY = Buffer.alloc(32, 7);

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  const page = {
    id: pageId,
    url: "https://example.com/",
    title: "Hi",
    metaDescription: null,
    h1: "Welcome to Example Products Home",
  };
  const href = {
    id: hrefId,
    url: "https://example.com/about",
    title: "About",
    metaDescription: null,
    h1: "About",
  };
  return {
    now: new Date("2026-09-01T00:00:00.000Z"),
    site: {
      id: siteId,
      origin: "https://example.com",
      autonomyMode: "full_auto",
      observeUntil: "2026-08-01T00:00:00.000Z",
      ymylCategory: null,
      killswitch: 0,
      neverTouchGlobs: [],
      createdAt: "2026-07-01T00:00:00.000Z",
    },
    pages: [page, href],
    allowlist: [],
    entities: [
      { entity: "https://example.com/", source: "crawl" },
      { entity: "https://example.com/about", source: "crawl" },
    ],
    appliedThisRun: 0,
    appliedThisHour: 0,
    appliedThisDay: 0,
    newPagesToday: 0,
    contentRefreshToday: 0,
    spentUsdToday: 0,
    budgetUsdDaily: 8,
    estimatedCostUsd: 0,
    twoKeyApprovals: [],
    halted: false,
    beforeText: 'export const metadata = { title: "Hi" };\n',
    afterText:
      'export const metadata = { title: "Welcome to Example Products Home" };\n',
    runId: "run-1",
    approvalKey: KEY,
    ...over,
  };
}

function titleAction(over: Partial<Action> = {}): Action {
  return {
    id: randomUUID(),
    siteId,
    kind: "rewrite_title",
    tier: KIND_TIER.rewrite_title,
    target: { pageId, url: "https://example.com/" },
    payload: { title: "Welcome to Example Products Home" },
    rationale: ["Fix a short title from the page H1."],
    findingIds: [findingId],
    estimatedImpact: { metric: "clicks", estimate: 0, confidence: 0.2 },
    ...over,
  };
}

describe("content rate limits", () => {
  it("vetoes the third refresh of the day", () => {
    const action: Action = {
      id: randomUUID(),
      siteId,
      kind: "refresh_content",
      tier: KIND_TIER.refresh_content,
      target: { pageId, url: "https://example.com/" },
      payload: { body: "# Hello\n\nA longer body that stays on this URL.\n" },
      rationale: ["Refresh the decaying page."],
      findingIds: [findingId],
      estimatedImpact: { metric: "clicks", estimate: 0, confidence: 0.2 },
    };
    const blocked = validateAction(action, ctx({ contentRefreshToday: 2 }));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok)
      expect(blocked.vetoes.some((v) => v.code === "RATE_LIMIT")).toBe(true);
  });
});

describe("closed schema", () => {
  it("rejects unknown kinds and extra keys", () => {
    expect(parseAction({ ...titleAction(), kind: "hack_the_planet" }).ok).toBe(false);
    expect(parseAction({ ...titleAction(), extra: true }).ok).toBe(false);
    expect(parseAction(titleAction()).ok).toBe(true);
  });
});

describe("validator", () => {
  it("accepts a clean title rewrite bound to a crawled page", () => {
    const result = validateAction(titleAction(), ctx());
    expect(result).toEqual({ ok: true });
  });

  it("vetoes a target that is not in the crawl table", () => {
    const result = validateAction(
      titleAction({
        target: { pageId: randomUUID(), url: "https://example.com/" },
      }),
      ctx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.vetoes.some((v) => v.code === "TARGET_BINDING")).toBe(true);
  });

  it("queues writes during the observe period", () => {
    const result = validateAction(
      titleAction(),
      ctx({ now: new Date("2026-07-02T00:00:00.000Z") }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.vetoes.some((v) => v.code === "OBSERVE_PERIOD")).toBe(true);
  });
});

describe("proposeTitle", () => {
  it("uses H1, never a JSON-LD headline", () => {
    const title = proposeTitle(
      {
        id: pageId,
        url: "https://example.com/about-us",
        title: null,
        metaDescription: null,
        h1: "About our running shoes today",
      },
      "https://example.com",
    );
    expect(title).toContain("running shoes");
    expect(title.toLowerCase()).not.toContain("system");
  });
});
