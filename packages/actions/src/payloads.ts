import { ACTION_KIND_SET, KIND_TIER, isActionKind, type ActionKind } from "./kinds.js";
import {
  ALT_MAX,
  ANCHOR_MAX,
  META_MAX,
  TITLE_MAX,
  type Action,
  type ActionPayload,
  type AutonomyTier,
  type Impact,
} from "./types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysOf(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).toSorted();
}

function expectKeys(obj: Record<string, unknown>, allowed: string[]): string | null {
  const extra = keysOf(obj).filter((k) => !allowed.includes(k));
  if (extra.length) return `unknown keys: ${extra.join(",")}`;
  return null;
}

function str(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): string {
  const v = obj[key];
  if (typeof v !== "string") throw new Error(`${key} must be a string`);
  if (v.length < min || v.length > max) {
    throw new Error(`${key} length ${v.length} outside ${min}-${max}`);
  }
  return v;
}

function uuid(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || !UUID_RE.test(v))
    throw new Error(`${key} must be a uuid`);
  return v;
}

function absHttpUrl(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string") throw new Error(`${key} must be a url`);
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`${key} is not a URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`${key} must be http(s)`);
  }
  if (u.username || u.password) throw new Error(`${key} must not carry credentials`);
  return u.href;
}

function parsePayload(kind: ActionKind, raw: unknown): ActionPayload {
  if (!isPlainObject(raw)) throw new Error("payload must be an object");
  switch (kind) {
    case "rewrite_title":
    case "rewrite_og_title":
    case "fix_title_length": {
      const err = expectKeys(raw, ["title"]);
      if (err) throw new Error(err);
      return { title: str(raw, "title", 1, TITLE_MAX) };
    }
    case "rewrite_meta_description":
    case "rewrite_og_description":
    case "fix_meta_length": {
      const err = expectKeys(raw, ["metaDescription"]);
      if (err) throw new Error(err);
      return { metaDescription: str(raw, "metaDescription", 1, META_MAX) };
    }
    case "rewrite_alt_text": {
      const err = expectKeys(raw, ["selector", "alt"]);
      if (err) throw new Error(err);
      return {
        selector: str(raw, "selector", 1, 200),
        alt: str(raw, "alt", 1, ALT_MAX),
      };
    }
    case "fix_heading":
    case "add_h1": {
      const err = expectKeys(raw, ["level", "text"]);
      if (err) throw new Error(err);
      const level = raw["level"];
      if (
        level !== 1 &&
        level !== 2 &&
        level !== 3 &&
        level !== 4 &&
        level !== 5 &&
        level !== 6
      ) {
        throw new Error("level must be 1-6");
      }
      return { level, text: str(raw, "text", 1, 200) };
    }
    case "insert_internal_link":
    case "repair_broken_internal_link": {
      const err = expectKeys(raw, ["hrefPageId", "hrefUrl", "anchor"]);
      if (err) throw new Error(err);
      return {
        hrefPageId: uuid(raw, "hrefPageId"),
        hrefUrl: absHttpUrl(raw, "hrefUrl"),
        anchor: str(raw, "anchor", 1, ANCHOR_MAX),
      };
    }
    case "add_jsonld":
    case "update_jsonld":
    case "add_faq_schema":
    case "add_article_schema":
    case "add_product_schema":
    case "add_breadcrumb": {
      const err = expectKeys(raw, ["type", "json"]);
      if (err) throw new Error(err);
      const type = str(raw, "type", 1, 80);
      const json = raw["json"];
      if (!isPlainObject(json)) throw new Error("json must be an object");
      return { type, json };
    }
    case "remove_invalid_jsonld": {
      const err = expectKeys(raw, ["type", "json"]);
      if (err) throw new Error(err);
      const json = raw["json"];
      if (!isPlainObject(json)) throw new Error("json must be an object");
      return { type: str(raw, "type", 1, 80), json };
    }
    case "refresh_content": {
      const err = expectKeys(raw, ["body"]);
      if (err) throw new Error(err);
      return { body: str(raw, "body", 1, 40_000) };
    }
    case "create_page": {
      const err = expectKeys(raw, ["path", "title", "body"]);
      if (err) throw new Error(err);
      const path = str(raw, "path", 1, 200);
      if (!path.startsWith("/")) throw new Error("path must start with /");
      return {
        path,
        title: str(raw, "title", 1, TITLE_MAX),
        body: str(raw, "body", 1, 40_000),
      };
    }
    case "edit_robots_txt":
    case "edit_llms_txt": {
      const err = expectKeys(raw, ["body"]);
      if (err) throw new Error(err);
      return { body: str(raw, "body", 0, 20_000) };
    }
    case "edit_meta_robots": {
      const err = expectKeys(raw, ["content"]);
      if (err) throw new Error(err);
      return { content: str(raw, "content", 1, 200) };
    }
    case "add_redirect": {
      const err = expectKeys(raw, [
        "fromPageId",
        "fromUrl",
        "toPageId",
        "toUrl",
        "status",
      ]);
      if (err) throw new Error(err);
      const status = raw["status"];
      if (status !== 301 && status !== 410)
        throw new Error("status must be 301 or 410");
      return {
        fromPageId: uuid(raw, "fromPageId"),
        fromUrl: absHttpUrl(raw, "fromUrl"),
        toPageId: uuid(raw, "toPageId"),
        toUrl: absHttpUrl(raw, "toUrl"),
        status,
      };
    }
    case "change_canonical": {
      const err = expectKeys(raw, ["canonicalPageId", "canonicalUrl"]);
      if (err) throw new Error(err);
      return {
        canonicalPageId: uuid(raw, "canonicalPageId"),
        canonicalUrl: absHttpUrl(raw, "canonicalUrl"),
      };
    }
    case "change_hreflang": {
      const err = expectKeys(raw, ["lang", "hrefPageId", "hrefUrl"]);
      if (err) throw new Error(err);
      return {
        lang: str(raw, "lang", 2, 20),
        hrefPageId: uuid(raw, "hrefPageId"),
        hrefUrl: absHttpUrl(raw, "hrefUrl"),
      };
    }
    case "regenerate_sitemap":
    case "submit_sitemap": {
      const err = expectKeys(raw, ["sitemapUrl"]);
      if (err) throw new Error(err);
      return { sitemapUrl: absHttpUrl(raw, "sitemapUrl") };
    }
    case "add_image_dimensions": {
      const err = expectKeys(raw, ["selector", "width", "height"]);
      if (err) throw new Error(err);
      const width = raw["width"];
      const height = raw["height"];
      if (typeof width !== "number" || typeof height !== "number") {
        throw new Error("width/height must be numbers");
      }
      if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1
      ) {
        throw new Error("width/height must be positive integers");
      }
      return { selector: str(raw, "selector", 1, 200), width, height };
    }
    case "add_lang": {
      const err = expectKeys(raw, ["lang"]);
      if (err) throw new Error(err);
      return { lang: str(raw, "lang", 2, 20) };
    }
    case "add_viewport": {
      const err = expectKeys(raw, ["content"]);
      if (err) throw new Error(err);
      return { content: str(raw, "content", 1, 120) };
    }
    case "add_og_image": {
      const err = expectKeys(raw, ["hrefPageId", "hrefUrl", "anchor"]);
      if (err) throw new Error(err);
      return {
        hrefPageId: uuid(raw, "hrefPageId"),
        hrefUrl: absHttpUrl(raw, "hrefUrl"),
        anchor: str(raw, "anchor", 1, ANCHOR_MAX),
      };
    }
    case "observe_snapshot":
    case "record_finding":
    case "inspect_indexation":
    case "delete_page": {
      const err = expectKeys(raw, []);
      if (err) throw new Error(err);
      return {};
    }
    case "send_outreach_email":
    case "submit_disavow":
    case "buy_link":
    case "build_pbn":
    case "exchange_links":
    case "cloak":
    case "sneaky_redirect":
    case "hide_text":
    case "write_third_party":
    case "gate_reviews":
    case "incentivize_reviews":
    case "scrape_serp":
    case "generate_ymyl":
    case "generate_affiliate":
    case "create_city_service_page": {
      const err = expectKeys(raw, ["reason"]);
      if (err) throw new Error(err);
      return { reason: str(raw, "reason", 1, 200) };
    }
    default: {
      kind satisfies never;
      throw new Error("unhandled kind");
    }
  }
}

function parseImpact(raw: unknown): Impact {
  if (!isPlainObject(raw)) throw new Error("estimatedImpact must be an object");
  const extra = expectKeys(raw, ["metric", "estimate", "confidence"]);
  if (extra) throw new Error(extra);
  if (raw["metric"] !== "clicks")
    throw new Error("estimatedImpact.metric must be clicks");
  const estimate = raw["estimate"];
  const confidence = raw["confidence"];
  if (typeof estimate !== "number" || !Number.isFinite(estimate) || estimate < 0) {
    throw new Error("estimate must be a non-negative number");
  }
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be 0-1");
  }
  return { metric: "clicks", estimate, confidence };
}

function parseTarget(raw: unknown): { pageId: string; url: string } {
  if (!isPlainObject(raw)) throw new Error("target must be an object");
  const extra = expectKeys(raw, ["pageId", "url"]);
  if (extra) throw new Error(extra);
  return { pageId: uuid(raw, "pageId"), url: absHttpUrl(raw, "url") };
}

const ACTION_KEYS = [
  "id",
  "siteId",
  "kind",
  "tier",
  "target",
  "payload",
  "rationale",
  "findingIds",
  "estimatedImpact",
];

/** Closed-schema parse. Unknown keys, open enums, and free-string URLs fail. */
export function parseAction(
  raw: unknown,
): { ok: true; action: Action } | { ok: false; error: string } {
  try {
    if (!isPlainObject(raw)) return { ok: false, error: "action must be an object" };
    const extra = expectKeys(raw, ACTION_KEYS);
    if (extra) return { ok: false, error: extra };
    const kindRaw = raw["kind"];
    if (typeof kindRaw !== "string" || !isActionKind(kindRaw)) {
      return { ok: false, error: `unknown kind ${String(kindRaw)}` };
    }
    const tier = raw["tier"];
    if (tier !== 0 && tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4) {
      return { ok: false, error: "tier must be 0-4" };
    }
    if (tier !== KIND_TIER[kindRaw]) {
      return { ok: false, error: `tier ${tier} does not match kind ${kindRaw}` };
    }
    const rationale = raw["rationale"];
    if (!Array.isArray(rationale) || rationale.some((r) => typeof r !== "string")) {
      return { ok: false, error: "rationale must be string[]" };
    }
    if (rationale.length < 1 || rationale.length > 12) {
      return { ok: false, error: "rationale must have 1-12 bullets" };
    }
    const findingIds = raw["findingIds"];
    if (
      !Array.isArray(findingIds) ||
      findingIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))
    ) {
      return { ok: false, error: "findingIds must be uuid[]" };
    }
    const action: Action = {
      id: uuid(raw, "id"),
      siteId: uuid(raw, "siteId"),
      kind: kindRaw,
      tier: tier as AutonomyTier,
      target: parseTarget(raw["target"]),
      payload: parsePayload(kindRaw, raw["payload"]),
      rationale: rationale as string[],
      findingIds: findingIds as string[],
      estimatedImpact: parseImpact(raw["estimatedImpact"]),
    };
    return { ok: true, action };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export { ACTION_KIND_SET };
