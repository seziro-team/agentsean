import { BLAST, bannedHits } from "@agentsean/actions";
import { validateJsonLdBlocks } from "@agentsean/analyzers";
import { nearDuplicate, simhashHex } from "@agentsean/crawler";
import { contentScore } from "./score.js";
import { hasDisclosure } from "./disclosure.js";
import { extractHeadings, numericClaims, wordCount } from "./extract.js";
import type {
  ContentBrief,
  ContentDraft,
  GateCheck,
  PublishGateResult,
  StyleProfile,
} from "./types.js";

export type GateContext = {
  brief: ContentBrief;
  draft: ContentDraft;
  style: StyleProfile;
  corpus: Array<{ url: string; body: string }>;
  ymylCategory: string | null;
  newPagesToday: number;
  kind: "refresh" | "create";
};

function check(
  id: GateCheck["id"],
  code: string,
  ok: boolean,
  detail: string,
): GateCheck {
  return { id, code, ok, detail };
}

function sourceText(brief: ContentBrief): string {
  return [
    ...brief.facts.map((f) => f.claim),
    ...brief.sources.map((s) => s.text),
    ...brief.topics,
    brief.title,
  ].join("\n");
}

function factCheck(ctx: GateContext): GateCheck {
  const allowed = sourceText(ctx.brief);
  const claims = numericClaims(ctx.draft.body);
  const missing = claims.filter((c) => !allowed.includes(c));
  return check(
    1,
    "FACT_CHECK",
    missing.length === 0,
    missing.length ? `untraced claims: ${missing.join(", ")}` : `${claims.length} numeric claims traced to the brief`,
  );
}

function nearDup(ctx: GateContext): GateCheck {
  const hex = simhashHex(ctx.draft.body);
  for (const page of ctx.corpus) {
    if (page.url === ctx.brief.targetUrl) continue;
    if (nearDuplicate(hex, simhashHex(page.body), 3)) {
      return check(2, "NEAR_DUPLICATE", false, `near-duplicate of ${page.url}`);
    }
  }
  const self = ctx.corpus.find((p) => p.url === ctx.brief.targetUrl);
  if (self && ctx.kind === "refresh") {
    // Refreshing the same URL is allowed; identical copy is not a refresh.
    if (nearDuplicate(hex, simhashHex(self.body), 1) && wordCount(ctx.draft.body) < ctx.brief.currentWordCount + 40) {
      return check(2, "NEAR_DUPLICATE", false, "draft is effectively the existing page");
    }
  }
  return check(2, "NEAR_DUPLICATE", true, "not a near-duplicate of the site corpus");
}

function fleschEase(text: string): number {
  const plain = text.replace(/[#*_`>[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const sentences = plain.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = plain.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((n, w) => n + Math.max(1, (w.match(/[aeiouy]+/gi) ?? []).length), 0);
  const s = Math.max(1, sentences.length);
  const w = Math.max(1, words.length);
  return 206.835 - 1.015 * (w / s) - 84.6 * (syllables / w);
}

function readability(ctx: GateContext): GateCheck {
  const words = wordCount(ctx.draft.body);
  const headings = extractHeadings(ctx.draft.body);
  const hasH1 = headings.length > 0 || /^#\s+/m.test(ctx.draft.body);
  const h2 = (ctx.draft.body.match(/^##\s+/gm) ?? []).length + (ctx.draft.body.match(/<h2[\s>]/gi) ?? []).length;
  const ease = fleschEase(ctx.draft.body);
  const minWords = Math.max(80, Math.floor(ctx.brief.currentWordCount * 0.8));
  if (!hasH1) return check(3, "READABILITY", false, "missing H1");
  if (h2 < 2) return check(3, "READABILITY", false, "need at least two H2s");
  if (words < minWords) return check(3, "READABILITY", false, `word count ${words} < ${minWords}`);
  if (ease < 20) return check(3, "READABILITY", false, `Flesch ease ${ease.toFixed(0)} is unreadable`);
  return check(3, "READABILITY", true, `words=${words} h2=${h2} flesch=${ease.toFixed(0)}`);
}

function voice(ctx: GateContext): GateCheck {
  const lower = ctx.draft.body.toLowerCase();
  for (const phrase of ctx.style.bannedPhrases) {
    if (phrase && lower.includes(phrase.toLowerCase())) {
      return check(4, "BRAND_VOICE", false, `banned phrase: ${phrase}`);
    }
  }
  for (const [preferred, synonym] of Object.entries(ctx.style.preferredTerms)) {
    if (synonym && lower.includes(synonym.toLowerCase()) && !lower.includes(preferred.toLowerCase())) {
      return check(4, "BRAND_VOICE", false, `use "${preferred}" instead of "${synonym}"`);
    }
  }
  return check(4, "BRAND_VOICE", true, "voice profile clean");
}

function internalLinks(ctx: GateContext): GateCheck {
  const hrefs = [...ctx.draft.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1] ?? "");
  const htmlHrefs = [...ctx.draft.body.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1] ?? "");
  const all = [...new Set([...hrefs, ...htmlHrefs])];
  if (all.length < 1) return check(5, "INTERNAL_LINKS", false, "draft has no internal links");
  const allowed = new Set(ctx.brief.internalLinks.map((l) => l.url));
  allowed.add(ctx.brief.targetUrl);
  const bad = all.filter((u) => !allowed.has(u));
  if (bad.length) return check(5, "INTERNAL_LINKS", false, `unresolved hrefs: ${bad.join(", ")}`);
  return check(5, "INTERNAL_LINKS", true, `${all.length} internal links resolve`);
}

function schemaCheck(ctx: GateContext): GateCheck {
  if (!ctx.draft.jsonld) {
    return check(6, "SCHEMA", true, "no JSON-LD in draft; not required on a refresh");
  }
  const issues = validateJsonLdBlocks([
    {
      raw: JSON.stringify(ctx.draft.jsonld),
      parsed: ctx.draft.jsonld,
      error: null,
      inHead: true,
    },
  ]);
  const blocking = issues.filter((i) => i.code !== "MISSING_RECOMMENDED_PROP");
  if (blocking.length) {
    return check(6, "SCHEMA", false, blocking.map((i) => i.message).join("; "));
  }
  return check(6, "SCHEMA", true, "JSON-LD valid against vendored schema.org");
}

function banned(ctx: GateContext): GateCheck {
  const hits = bannedHits(ctx.draft.body);
  if (hits.length) return check(7, "BANNED_SUBSTRING", false, hits.join(","));
  return check(7, "BANNED_SUBSTRING", true, "output-side scan clean");
}

function rateLimit(ctx: GateContext): GateCheck {
  if (ctx.kind === "create" && ctx.newPagesToday >= BLAST.newPagesPerDay) {
    return check(8, "RATE_LIMIT", false, `new-page cap is ${BLAST.newPagesPerDay}/day/site`);
  }
  return check(8, "RATE_LIMIT", true, `new pages today ${ctx.newPagesToday}/${BLAST.newPagesPerDay}`);
}

function vertical(ctx: GateContext): GateCheck {
  const cat = (ctx.ymylCategory ?? "").toLowerCase();
  const blocked = cat === "ymyl" || cat === "affiliate" || cat === "yours-money-your-life";
  if (blocked) {
    return check(9, "VERTICAL_BLOCK", false, `content generation is T4-blocked for ${cat} sites`);
  }
  return check(9, "VERTICAL_BLOCK", true, "vertical allows content");
}

function disclosure(ctx: GateContext): GateCheck {
  const ok = hasDisclosure(ctx.draft.body, ctx.style);
  return check(
    10,
    "AI_DISCLOSURE",
    ok,
    ok ? `disclosure=${ctx.style.disclosure}` : "EU AI Act Art. 50 mark missing",
  );
}

export function runPublishGate(ctx: GateContext): PublishGateResult {
  const checks: GateCheck[] = [
    factCheck(ctx),
    nearDup(ctx),
    readability(ctx),
    voice(ctx),
    internalLinks(ctx),
    schemaCheck(ctx),
    banned(ctx),
    rateLimit(ctx),
    vertical(ctx),
    disclosure(ctx),
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

export function coverageScore(brief: ContentBrief, body: string): number {
  return contentScore(body, brief.topics);
}
