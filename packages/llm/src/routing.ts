import type { LlmProvider, ModelClass, ModelRates } from "./types.js";

/**
 * Model routing from PLAN §Phase 5.
 * Cheap = classification/triage (Haiku 4.5 / Flash-Lite).
 * Mid = drafting (Sonnet 5, $2/$10 per MTok).
 * Top = weekly strategy / hard judgement (Opus 5), rare.
 */
export const DEFAULT_MODELS: Record<LlmProvider, Record<ModelClass, string>> = {
  anthropic: {
    cheap: "claude-haiku-4-5",
    mid: "claude-sonnet-5",
    top: "claude-opus-5",
  },
  openai: {
    cheap: "gpt-4.1-mini",
    mid: "gpt-4.1",
    top: "gpt-4.1",
  },
  google: {
    cheap: "gemini-2.5-flash-lite",
    mid: "gemini-2.5-flash",
    top: "gemini-2.5-pro",
  },
  openrouter: {
    cheap: "anthropic/claude-haiku-4.5",
    mid: "anthropic/claude-sonnet-5",
    top: "anthropic/claude-opus-5",
  },
  ollama: {
    cheap: "llama3.2",
    mid: "llama3.1",
    top: "llama3.1",
  },
};

export const CLASS_RATES: Record<ModelClass, ModelRates> = {
  cheap: { inputPerMTok: 0.25, outputPerMTok: 1.25 },
  mid: { inputPerMTok: 2, outputPerMTok: 10 },
  top: { inputPerMTok: 15, outputPerMTok: 75 },
};

export function resolveModel(
  provider: LlmProvider,
  modelClass: ModelClass,
  overrides?: Partial<Record<ModelClass, string>> | undefined,
): string {
  return overrides?.[modelClass] ?? DEFAULT_MODELS[provider][modelClass];
}

export function estimateCostUsd(
  modelClass: ModelClass,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = CLASS_RATES[modelClass];
  return (
    (inputTokens / 1_000_000) * rates.inputPerMTok +
    (outputTokens / 1_000_000) * rates.outputPerMTok
  );
}

export function taskClass(task: "classify" | "draft" | "strategy"): ModelClass {
  if (task === "classify") return "cheap";
  if (task === "strategy") return "top";
  return "mid";
}
