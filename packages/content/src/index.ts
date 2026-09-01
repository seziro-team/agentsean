export { decayingPages } from "./decay.js";
export { contentScore, countMentions } from "./score.js";
export {
  stripHtml,
  wordCount,
  extractHeadings,
  extractEntities,
  extractQuestions,
  numericClaims,
  factsFromText,
} from "./extract.js";
export { buildBrief } from "./brief.js";
export { runPublishGate, coverageScore, type GateContext } from "./gate.js";
export { draftFromBrief, actionFromDraft, briefPrompt } from "./generate.js";
export { runContentJob, pickCandidates } from "./engine.js";
export {
  loadStyleProfile,
  upsertStyleProfile,
  saveBrief,
  saveDraft,
  listContent,
} from "./persist.js";
export {
  applyDisclosure,
  disclosureFor,
  hasDisclosure,
  HTML_COMMENT,
} from "./disclosure.js";
export { evidenceForContentChange, EVIDENCE_MEANING, DEFAULT_EVIDENCE_TIER } from "./evidence.js";
export type {
  ContentBrief,
  ContentDraft,
  ContentKind,
  ContentCandidate,
  PublishGateResult,
  GateCheck,
  StyleProfile,
  EvidenceTier,
  DecayingPage,
  RunContentOptions,
  RunContentResult,
  PageDaily,
  QueryDaily,
} from "./types.js";
export { DEFAULT_STYLE } from "./types.js";
