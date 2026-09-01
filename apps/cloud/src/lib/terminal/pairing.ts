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

/**
 * Cap on live pairing codes per tenant.
 *
 * Without this, any authenticated user can loop the pair endpoint and mint
 * unbounded rows in `daemon_pairings` and `terminal_sessions` — a cheap
 * database-fill denial of service, and an unbounded set of valid codes
 * outstanding at once. The cap counts only codes that are still usable
 * (pending and unexpired), so it throttles abuse without ever blocking a user
 * who is simply pairing a new machine.
 */
export const MAX_PENDING_PAIRINGS_PER_TENANT = 5;

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** A pairing is usable only while pending AND unexpired. */
export function pairingIsLive(row: { status: string; expires_at: string }): boolean {
  return row.status === "pending" && Date.parse(row.expires_at) > Date.now();
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

  // Rate limit before doing any work. Count only codes that are still usable —
  // expired rows must not permanently consume a tenant's quota.
  const { data: live, error: countErr } = await db
    .from("daemon_pairings")
    .select("id, status, expires_at")
    .eq("tenant_id", opts.tenantId)
    .eq("status", "pending");
  if (countErr) {
    console.error("[terminal] pairing quota check failed", countErr.message);
    return null;
  }
  const usable = (live ?? []).filter(pairingIsLive);
  if (usable.length >= MAX_PENDING_PAIRINGS_PER_TENANT) {
    console.warn(
      `[terminal] tenant ${opts.tenantId} has ${usable.length} live pairing codes; refusing to mint another`,
    );
    return null;
  }

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

export type RedeemedPairing = {
  id: string;
  tenantId: string;
  sessionId: string;
};

/**
 * Burn a pairing code and bind a daemon session token to it.
 *
 * Call this from the daemon-facing redemption endpoint when that ships. Do NOT
 * reimplement it as a select-then-update in TypeScript: two daemons redeeming
 * the same code concurrently would both observe `pending` and both succeed.
 * `redeem_daemon_pairing` (migration 0003) puts the `status = 'pending'` and
 * `expires_at > now()` predicates inside a single UPDATE, so exactly one caller
 * can win and an expired code can never be redeemed.
 *
 * Returns null when the code is unknown, already redeemed, or expired — the
 * caller must not distinguish those cases to the client, or it becomes an
 * oracle for probing valid codes.
 */
export async function redeemPairing(
  db: SupabaseClient<Database>,
  code: string,
  sessionToken: string,
): Promise<RedeemedPairing | null> {
  const { data, error } = await db.rpc("redeem_daemon_pairing", {
    p_code_hash: hashCode(code),
    p_session_token_hash: hashCode(sessionToken),
  });
  if (error) {
    console.error("[terminal] redeem failed", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return { id: row.id, tenantId: row.tenant_id, sessionId: row.session_id };
}
