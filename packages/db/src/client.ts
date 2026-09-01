import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteSchema from "./sqlite/schema.js";
import { SQLITE_INIT_SQL } from "./sqlite/init-sql.js";

export type SqliteDatabase = ReturnType<typeof openSqlite>["db"];

export function applySqliteSchema(sqlite: Database.Database): void {
  sqlite.exec(SQLITE_INIT_SQL);
}

export function openSqlite(
  filePath: string,
  options?: { readonly?: boolean | undefined },
): {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof sqliteSchema>>;
} {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  }
  const sqlite = new Database(filePath, {
    readonly: options?.readonly ?? false,
    fileMustExist: false,
  });
  if (filePath !== ":memory:") {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // chmod can fail on Windows; the 0600 check is Linux/macOS.
    }
  }
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  applySqliteSchema(sqlite);
  const db = drizzle(sqlite, { schema: sqliteSchema });
  return { sqlite, db };
}

export function assertDbNotWorldReadable(filePath: string): void {
  if (filePath === ":memory:" || process.platform === "win32") return;
  const mode = fs.statSync(filePath).mode & 0o777;
  if (mode & 0o077) {
    throw new Error(
      `Refusing to use ${filePath}: mode ${mode.toString(8)} is group/world-readable. Expected 0600.`,
    );
  }
}
