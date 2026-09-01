import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openSqlite } from "./client.js";
import { ALL_TABLES } from "./tables.js";
import { sites, settings } from "./sqlite/schema.js";

describe("sqlite client", () => {
  it("creates every core table and round-trips a site", () => {
    const { sqlite, db } = openSqlite(":memory:");
    const names = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all() as { name: string }[];
    const tableNames = names
      .map((r) => r.name)
      .filter((n) => !n.startsWith("sqlite_") && !n.startsWith("findings_fts"));
    expect(tableNames.toSorted()).toEqual([...ALL_TABLES].toSorted());

    const now = new Date().toISOString();
    const id = randomUUID();
    db.insert(sites)
      .values({
        id,
        origin: "https://example.com",
        name: "Example",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(sites).where(eq(sites.id, id)).get();
    expect(row?.origin).toBe("https://example.com");
    expect(row?.autonomyMode).toBe("full_auto");
    expect(row?.killswitch).toBe(0);

    db.insert(settings)
      .values({ key: "bind_host", value: "127.0.0.1", updatedAt: now })
      .run();
    sqlite.close();
  });

  it("rejects unknown database providers", async () => {
    const { getDatabaseProvider } = await import("./provider.js");
    expect(() => getDatabaseProvider("d1")).toThrow(/Unknown SEAN_DATABASE_PROVIDER/);
    expect(getDatabaseProvider("sqlite")).toBe("sqlite");
    expect(getDatabaseProvider("postgres")).toBe("postgres");
  });
});
