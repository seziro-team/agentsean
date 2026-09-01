import type { VectorHit, VectorStore } from "./types.js";
import { cosine } from "./embeddings.js";

/**
 * Brute-force cosine KNN. sqlite-vec 0.1.9 is still alpha with brute-force only,
 * so this is the honest default. LanceDB is the escape hatch above ~200k vectors.
 */
export function createMemoryVectorStore(): VectorStore {
  const rows = new Map<string, number[]>();
  return {
    upsert(id, vector) {
      rows.set(id, vector);
    },
    knn(vector, k) {
      const hits: VectorHit[] = [];
      for (const [id, v] of rows) {
        hits.push({ id, score: cosine(vector, v) });
      }
      return hits.toSorted((a, b) => b.score - a.score).slice(0, k);
    },
  };
}

export function createLanceVectorStore(): VectorStore {
  throw new Error(
    "LanceDB is the escape hatch above ~200k vectors and is not bundled. Stay on the in-memory/SQLite brute-force store until then.",
  );
}
