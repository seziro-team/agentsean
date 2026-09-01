import "server-only";
import { getSessionContext, type SessionContext } from "@/lib/auth";

/**
 * Re-assert superadmin inside every admin server action / route handler.
 *
 * The layout guard protects rendering, but Server Actions and Route Handlers
 * are independently invocable endpoints — they MUST re-check authorization
 * themselves. Throws if the caller is not a superadmin.
 */
export async function requireSuperadmin(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.isSuperadmin) {
    throw new Error("forbidden: superadmin required");
  }
  return ctx;
}
