import { CHECKS as RAW } from "./catalogue-data.js";
import { OPENSEO_COPY } from "./openseo-seed.js";
import type { CheckDefinition } from "./types.js";

const overlay: CheckDefinition[] = RAW.map((c) => {
  const extra = OPENSEO_COPY[c.id];
  if (!extra) return c;
  return {
    ...c,
    explanation: extra.explanation,
    fixTemplate: extra.howToFix,
    name: extra.title || c.name,
  };
});

export const CHECKS: readonly CheckDefinition[] = overlay;

const BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

export function getCheck(id: string): CheckDefinition | undefined {
  return BY_ID.get(id);
}

export function checksByCategory(category: string): CheckDefinition[] {
  return CHECKS.filter((c) => c.category === category);
}

export function categories(): string[] {
  return [...new Set(CHECKS.map((c) => c.category))].toSorted();
}
