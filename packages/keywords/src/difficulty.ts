import type { DifficultyModel, QueryDaily } from "./types.js";

/**
 * Per-site difficulty from the user's own GSC top-10 labels — not a vendor score.
 * Label 0 (easy) if avg position ≤ 10, 1 (hard) if avg position ≥ 20.
 */
export function trainDifficulty(rows: QueryDaily[], brandTerms: string[] = []): DifficultyModel {
  const agg = aggregate(rows);
  const samples: Array<{ x: number[]; y: number }> = [];
  for (const row of agg.values()) {
    if (row.position === null) continue;
    let y: number | null = null;
    if (row.position <= 10) y = 0;
    else if (row.position >= 20) y = 1;
    if (y === null) continue;
    samples.push({ x: features(row.query, row.impressions, brandTerms), y });
  }
  if (samples.length < 10) {
    return {
      trained: false,
      samples: samples.length,
      note: `Need ≥10 GSC queries with a clear top-10 or 20+ position; have ${samples.length}.`,
      predict: () => null,
    };
  }
  const weights = fitLogistic(samples, 250);
  return {
    trained: true,
    samples: samples.length,
    note: `Trained on ${samples.length} GSC labels from this site.`,
    predict(query, impressions) {
      const p = sigmoid(dot(weights, features(query, impressions, brandTerms)));
      return Math.round(p * 100);
    },
  };
}

export function features(query: string, impressions: number, brandTerms: string[]): number[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const hasDigit = /\d/.test(query) ? 1 : 0;
  const brand = brandTerms.some((t) => query.toLowerCase().includes(t.toLowerCase())) ? 1 : 0;
  return [1, words.length, query.length, hasDigit, Math.log1p(impressions), brand];
}

function aggregate(rows: QueryDaily[]): Map<string, { query: string; impressions: number; position: number | null }> {
  const map = new Map<string, { query: string; impressions: number; position: number; n: number }>();
  for (const r of rows) {
    const cur = map.get(r.query) ?? { query: r.query, impressions: 0, position: 0, n: 0 };
    cur.impressions += r.impressions;
    if (r.position !== null) {
      cur.position += r.position;
      cur.n++;
    }
    map.set(r.query, cur);
  }
  const out = new Map<string, { query: string; impressions: number; position: number | null }>();
  for (const [q, v] of map) {
    out.set(q, { query: q, impressions: v.impressions, position: v.n ? v.position / v.n : null });
  }
  return out;
}

function fitLogistic(samples: Array<{ x: number[]; y: number }>, iters: number): number[] {
  const dim = samples[0]?.x.length ?? 1;
  const w = Array.from({ length: dim }, () => 0);
  const lr = 0.05;
  for (let i = 0; i < iters; i++) {
    const g = Array.from({ length: dim }, () => 0);
    for (const s of samples) {
      const p = sigmoid(dot(w, s.x));
      const err = p - s.y;
      for (let j = 0; j < dim; j++) g[j] = (g[j] ?? 0) + err * (s.x[j] ?? 0);
    }
    for (let j = 0; j < dim; j++) w[j] = (w[j] ?? 0) - (lr * (g[j] ?? 0)) / samples.length;
  }
  return w;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}
