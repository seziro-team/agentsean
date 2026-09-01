import { describe, expect, it } from "vitest";
import { trainDifficulty } from "./difficulty.js";
import type { QueryDaily } from "./types.js";

function row(query: string, position: number, impressions: number): QueryDaily {
  return {
    date: "2026-08-01",
    query,
    clicks: position <= 10 ? 10 : 0,
    impressions,
    position,
  };
}

describe("per-site difficulty", () => {
  it("trains on the site's own GSC top-10 labels and scores a new query", () => {
    const rows: QueryDaily[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(row(`brand widget ${i}`, 3, 800));
      rows.push(row(`cheap buy xyz ${i} online now`, 28, 40));
    }
    const model = trainDifficulty(rows, ["brand"]);
    expect(model.trained).toBe(true);
    const easy = model.predict("brand widget extra", 900);
    const hard = model.predict("cheap buy xyz extra online now", 20);
    expect(easy).not.toBeNull();
    expect(hard).not.toBeNull();
    expect(easy!).toBeLessThan(hard!);
  });

  it("refuses to invent a score with too few labels", () => {
    const model = trainDifficulty([row("one", 4, 10)]);
    expect(model.trained).toBe(false);
    expect(model.predict("one", 10)).toBeNull();
  });
});
