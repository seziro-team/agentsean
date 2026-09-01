import { describe, expect, it } from "vitest";
import { HTML_COMMENT } from "./disclosure.js";
import { runPublishGate } from "./gate.js";
import { DEFAULT_STYLE, type ContentBrief, type ContentDraft } from "./types.js";

const pageId = "11111111-1111-4111-8111-111111111111";

function brief(over: Partial<ContentBrief> = {}): ContentBrief {
  return {
    version: "1.0.0",
    playbookId: "content-brief",
    playbookVersion: "1.0.0",
    kind: "refresh",
    targetUrl: "https://example.com/guide",
    pageId,
    title: "Widget guide",
    intent: "refresh existing URL",
    topics: ["widgets", "maintenance"],
    entities: ["widgets"],
    headings: ["How to maintain widgets", "When to replace widgets"],
    questions: ["how to maintain widgets"],
    internalLinks: [
      {
        pageId: "22222222-2222-4222-8222-222222222222",
        url: "https://example.com/about",
        anchor: "About",
      },
    ],
    competitorOutline: [],
    sources: [
      {
        url: "https://example.com/guide",
        text: "Widgets last 12 months. Maintenance every 3 months.",
        kind: "page",
      },
    ],
    facts: [
      { claim: "12", sourceUrl: "https://example.com/guide" },
      { claim: "3", sourceUrl: "https://example.com/guide" },
    ],
    currentWordCount: 80,
    targetWordCount: 200,
    decay: { previousClicks: 100, currentClicks: 40, delta: -60, deltaPct: -0.6 },
    contentScore: 40,
    googleUpdateNote: null,
    ...over,
  };
}

function draft(over: Partial<ContentDraft> = {}): ContentDraft {
  const body = `# Widget guide

${HTML_COMMENT}

Widgets last 12 months with care. See [About](https://example.com/about) for the company that builds them and the people who stand behind the housing.

## How to maintain widgets

Clean the housing every 3 months. Widgets that skip that schedule seize at the bearing. Keep a dated log next to the serial plate so the next technician is not guessing about the last service.

Wipe the contacts, check the gasket, and confirm the firmware revision matches the card in the box. A five-minute pass now beats a failed unit in the field.

## When to replace widgets

Replace the unit after 12 months of daily use. Do not stretch a tired bearing because the shell still looks new. Record the swap, recycle the old unit, and start the 12 month clock again.
`;
  return {
    title: "Widget guide",
    body,
    jsonld: null,
    disclosure: "html_comment",
    model: "mock",
    modelClass: "mid",
    ...over,
  };
}

describe("PublishGate", () => {
  it("passes a clean refresh", () => {
    const result = runPublishGate({
      brief: brief(),
      draft: draft(),
      style: DEFAULT_STYLE,
      corpus: [
        { url: "https://example.com/guide", body: "short original widgets copy" },
      ],
      ymylCategory: null,
      newPagesToday: 0,
      kind: "refresh",
    });
    expect(result.ok, JSON.stringify(result.checks.filter((c) => !c.ok))).toBe(true);
    expect(result.checks).toHaveLength(10);
  });

  it("fails an untraced numeric claim", () => {
    const result = runPublishGate({
      brief: brief(),
      draft: draft({ body: draft().body.replace("12 months", "99 months") }),
      style: DEFAULT_STYLE,
      corpus: [],
      ymylCategory: null,
      newPagesToday: 0,
      kind: "refresh",
    });
    expect(result.checks.find((c) => c.id === 1)?.ok).toBe(false);
  });

  it("fails YMYL/affiliate and the third new page", () => {
    const ymyl = runPublishGate({
      brief: brief(),
      draft: draft(),
      style: DEFAULT_STYLE,
      corpus: [{ url: "https://example.com/guide", body: "short original" }],
      ymylCategory: "ymyl",
      newPagesToday: 0,
      kind: "refresh",
    });
    expect(ymyl.checks.find((c) => c.id === 9)?.ok).toBe(false);
    const cap = runPublishGate({
      brief: brief({ kind: "create" }),
      draft: draft(),
      style: DEFAULT_STYLE,
      corpus: [{ url: "https://example.com/guide", body: "short original" }],
      ymylCategory: null,
      newPagesToday: 2,
      kind: "create",
    });
    expect(cap.checks.find((c) => c.id === 8)?.ok).toBe(false);
  });

  it("fails missing Art. 50 disclosure", () => {
    const result = runPublishGate({
      brief: brief(),
      draft: draft({ body: draft().body.replace(HTML_COMMENT, "") }),
      style: DEFAULT_STYLE,
      corpus: [{ url: "https://example.com/guide", body: "short original" }],
      ymylCategory: null,
      newPagesToday: 0,
      kind: "refresh",
    });
    expect(result.checks.find((c) => c.id === 10)?.ok).toBe(false);
  });
});
