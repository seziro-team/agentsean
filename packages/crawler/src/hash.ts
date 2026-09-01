import { createHash } from "node:crypto";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function contentHash(body: string | Uint8Array): string {
  return sha256Hex(body);
}

export function urlHash(url: string): string {
  return sha256Hex(url);
}
