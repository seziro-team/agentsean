import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planAllowsInteractiveTerminal } from "./protocol";
import type { Database } from "../db/types";

/**
 * Pairing/session provisioning shared by the terminal page action and the
 * daemon-facing /api/terminal/pair route.
 *
 * Only the SHA-256 hash of the pairing code and the session token is persisted
 * (same pattern as packages/hosted/src/connector.ts). The plaintext code is
 * returned once to the browser and shown to the user; it is never stored, so a
 * database leak cannot reveal a usable code.
 */
export const PAIRING_TTL_MS = 10 * 60 * 1000; // short-lived: 10 minutes

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Human-friendly, high-entropy single-use code, e.g. "SEAN-3f9a-...". */
export function generatePairingCode(): string {
  return `SEAN-${randomBytes(9).toString("base64url")}`;
}

export type ProvisionResult = {
  code: string;
  sessionId: string;
  pairingId: string;
  expiresAt: string;
  interactive: boolean;
};

/**
 * Create a pairing + terminal session for a tenant. `interactive` is forced to
 * false unless the plan allows an interactive terminal — this is the first of
 * two enforcement points for the read-only-by-default boundary (the second is
 * the input route, which must not trust this flag alone).
 */
export async function provisionTerminalSession(
  db: SupabaseClient<Database>,
  opts: {
    tenantId: string;
    planId: string;
    userId: string;
    siteId?: string | null;
    interactive?: boolean;
  },
): Promise<ProvisionResult | null> {
  const interactive =
    Boolean(opts.interactive) && planAllowsInteractiveTerminal(opts.planId);
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const pairingId = randomUUID();
  const sessionId = randomUUID();

  const { error: pairErr } = await db.from("daemon_pairings").insert({
    id: pairingId,
    tenant_id: opts.tenantId,
    site_id: opts.siteId ?? null,
    code_hash: hashCode(code),
    status: "pending",
    interactive,
    expires_at: expiresAt,
    created_by: opts.userId,
  });
  if (pairErr) {
    console.error("[terminal] pairing insert failed", pairErr.message);
    return null;
  }

  const { error: sessErr } = await db.from("terminal_sessions").insert({
    id: sessionId,
    tenant_id: opts.tenantId,
    pairing_id: pairingId,
    status: "waiting",
    interactive,
    created_by: opts.userId,
  });
  if (sessErr) {
    console.error("[terminal] session insert failed", sessErr.message);
    return null;
  }

  return { code, sessionId, pairingId, expiresAt, interactive };
}
