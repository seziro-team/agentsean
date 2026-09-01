import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { gbpEdits, gbpLocations, type SqliteDatabase } from "@agentsean/db";

/** 10 edits/min per profile, non-increasable. 300 QPM per API. Quota starts at 0 until approval. */
export const GBP_EDITS_PER_MIN = 10;
export const GBP_QPM = 300;

export class GbpQuotaError extends Error {
  override readonly name = "GbpQuotaError";
}

export class GbpNotApprovedError extends Error {
  override readonly name = "GbpNotApprovedError";
}

export type GbpLocation = {
  id: string;
  locationName: string;
  title: string | null;
  primaryCategory: string | null;
  approvalStatus: string;
};

export type GbpWrite = {
  locationId: string;
  kind: "hours" | "category" | "title";
  payload: Record<string, unknown>;
};

const buckets = new Map<string, number[]>();

export function allowGbpEdit(locationId: string, now = Date.now()): boolean {
  const windowStart = now - 60_000;
  const hits = (buckets.get(locationId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= GBP_EDITS_PER_MIN) return false;
  hits.push(now);
  buckets.set(locationId, hits);
  return true;
}

export function refuseReviewGeneration(): never {
  throw new Error(
    "Review generation is T4. Incentives, gating, and staff-name asks are explicit GBP policy violations. No setting exists.",
  );
}

export function refuseCityServicePages(): never {
  throw new Error(
    "Unbounded city×service page generation is T4. It is named under both doorway abuse and scaled content abuse.",
  );
}

export function refuseGbpTitleWrite(): never {
  throw new Error(
    "Never auto-write the GBP business title. Keywords in the title are a policy trap. Advisory only.",
  );
}

export async function applyGbpEdit(
  db: SqliteDatabase,
  siteId: string,
  write: GbpWrite,
  now = new Date(),
): Promise<{ id: string }> {
  const loc = db.select().from(gbpLocations).where(eq(gbpLocations.id, write.locationId)).get();
  if (!loc || loc.approvalStatus !== "approved") {
    throw new GbpNotApprovedError(
      "GBP write APIs start at 0 QPM until Google approves Basic API Access and the profile is verified 60+ days.",
    );
  }
  if (write.kind === "title") refuseGbpTitleWrite();
  const windowStart = new Date(now.getTime() - 60_000).toISOString();
  const recentForProfile = db
    .select()
    .from(gbpEdits)
    .where(eq(gbpEdits.locationId, write.locationId))
    .all()
    .filter((e) => e.appliedAt >= windowStart);
  if (recentForProfile.length >= GBP_EDITS_PER_MIN || !allowGbpEdit(write.locationId, now.getTime())) {
    throw new GbpQuotaError(`GBP cap is ${GBP_EDITS_PER_MIN} edits/min per profile and is not increasable.`);
  }
  const recentAll = db
    .select()
    .from(gbpEdits)
    .all()
    .filter((e) => e.appliedAt >= windowStart);
  if (recentAll.length >= GBP_QPM) {
    throw new GbpQuotaError(`GBP API cap is ${GBP_QPM} QPM and starts at 0 until Google approves Basic API Access.`);
  }
  if (write.kind === "category" && typeof write.payload["primaryCategory"] === "string") {
    db.update(gbpLocations)
      .set({ primaryCategory: write.payload["primaryCategory"] })
      .where(eq(gbpLocations.id, write.locationId))
      .run();
  }
  const id = randomUUID();
  db.insert(gbpEdits)
    .values({
      id,
      siteId,
      locationId: write.locationId,
      kind: write.kind,
      payload: JSON.stringify(write.payload),
      appliedAt: now.toISOString(),
    })
    .run();
  return { id };
}

export function upsertGbpLocation(
  db: SqliteDatabase,
  siteId: string,
  loc: Omit<GbpLocation, "id"> & { id?: string | undefined },
): string {
  const id = loc.id ?? randomUUID();
  const existing = db.select().from(gbpLocations).where(eq(gbpLocations.id, id)).get();
  const values = {
    siteId,
    locationName: loc.locationName,
    title: loc.title,
    primaryCategory: loc.primaryCategory,
    approvalStatus: loc.approvalStatus,
    verifiedAt: loc.approvalStatus === "approved" ? new Date().toISOString() : null,
  };
  if (existing) {
    db.update(gbpLocations).set(values).where(eq(gbpLocations.id, id)).run();
    return id;
  }
  db.insert(gbpLocations)
    .values({ id, placeId: null, ...values })
    .run();
  return id;
}

export function listGbpLocations(db: SqliteDatabase, siteId: string) {
  return db.select().from(gbpLocations).where(eq(gbpLocations.siteId, siteId)).all();
}

export function localCitationGap(opts: {
  gbpListed: boolean;
  aiMentions: number;
  localPackVisible: boolean;
}): { gap: boolean; message: string } {
  if (opts.gbpListed && opts.localPackVisible && opts.aiMentions === 0) {
    return {
      gap: true,
      message:
        "BrightLocal 2026: AI tools jumped from 6% to 45% of local discovery while Google review-reading fell 83% → 71%. An AI citation gap is now worth more than another local rank tracker.",
    };
  }
  return { gap: false, message: "No AI citation gap flagged." };
}
