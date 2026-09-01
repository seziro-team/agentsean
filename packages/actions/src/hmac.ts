import { createHmac, timingSafeEqual } from "node:crypto";
import type { Action } from "./types.js";

function canonicalPayload(action: Action): string {
  return JSON.stringify({
    id: action.id,
    kind: action.kind,
    target: action.target,
    payload: action.payload,
  });
}

export function signApproval(key: Buffer, action: Action, actor: string): string {
  return createHmac("sha256", key)
    .update(`${actor}\n${canonicalPayload(action)}`)
    .digest("hex");
}

export function verifyApproval(
  key: Buffer,
  action: Action,
  actor: string,
  hmac: string,
): boolean {
  const expected = signApproval(key, action, actor);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hmac, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
