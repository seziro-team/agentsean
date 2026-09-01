import { randomUUID } from "node:crypto";
import { KIND_TIER } from "./kinds.js";
import { bannedHits, invisibleHits } from "./scan.js";
import { TITLE_MAX, type Action, type PageRow } from "./types.js";

const TITLE_RULES = new Set([
  "ONP.TITLE_MISSING",
  "ONP.TITLE_TOO_SHORT",
  "ONP.TITLE_TOO_LONG",
  "ONP.TITLE_PIXEL_OVER",
]);

export type FindingRow = {
  id: string;
  siteId: string;
  pageId: string | null;
  ruleId: string;
  status: string;
};

function hostnameToName(origin: string): string {
  try {
    const host = new URL(origin).hostname.replace(/^www\./, "");
    const head = host.split(".")[0] ?? host;
    return head.charAt(0).toUpperCase() + head.slice(1);
  } catch {
    return "Site";
  }
}

function slugTitle(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const cleaned = last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    if (!cleaned) return "";
    return cleaned
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function usable(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8 || t.length > TITLE_MAX) return false;
  if (bannedHits(t).length) return false;
  if (invisibleHits(t).count) return false;
  if (/https?:\/\//i.test(t) || /</.test(t)) return false;
  return true;
}

/**
 * Deterministic title. Never reads JSON-LD headline or Readability metadata —
 * those are attacker-controlled. Prefer a clean H1, else slug + site name.
 */
export function proposeTitle(page: PageRow, origin: string): string {
  const site = hostnameToName(origin);
  const h1 = page.h1?.replace(/\s+/g, " ").trim() ?? "";
  if (usable(h1) && h1.length >= 20 && h1.length <= 60) {
    return h1.length >= 30 ? h1 : `${h1} | ${site}`.slice(0, TITLE_MAX);
  }
  const slug = slugTitle(page.url);
  let title = slug ? `${slug} | ${site}` : `${site} official site`;
  if (h1 && usable(h1)) title = `${h1} | ${site}`;
  if (title.length < 30) title = `${title} — ${site} official site`;
  if (title.length > 60) {
    title = title.slice(0, 57).replace(/\s+\S*$/, "").trimEnd();
  }
  if (title.length < 30) title = `${site} official site home page`;
  if (!usable(title)) title = `${site} official site home page`;
  return title.slice(0, TITLE_MAX);
}

export function planTitleActions(opts: {
  siteId: string;
  origin: string;
  pages: PageRow[];
  findings: FindingRow[];
}): Action[] {
  const byId = new Map(opts.pages.map((p) => [p.id, p]));
  const out: Action[] = [];
  for (const f of opts.findings) {
    if (f.status !== "open") continue;
    if (!TITLE_RULES.has(f.ruleId)) continue;
    if (!f.pageId) continue;
    const page = byId.get(f.pageId);
    if (!page) continue;
    const title = proposeTitle(page, opts.origin);
    if (page.title && page.title === title) continue;
    out.push({
      id: randomUUID(),
      siteId: opts.siteId,
      kind: "rewrite_title",
      tier: KIND_TIER.rewrite_title,
      target: { pageId: page.id, url: page.url },
      payload: { title },
      rationale: [
        `Finding ${f.ruleId} on ${page.url}.`,
        `Proposed title from the page H1 or URL slug, never from JSON-LD or og: tags.`,
        `Default impact metric is clicks.`,
      ],
      findingIds: [f.id],
      estimatedImpact: { metric: "clicks", estimate: 0, confidence: 0.2 },
    });
  }
  return out;
}
