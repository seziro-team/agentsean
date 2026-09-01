import {
  CONTENT_GEN_KINDS,
  KIND_TIER,
  NEW_PAGE_KINDS,
  TWO_KEY_KINDS,
} from "./kinds.js";
import { parseAction } from "./payloads.js";
import { bannedHits, collectActionText, encodedPayloadHits, invisibleHits } from "./scan.js";
import { verifyApproval } from "./hmac.js";
import { extractDomains, extractUrls, matchGlob, sameSite } from "./urls.js";
import {
  BLAST,
  DIFF_CAPS,
  META_MAX,
  TITLE_MAX,
  type Action,
  type ValidationContext,
  type ValidationResult,
  type Veto,
} from "./types.js";

function veto(check: number, code: string, detail: string): Veto {
  return { check, code, detail };
}

function afterLen(ctx: ValidationContext): number {
  return Buffer.byteLength(ctx.afterText, "utf8");
}

function beforeLen(ctx: ValidationContext): number {
  return Buffer.byteLength(ctx.beforeText, "utf8");
}

function changedBytes(ctx: ValidationContext): number {
  const a = Buffer.from(ctx.beforeText, "utf8");
  const b = Buffer.from(ctx.afterText, "utf8");
  return Math.abs(b.length - a.length) + levenshteinCap(ctx.beforeText, ctx.afterText, 50_000);
}

function levenshteinCap(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  if (m * n > 400_000) return Math.abs(m - n);
  const prev = new Uint32Array(n + 1);
  const cur = new Uint32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min((cur[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev.set(cur);
  }
  return prev[n] ?? cap + 1;
}

function pageById(ctx: ValidationContext, id: string) {
  return ctx.pages.find((p) => p.id === id);
}

function pageByUrl(ctx: ValidationContext, url: string) {
  return ctx.pages.find((p) => p.url === url);
}

function urlAllowed(ctx: ValidationContext, url: string): boolean {
  if (pageByUrl(ctx, url)) return true;
  if (ctx.allowlist.includes(url)) return true;
  return false;
}

function firstAppearanceOk(ctx: ValidationContext, entity: string): boolean {
  const row = ctx.entities.find((e) => e.entity === entity);
  if (!row) return false;
  return row.source === "crawl" || row.source === "user";
}

function payloadUrls(action: Action): string[] {
  const fromPayload = extractUrls(action.payload);
  const fromRationale = extractUrls(action.rationale);
  return [...new Set([...fromPayload, ...fromRationale])];
}

function payloadDomains(action: Action): string[] {
  return extractDomains({ payload: action.payload, rationale: action.rationale });
}

function checkSchema(raw: unknown): { action: Action } | { vetoes: Veto[] } {
  const parsed = parseAction(raw);
  if (!parsed.ok) {
    return { vetoes: [veto(1, "SCHEMA", parsed.error)] };
  }
  return { action: parsed.action };
}

function checkTarget(action: Action, ctx: ValidationContext): Veto[] {
  const page = pageById(ctx, action.target.pageId);
  if (!page) {
    return [veto(2, "TARGET_BINDING", `pageId ${action.target.pageId} is not in the crawl table`)];
  }
  if (page.url !== action.target.url) {
    return [
      veto(
        2,
        "TARGET_BINDING",
        `target.url ${action.target.url} does not match crawled page ${page.url}`,
      ),
    ];
  }
  if (pageByUrl(ctx, action.target.url)?.id !== action.target.pageId) {
    return [veto(2, "TARGET_BINDING", "target url/pageId pair is inconsistent")];
  }
  if (!sameSite(action.target.url, ctx.site.origin)) {
    return [veto(2, "TARGET_BINDING", "target url is off-site")];
  }
  for (const glob of ctx.site.neverTouchGlobs) {
    if (matchGlob(action.target.url, glob)) {
      return [veto(2, "TARGET_BINDING", `target matches never-touch glob ${glob}`)];
    }
  }
  return [];
}

function checkUrlAllowlist(action: Action, ctx: ValidationContext): Veto[] {
  const urls = payloadUrls(action);
  const out: Veto[] = [];
  for (const url of urls) {
    if (url === action.target.url) continue;
    if (!urlAllowed(ctx, url)) {
      out.push(veto(3, "URL_ALLOWLIST", `payload url not crawled or allowlisted: ${url}`));
    }
    if (!sameSite(url, ctx.site.origin) && !ctx.allowlist.includes(url)) {
      out.push(veto(3, "URL_ALLOWLIST", `off-site url requires allowlist: ${url}`));
    }
  }
  return out;
}

function checkFirstAppearance(action: Action, ctx: ValidationContext): Veto[] {
  const out: Veto[] = [];
  const urls = [action.target.url, ...payloadUrls(action)];
  for (const url of urls) {
    if (!firstAppearanceOk(ctx, url) && !pageByUrl(ctx, url) && !ctx.allowlist.includes(url)) {
      out.push(
        veto(4, "FIRST_APPEARANCE", `url first appeared outside our crawl table: ${url}`),
      );
    }
    const row = ctx.entities.find((e) => e.entity === url);
    if (row?.source === "third_party") {
      out.push(veto(4, "FIRST_APPEARANCE", `entity first seen in third-party content: ${url}`));
    }
  }
  for (const domain of payloadDomains(action)) {
    const originHost = new URL(ctx.site.origin).hostname.toLowerCase();
    if (domain === originHost) continue;
    const asUrl = ctx.pages.some((p) => {
      try {
        return new URL(p.url).hostname.toLowerCase() === domain;
      } catch {
        return false;
      }
    });
    if (asUrl) continue;
    const row = ctx.entities.find((e) => e.entity === domain || e.entity.endsWith(`.${domain}`));
    if (row?.source === "third_party") {
      out.push(veto(4, "FIRST_APPEARANCE", `domain first seen in third-party content: ${domain}`));
    } else if (!row && !ctx.allowlist.some((u) => u.includes(domain))) {
      const mentioned = collectActionText(action.payload);
      if (mentioned.includes(domain) && domain !== originHost) {
        out.push(veto(4, "FIRST_APPEARANCE", `untracked domain in payload: ${domain}`));
      }
    }
  }
  return out;
}

const FIELD_KINDS = new Set([
  "rewrite_title",
  "rewrite_meta_description",
  "rewrite_og_title",
  "rewrite_og_description",
  "rewrite_alt_text",
  "fix_heading",
  "add_h1",
  "fix_title_length",
  "fix_meta_length",
]);

function fieldDiff(action: Action, ctx: ValidationContext): { before: string; after: string } | null {
  const page = pageById(ctx, action.target.pageId);
  if ("title" in action.payload) {
    return { before: page?.title ?? "", after: action.payload.title };
  }
  if ("metaDescription" in action.payload) {
    return { before: page?.metaDescription ?? "", after: action.payload.metaDescription };
  }
  if ("alt" in action.payload) {
    return { before: "", after: action.payload.alt };
  }
  if ("text" in action.payload) {
    return { before: page?.h1 ?? "", after: action.payload.text };
  }
  return null;
}

function checkDiffCaps(action: Action, ctx: ValidationContext): Veto[] {
  const cap = DIFF_CAPS[action.kind] ?? DIFF_CAPS["default"]!;
  const field = FIELD_KINDS.has(action.kind) ? fieldDiff(action, ctx) : null;
  const before = field ? Buffer.byteLength(field.before, "utf8") : beforeLen(ctx);
  const after = field ? Buffer.byteLength(field.after, "utf8") : afterLen(ctx);
  const changed = field
    ? Math.abs(after - before) +
      levenshteinCap(field.before, field.after, cap.maxBytes)
    : changedBytes(ctx);
  if (changed > cap.maxBytes) {
    return [veto(5, "DIFF_CAPS", `changed ${changed} bytes, cap ${cap.maxBytes}`)];
  }
  if (!field && before > 0) {
    const pct = (changed / before) * 100;
    if (pct > cap.maxPct && changed > 40) {
      return [veto(5, "DIFF_CAPS", `changed ${pct.toFixed(1)}% of page, cap ${cap.maxPct}%`)];
    }
  }
  if (!field && after > before * 1.5 + 200 && before > 0) {
    return [veto(5, "DIFF_CAPS", "after is more than 1.5× before + 200 bytes")];
  }
  if ("title" in action.payload && action.payload.title.length > TITLE_MAX) {
    return [veto(5, "DIFF_CAPS", `title longer than ${TITLE_MAX}`)];
  }
  if (
    "metaDescription" in action.payload &&
    action.payload.metaDescription.length > META_MAX
  ) {
    return [veto(5, "DIFF_CAPS", `meta description longer than ${META_MAX}`)];
  }
  return [];
}

function checkBlast(action: Action, ctx: ValidationContext): Veto[] {
  if (ctx.halted || ctx.site.killswitch) {
    return [veto(6, "BLAST_RADIUS", "kill switch is on; no writes")];
  }
  if (ctx.appliedThisRun >= BLAST.maxUrlsPerRun) {
    return [veto(6, "BLAST_RADIUS", `run already touched ${BLAST.maxUrlsPerRun} URLs`)];
  }
  if (ctx.appliedThisHour >= BLAST.maxPerHour) {
    return [veto(6, "BLAST_RADIUS", `hourly cap ${BLAST.maxPerHour} reached`)];
  }
  if (ctx.appliedThisDay >= BLAST.maxPerDay) {
    return [veto(6, "BLAST_RADIUS", `daily cap ${BLAST.maxPerDay} reached`)];
  }
  return [];
}

function checkPolicy(action: Action, ctx: ValidationContext): Veto[] {
  const locked = KIND_TIER[action.kind];
  if (action.tier !== locked) {
    return [veto(7, "POLICY_TIER", `kind ${action.kind} is locked at T${locked}`)];
  }
  if (locked === 4) {
    return [veto(7, "POLICY_TIER", `kind ${action.kind} is T4 refused; no setting exists`)];
  }
  if (locked === 0) {
    return [veto(7, "POLICY_TIER", "T0 observe actions must not write")];
  }
  if (ctx.site.autonomyMode === "observe" && locked >= 1) {
    return [veto(7, "POLICY_TIER", "site is in observe mode")];
  }
  return [];
}

function checkBudget(ctx: ValidationContext): Veto[] {
  if (ctx.estimatedCostUsd <= 0) return [];
  if (ctx.spentUsdToday + ctx.estimatedCostUsd > ctx.budgetUsdDaily) {
    return [
      veto(
        8,
        "BUDGET",
        `$${ctx.spentUsdToday + ctx.estimatedCostUsd} would exceed daily budget $${ctx.budgetUsdDaily}`,
      ),
    ];
  }
  return [];
}

function checkInvisible(action: Action): Veto[] {
  const text = collectActionText({ payload: action.payload, rationale: action.rationale });
  const hits = invisibleHits(text);
  if (hits.count > 0) {
    return [
      veto(9, "INVISIBLE_CHARS", `output contains ${hits.count} invisible chars (${hits.kinds.join(",")})`),
    ];
  }
  return [];
}

function checkEncoded(action: Action): Veto[] {
  const text = collectActionText({ payload: action.payload, rationale: action.rationale });
  const hits = encodedPayloadHits(text);
  if (hits.length) {
    return [veto(10, "ENCODED_PAYLOAD", hits.join(","))];
  }
  return [];
}

function checkBanned(action: Action): Veto[] {
  const text = collectActionText({ payload: action.payload, rationale: action.rationale });
  const hits = bannedHits(text);
  if (hits.length) {
    return [veto(11, "BANNED_SUBSTRING", hits.join(","))];
  }
  if ("title" in action.payload) {
    if (/https?:\/\//i.test(action.payload.title) || /</.test(action.payload.title)) {
      return [veto(11, "BANNED_SUBSTRING", "title must not contain a URL or HTML")];
    }
  }
  if ("metaDescription" in action.payload) {
    if (/</.test(action.payload.metaDescription)) {
      return [veto(11, "BANNED_SUBSTRING", "meta description must not contain HTML")];
    }
  }
  return [];
}

function checkTwoKey(action: Action, ctx: ValidationContext): Veto[] {
  if (!TWO_KEY_KINDS.has(action.kind) && action.tier !== 3) return [];
  const unique = new Map<string, string>();
  for (const a of ctx.twoKeyApprovals) {
    if (!verifyApproval(ctx.approvalKey, action, a.actor, a.hmac)) {
      return [veto(12, "TWO_KEY", `invalid hmac for actor ${a.actor}`)];
    }
    unique.set(a.actor, a.hmac);
  }
  if (unique.size < 2) {
    return [
      veto(
        12,
        "TWO_KEY",
        `${action.kind} requires two distinct HMAC-signed approvals (have ${unique.size})`,
      ),
    ];
  }
  return [];
}

function checkVertical(action: Action, ctx: ValidationContext): Veto[] {
  const cat = (ctx.site.ymylCategory ?? "").toLowerCase();
  if (!cat) return [];
  const blocked = cat === "ymyl" || cat === "affiliate" || cat === "yours-money-your-life";
  if (blocked && CONTENT_GEN_KINDS.has(action.kind)) {
    return [
      veto(13, "VERTICAL_BLOCK", `content generation is T4-blocked for ${cat} sites`),
    ];
  }
  return [];
}

function checkObserve(ctx: ValidationContext): Veto[] {
  if (!ctx.site.observeUntil) return [];
  const until = Date.parse(ctx.site.observeUntil);
  if (Number.isNaN(until)) return [veto(14, "OBSERVE_PERIOD", "observeUntil is not a date")];
  if (ctx.now.getTime() < until) {
    return [
      veto(
        14,
        "OBSERVE_PERIOD",
        `site is in observe-only until ${ctx.site.observeUntil}; writes are queued`,
      ),
    ];
  }
  return [];
}

function checkRate(action: Action, ctx: ValidationContext): Veto[] {
  if (NEW_PAGE_KINDS.has(action.kind) && ctx.newPagesToday >= BLAST.newPagesPerDay) {
    return [
      veto(15, "RATE_LIMIT", `new-page cap is ${BLAST.newPagesPerDay}/day/site`),
    ];
  }
  return [];
}

/**
 * Deterministic reference monitor. No network, no LLM. Every check can veto.
 * Checks are independent: we collect all vetoes rather than failing closed on the first,
 * so the red-team suite can assert on stable codes.
 */
export function validateAction(raw: unknown, ctx: ValidationContext): ValidationResult {
  const schema = checkSchema(raw);
  if ("vetoes" in schema) return { ok: false, vetoes: schema.vetoes };
  const action = schema.action;
  const vetoes: Veto[] = [
    ...checkTarget(action, ctx),
    ...checkUrlAllowlist(action, ctx),
    ...checkFirstAppearance(action, ctx),
    ...checkDiffCaps(action, ctx),
    ...checkBlast(action, ctx),
    ...checkPolicy(action, ctx),
    ...checkBudget(ctx),
    ...checkInvisible(action),
    ...checkEncoded(action),
    ...checkBanned(action),
    ...checkTwoKey(action, ctx),
    ...checkVertical(action, ctx),
    ...checkObserve(ctx),
    ...checkRate(action, ctx),
  ];
  if (vetoes.length) return { ok: false, vetoes };
  return { ok: true };
}

export function validateParsed(action: Action, ctx: ValidationContext): ValidationResult {
  return validateAction(action, ctx);
}
