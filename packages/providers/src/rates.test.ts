import { describe, expect, it } from "vitest";
import {
  DFS_RATES,
  freeEstimate,
  keywordsDataTasks,
  paidEstimate,
  roundUsd,
} from "./rates.js";

describe("provider rates", () => {
  it("quotes DataForSEO SERP at $0.60/1k before the call", () => {
    const q = paidEstimate({
      provider: "dataforseo",
      capability: "serp",
      operation: "organic_standard",
      units: 200,
      unitUsd: DFS_RATES.serpPerKeyword,
    });
    expect(q.free).toBe(false);
    expect(q.estimatedUsd).toBe(roundUsd(200 * 0.0006));
    expect(q.estimatedUsd).toBe(0.12);
  });

  it("quotes Keywords Data as $0.06 per 1,000-keyword task", () => {
    expect(keywordsDataTasks(1)).toBe(1);
    expect(keywordsDataTasks(1000)).toBe(1);
    expect(keywordsDataTasks(1001)).toBe(2);
    const q = paidEstimate({
      provider: "dataforseo",
      capability: "volume",
      operation: "search_volume",
      units: keywordsDataTasks(50),
      unitUsd: DFS_RATES.keywordsDataPerTask,
    });
    expect(q.estimatedUsd).toBe(0.06);
  });

  it("quotes free GSC demand at $0", () => {
    const q = freeEstimate("gsc", "keywords", "search_analytics", 25_000);
    expect(q.free).toBe(true);
    expect(q.estimatedUsd).toBe(0);
  });
});
