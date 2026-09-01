import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  contentBriefs,
  contentDrafts,
  publishGateResults,
  styleProfiles,
  type SqliteDatabase,
} from "@agentsean/db";
import { DEFAULT_STYLE, type ContentBrief, type PublishGateResult, type StyleProfile } from "./types.js";

export function loadStyleProfile(db: SqliteDatabase, siteId: string): StyleProfile {
  const row = db.select().from(styleProfiles).where(eq(styleProfiles.siteId, siteId)).get();
  if (!row) return { ...DEFAULT_STYLE };
  try {
    const parsed = JSON.parse(row.voiceJson) as Partial<StyleProfile>;
    const disclosure =
      row.disclosure === "none" ||
      row.disclosure === "meta" ||
      row.disclosure === "visible" ||
      row.disclosure === "html_comment"
        ? row.disclosure
        : DEFAULT_STYLE.disclosure;
    return {
      bannedPhrases: parsed.bannedPhrases ?? [],
      preferredTerms: parsed.preferredTerms ?? {},
      maxSentenceWords: parsed.maxSentenceWords ?? DEFAULT_STYLE.maxSentenceWords,
      disclosure,
    };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

export function upsertStyleProfile(db: SqliteDatabase, siteId: string, profile: StyleProfile): void {
  const now = new Date().toISOString();
  const existing = db.select().from(styleProfiles).where(eq(styleProfiles.siteId, siteId)).get();
  const voiceJson = JSON.stringify({
    bannedPhrases: profile.bannedPhrases,
    preferredTerms: profile.preferredTerms,
    maxSentenceWords: profile.maxSentenceWords,
  });
  if (existing) {
    db.update(styleProfiles)
      .set({ voiceJson, disclosure: profile.disclosure, updatedAt: now })
      .where(eq(styleProfiles.siteId, siteId))
      .run();
    return;
  }
  db.insert(styleProfiles)
    .values({
      id: randomUUID(),
      siteId,
      voiceJson,
      disclosure: profile.disclosure,
      updatedAt: now,
    })
    .run();
}

export function saveBrief(db: SqliteDatabase, siteId: string, brief: ContentBrief): string {
  const id = randomUUID();
  db.insert(contentBriefs)
    .values({
      id,
      siteId,
      pageId: brief.pageId,
      playbookId: brief.playbookId,
      playbookVersion: brief.playbookVersion,
      kind: brief.kind,
      targetUrl: brief.targetUrl,
      briefJson: JSON.stringify(brief),
      score: brief.contentScore,
      createdAt: new Date().toISOString(),
    })
    .run();
  return id;
}

export function saveDraft(
  db: SqliteDatabase,
  opts: {
    briefId: string;
    siteId: string;
    pageId: string;
    actionId: string | null;
    title: string;
    body: string;
    model: string;
    modelClass: string;
    state: "draft" | "gated" | "published" | "rejected";
    gate: PublishGateResult | null;
    evidenceTier: string;
    publishedAt?: string | null | undefined;
  },
): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(contentDrafts)
    .values({
      id,
      briefId: opts.briefId,
      siteId: opts.siteId,
      pageId: opts.pageId,
      actionId: opts.actionId,
      title: opts.title,
      body: opts.body,
      model: opts.model,
      modelClass: opts.modelClass,
      state: opts.state,
      gateJson: opts.gate ? JSON.stringify(opts.gate) : null,
      evidenceTier: opts.evidenceTier,
      createdAt: now,
      publishedAt: opts.publishedAt ?? null,
    })
    .run();
  if (opts.gate) {
    for (const c of opts.gate.checks) {
      db.insert(publishGateResults)
        .values({
          id: randomUUID(),
          draftId: id,
          checkId: c.id,
          code: c.code,
          ok: c.ok ? 1 : 0,
          detail: c.detail,
          createdAt: now,
        })
        .run();
    }
  }
  return id;
}

export function listContent(db: SqliteDatabase, siteId?: string) {
  const briefs = db.select().from(contentBriefs).all().filter((b) => !siteId || b.siteId === siteId);
  const drafts = db.select().from(contentDrafts).all().filter((d) => !siteId || d.siteId === siteId);
  return { briefs, drafts };
}
