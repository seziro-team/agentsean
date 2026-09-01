export type ModelClass = "cheap" | "mid" | "top";

export type LlmProvider = "anthropic" | "openai" | "google" | "openrouter" | "ollama";

export type GenerateRequest = {
  class: ModelClass;
  system: string;
  prompt: string;
  json?: boolean | undefined;
};

export type GenerateResult = {
  text: string;
  model: string;
  class: ModelClass;
  provider: LlmProvider;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cached: boolean;
};

export type GenerateFn = (req: GenerateRequest) => Promise<GenerateResult>;

export type LlmConfig = {
  provider: LlmProvider;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  models?: Partial<Record<ModelClass, string>> | undefined;
  generate?: GenerateFn | undefined;
  fetch?: typeof fetch | undefined;
};

/** Per-million-token list prices used to debit the cost ledger before the call. */
export type ModelRates = {
  inputPerMTok: number;
  outputPerMTok: number;
};
