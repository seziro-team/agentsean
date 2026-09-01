import { eq } from "drizzle-orm";
import { openSqlite, tenants } from "@agentsean/db";
import { hostedStatus } from "@agentsean/hosted";
import { dbPath, defaultSeanHome, ensureSeanHome } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function tenantCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const { db, sqlite } = openSqlite(dbPath(home));
  try {
    const row = opts.target
      ? db.select().from(tenants).where(eq(tenants.id, opts.target)).get()
      : db.select().from(tenants).all()[0];
    if (!row) {
      emitError(
        opts.json,
        { command: "tenant", error: "unknown_tenant" },
        "No tenant. Run sean signup <plan>.",
      );
      return 2;
    }
    const status = hostedStatus(db, row.id);
    emit(
      opts.json,
      { command: "tenant", ok: true, ...status },
      `${row.email} · ${row.plan} · ${status?.cost.sites ?? 0}/${status?.plan.sites ?? 0} sites · ledger $${(status?.cost.ledgerUsd ?? 0).toFixed(2)} · BYOK ${row.byok ? "on" : "off"}`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
