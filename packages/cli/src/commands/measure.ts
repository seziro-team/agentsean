import { eq } from "drizzle-orm";
import { openSqlite, sites } from "@agentsean/db";
import { runMeasureJob } from "@agentsean/measure";
import { dbPath, defaultSeanHome, ensureSeanHome } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function measureCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const { db, sqlite } = openSqlite(dbPath(home));
  try {
    const site = opts.target
      ? db.select().from(sites).where(eq(sites.origin, opts.target)).get()
      : db.select().from(sites).all()[0];
    if (!site) {
      emitError(
        opts.json,
        { command: "measure", error: "unknown_site" },
        "No site in the database. Run `sean audit https://example.com` first.",
      );
      return 2;
    }
    const result = runMeasureJob(db, { siteId: site.id });
    emit(
      opts.json,
      {
        command: "measure",
        ok: true,
        origin: site.origin,
        headline: result.headline,
        power: result.power,
        claims: result.claims.map((c) => ({
          id: c.id,
          evidenceTier: c.evidenceTier,
          causationClaimed: c.causationClaimed,
          statement: c.statement,
        })),
        waterfall: result.waterfall
          ? {
              residual: result.waterfall.residual,
              anonymizedQueryShare: result.waterfall.anonymizedQueryShare,
              euInvisibleShare: result.waterfall.euInvisibleShare,
              causes: result.waterfall.steps.length,
            }
          : null,
        analysed: result.analysed.length,
      },
      `Evidence: ${result.headline}\n${result.power.message}`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
