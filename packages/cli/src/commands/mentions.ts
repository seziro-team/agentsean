import { eq } from "drizzle-orm";
import { openSqlite, sites } from "@agentsean/db";
import { listMentions, listOutreach } from "@agentsean/surfaces";
import { dbPath, defaultSeanHome, ensureSeanHome } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function mentionsCommand(opts: {
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
        { command: "mentions", error: "unknown_site" },
        "No site. Run sean audit first.",
      );
      return 2;
    }
    const rows = listMentions(db, site.id);
    const drafts = listOutreach(db, site.id);
    emit(
      opts.json,
      {
        command: "mentions",
        ok: true,
        mentions: rows,
        outreachDrafts: drafts.length,
        sendRequiresApproval: true,
      },
      rows.length
        ? `${rows.length} brand-mention opportunities. Outreach send is T3 (per-message approval).`
        : "No mention opportunities stored. Run sean visibility to harvest.",
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
