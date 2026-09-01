import { describe, expect, it } from "vitest";
import { openSqlite } from "./client.js";
import { findings, sites } from "./schema.js";
import { ftsMatchQuery, searchFindingsFts } from "./fts.js";

describe("findings FTS5", () => {
  it("builds a prefix AND query and ignores punctuation", () => {
    expect(ftsMatchQuery("  Title, tag!  ")).toBe("Title* AND tag*");
    expect(ftsMatchQuery("???")).toBeNull();
  });

  it("finds a title by token and keyset-paginates", () => {
    const { db, sqlite } = openSqlite(":memory:");
    const now = "2026-01-01T00:00:00.000Z";
    db.insert(sites)
      .values({
        id: "s1",
        origin: "https://example.com",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(findings)
      .values([
        {
          id: "f1",
          siteId: "s1",
          pageId: null,
          ruleId: "title-missing",
          severity: "high",
          autonomyTier: "T1",
          title: "Missing title tag on the homepage",
          explanation: "Add a unique title",
          evidence: null,
          status: "open",
          fingerprint: "fp1",
          firstDetectedAt: "2026-01-02T00:00:00.000Z",
          resolvedAt: null,
        },
        {
          id: "f2",
          siteId: "s1",
          pageId: null,
          ruleId: "meta-short",
          severity: "medium",
          autonomyTier: "T1",
          title: "Meta description is too short",
          explanation: "Expand the description",
          evidence: null,
          status: "open",
          fingerprint: "fp2",
          firstDetectedAt: "2026-01-01T00:00:00.000Z",
          resolvedAt: null,
        },
      ])
      .run();

    const hits = searchFindingsFts(sqlite, { q: "title homepage", limit: 10 });
    expect(hits.map((h) => h.id)).toEqual(["f1"]);

    const page = searchFindingsFts(sqlite, {
      q: "",
      siteId: "s1",
      limit: 1,
    });
    expect(page).toHaveLength(1);
    expect(page[0]?.id).toBe("f1");
    const next = searchFindingsFts(sqlite, {
      q: "",
      siteId: "s1",
      limit: 1,
      cursor: { detectedAt: page[0]!.firstDetectedAt, id: page[0]!.id },
    });
    expect(next.map((h) => h.id)).toEqual(["f2"]);
    sqlite.close();
  });
});
