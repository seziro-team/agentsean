import { describe, expect, it } from "vitest";
import { COSINE_MERGE, cosine, createHashEmbeddings, hashEmbed } from "./embeddings.js";
import { createLanceVectorStore, createMemoryVectorStore } from "./vectors.js";

describe("local embeddings", () => {
  it("places near-paraphrases above the 0.78 merge threshold", () => {
    const a = hashEmbed("best seo tools for agencies");
    const b = hashEmbed("best seo tools for an agency");
    const c = hashEmbed("how to bake sourdough bread");
    expect(cosine(a, b)).toBeGreaterThan(COSINE_MERGE);
    expect(cosine(a, c)).toBeLessThan(0.4);
  });

  it("exposes a swappable vector store and refuses bundled LanceDB", () => {
    const store = createMemoryVectorStore();
    const emb = createHashEmbeddings();
    store.upsert("a", emb.embed("seo audit checklist") as number[]);
    store.upsert("b", emb.embed("seo audit check list") as number[]);
    const hits = store.knn(emb.embed("seo audit checklist") as number[], 2);
    expect(hits[0]?.id).toBe("a");
    expect(hits[0]?.score).toBeGreaterThan(0.99);
    expect(() => createLanceVectorStore()).toThrow(/escape hatch/);
  });
});
