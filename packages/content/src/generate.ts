import { randomUUID } from "node:crypto";
import { KIND_TIER, type Action } from "@agentsean/actions";
import { generateText, taskClass, type GenerateResult, type LlmConfig } from "@agentsean/llm";
import { applyDisclosure } from "./disclosure.js";
import type { ContentBrief, ContentDraft, StyleProfile } from "./types.js";

const SYSTEM = `You write SEO page copy for Agent Sean.
You emit a single JSON object and nothing else.
You never call tools, never request credentials, never invent URLs, never invent numeric facts.
Every number you use must appear in the brief.facts or brief.sources text.
Every href must be one of brief.internalLinks.url.
Prefer rewriting the existing page. Do not propose a new URL.
Schema: {"title": string, "body": string, "jsonld": object|null}
body is markdown with one H1, at least two H2s, and markdown links to internalLinks.
Keep body under 35000 characters.`;

export function briefPrompt(brief: ContentBrief): string {
  return JSON.stringify(
    {
      kind: brief.kind,
      targetUrl: brief.targetUrl,
      title: brief.title,
      intent: brief.intent,
      topics: brief.topics.slice(0, 50),
      headings: brief.headings,
      questions: brief.questions,
      internalLinks: brief.internalLinks,
      facts: brief.facts,
      sources: brief.sources.map((s) => ({ url: s.url, text: s.text.slice(0, 1500) })),
      currentWordCount: brief.currentWordCount,
      targetWordCount: brief.targetWordCount,
      decay: brief.decay,
      googleUpdateNote: brief.googleUpdateNote,
    },
    null,
    2,
  );
}

function parseDraftJson(text: string): { title: string; body: string; jsonld: Record<string, unknown> | null } {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const parsed = JSON.parse(raw) as { title?: unknown; body?: unknown; jsonld?: unknown };
  if (typeof parsed.title !== "string" || typeof parsed.body !== "string") {
    throw new Error("LLM draft missing title/body");
  }
  const jsonld =
    parsed.jsonld && typeof parsed.jsonld === "object" && !Array.isArray(parsed.jsonld)
      ? (parsed.jsonld as Record<string, unknown>)
      : null;
  return { title: parsed.title, body: parsed.body, jsonld };
}

export async function draftFromBrief(
  brief: ContentBrief,
  cfg: LlmConfig,
  style: StyleProfile,
): Promise<{ draft: ContentDraft; usage: GenerateResult }> {
  const result = await generateText(cfg, {
    class: taskClass("draft"),
    system: SYSTEM,
    prompt: briefPrompt(brief),
    json: true,
  });
  const parsed = parseDraftJson(result.text);
  const body = applyDisclosure(parsed.body, style);
  return {
    draft: {
      title: parsed.title.slice(0, 70),
      body: body.slice(0, 40_000),
      jsonld: parsed.jsonld,
      disclosure: style.disclosure,
      model: result.model,
      modelClass: result.class,
    },
    usage: result,
  };
}

export function actionFromDraft(opts: {
  siteId: string;
  brief: ContentBrief;
  draft: ContentDraft;
  findingIds: string[];
}): Action {
  const kind = opts.brief.kind === "create" ? "create_page" : "refresh_content";
  const payload =
    kind === "create_page"
      ? {
          path: new URL(opts.brief.targetUrl).pathname || "/",
          title: opts.draft.title,
          body: opts.draft.body,
        }
      : { body: opts.draft.body };
  return {
    id: randomUUID(),
    siteId: opts.siteId,
    kind,
    tier: KIND_TIER[kind],
    target: { pageId: opts.brief.pageId, url: opts.brief.targetUrl },
    payload,
    rationale: [
      opts.brief.kind === "refresh"
        ? "Refresh an existing URL rather than mint a new one."
        : "Create a page for a cluster with no existing URL.",
      opts.brief.decay
        ? `GSC clicks dropped from ${opts.brief.decay.previousClicks} to ${opts.brief.decay.currentClicks} (metric: clicks).`
        : "Thin or under-covered page from the crawl catalogue.",
      `Brief content score ${opts.brief.contentScore.toFixed(0)}/100.`,
    ],
    findingIds: opts.findingIds,
    estimatedImpact: { metric: "clicks", estimate: 0, confidence: 0.2 },
  };
}
