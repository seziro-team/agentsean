import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { openSqlite, sites } from "@agentsean/db";
import { loadGitConnection } from "@agentsean/actions";
import { createGitAdapter } from "@agentsean/adapter-git";
import { runContentJob } from "@agentsean/content";
import { loadLlmConfig } from "@agentsean/llm";
import {
  defaultSeanHome,
  dbPath,
  ensureSeanHome,
  isHalted,
  loadOrCreateToken,
  openDaemonStore,
} from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function contentCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
  repo?: string | undefined;
  dryRun: boolean;
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
        { command: "content", error: "unknown_site" },
        "No site in the database. Run `sean audit https://example.com` first.",
      );
      return 2;
    }
    const store = openDaemonStore(home);
    const token = await loadOrCreateToken(store);
    const llm = await loadLlmConfig({ store });
    const cfg = loadGitConnection(db, site.id);
    const repoPath =
      opts.repo ?? (typeof cfg?.["repoPath"] === "string" ? cfg["repoPath"] : null);
    const adapter = repoPath
      ? createGitAdapter({
          repoPath,
          ...(typeof cfg?.["token"] === "string" ? { token: cfg["token"] } : {}),
        })
      : null;
    const result = await runContentJob(db, {
      siteId: site.id,
      origin: site.origin,
      halted: isHalted(home),
      dryRun: opts.dryRun,
      llm,
      adapter,
      approvalKey: createHash("sha256").update(token.unwrap()).digest(),
    });
    emit(
      opts.json,
      { command: "content", ok: true, ...result },
      result.skipped
        ? `Content skipped (${result.reason}).`
        : `Content: ${result.applied} published, ${result.gated} gated, ${result.rejected} rejected. Evidence: ${result.evidenceTier}.`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
