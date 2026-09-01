import { PANEL_COST_USD, PANEL_ENGINES, PANEL_PROMPTS } from "./honest.js";
import type { GenerateFn } from "@agentsean/llm";

export type PanelEngine = (typeof PANEL_ENGINES)[number];

export type CitationHit = {
  engine: PanelEngine;
  prompt: string;
  citedUrl: string | null;
  citedDomain: string | null;
  isOurs: boolean;
  answer: string;
};

export function defaultPrompts(brand: string, category: string): string[] {
  const b = brand.trim() || "the brand";
  const c = category.trim() || "this category";
  return [
    `What is ${b}?`,
    `Who makes the best ${c}?`,
    `${b} vs competitors`,
    `How does ${b} work?`,
    `Is ${b} worth it?`,
    `${c} pricing comparison`,
    `Best ${c} for small teams`,
    `${b} alternatives`,
    `How to get started with ${c}`,
    `${b} reviews`,
    `What is the definition of ${c}?`,
    `${c} implementation steps`,
    `${b} numeric benchmarks`,
    `Compare ${b} to the market`,
    `${c} procedure checklist`,
    `Who cites ${b} as a source?`,
    `${c} facts and figures`,
    `${b} integrations`,
    `Common ${c} mistakes`,
    `${b} documentation`,
  ].slice(0, PANEL_PROMPTS);
}

const URL_RE = /https?:\/\/[^\s)\]>'"]+/gi;

// Strip trailing sentence punctuation from a matched URL. A while-slice avoids
// the anchored `/[.,;]+$/` whose `+` + `$` backtracks on a URL ending in many
// `.,;` (js/polynomial-redos); this loop touches each trailing char once.
function trimTrailingPunct(s: string): string {
  let end = s.length;
  while (end > 0) {
    const c = s.charCodeAt(end - 1);
    // '.' 46, ',' 44, ';' 59
    if (c === 46 || c === 44 || c === 59) end--;
    else break;
  }
  return s.slice(0, end);
}

export function parseCitations(
  answer: string,
  originHost: string,
): { url: string; domain: string; isOurs: boolean }[] {
  const seen = new Set<string>();
  const out: { url: string; domain: string; isOurs: boolean }[] = [];
  const matches = answer.match(URL_RE) ?? [];
  for (const raw of matches) {
    let url: URL;
    try {
      url = new URL(trimTrailingPunct(raw));
    } catch {
      continue;
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const domain = url.hostname.replace(/^www\./, "");
    const ours = originHost.replace(/^www\./, "");
    out.push({
      url: url.href,
      domain,
      isOurs: domain === ours || domain.endsWith(`.${ours}`),
    });
  }
  return out;
}

export function citationShare(hits: CitationHit[]): number {
  if (hits.length === 0) return 0;
  const cited = hits.filter((h) => h.citedUrl);
  if (cited.length === 0) return 0;
  return cited.filter((h) => h.isOurs).length / cited.length;
}

export function shareOfVoice(hits: CitationHit[]): number {
  if (hits.length === 0) return 0;
  return hits.filter((h) => h.isOurs).length / hits.length;
}

export async function runPromptPanel(opts: {
  origin: string;
  brand: string;
  category?: string | undefined;
  generate: GenerateFn;
  engines?: readonly PanelEngine[] | undefined;
}): Promise<{
  hits: CitationHit[];
  citationShare: number;
  shareOfVoice: number;
  estimatedUsd: number;
}> {
  const host = new URL(opts.origin).hostname;
  const prompts = defaultPrompts(opts.brand, opts.category ?? "");
  const engines = opts.engines ?? PANEL_ENGINES;
  const hits: CitationHit[] = [];
  for (const engine of engines) {
    for (const prompt of prompts) {
      const result = await opts.generate({
        class: "cheap",
        system:
          "Answer with sources as absolute http(s) URLs when you cite the web. Do not invent URLs.",
        prompt: `${prompt}\nBrand origin: ${opts.origin}`,
      });
      const parsed = parseCitations(result.text, host);
      if (parsed.length === 0) {
        hits.push({
          engine,
          prompt,
          citedUrl: null,
          citedDomain: null,
          isOurs: false,
          answer: result.text,
        });
        continue;
      }
      for (const p of parsed) {
        hits.push({
          engine,
          prompt,
          citedUrl: p.url,
          citedDomain: p.domain,
          isOurs: p.isOurs,
          answer: result.text,
        });
      }
    }
  }
  return {
    hits,
    citationShare: citationShare(hits),
    shareOfVoice: shareOfVoice(hits),
    estimatedUsd: PANEL_COST_USD,
  };
}
