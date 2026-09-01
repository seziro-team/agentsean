import { describe, expect, it } from "vitest";
import { getDatabaseProvider } from "./provider.js";
import { PGVECTOR_EXTENSION_SQL, pgvectorIndexSql } from "./pg/vector.js";

describe("getDatabaseProvider", () => {
  it("defaults to sqlite", () => {
    expect(getDatabaseProvider(undefined)).toBe("sqlite");
  });
});

describe("pgvector (hosted-only, not dual-dialect)", () => {
  it("emits CREATE EXTENSION and does not add a drizzle table", () => {
    expect(PGVECTOR_EXTENSION_SQL).toMatch(/vector/);
    expect(pgvectorIndexSql()).toMatch(/ivfflat/);
  });
});
