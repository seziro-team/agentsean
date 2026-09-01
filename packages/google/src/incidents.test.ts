import { describe, expect, it } from "vitest";
import { openSqlite } from "@agentsean/db";
import {
  parseIncidentsJson,
  seedCuratedChangepoints,
  SERVICE_RANKING,
  upsertIncidents,
} from "./incidents.js";
import { changepointsOverlapping } from "./incidents.js";
import { computeResidual, reconcileSite } from "./reconcile.js";
import { persistGa4Daily, persistGscDaily } from "./persist.js";

describe("incidents + residual", () => {
  it("parses incidents.json rows and upserts by id", () => {
    const { sqlite, db } = openSqlite(":memory:");
    const rows = parseIncidentsJson([
      {
        id: "abc",
        begin: "2026-08-18T16:27:00+00:00",
        end: "2026-08-21T08:49:00+00:00",
        external_desc: "August 2026 spam update",
        service_key: SERVICE_RANKING,
        service_name: "Ranking",
      },
    ]);
    expect(rows[0]?.id).toBe("abc");
    expect(upsertIncidents(db, rows)).toBe(1);
    expect(upsertIncidents(db, rows)).toBe(1);
    const overlap = changepointsOverlapping(db, "2026-08-19", "2026-08-19");
    expect(overlap.some((c) => c.title.includes("spam"))).toBe(true);
    sqlite.close();
  });

  it("seeds curated confounders including impressions bug and num=100", () => {
    const { sqlite, db } = openSqlite(":memory:");
    seedCuratedChangepoints(db);
    const bug = changepointsOverlapping(db, "2025-12-01", "2025-12-02");
    expect(bug.some((c) => c.title.includes("impressions logging"))).toBe(true);
    const num = changepointsOverlapping(db, "2025-09-12", "2025-09-12");
    expect(num.some((c) => c.title.includes("num=100"))).toBe(true);
    sqlite.close();
  });

  it("stores an explicit GSC vs GA4 residual", () => {
    const r = computeResidual(100, 80);
    expect(r.residual).toBe(-20);
    expect(r.notes).toMatch(/residual/i);

    const { sqlite, db } = openSqlite(":memory:");
    sqlite.exec(
      `INSERT INTO sites (id, origin, created_at, updated_at) VALUES ('s1','https://example.com',datetime('now'),datetime('now'))`,
    );
    persistGscDaily(
      db,
      "s1",
      "web",
      "2026-08-01",
      { clicks: 100, impressions: 1000, ctr: 0.1, position: 4 },
      "final",
      null,
    );
    persistGa4Daily(db, "s1", "2026-08-01", {
      sessions: 90,
      organicSessions: 80,
      engagedSessions: 40,
      conversions: 2,
    });
    seedCuratedChangepoints(db);
    const rows = reconcileSite(db, "s1");
    expect(rows[0]?.residual).toBe(-20);
    expect(rows[0]?.gscClicks).toBe(100);
    expect(rows[0]?.ga4OrganicSessions).toBe(80);
    sqlite.close();
  });
});
