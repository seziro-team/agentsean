// Anchored on `<head` with a word boundary so the engine does not retry the
// attribute run from every position in a document full of `<head`-alikes
// (js/polynomial-redos).

import type { StyleProfile } from "./types.js";
import { findOpenTag } from "@agentsean/actions";

export const HTML_COMMENT =
  "<!-- ai-generated: Agent Sean. EU AI Act Art. 50 machine-readable mark. -->";

export const META_TAG = '<meta name="ai-generated" content="true">';

export const VISIBLE_NOTE =
  '<p class="ai-disclosure">This page includes AI-generated text produced by Agent Sean.</p>';

export function disclosureFor(profile: StyleProfile): string {
  if (profile.disclosure === "none") return "";
  if (profile.disclosure === "meta") return META_TAG;
  if (profile.disclosure === "visible") return VISIBLE_NOTE;
  return HTML_COMMENT;
}

export function applyDisclosure(body: string, profile: StyleProfile): string {
  const mark = disclosureFor(profile);
  if (!mark) return body;
  if (body.includes(mark) || body.includes("ai-generated")) return body;
  if (profile.disclosure === "meta") {
    if (/<head[\s>]/i.test(body)) {
      const head = findOpenTag(body, "head");
      if (head) return body.slice(0, head.end) + `\n${mark}` + body.slice(head.end);
      return body;
    }
    return `${mark}\n${body}`;
  }
  if (profile.disclosure === "visible") {
    if (/<\/body>/i.test(body)) return body.replace(/<\/body>/i, `${mark}\n</body>`);
    return `${body}\n\n${mark}\n`;
  }
  return `${mark}\n${body}`;
}

export function hasDisclosure(body: string, profile: StyleProfile): boolean {
  if (profile.disclosure === "none") return true;
  if (profile.disclosure === "visible")
    return /ai-disclosure|AI-generated text produced by Agent Sean/i.test(body);
  return /ai-generated/i.test(body);
}
