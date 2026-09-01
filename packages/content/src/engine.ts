import { eq } from "drizzle-orm";
import {
  findings,
  googleIncidents,
  gscPageDaily,
  gscQueryDaily,
  pages,
  pageSnapshots,
  sites,
  type SqliteDatabase,
} from "@agentsean/db";
import { BLAST, countsForLedger, executeAction, saveAction } from "@agentsean/actions";
import { recordLlmCost, type LlmConfig } from "@agentsean/llm";
import { buildBrief } from "./brief.js";
import { decayingPages } from "./decay.js";
import { evidenceForContentChange } from "./evidence.js";
import { runPublishGate } from "./gate.js";
import { actionFromDraft, draftFromBrief } from "./generate.js";
import { loadStyleProfile, saveBrief, saveDraft } from "./persist.js";
import type { ContentCandidate, RunContentOptions, RunContentResult } from "./types.js";

function latestBodies(db: SqliteDatabase, siteId: string): Map<string, string> {
  const snaps = db.select().from(pageSnapshots).all();
  const pageIds = new Set(
    db
      .select()
      .from(pages)
      .where(eq(pages.siteId, siteId))
      .all()
      .map((p) => p.id),
  );
  const best = new Map<string, { at: string; body: string }>();
  for (const s of snaps) {
    if (!pageIds.has(s.pageId) || !s.body) continue;
    const cur = best.get(s.pageId);
    if (!cur || s.fetchedAt > cur.at) best.set(s.pageId, { at: s.fetchedAt, body: s.body });
  }
  return new Map([...best].map(([id, v]) => [id, v.body]));
}

function verticalBlocked(category: string | null | undefined): boolean {
  const cat = (category ?? "").toLowerCase();
  return cat === "ymyl" || cat === "affiliate" || cat === "yours-money-your-life";
}

function googleNote(db: SqliteDatabase, now: Date): string | null {
  const begin = new Date(now.getTime() - 56 * 86400000).toISOString();
  const rows = db
    .select()
    .from(googleIncidents)
    .all()
    .filter((r) => r.begin >= begin && r.begin <= now.toISOString());
  if (!rows.length) return null;
  return `Google incidents in window: ${rows.map((r) => r.externalDesc).slice(0, 3).join("; ")}. Do not claim the rewrite caused a recovery.`;
}

export function pickCandidates(opts: {
  db: SqliteDatabase;
  siteId: string;
  now: Date;
}): ContentCandidate[] {
  const pageRows = opts.db.select().from(pages).where(eq(pages.siteId, opts.siteId)).all();
  const bodies = latestBodies(opts.db, opts.siteId);
  const gsc = opts.db.select().from(gscPageDaily).where(eq(gscPageDaily.siteId, opts.siteId)).all();
  const decay = decayingPages(
    gsc.map((r) => ({ date: r.date, page: r.page, clicks: r.clicks })),
    opts.now,
  );
  const findingRows = opts.db.select().from(findings).where(eq(findings.siteId, opts.siteId)).all();
  const byUrl = new Map(pageRows.map((p) => [p.url, p]));
  const out: ContentCandidate[] = [];
  const seen = new Set<string>();

  for (const d of decay) {
    const page = byUrl.get(d.url);
    if (!page) continue;
    seen.add(page.id);
    out.push({
      pageId: page.id,
      url: page.url,
      title: page.title,
      h1: page.h1,
      wordCount: page.wordCount ?? 0,
      body: bodies.get(page.id) ?? `${page.title ?? ""}\n${page.h1 ?? ""}`,
      kind: "refresh",
      decay: d,
      findingIds: findingRows.filter((f) => f.pageId === page.id).map((f) => f.id),
    });
  }

  const thin = findingRows.filter((f) => f.ruleId.startsWith("THIN.") && f.status === "open");
  for (const f of thin) {
    if (!f.pageId || seen.has(f.pageId)) continue;
    const page = pageRows.find((p) => p.id === f.pageId);
    if (!page) continue;
    seen.add(page.id);
    out.push({
      pageId: page.id,
      url: page.url,
      title: page.title,
      h1: page.h1,
      wordCount: page.wordCount ?? 0,
      body: bodies.get(page.id) ?? `${page.title ?? ""}\n${page.h1 ?? ""}`,
      kind: "refresh",
      decay: null,
      findingIds: [f.id],
    });
  }

  return out;
}

export async function runContentJob(
  db: SqliteDatabase,
  opts: RunContentOptions,
): Promise<RunContentResult> {
  const now = opts.now ?? new Date();
  const evidenceTier = evidenceForContentChange();
  const empty: RunContentResult = {
    briefs: 0,
    drafts: 0,
    gated: 0,
    applied: 0,
    rejected: 0,
    queued: 0,
    actions: [],
    evidenceTier,
  };

  const site = db.select().from(sites).where(eq(sites.id, opts.siteId)).get();
  if (!site) return { ...empty, skipped: true, reason: "unknown_site" };
  if (opts.halted) return { ...empty, skipped: true, reason: "halted" };
  if (verticalBlocked(opts.ymylCategory ?? site.ymylCategory)) {
    return { ...empty, skipped: true, reason: "vertical_block" };
  }

  const llm: LlmConfig | null = opts.generate
    ? { provider: "anthropic", generate: opts.generate }
    : (opts.llm ?? null);
  if (!llm) return { ...empty, skipped: true, reason: "llm_not_configured" };

  const style = opts.style ?? loadStyleProfile(db, opts.siteId);
  const counts = countsForLedger(db, opts.siteId, now);
  let refreshToday = opts.contentRefreshToday ?? counts.contentRefreshToday;
  const newPagesToday = opts.newPagesToday ?? counts.newPagesToday;
  if (refreshToday >= BLAST.contentRefreshPerDay) {
    return { ...empty, skipped: true, reason: "refresh_cap" };
  }

  const candidates = pickCandidates({ db, siteId: opts.siteId, now });
  if (!candidates.length) return { ...empty, skipped: true, reason: "no_candidates" };

  const queries = db
    .select()
    .from(gscQueryDaily)
    .where(eq(gscQueryDaily.siteId, opts.siteId))
    .all()
    .map((q) => ({ date: q.date, query: q.query, clicks: q.clicks }));
  const sitePages = db
    .select()
    .from(pages)
    .where(eq(pages.siteId, opts.siteId))
    .all()
    .map((p) => ({ id: p.id, url: p.url, title: p.title, h1: p.h1 }));
  const corpus =
    opts.corpus && opts.corpus.length > 0
      ? opts.corpus
      : candidates.map((c) => ({ url: c.url, body: c.body }));
  const note = googleNote(db, now);

  const result: RunContentResult = { ...empty };
  for (const candidate of candidates) {
    if (refreshToday >= BLAST.contentRefreshPerDay) break;
    const brief = buildBrief({
      candidate,
      queries,
      sitePages,
      googleUpdateNote: note,
    });
    const briefId = saveBrief(db, opts.siteId, brief);
    result.briefs++;

    let draft;
    try {
      const produced = await draftFromBrief(brief, llm, style);
      draft = produced.draft;
      recordLlmCost(db, { siteId: opts.siteId, result: produced.usage, operation: "content_draft" });
    } catch {
      saveDraft(db, {
        briefId,
        siteId: opts.siteId,
        pageId: candidate.pageId,
        actionId: null,
        title: brief.title,
        body: "",
        model: "none",
        modelClass: "mid",
        state: "rejected",
        gate: null,
        evidenceTier,
      });
      result.rejected++;
      continue;
    }
    result.drafts++;

    const gate = runPublishGate({
      brief,
      draft,
      style,
      corpus,
      ymylCategory: opts.ymylCategory ?? site.ymylCategory,
      newPagesToday,
      kind: candidate.kind,
    });
    const action = actionFromDraft({
      siteId: opts.siteId,
      brief,
      draft,
      findingIds: candidate.findingIds,
    });

    if (!gate.ok) {
      saveDraft(db, {
        briefId,
        siteId: opts.siteId,
        pageId: candidate.pageId,
        actionId: action.id,
        title: draft.title,
        body: draft.body,
        model: draft.model,
        modelClass: draft.modelClass,
        state: "rejected",
        gate,
        evidenceTier,
      });
      saveAction(db, action, "rejected", {
        error: gate.checks.filter((c) => !c.ok).map((c) => c.code).join(","),
      });
      result.rejected++;
      continue;
    }
    result.gated++;

    if (!opts.adapter) {
      saveDraft(db, {
        briefId,
        siteId: opts.siteId,
        pageId: candidate.pageId,
        actionId: action.id,
        title: draft.title,
        body: draft.body,
        model: draft.model,
        modelClass: draft.modelClass,
        state: "gated",
        gate,
        evidenceTier,
      });
      saveAction(db, action, "proposed");
      result.queued++;
      result.actions.push(action);
      continue;
    }

    const exec = await executeAction({
      db,
      action,
      adapter: opts.adapter,
      approvalKey: opts.approvalKey,
      halted: Boolean(opts.halted),
      now,
      dryRun: opts.dryRun,
    });
    const published = exec.status === "applied";
    saveDraft(db, {
      briefId,
      siteId: opts.siteId,
      pageId: candidate.pageId,
      actionId: action.id,
      title: draft.title,
      body: draft.body,
      model: draft.model,
      modelClass: draft.modelClass,
      state: published ? "published" : exec.status === "queued" ? "gated" : "rejected",
      gate,
      evidenceTier,
      publishedAt: published ? now.toISOString() : null,
    });
    if (published) {
      result.applied++;
      refreshToday++;
    } else if (exec.status === "queued") result.queued++;
    else result.rejected++;
    result.actions.push(action);
  }

  return result;
}

export { recordLlmCost };
