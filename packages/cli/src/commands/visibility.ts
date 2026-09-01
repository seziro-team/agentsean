import { eq } from "drizzle-orm";
import { openSqlite, sites } from "@agentsean/db";
import { loadLlmConfig } from "@agentsean/llm";
import { runSurfacesJob } from "@agentsean/surfaces";
import { dbPath, defaultSeanHome, ensureSeanHome, openDaemonStore } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function visibilityCommand(opts: {
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
      emitError(opts.json, { command: "visibility", error: "unknown_site" }, "No site. Run sean audit first.");
      return 2;
    }
    const store = openDaemonStore(home);
    const llm = await loadLlmConfig({ store });
    const result = await runSurfacesJob(db, {
      siteId: site.id,
      origin: site.origin,
      ...(llm?.generate ? { generate: llm.generate } : {}),
    });
    emit(
      opts.json,
      {
        command: "visibility",
        ok: true,
        citationShare: result.citationShare,
        shareOfVoice: result.shareOfVoice,
        estimatedUsd: result.estimatedUsd,
        bingShare: result.bingShare,
        vertical: result.vertical,
      },
      `AI citation share ${Math.round(result.citationShare * 100)}% · ~$${result.estimatedUsd.toFixed(2)}/run · vertical ${result.vertical}. Schema/llms.txt are not sold as AEO levers.`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
