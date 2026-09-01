import { eq } from "drizzle-orm";
import { openSqlite, sites } from "@agentsean/db";
import { listGbpLocations, listMentions, localCitationGap } from "@agentsean/surfaces";
import { dbPath, defaultSeanHome, ensureSeanHome } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function localCommand(opts: {
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
      emitError(opts.json, { command: "local", error: "unknown_site" }, "No site. Run sean audit first.");
      return 2;
    }
    const locations = listGbpLocations(db, site.id);
    const gap = localCitationGap({
      gbpListed: locations.length > 0,
      aiMentions: listMentions(db, site.id).length,
      localPackVisible: locations.length > 0,
    });
    emit(
      opts.json,
      {
        command: "local",
        ok: true,
        locations: locations.map((l) => ({
          id: l.id,
          name: l.locationName,
          category: l.primaryCategory,
          approvalStatus: l.approvalStatus,
        })),
        gap,
        editsPerMin: 10,
      },
      locations.length
        ? `GBP ${locations.length} location(s). Cap 10 edits/min/profile. ${gap.message}`
        : "No GBP connected. Local mode is read-only until Google approves Basic API Access (quota starts at 0 QPM).",
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
