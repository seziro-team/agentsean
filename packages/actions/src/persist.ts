import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import {
  actions,
  adapterConnections,
  changes,
  changeSnapshots,
  costLedger,
  entitySightings,
  pages,
  sites,
  twoKeyApprovals,
  urlAllowlist,
} from "@agentsean/db";
import type { Action, AppliedChange, EntitySource, SitePolicy, TwoKeyApproval } from "./types.js";
import { BLAST } from "./types.js";

export type StoredActionState =
  | "proposed"
  | "queued"
  | "approved"
  | "applied"
  | "rejected"
  | "reverted"
  | "failed";

export type Envelope = {
  payload: Action["payload"];
  rationale: string[];
  findingIds: string[];
  estimatedImpact: Action["estimatedImpact"];
  kind: Action["kind"];
  target: Action["target"];
};

export function envelopeOf(action: Action): Envelope {
  return {
    payload: action.payload,
    rationale: action.rationale,
    findingIds: action.findingIds,
    estimatedImpact: action.estimatedImpact,
    kind: action.kind,
    target: action.target,
  };
}

export function actionFromRow(row: {
  id: string;
  siteId: string;
  pageId: string | null;
  actionType: string;
  targetRef: string;
  payload: string | null;
  tier: string;
  state: string;
}): Action | null {
  if (!row.payload) return null;
  let env: Envelope;
  try {
    env = JSON.parse(row.payload) as Envelope;
  } catch {
    return null;
  }
  const tier = Number(row.tier.replace(/^T/, ""));
  if (tier !== 0 && tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4) return null;
  return {
    id: row.id,
    siteId: row.siteId,
    kind: env.kind,
    tier,
    target: env.target,
    payload: env.payload,
    rationale: env.rationale,
    findingIds: env.findingIds,
    estimatedImpact: env.estimatedImpact,
  };
}

export function saveAction(
  db: SqliteDatabase,
  action: Action,
  state: StoredActionState,
  extra?: { error?: string | undefined; approvedBy?: string | undefined },
): void {
  const now = new Date().toISOString();
  const existing = db.select().from(actions).where(eq(actions.id, action.id)).get();
  const values = {
    siteId: action.siteId,
    pageId: action.target.pageId,
    findingId: action.findingIds[0] ?? null,
    actionType: action.kind,
    targetRef: action.target.url,
    payload: JSON.stringify(envelopeOf(action)),
    risk: `T${action.tier}`,
    tier: `T${action.tier}`,
    state,
    approvedBy: extra?.approvedBy ?? existing?.approvedBy ?? null,
    approvedAt: extra?.approvedBy ? now : (existing?.approvedAt ?? null),
    appliedAt: state === "applied" ? now : (existing?.appliedAt ?? null),
    error: extra?.error ?? null,
  };
  if (existing) {
    db.update(actions).set(values).where(eq(actions.id, action.id)).run();
    return;
  }
  db.insert(actions)
    .values({
      id: action.id,
      createdAt: now,
      ...values,
    })
    .run();
}

export function recordChange(
  db: SqliteDatabase,
  action: Action,
  applied: AppliedChange,
): { changeId: string } {
  const now = new Date().toISOString();
  const changeId = applied.id || randomUUID();
  db.insert(changes)
    .values({
      id: changeId,
      actionId: action.id,
      siteId: action.siteId,
      appliedAt: now,
      actor: "sean",
      summary: applied.summary,
      revertible: 1,
      revertedAt: null,
    })
    .run();
  db.insert(changeSnapshots)
    .values({
      id: randomUUID(),
      changeId,
      kind: "before",
      targetRef: applied.targetRef,
      body: applied.before,
      contentType: "text/plain",
      capturedAt: now,
    })
    .run();
  db.insert(changeSnapshots)
    .values({
      id: randomUUID(),
      changeId,
      kind: "after",
      targetRef: applied.targetRef,
      body: applied.after,
      contentType: "text/plain",
      capturedAt: now,
    })
    .run();
  const meta = {
    branch: applied.branch ?? null,
    commitSha: applied.commitSha ?? null,
    prUrl: applied.prUrl ?? null,
  };
  db.insert(changeSnapshots)
    .values({
      id: randomUUID(),
      changeId,
      kind: "meta",
      targetRef: applied.targetRef,
      body: JSON.stringify(meta),
      contentType: "application/json",
      capturedAt: now,
    })
    .run();
  return { changeId };
}

export function loadChange(db: SqliteDatabase, changeId: string): AppliedChange | null {
  const row = db.select().from(changes).where(eq(changes.id, changeId)).get();
  if (!row) return null;
  const snaps = db
    .select()
    .from(changeSnapshots)
    .where(eq(changeSnapshots.changeId, changeId))
    .all();
  const before = snaps.find((s) => s.kind === "before");
  const after = snaps.find((s) => s.kind === "after");
  const metaRow = snaps.find((s) => s.kind === "meta");
  let meta: { branch?: string | null; commitSha?: string | null; prUrl?: string | null } = {};
  if (metaRow) {
    try {
      meta = JSON.parse(metaRow.body) as typeof meta;
    } catch {
      meta = {};
    }
  }
  const result: AppliedChange = {
    id: row.id,
    actionId: row.actionId,
    siteId: row.siteId,
    targetRef: before?.targetRef ?? after?.targetRef ?? "",
    before: before?.body ?? "",
    after: after?.body ?? "",
    summary: row.summary,
  };
  if (meta.branch) result.branch = meta.branch;
  if (meta.commitSha) result.commitSha = meta.commitSha;
  if (meta.prUrl) result.prUrl = meta.prUrl;
  return result;
}

export function markReverted(db: SqliteDatabase, changeId: string): void {
  db.update(changes)
    .set({ revertedAt: new Date().toISOString() })
    .where(eq(changes.id, changeId))
    .run();
}

export function loadSitePolicy(db: SqliteDatabase, siteId: string): SitePolicy | null {
  const row = db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!row) return null;
  let globs: string[] = [];
  try {
    const parsed = JSON.parse(row.neverTouchGlobs) as unknown;
    if (Array.isArray(parsed) && parsed.every((g) => typeof g === "string")) globs = parsed;
  } catch {
    globs = [];
  }
  return {
    id: row.id,
    origin: row.origin,
    autonomyMode: row.autonomyMode,
    observeUntil: row.observeUntil,
    ymylCategory: row.ymylCategory,
    killswitch: row.killswitch,
    neverTouchGlobs: globs,
    createdAt: row.createdAt,
  };
}

export function loadPages(db: SqliteDatabase, siteId: string) {
  return db
    .select()
    .from(pages)
    .where(eq(pages.siteId, siteId))
    .all()
    .map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title,
      metaDescription: p.metaDescription,
      h1: p.h1,
    }));
}

export function loadAllowlist(db: SqliteDatabase, siteId: string): string[] {
  return db
    .select()
    .from(urlAllowlist)
    .where(eq(urlAllowlist.siteId, siteId))
    .all()
    .map((r) => r.url);
}

export function loadEntities(db: SqliteDatabase, siteId: string) {
  return db
    .select()
    .from(entitySightings)
    .where(eq(entitySightings.siteId, siteId))
    .all()
    .map((r) => ({
      entity: r.entity,
      source: r.source as EntitySource,
    }));
}

export function loadTwoKey(db: SqliteDatabase, actionId: string): TwoKeyApproval[] {
  return db
    .select()
    .from(twoKeyApprovals)
    .where(eq(twoKeyApprovals.actionId, actionId))
    .all()
    .map((r) => ({ actor: r.actor, hmac: r.hmac }));
}

export function addTwoKey(
  db: SqliteDatabase,
  actionId: string,
  actor: string,
  hmac: string,
): void {
  db.insert(twoKeyApprovals)
    .values({
      id: randomUUID(),
      actionId,
      actor,
      hmac,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export function recordEntity(
  db: SqliteDatabase,
  siteId: string,
  entity: string,
  entityKind: string,
  source: EntitySource,
): void {
  const existing = db
    .select()
    .from(entitySightings)
    .where(eq(entitySightings.siteId, siteId))
    .all()
    .find((r) => r.entity === entity);
  if (existing) return;
  db.insert(entitySightings)
    .values({
      id: randomUUID(),
      siteId,
      entity,
      entityKind,
      source,
      firstSeenAt: new Date().toISOString(),
    })
    .run();
}

export function upsertGitConnection(
  db: SqliteDatabase,
  siteId: string,
  config: Record<string, unknown>,
): void {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(adapterConnections)
    .where(
      and(eq(adapterConnections.siteId, siteId), eq(adapterConnections.kind, "git")),
    )
    .get();
  if (existing) {
    db.update(adapterConnections)
      .set({ config: JSON.stringify(config), updatedAt: now })
      .where(eq(adapterConnections.id, existing.id))
      .run();
    return;
  }
  db.insert(adapterConnections)
    .values({
      id: randomUUID(),
      siteId,
      kind: "git",
      config: JSON.stringify(config),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function loadGitConnection(
  db: SqliteDatabase,
  siteId: string,
): Record<string, unknown> | null {
  const row = db
    .select()
    .from(adapterConnections)
    .where(and(eq(adapterConnections.siteId, siteId), eq(adapterConnections.kind, "git")))
    .get();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.config) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function countsForLedger(
  db: SqliteDatabase,
  siteId: string,
  now: Date,
): {
  appliedThisHour: number;
  appliedThisDay: number;
  newPagesToday: number;
  contentRefreshToday: number;
  spentUsdToday: number;
} {
  const hour = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const day = now.toISOString().slice(0, 10) + "T00:00:00.000Z";
  const applied = db
    .select()
    .from(actions)
    .where(and(eq(actions.siteId, siteId), eq(actions.state, "applied")))
    .all();
  const appliedThisHour = applied.filter((a) => (a.appliedAt ?? "") >= hour).length;
  const appliedThisDay = applied.filter((a) => (a.appliedAt ?? "") >= day).length;
  const newPagesToday = applied.filter(
    (a) => a.actionType === "create_page" && (a.appliedAt ?? "") >= day,
  ).length;
  const contentRefreshToday = applied.filter(
    (a) => a.actionType === "refresh_content" && (a.appliedAt ?? "") >= day,
  ).length;
  const costs = db
    .select()
    .from(costLedger)
    .where(and(eq(costLedger.siteId, siteId), gte(costLedger.ts, day)))
    .all();
  const spentUsdToday = costs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  return { appliedThisHour, appliedThisDay, newPagesToday, contentRefreshToday, spentUsdToday };
}

export { BLAST };
