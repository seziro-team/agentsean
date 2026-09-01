import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { envelopeKeys, type SqliteDatabase } from "@agentsean/db";

const ALGO = "aes-256-gcm";

export class EnvelopeError extends Error {
  override readonly name = "EnvelopeError";
}

export function masterKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env["SEAN_KMS_KEY"]?.trim();
  if (!raw) {
    throw new EnvelopeError("SEAN_KMS_KEY is required to wrap per-tenant data keys.");
  }
  if (/^[0-9a-f]+$/i.test(raw) && raw.length === 64) return Buffer.from(raw, "hex");
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  return createHash("sha256").update(raw).digest();
}

function wrapDek(master: Buffer, dek: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, master, iv);
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function unwrapDek(master: Buffer, wrapped: string): Buffer {
  const buf = Buffer.from(wrapped, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, master, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function encryptSecret(dek: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, dek, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(dek: Buffer, blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function loadOrCreateDek(
  db: SqliteDatabase,
  tenantId: string,
  master: Buffer,
  now = new Date(),
): Buffer {
  const existing = db
    .select()
    .from(envelopeKeys)
    .where(eq(envelopeKeys.tenantId, tenantId))
    .get();
  if (existing) return unwrapDek(master, existing.wrappedDek);
  const dek = randomBytes(32);
  db.insert(envelopeKeys)
    .values({
      id: randomUUID(),
      tenantId,
      wrappedDek: wrapDek(master, dek),
      createdAt: now.toISOString(),
    })
    .run();
  return dek;
}
