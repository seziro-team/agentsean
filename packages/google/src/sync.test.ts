import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSqlite } from "@agentsean/db";
import { openCredentialStore } from "@agentsean/credentials";
import { Secret } from "@agentsean/credentials";
import { GOOGLE_OAUTH_ACCOUNT } from "./scopes.js";
import {
  persistGa4Daily,
  persistGscDaily,
  upsertGa4Connection,
  upsertGscConnection,
} from "./persist.js";
import { seedCuratedChangepoints } from "./incidents.js";
import { reconcileSite } from "./reconcile.js";
import { loadAuditExtras } from "./audit-extras.js";
import { saveGrant } from "./tokens.js";

describe("stored GSC + GA4 + residual + audit extras", () => {
  it("reconciles to an explicit residual and annotates Google updates", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-sync-"));
    const { sqlite, db } = openSqlite(":memory:");
    sqlite.exec(
      `INSERT INTO sites (id, origin, created_at, updated_at) VALUES ('s1','https://example.com',datetime('now'),datetime('now'))`,
    );
    upsertGscConnection(db, { siteId: "s1", siteUrl: "https://example.com/" });
    upsertGa4Connection(db, { siteId: "s1", propertyId: "properties/1" });
    persistGscDaily(
      db,
      "s1",
      "web",
      "2026-08-19",
      { clicks: 50, impressions: 900, ctr: 0.05, position: 8 },
      "final",
      null,
    );
    persistGa4Daily(db, "s1", "2026-08-19", {
      sessions: 40,
      organicSessions: 42,
      engagedSessions: 20,
      conversions: 1,
    });
    seedCuratedChangepoints(db);
    const rows = reconcileSite(db, "s1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.gscClicks).toBe(50);
    expect(rows[0]?.ga4OrganicSessions).toBe(42);
    expect(rows[0]?.residual).toBe(-8);
    expect(rows[0]?.notes).toMatch(/residual/);
    expect(rows[0]?.notes).toMatch(/spam update/i);

    const extras = loadAuditExtras(db, "s1");
    expect(extras.gsc).toBeTruthy();

    const store = openCredentialStore({ dir, backend: "encrypted-file" });
    void store;
    sqlite.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stores a Google grant without logging the refresh token", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-grant-"));
    const store = openCredentialStore({ dir, backend: "encrypted-file" });
    await saveGrant(store, {
      accessToken: "at",
      refreshToken: "super-secret-rt",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scopes: "https://www.googleapis.com/auth/webmasters",
      tokenType: "Bearer",
      issuedAt: new Date().toISOString(),
      refreshTokenExpiresAt: null,
      email: "user@example.com",
      googleSub: "sub",
      mode: "byo",
      testingModeSuspected: false,
    });
    const vault = fs.readFileSync(path.join(dir, "secrets", "vault.json"), "utf8");
    expect(vault).not.toContain("super-secret-rt");
    const got = await store.get(GOOGLE_OAUTH_ACCOUNT);
    expect(got).toBeInstanceOf(Secret);
    expect(String(got)).toBe("[redacted]");
    expect(got?.unwrap()).toContain("super-secret-rt");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
