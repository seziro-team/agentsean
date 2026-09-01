import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { adminSecretKey } from "../env";

/**
 * AES-256-GCM secret encryption for admin-saved provider credentials.
 *
 * Wire format is byte-identical to packages/hosted/src/envelope.ts:
 *   base64url( iv[12] || authTag[16] || ciphertext )
 * The key is derived from ADMIN_SECRET_KEY: a 64-char hex string or 32-byte
 * base64 value is used directly; anything else is SHA-256'd to 32 bytes.
 *
 * Unlike the hosted package this does not wrap a per-tenant DEK — admin
 * settings are a single global bag, so we encrypt directly under the master
 * key. Same algorithm, same layout, so operators reason about one scheme.
 */
const ALGO = "aes-256-gcm";

export class EnvelopeError extends Error {
  override readonly name = "EnvelopeError";
}

export function isEncryptionConfigured(): boolean {
  return Boolean(adminSecretKey());
}

function masterKey(): Buffer {
  const raw = adminSecretKey();
  if (!raw) {
    throw new EnvelopeError(
      "ADMIN_SECRET_KEY is required to encrypt admin-saved secrets.",
    );
  }
  if (/^[0-9a-f]+$/i.test(raw) && raw.length === 64) return Buffer.from(raw, "hex");
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < 28) throw new EnvelopeError("ciphertext too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Encrypt a JSON-serialisable credential bag; returns the base64url blob. */
export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(blob: string): T {
  return JSON.parse(decryptSecret(blob)) as T;
}
