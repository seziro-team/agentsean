import { createHash } from "node:crypto";
import type { Embeddings } from "./types.js";

export const HASH_DIM = 256;
export const COSINE_MERGE = 0.78;

/**
 * Always-available local embedder. Character 3-grams + tokens hashed into 256
 * buckets, L2-normalised. Used when EmbeddingGemma is not installed (D10).
 */
export function createHashEmbeddings(): Embeddings {
  return {
    model: "local_hash",
    dim: HASH_DIM,
    embed(text: string) {
      return hashEmbed(text, HASH_DIM);
    },
  };
}

/**
 * HTTP embeddings (Ollama EmbeddingGemma-300M or any OpenAI-compatible endpoint).
 * PLAN default is EmbeddingGemma when a local runtime serves it.
 */
export function createHttpEmbeddings(opts: {
  url: string;
  model?: string;
  fetch?: typeof fetch;
  apiKey?: string;
}): Embeddings {
  const model = opts.model ?? "embeddinggemma";
  const fetchFn = opts.fetch ?? fetch;
  return {
    model,
    dim: 0,
    async embed(text: string) {
      const res = await fetchFn(opts.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({ model, prompt: text, input: text }),
      });
      if (!res.ok) throw new Error(`embeddings HTTP ${res.status}`);
      const json = (await res.json()) as { embedding?: number[]; data?: Array<{ embedding: number[] }> };
      const vec = json.embedding ?? json.data?.[0]?.embedding;
      if (!vec?.length) throw new Error("embeddings response missing vector");
      return l2(vec);
    },
  };
}

export function createEmbeddings(opts?: {
  url?: string;
  model?: string;
  fetch?: typeof fetch;
  embed?: Embeddings;
}): Embeddings {
  if (opts?.embed) return opts.embed;
  const url =
    opts?.url ??
    (process.env["SEAN_EMBEDDINGS_URL"]
      ? process.env["SEAN_EMBEDDINGS_URL"]
      : process.env["OLLAMA_HOST"]
        ? `${process.env["OLLAMA_HOST"].replace(/\/$/, "")}/api/embeddings`
        : undefined);
  if (url) {
    return createHttpEmbeddings({
      url,
      ...(opts?.model ? { model: opts.model } : {}),
      ...(opts?.fetch ? { fetch: opts.fetch } : {}),
    });
  }
  return createHashEmbeddings();
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

export function hashEmbed(text: string, dim = HASH_DIM): number[] {
  const vec = Array.from({ length: dim }, () => 0);
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!norm) return vec;
  const grams = new Set<string>();
  for (const tok of norm.split(/[^a-z0-9]+/).filter(Boolean)) {
    grams.add(`w:${tok}`);
    const padded = ` ${tok} `;
    for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  }
  for (const g of grams) {
    const h = fnv(g) % dim;
    vec[h] = (vec[h] ?? 0) + 1;
  }
  return l2(vec);
}

function l2(vec: number[]): number[] {
  let ss = 0;
  for (const x of vec) ss += x * x;
  const n = Math.sqrt(ss) || 1;
  return vec.map((x) => x / n);
}

function fnv(s: string): number {
  const buf = createHash("sha256").update(s).digest();
  return buf.readUInt32BE(0);
}

export function textHash(text: string, model: string): string {
  return createHash("sha256").update(`${model}\n${text}`).digest("hex");
}
