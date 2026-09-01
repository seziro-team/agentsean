import { PLAYBOOKS } from "./catalog.js";
import type { Playbook } from "./types.js";

export type { Playbook, PlaybookInput, DecisionRule, PlaybookSource } from "./types.js";
export { PLAYBOOKS } from "./catalog.js";

const BY_ID = new Map(PLAYBOOKS.map((p) => [p.id, p]));

export function getPlaybook(id: string): Playbook | undefined {
  return BY_ID.get(id);
}

export function playbookVersion(id: string): string | undefined {
  return BY_ID.get(id)?.version;
}

export function adaptedFromOpenseo(): Playbook[] {
  return PLAYBOOKS.filter((p) => p.source?.project === "openseo");
}
