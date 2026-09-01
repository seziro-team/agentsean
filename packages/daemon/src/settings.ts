import { eq } from "drizzle-orm";
import { settings, type SqliteDatabase } from "@agentsean/db";

export function getSetting(db: SqliteDatabase, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setSetting(db: SqliteDatabase, key: string, value: string): void {
  const now = new Date().toISOString();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, key)).run();
    return;
  }
  db.insert(settings).values({ key, value, updatedAt: now }).run();
}

export function getSettingNumber(db: SqliteDatabase, key: string, fallback: number): number {
  const raw = getSetting(db, key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
