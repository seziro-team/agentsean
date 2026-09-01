import { describe, expect, it } from "vitest";
import { clusterQueries, confirmSerpMerges } from "./cluster.js";
import { createHashEmbeddings } from "./embeddings.js";

describe("hybrid clustering", () => {
  it("drafts semantic clusters then confirms merges with ≥3 shared top-10 URLs", async () => {
    const emb = createHashEmbeddings();
    const drafted = await clusterQueries(
      ["seo tools", "seo tool", "local plumber nyc", "plumber in new york"],
      emb,
    );
    expect(drafted.length).toBeGreaterThanOrEqual(2);

    const serp = new Map<string, string[]>([
      [
        "seo tools",
        [
          "https://a.test/1",
          "https://b.test/2",
          "https://c.test/3",
          "https://d.test/4",
        ],
      ],
      [
        "seo software",
        [
          "https://a.test/1",
          "https://b.test/2",
          "https://c.test/3",
          "https://e.test/5",
        ],
      ],
    ]);
    const merged = confirmSerpMerges(
      [
        { id: "1", label: "seo tools", members: ["seo tools"], serpConfirmed: false },
        {
          id: "2",
          label: "seo software",
          members: ["seo software"],
          serpConfirmed: false,
        },
      ],
      serp,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.serpConfirmed).toBe(true);
    expect(merged[0]?.members).toEqual(
      expect.arrayContaining(["seo tools", "seo software"]),
    );
  });
});
