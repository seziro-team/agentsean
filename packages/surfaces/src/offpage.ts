import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { inbound404s, mentions, outreachDrafts, type SqliteDatabase } from "@agentsean/db";

export type MentionInput = {
  url: string;
  snippet: string;
  linked: boolean;
  kind?: "unlinked" | "inbound_404" | "prospect" | undefined;
};

export function scoreProspect(opts: { linked: boolean; domainRating?: number | undefined; branded: boolean }): number {
  const mention = opts.branded ? 0.68 : 0.2;
  const dr = Math.min(1, (opts.domainRating ?? 20) / 100) * 0.3;
  const unlinkBonus = opts.linked ? 0 : 0.25;
  return Math.round((mention + dr + unlinkBonus) * 1000) / 1000;
}

export function discoverMentions(opts: {
  brand: string;
  originHost: string;
  pages: Array<{ url: string; text: string; links: string[] }>;
}): MentionInput[] {
  const brand = opts.brand.toLowerCase();
  const host = opts.originHost.replace(/^www\./, "");
  const out: MentionInput[] = [];
  for (const p of opts.pages) {
    const text = p.text.toLowerCase();
    if (!text.includes(brand)) continue;
    const linked = p.links.some((l) => {
      try {
        return new URL(l).hostname.replace(/^www\./, "") === host;
      } catch {
        return false;
      }
    });
    const idx = text.indexOf(brand);
    const snippet = p.text.slice(Math.max(0, idx - 40), idx + brand.length + 40);
    out.push({
      url: p.url,
      snippet,
      linked,
      kind: linked ? "prospect" : "unlinked",
    });
  }
  return out;
}

export function findInbound404s(
  crawled: Array<{ url: string; statusCode: number | null; inlinks: string[] }>,
): Array<{ sourceUrl: string; targetUrl: string; status: number | null }> {
  const out: Array<{ sourceUrl: string; targetUrl: string; status: number | null }> = [];
  for (const p of crawled) {
    if (p.statusCode !== 404 && p.statusCode !== 410) continue;
    for (const src of p.inlinks) {
      out.push({ sourceUrl: src, targetUrl: p.url, status: p.statusCode });
    }
  }
  return out;
}

export function saveMentions(db: SqliteDatabase, siteId: string, rows: MentionInput[], now = new Date()): number {
  let n = 0;
  const ts = now.toISOString();
  for (const row of rows) {
    const kind = row.kind ?? (row.linked ? "prospect" : "unlinked");
    const existing = db
      .select()
      .from(mentions)
      .where(eq(mentions.siteId, siteId))
      .all()
      .find((m) => m.url === row.url && m.kind === kind);
    const score = scoreProspect({ linked: row.linked, branded: true });
    if (existing) {
      db.update(mentions)
        .set({ snippet: row.snippet, linked: row.linked ? 1 : 0, score })
        .where(eq(mentions.id, existing.id))
        .run();
      continue;
    }
    db.insert(mentions)
      .values({
        id: randomUUID(),
        siteId,
        url: row.url,
        snippet: row.snippet,
        linked: row.linked ? 1 : 0,
        score,
        kind,
        createdAt: ts,
      })
      .run();
    n++;
  }
  return n;
}

export function saveInbound404s(
  db: SqliteDatabase,
  siteId: string,
  rows: Array<{ sourceUrl: string; targetUrl: string; status: number | null }>,
  now = new Date(),
): number {
  const ts = now.toISOString();
  for (const row of rows) {
    db.insert(inbound404s)
      .values({
        id: randomUUID(),
        siteId,
        sourceUrl: row.sourceUrl,
        targetUrl: row.targetUrl,
        status: row.status,
        createdAt: ts,
      })
      .run();
  }
  return rows.length;
}

export function draftOutreach(db: SqliteDatabase, siteId: string, mentionId: string, now = new Date()): string {
  const mention = db.select().from(mentions).where(eq(mentions.id, mentionId)).get();
  const id = randomUUID();
  const brand = "your brand";
  db.insert(outreachDrafts)
    .values({
      id,
      siteId,
      mentionId,
      toEmail: null,
      subject: `Unlinked mention of ${brand}`,
      body: `Hi — we noticed ${mention?.url ?? "a page"} mentions us without a link. Happy to share a corrected URL if useful.`,
      state: "draft",
      createdAt: now.toISOString(),
    })
    .run();
  return id;
}

export function refuseUnauthedSend(): never {
  throw new Error("Outreach send is T3 permanently. Per-message approval is required. No auto-send setting exists.");
}

export function refuseDisavowWithoutManualAction(): never {
  throw new Error("Disavow is locked unless a Search Console manual action exists. GSC has no disavow API.");
}

export function listMentions(db: SqliteDatabase, siteId: string) {
  return db.select().from(mentions).where(eq(mentions.siteId, siteId)).all();
}

export function listOutreach(db: SqliteDatabase, siteId: string) {
  return db.select().from(outreachDrafts).where(eq(outreachDrafts.siteId, siteId)).all();
}

export function listInbound404s(db: SqliteDatabase, siteId: string) {
  return db.select().from(inbound404s).where(eq(inbound404s.siteId, siteId)).all();
}

export function brandHostFromOrigin(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./, "");
}
