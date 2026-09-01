import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { openSqlite, findings, pages, sites } from "@agentsean/db";
import {
  executeAction,
  loadGitConnection,
  planTitleActions,
  upsertGitConnection,
} from "@agentsean/actions";
import { createGitAdapter } from "@agentsean/adapter-git";
import {
  defaultSeanHome,
  dbPath,
  ensureSeanHome,
  isHalted,
  loadOrCreateToken,
  openDaemonStore,
} from "@agentsean/daemon";
import { startCommand } from "./start.js";
import { emit, emitError } from "../output.js";

export async function applyCommand(opts: {
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
        { command: "apply", error: "unknown_site" },
        "No site in the database. Run `sean audit https://example.com` first.",
      );
      return 2;
    }
    if (opts.repo) {
      upsertGitConnection(db, site.id, {
        ...loadGitConnection(db, site.id),
        repoPath: opts.repo,
      });
    }
    const cfg = loadGitConnection(db, site.id);
    const repoPath = opts.repo ?? (typeof cfg?.["repoPath"] === "string" ? cfg["repoPath"] : null);
    if (!repoPath) {
      emitError(
        opts.json,
        { command: "apply", error: "missing_repo" },
        "Pass --repo /path/to/nextjs so Sean can open a PR.",
      );
      return 2;
    }
    const token = typeof cfg?.["token"] === "string" ? cfg["token"] : process.env["GITHUB_TOKEN"];
    const adapter = createGitAdapter({
      repoPath,
      ...(token ? { token } : {}),
    });
    const pageRows = db.select().from(pages).where(eq(pages.siteId, site.id)).all();
    const findingRows = db.select().from(findings).where(eq(findings.siteId, site.id)).all();
    const planned = planTitleActions({
      siteId: site.id,
      origin: site.origin,
      pages: pageRows.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.title,
        metaDescription: p.metaDescription,
        h1: p.h1,
      })),
      findings: findingRows.map((f) => ({
        id: f.id,
        siteId: f.siteId,
        pageId: f.pageId,
        ruleId: f.ruleId,
        status: f.status,
      })),
    });
    if (planned.length === 0) {
      emit(
        opts.json,
        { ok: true, command: "apply", planned: 0 },
        "No title-tag actions to apply.",
      );
      return 0;
    }
    const store = openDaemonStore(home);
    const daemonToken = await loadOrCreateToken(store);
    const approvalKey = createHash("sha256").update(daemonToken.unwrap()).digest();
    const results = [];
    for (const action of planned) {
      results.push(
        await executeAction({
          db,
          action,
          adapter,
          approvalKey,
          halted: isHalted(home),
          dryRun: opts.dryRun,
        }),
      );
    }
    await startCommand({ json: opts.json, foreground: false, home, quiet: true });
    const applied = results.filter((r) => r.status === "applied").length;
    const queued = results.filter((r) => r.status === "queued").length;
    const rejected = results.filter((r) => r.status === "rejected" || r.status === "failed").length;
    emit(
      opts.json,
      {
        ok: rejected === 0,
        command: "apply",
        origin: site.origin,
        planned: planned.length,
        applied,
        queued,
        rejected,
        results,
        activity: "http://127.0.0.1:7777/activity",
      },
      `Sean planned ${planned.length} title fix(es): ${applied} applied, ${queued} queued, ${rejected} rejected.\nDiffs: http://127.0.0.1:7777/activity — one click reverts.`,
    );
    return rejected === 0 ? 0 : 1;
  } finally {
    sqlite.close();
  }
}
