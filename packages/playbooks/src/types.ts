export type PlaybookSource = {
  project: "openseo";
  skill: string;
  treatment: "ADAPT";
  copyright: string;
};

export type PlaybookInput = {
  name: string;
  type: string;
  required: boolean;
  notes: string;
};

export type DecisionRule = {
  id: string;
  when: string;
  action: string;
};

export type PlaybookProperty = {
  type: string;
  description: string;
};

export type Playbook = {
  id: string;
  version: string;
  title: string;
  summary: string;
  inputs: PlaybookInput[];
  decisionRules: DecisionRule[];
  outputSchema: {
    type: "object";
    required: string[];
    properties: Record<string, PlaybookProperty>;
  };
  guardrails: string[];
  source?: PlaybookSource | undefined;
};
