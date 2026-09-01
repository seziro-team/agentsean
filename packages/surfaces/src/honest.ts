/** Claims we refuse to sell as AEO levers. PLAN Phase 9 / Ahrefs DiD / arXiv:2604.25707. */

export const AEO_REFUSALS = [
  {
    claim: "Add schema markup to win AI citations",
    truth: "Ahrefs matched difference-in-differences (1,885 pages): schema has no measurable effect on AI citations.",
  },
  {
    claim: "Longer pages get cited more",
    truth: "Content length is uncorrelated with AI citations (r = 0.04).",
  },
  {
    claim: "Publish llms.txt for GEO",
    truth: "97% of published llms.txt files are never fetched (Ahrefs, 137,210 domains). Google does not support the file.",
  },
] as const;

export const EVIDENCE_SPEC = [
  "definitions",
  "numeric_facts",
  "comparisons",
  "procedures",
] as const;

export const PANEL_COST_USD = 1.11;
export const PANEL_PROMPTS = 20;
export const PANEL_ENGINES = ["chatgpt", "gemini"] as const;

export function refuseAeoLever(claim: string): string {
  const hit = AEO_REFUSALS.find((r) => r.claim.toLowerCase() === claim.toLowerCase());
  if (hit) return hit.truth;
  return "Sean does not sell schema, word count, or llms.txt as AEO levers. Citation selection and answer absorption are distinct outcomes; high-impact pages are dense in extractable evidence.";
}
