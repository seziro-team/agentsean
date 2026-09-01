import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as sqliteSchema from "./sqlite/schema.js";
import * as pgSchema from "./pg/schema.js";
import {
  ACTION_TABLES,
  ALL_TABLES,
  CONTENT_TABLES,
  CORE_TABLES,
  DASHBOARD_TABLES,
  GOOGLE_TABLES,
} from "./tables.js";

type Dialect = "sqlite" | "pg";

const sortStrings = (values: string[]) =>
  values.toSorted((a, b) => a.localeCompare(b));

function tablesFrom(mod: Record<string, unknown>) {
  const out = new Map<string, Table>();
  for (const value of Object.values(mod)) {
    if (is(value, Table)) out.set(getTableName(value), value);
  }
  return out;
}

const getConfig = (table: Table, dialect: Dialect) =>
  dialect === "pg" ? getPgTableConfig(table) : getSqliteTableConfig(table);

type ColumnInfo = {
  name: string;
  notNull: boolean;
  dataType: string;
  hasDefault: boolean;
};

function columnsOf(table: Table): ColumnInfo[] {
  return Object.values(getTableColumns(table)).map((col) => ({
    name: col.name,
    notNull: col.notNull,
    dataType: typeof col.dataType === "string" ? col.dataType : "unknown",
    hasDefault: col.hasDefault,
  }));
}

function columnName(candidate: unknown): string | null {
  if (
    candidate &&
    typeof candidate === "object" &&
    "name" in candidate &&
    typeof candidate.name === "string"
  ) {
    return candidate.name;
  }
  return null;
}

function uniqueColumnTuples(table: Table, dialect: Dialect): string[] {
  const config = getConfig(table, dialect);
  const tuples = new Set<string>();
  for (const index of config.indexes) {
    if (!index.config.unique) continue;
    const cols = index.config.columns
      .map(columnName)
      .filter((name): name is string => name !== null);
    tuples.add(sortStrings(cols).join(","));
  }
  for (const constraint of config.uniqueConstraints) {
    tuples.add(sortStrings(constraint.columns.map((c) => c.name)).join(","));
  }
  for (const col of Object.values(getTableColumns(table))) {
    if (col.isUnique) tuples.add(col.name);
  }
  return sortStrings([...tuples]);
}

function primaryKeyColumns(table: Table, dialect: Dialect): string[] {
  const config = getConfig(table, dialect);
  const pk = new Set<string>();
  for (const col of Object.values(getTableColumns(table))) {
    if (col.primary) pk.add(col.name);
  }
  for (const composite of config.primaryKeys) {
    for (const col of composite.columns) pk.add(col.name);
  }
  return sortStrings([...pk]);
}

function foreignKeys(table: Table, dialect: Dialect): string[] {
  const config = getConfig(table, dialect);
  return sortStrings(
    config.foreignKeys.map((fk) => {
      const ref = fk.reference();
      const cols = sortStrings(ref.columns.map((c) => c.name)).join(",");
      const refTable = getTableName(ref.foreignTable);
      const refCols = sortStrings(ref.foreignColumns.map((c) => c.name)).join(
        ",",
      );
      return `${cols}->${refTable}.${refCols} onDelete=${fk.onDelete ?? "none"}`;
    }),
  );
}

const sqliteTables = tablesFrom(sqliteSchema);
const pgTables = tablesFrom(pgSchema);

describe("schema parity", () => {
  it("defines every Phase 0 core table on SQLite", () => {
    for (const name of CORE_TABLES) {
      expect(sqliteTables.has(name), name).toBe(true);
    }
  });

  it("defines every Phase 2 google table on SQLite", () => {
    for (const name of GOOGLE_TABLES) {
      expect(sqliteTables.has(name), name).toBe(true);
    }
  });

  it("defines every Phase 3 action table on SQLite", () => {
    for (const name of ACTION_TABLES) {
      expect(sqliteTables.has(name), name).toBe(true);
    }
  });

  it("defines every Phase 4 dashboard table on SQLite", () => {
    for (const name of DASHBOARD_TABLES) {
      expect(sqliteTables.has(name), name).toBe(true);
    }
  });

  it("defines every Phase 5 content table on SQLite", () => {
    for (const name of CONTENT_TABLES) {
      expect(sqliteTables.has(name), name).toBe(true);
    }
  });

  it("defines only known tables", () => {
    expect(sortStrings([...sqliteTables.keys()])).toEqual(
      sortStrings([...ALL_TABLES]),
    );
  });

  it("defines the same set of tables on both backends", () => {
    expect(sortStrings([...pgTables.keys()])).toEqual(
      sortStrings([...sqliteTables.keys()]),
    );
  });

  for (const [name, sqliteTable] of sqliteTables) {
    const pgTable = pgTables.get(name);
    if (!pgTable) continue;

    describe(`table "${name}"`, () => {
      it("has matching columns (name, nullability, type, default)", () => {
        expect(columnsOf(pgTable)).toEqual(columnsOf(sqliteTable));
      });
      it("has matching primary key", () => {
        expect(primaryKeyColumns(pgTable, "pg")).toEqual(
          primaryKeyColumns(sqliteTable, "sqlite"),
        );
      });
      it("has matching unique constraints", () => {
        expect(uniqueColumnTuples(pgTable, "pg")).toEqual(
          uniqueColumnTuples(sqliteTable, "sqlite"),
        );
      });
      it("has matching foreign keys (incl. onDelete)", () => {
        expect(foreignKeys(pgTable, "pg")).toEqual(
          foreignKeys(sqliteTable, "sqlite"),
        );
      });
    });
  }
});
