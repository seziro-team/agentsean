/**
 * Track A = measured (cohort-able, 56-day window).
 * Track B = obviously-correct fixes applied everywhere, no hold-out, no causal claim.
 * Routing rule: if a competent human SEO would refuse to hold this back as a control, it's Track B.
 */

export const TRACK_B_KINDS = new Set([
  "fix_broken_internal_link",
  "add_image_alt",
  "add_canonical",
  "remove_sitemap_404",
  "fix_malformed_schema",
  "repair_redirect_chain",
]);

export const TRACK_A_KINDS = new Set([
  "rewrite_title",
  "rewrite_meta_description",
  "rewrite_h1",
  "inject_jsonld",
  "insert_internal_link",
  "refresh_content",
  "create_page",
]);

export type Track = "A" | "B";

export function trackForActionKind(kind: string): Track {
  if (TRACK_B_KINDS.has(kind)) return "B";
  if (TRACK_A_KINDS.has(kind)) return "A";
  return "B";
}
