/** Training crawlers ≠ search/citation crawlers. Conflating them is a landmine. */

export type CrawlerClass = "training" | "citation" | "user" | "search_index";

export type AiCrawler = {
  token: string;
  vendor: string;
  class: CrawlerClass;
  blockingCosts: string;
};

export const AI_CRAWLERS: readonly AiCrawler[] = [
  {
    token: "GPTBot",
    vendor: "OpenAI",
    class: "training",
    blockingCosts: "Foundation-model training only",
  },
  {
    token: "ClaudeBot",
    vendor: "Anthropic",
    class: "training",
    blockingCosts: "Model training",
  },
  {
    token: "Google-Extended",
    vendor: "Google",
    class: "training",
    blockingCosts: "Gemini training + grounding; not Search ranking",
  },
  {
    token: "CCBot",
    vendor: "Common Crawl",
    class: "training",
    blockingCosts: "Common Crawl corpus",
  },
  {
    token: "Applebot-Extended",
    vendor: "Apple",
    class: "training",
    blockingCosts: "Apple Intelligence training",
  },
  {
    token: "Bytespider",
    vendor: "ByteDance",
    class: "training",
    blockingCosts: "ByteDance training",
  },
  {
    token: "OAI-SearchBot",
    vendor: "OpenAI",
    class: "citation",
    blockingCosts: "ChatGPT search citations",
  },
  {
    token: "Claude-SearchBot",
    vendor: "Anthropic",
    class: "citation",
    blockingCosts: "Claude search citations",
  },
  {
    token: "PerplexityBot",
    vendor: "Perplexity",
    class: "citation",
    blockingCosts: "Perplexity citations",
  },
  {
    token: "Bingbot",
    vendor: "Microsoft",
    class: "citation",
    blockingCosts: "Bing + Copilot grounding",
  },
  {
    token: "ChatGPT-User",
    vendor: "OpenAI",
    class: "user",
    blockingCosts: "Live browsing on user request",
  },
  {
    token: "Claude-User",
    vendor: "Anthropic",
    class: "user",
    blockingCosts: "Claude live browsing",
  },
  {
    token: "Perplexity-User",
    vendor: "Perplexity",
    class: "user",
    blockingCosts: "User-initiated fetch (often ignores robots.txt)",
  },
  {
    token: "Googlebot",
    vendor: "Google",
    class: "search_index",
    blockingCosts: "Search, including AI Overviews / AI Mode eligibility",
  },
];

export const TRAINING_TOKENS = AI_CRAWLERS.filter((c) => c.class === "training").map(
  (c) => c.token.toLowerCase(),
);
export const CITATION_TOKENS = AI_CRAWLERS.filter((c) => c.class === "citation").map(
  (c) => c.token.toLowerCase(),
);

export type RobotsCrawlerReport = {
  blockedTraining: string[];
  blockedCitation: string[];
  conflatesTrainingAndCitation: boolean;
};

export function groupDisallowsAll(raw: string, token: string): boolean {
  const lower = raw.toLowerCase();
  const needle = `user-agent: ${token.toLowerCase()}`;
  const idx = lower.indexOf(needle);
  if (idx < 0) return false;
  const rest = lower.slice(idx);
  const nextUa = rest.slice(needle.length).search(/\nuser-agent:/);
  const block = nextUa >= 0 ? rest.slice(0, needle.length + nextUa) : rest;
  return /disallow:\s*\/\s*$/m.test(block) || /disallow:\s*\/\s*\n/.test(block);
}

export function analyzeAiRobots(raw: string | null | undefined): RobotsCrawlerReport {
  const text = raw ?? "";
  const blockedTraining = TRAINING_TOKENS.filter((t) => groupDisallowsAll(text, t));
  const blockedCitation = CITATION_TOKENS.filter((t) => groupDisallowsAll(text, t));
  return {
    blockedTraining,
    blockedCitation,
    conflatesTrainingAndCitation:
      blockedTraining.length > 0 && blockedCitation.length > 0,
  };
}
