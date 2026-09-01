import { randomUUID } from "node:crypto";
import { costLedger, type SqliteDatabase } from "@agentsean/db";
import type { CredentialStore } from "@agentsean/credentials";
import { estimateCostUsd, resolveModel } from "./routing.js";
import type {
  GenerateRequest,
  GenerateResult,
  LlmConfig,
  LlmProvider,
} from "./types.js";

const WRITE_SECRET_RE =
  /\b(password|client_secret|refresh_token|access_token|private_key|github_token|ghs_|sk-ant-|sk-or-)\b/i;

export class LlmNotConfiguredError extends Error {
  override name = "LlmNotConfiguredError";
  constructor() {
    super("No LLM key configured. Set a BYOK provider in Settings or OLLAMA_HOST.");
  }
}

export class LlmCredentialLeakError extends Error {
  override name = "LlmCredentialLeakError";
  constructor(detail: string) {
    super(`Refusing to send credentials to the LLM: ${detail}`);
  }
}

export function assertNoSecrets(text: string): void {
  if (WRITE_SECRET_RE.test(text)) {
    throw new LlmCredentialLeakError("prompt or system contains a credential-shaped token");
  }
}

export async function loadLlmConfig(opts: {
  store?: CredentialStore | undefined;
  provider?: LlmProvider | undefined;
  generate?: LlmConfig["generate"];
  fetch?: typeof fetch | undefined;
}): Promise<LlmConfig | null> {
  if (opts.generate) {
    return {
      provider: opts.provider ?? "anthropic",
      generate: opts.generate,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    };
  }
  const provider = opts.provider ?? detectProvider();
  if (!provider) return null;
  if (provider === "ollama") {
    return {
      provider,
      baseUrl: process.env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434",
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    };
  }
  if (!opts.store) return null;
  const secret = await opts.store.get(`llm:${provider}`);
  if (!secret) return null;
  const apiKey = secret.unwrap();
  return {
    provider,
    apiKey,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  };
}

function detectProvider(): LlmProvider | null {
  if (process.env["OLLAMA_HOST"]) return "ollama";
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic";
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["GOOGLE_API_KEY"] || process.env["GEMINI_API_KEY"]) return "google";
  if (process.env["OPENROUTER_API_KEY"]) return "openrouter";
  return null;
}

export async function generateText(
  cfg: LlmConfig,
  req: GenerateRequest,
): Promise<GenerateResult> {
  assertNoSecrets(req.system);
  assertNoSecrets(req.prompt);
  if (cfg.generate) {
    const out = await cfg.generate(req);
    assertNoSecrets(out.text);
    return out;
  }
  const model = resolveModel(cfg.provider, req.class, cfg.models);
  const fetchFn = cfg.fetch ?? fetch;
  if (cfg.provider === "anthropic") {
    return anthropicGenerate(cfg, req, model, fetchFn);
  }
  if (cfg.provider === "ollama") {
    return ollamaGenerate(cfg, req, model, fetchFn);
  }
  if (cfg.provider === "google") {
    return googleGenerate(cfg, req, model, fetchFn);
  }
  return openAiCompatibleGenerate(cfg, req, model, fetchFn);
}

async function anthropicGenerate(
  cfg: LlmConfig,
  req: GenerateRequest,
  model: string,
  fetchFn: typeof fetch,
): Promise<GenerateResult> {
  if (!cfg.apiKey) throw new LlmNotConfiguredError();
  const res = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = json.content?.map((c) => c.text ?? "").join("") ?? "";
  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;
  return {
    text,
    model,
    class: req.class,
    provider: "anthropic",
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(req.class, inputTokens, outputTokens),
    cached: false,
  };
}

async function openAiCompatibleGenerate(
  cfg: LlmConfig,
  req: GenerateRequest,
  model: string,
  fetchFn: typeof fetch,
): Promise<GenerateResult> {
  if (!cfg.apiKey) throw new LlmNotConfiguredError();
  const url =
    cfg.baseUrl ??
    (cfg.provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions");
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const inputTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;
  return {
    text,
    model,
    class: req.class,
    provider: cfg.provider,
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(req.class, inputTokens, outputTokens),
    cached: false,
  };
}

async function googleGenerate(
  cfg: LlmConfig,
  req: GenerateRequest,
  model: string,
  fetchFn: typeof fetch,
): Promise<GenerateResult> {
  if (!cfg.apiKey) throw new LlmNotConfiguredError();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    text,
    model,
    class: req.class,
    provider: "google",
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(req.class, inputTokens, outputTokens),
    cached: false,
  };
}

async function ollamaGenerate(
  cfg: LlmConfig,
  req: GenerateRequest,
  model: string,
  fetchFn: typeof fetch,
): Promise<GenerateResult> {
  const base = (cfg.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const res = await fetchFn(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const text = json.message?.content ?? "";
  const inputTokens = json.prompt_eval_count ?? 0;
  const outputTokens = json.eval_count ?? 0;
  return {
    text,
    model,
    class: req.class,
    provider: "ollama",
    inputTokens,
    outputTokens,
    costUsd: 0,
    cached: false,
  };
}

export function recordLlmCost(
  db: SqliteDatabase,
  opts: {
    siteId: string | null;
    result: GenerateResult;
    operation: string;
  },
): void {
  const now = new Date().toISOString();
  db.insert(costLedger)
    .values({
      id: randomUUID(),
      siteId: opts.siteId,
      ts: now,
      provider: opts.result.provider,
      model: opts.result.model,
      operation: opts.operation,
      inputTokens: opts.result.inputTokens,
      outputTokens: opts.result.outputTokens,
      costUsd: opts.result.costUsd,
      currency: "USD",
      meta: JSON.stringify({ class: opts.result.class, cached: opts.result.cached }),
      createdAt: now,
    })
    .run();
}

/** Confirms the Vercel AI SDK 7 runtime is present without calling a provider. */
export async function assertSdkPresent(): Promise<string> {
  const mod = await import("ai");
  if (typeof mod.generateText !== "function") {
    throw new Error("ai package is present but generateText is missing");
  }
  return "7";
}
