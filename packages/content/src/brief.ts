import { getPlaybook } from "@agentsean/playbooks";
import { contentScore } from "./score.js";
import {
  extractEntities,
  extractHeadings,
  extractQuestions,
  factsFromText,
  wordCount,
} from "./extract.js";
import type {
  BriefLink,
  ContentBrief,
  ContentCandidate,
  QueryDaily,
} from "./types.js";

export type BuildBriefInput = {
  candidate: ContentCandidate;
  queries: QueryDaily[];
  sitePages: Array<{ id: string; url: string; title: string | null; h1: string | null }>;
  competitorOutline?: string[] | undefined;
  googleUpdateNote?: string | null | undefined;
};

export function buildBrief(input: BuildBriefInput): ContentBrief {
  const playbook = getPlaybook("content-brief");
  const page = input.candidate;
  const headings = extractHeadings(page.body);
  const titleBits = [page.title, page.h1].filter((x): x is string => Boolean(x));
  const topics = extractEntities(page.body, [
    ...titleBits,
    ...input.queries.map((q) => q.query),
  ]);
  const questions = extractQuestions(input.queries, headings);
  const facts = factsFromText(page.body, page.url);
  const currentWordCount = page.wordCount || wordCount(page.body);
  const targetWordCount = Math.max(currentWordCount, 600);
  const internalLinks: BriefLink[] = input.sitePages
    .filter((p) => p.url !== page.url)
    .slice(0, 5)
    .map((p) => ({
      pageId: p.id,
      url: p.url,
      anchor: (p.h1 || p.title || "Related").slice(0, 80),
    }));
  const requiredHeadings = [
    ...headings.slice(0, 6),
    ...questions.slice(0, 3).map((q) => q.replace(/\?$/, "")),
  ].filter((h, i, arr) => arr.indexOf(h) === i);

  const brief: ContentBrief = {
    version: "1.0.0",
    playbookId: "content-brief",
    playbookVersion: playbook?.version ?? "1.0.0",
    kind: page.kind,
    targetUrl: page.url,
    pageId: page.pageId,
    title: page.title || page.h1 || page.url,
    intent: page.kind === "refresh" ? "refresh existing URL" : "new page",
    topics,
    entities: topics.slice(0, 20),
    headings: requiredHeadings,
    questions,
    internalLinks,
    competitorOutline: input.competitorOutline ?? [],
    sources: [
      { url: page.url, text: page.body.slice(0, 8000), kind: "page" },
      ...input.queries.slice(0, 20).map((q) => ({
        url: page.url,
        text: q.query,
        kind: "gsc" as const,
      })),
    ],
    facts,
    currentWordCount,
    targetWordCount,
    decay: page.decay
      ? {
          previousClicks: page.decay.previousClicks,
          currentClicks: page.decay.currentClicks,
          delta: page.decay.delta,
          deltaPct: page.decay.deltaPct,
        }
      : null,
    contentScore: contentScore(page.body, topics),
    googleUpdateNote: input.googleUpdateNote ?? null,
  };
  return brief;
}
