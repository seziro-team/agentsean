import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type AuditEntry = {
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/**
 * Append a row to `audit_log`. EVERY mutating admin action must call this —
 * especially impersonation, the single most dangerous action in the app.
 *
 * Best-effort by design: a failure to write the audit row must not swallow the
 * action's own result path, but it is logged loudly. Uses the admin client so
 * the insert succeeds regardless of the actor's RLS view; falls back to the
 * request-scoped client if the service role is not configured.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    ip = null;
  }

  const row = {
    actor_id: entry.actorId,
    actor_email: entry.actorEmail,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip,
  };

  try {
    const client = createAdminClient() ?? (await createClient());
    const { error } = await client.from("audit_log").insert(row);
    if (error) {
      console.error("[audit] failed to record action", entry.action, error.message);
    }
  } catch (err) {
    console.error("[audit] failed to record action", entry.action, err);
  }
}
