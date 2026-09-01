import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "@agentsean/db";
import { findings, pages } from "@agentsean/db";
import { eq } from "drizzle-orm";
import { validateParsed } from "./validator.js";
import {
  countsForLedger,
  loadAllowlist,
  loadEntities,
  loadPages,
  loadSitePolicy,
  loadTwoKey,
  recordChange,
  saveAction,
  type StoredActionState,
} from "./persist.js";
import type {
  Action,
  AppliedChange,
  SiteAdapter,
  ValidationContext,
  ValidationResult,
} from "./types.js";

export type ExecuteResult =
  | {
      status: "applied";
      action: Action;
      change: AppliedChange;
      changeId: string;
    }
  | {
      status: "queued" | "rejected" | "failed";
      action: Action;
      validation?: ValidationResult | undefined;
      error?: string | undefined;
    };

export type ExecuteOptions = {
  db: SqliteDatabase;
  action: Action;
  adapter: SiteAdapter;
  approvalKey: Buffer;
  halted: boolean;
  now?: Date | undefined;
  runId?: string | undefined;
  appliedThisRun?: number | undefined;
  budgetUsdDaily?: number | undefined;
  estimatedCostUsd?: number | undefined;
  dryRun?: boolean | undefined;
};

function afterText(action: Action, before: string): string {
  if ("title" in action.payload) {
    return before;
  }
  if ("body" in action.payload) return action.payload.body;
  if ("metaDescription" in action.payload) return action.payload.metaDescription;
  return before;
}

export function buildValidationContext(
  opts: ExecuteOptions,
  before: string,
  after: string,
): ValidationContext | { error: string } {
  const site = loadSitePolicy(opts.db, opts.action.siteId);
  if (!site) return { error: `unknown site ${opts.action.siteId}` };
  const now = opts.now ?? new Date();
  const counts = countsForLedger(opts.db, opts.action.siteId, now);
  return {
    now,
    site,
    pages: loadPages(opts.db, opts.action.siteId),
    allowlist: loadAllowlist(opts.db, opts.action.siteId),
    entities: loadEntities(opts.db, opts.action.siteId),
    appliedThisRun: opts.appliedThisRun ?? 0,
    appliedThisHour: counts.appliedThisHour,
    appliedThisDay: counts.appliedThisDay,
    newPagesToday: counts.newPagesToday,
    contentRefreshToday: counts.contentRefreshToday,
    spentUsdToday: counts.spentUsdToday,
    budgetUsdDaily: opts.budgetUsdDaily ?? 8,
    estimatedCostUsd: opts.estimatedCostUsd ?? 0,
    twoKeyApprovals: loadTwoKey(opts.db, opts.action.id),
    halted: opts.halted,
    beforeText: before,
    afterText: after,
    runId: opts.runId ?? randomUUID(),
    approvalKey: opts.approvalKey,
  };
}

/**
 * snapshot → apply → verify → record.
 * Verify is non-negotiable: never trust a 200. Re-read the target and confirm
 * the change landed. On verify failure, roll back from the shadow ledger.
 */
export async function executeAction(opts: ExecuteOptions): Promise<ExecuteResult> {
  const action = opts.action;
  saveAction(opts.db, action, "proposed");

  let before = "";
  try {
    const read = await opts.adapter.read(action.target);
    before = read.body;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    saveAction(opts.db, action, "failed", { error });
    return { status: "failed", action, error };
  }

  const dry = await opts.adapter.dryRun(action);
  const ctx = buildValidationContext(opts, before, dry.after || afterText(action, before));
  if ("error" in ctx) {
    saveAction(opts.db, action, "failed", { error: ctx.error });
    return { status: "failed", action, error: ctx.error };
  }

  const validation = validateParsed(action, ctx);
  if (!validation.ok) {
    const queued = validation.vetoes.every(
      (v) => v.code === "OBSERVE_PERIOD" || v.code === "TWO_KEY" || v.code === "POLICY_TIER",
    );
    const observeOnly = validation.vetoes.every((v) => v.code === "OBSERVE_PERIOD");
    const state: StoredActionState = observeOnly || queued ? "queued" : "rejected";
    saveAction(opts.db, action, state, {
      error: validation.vetoes.map((v) => v.code).join(","),
    });
    return { status: state === "queued" ? "queued" : "rejected", action, validation };
  }

  if (opts.dryRun) {
    saveAction(opts.db, action, "proposed");
    return { status: "queued", action, validation };
  }

  let applied;
  try {
    applied = await opts.adapter.apply(action);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    saveAction(opts.db, action, "failed", { error });
    return { status: "failed", action, error };
  }

  const change: AppliedChange = {
    id: randomUUID(),
    actionId: action.id,
    siteId: action.siteId,
    targetRef: applied.targetRef,
    before: applied.before,
    after: applied.after,
    summary: applied.summary,
    ...(applied.branch ? { branch: applied.branch } : {}),
    ...(applied.commitSha ? { commitSha: applied.commitSha } : {}),
    ...(applied.prUrl ? { prUrl: applied.prUrl } : {}),
  };

  const verified = await opts.adapter.verify(change);
  if (!verified.ok) {
    try {
      await opts.adapter.rollback(change);
    } catch {
      /* shadow ledger still holds the before snapshot */
    }
    saveAction(opts.db, action, "failed", { error: `verify failed: ${verified.detail}` });
    return { status: "failed", action, error: `verify failed: ${verified.detail}` };
  }

  const { changeId } = recordChange(opts.db, action, change);
  saveAction(opts.db, action, "applied");
  for (const fid of action.findingIds) {
    opts.db
      .update(findings)
      .set({ status: "applied", resolvedAt: new Date().toISOString() })
      .where(eq(findings.id, fid))
      .run();
  }
  if ("title" in action.payload) {
    opts.db
      .update(pages)
      .set({ title: action.payload.title })
      .where(eq(pages.id, action.target.pageId))
      .run();
  }
  return { status: "applied", action, change: { ...change, id: changeId }, changeId };
}

export async function revertChange(opts: {
  db: SqliteDatabase;
  change: AppliedChange;
  adapter: SiteAdapter;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const verifiedBefore = await opts.adapter.rollback(opts.change);
  const check: AppliedChange = {
    ...opts.change,
    after: verifiedBefore.after,
    before: verifiedBefore.before,
  };
  const verified = await opts.adapter.verify({
    ...check,
    after: opts.change.before,
  });
  if (!verified.ok) {
    return { ok: false, error: `revert verify failed: ${verified.detail}` };
  }
  return { ok: true };
}
