import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { connectorPairings, type SqliteDatabase } from "@agentsean/db";

/** CMS write kinds the hosted control plane must never store. */
export const CMS_WRITE_KINDS = [
  "wordpress",
  "shopify",
  "webflow",
  "ghost",
  "wix",
  "bigcommerce",
  "contentful",
  "sanity",
  "strapi",
  "payload",
  "cloudflare",
  "git",
] as const;

export class HostedCredentialError extends Error {
  override readonly name = "HostedCredentialError";
}

export function isCmsWriteKind(kind: string): boolean {
  return (CMS_WRITE_KINDS as readonly string[]).includes(kind);
}

export function refuseHostedCmsCredential(kind: string): never {
  throw new HostedCredentialError(
    `Hosted Sean will not store ${kind} write credentials. Pair a customer-side connector; the customer's own daemon holds the key.`,
  );
}

export function createConnectorPairing(
  db: SqliteDatabase,
  tenantId: string,
  siteId: string | null,
  now = new Date(),
): { id: string; token: string } {
  const token = randomBytes(24).toString("base64url");
  const id = randomUUID();
  db.insert(connectorPairings)
    .values({
      id,
      tenantId,
      siteId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      status: "pending",
      createdAt: now.toISOString(),
    })
    .run();
  return { id, token };
}

export function activateConnector(db: SqliteDatabase, token: string): boolean {
  const hash = createHash("sha256").update(token).digest("hex");
  const row = db.select().from(connectorPairings).all().find((r) => r.tokenHash === hash);
  if (!row) return false;
  db.update(connectorPairings).set({ status: "active" }).where(eq(connectorPairings.id, row.id)).run();
  return true;
}

export function listConnectors(db: SqliteDatabase, tenantId: string) {
  return db.select().from(connectorPairings).where(eq(connectorPairings.tenantId, tenantId)).all();
}
