import { openSqlite } from "@agentsean/db";
import {
  loadChange,
  loadGitConnection,
  markReverted,
  revertChange,
} from "@agentsean/actions";
import { createGitAdapter } from "@agentsean/adapter-git";
import { actions } from "@agentsean/db";
import { eq } from "drizzle-orm";
import { defaultSeanHome, dbPath, ensureSeanHome } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function revertCommand(opts: {
  json: boolean;
  home?: string | undefined;
  changeId?: string | undefined;
}): Promise<number> {
  if (!opts.changeId) {
    emitError(
      opts.json,
      { command: "revert", error: "missing_change_id" },
      "Missing change id. Try `sean revert <changeId> --json`.",
    );
    return 2;
  }
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const { db, sqlite } = openSqlite(dbPath(home));
  try {
    const change = loadChange(db, opts.changeId);
    if (!change) {
      emitError(
        opts.json,
        { command: "revert", error: "unknown_change", id: opts.changeId },
        `Unknown change ${opts.changeId}`,
      );
      return 2;
    }
    const cfg = loadGitConnection(db, change.siteId);
    const repoPath = typeof cfg?.["repoPath"] === "string" ? cfg["repoPath"] : null;
    if (!repoPath) {
      emitError(
        opts.json,
        { command: "revert", error: "missing_repo" },
        "Git adapter is not connected for this site.",
      );
      return 2;
    }
    const adapter = createGitAdapter({ repoPath });
    const result = await revertChange({ db, change, adapter });
    if (!result.ok) {
      emitError(opts.json, { command: "revert", error: result.error }, result.error);
      return 1;
    }
    markReverted(db, change.id);
    db.update(actions)
      .set({ state: "reverted" })
      .where(eq(actions.id, change.actionId))
      .run();
    emit(
      opts.json,
      { ok: true, command: "revert", changeId: change.id },
      `Reverted ${change.id}. Shadow-ledger snapshot restored.`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
