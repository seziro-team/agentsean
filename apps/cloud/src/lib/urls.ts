/**
 * Absolute-URL builders for the control plane.
 *
 * This is a PLAIN module (no "use server"): URL construction is pure and must
 * never become a callable RPC endpoint. Server Actions files may only export
 * async functions — a sync helper like `webhookUrl` living in a "use server"
 * file makes the build fail ("Server Actions must be async functions"), so
 * shared URL helpers live here and are imported by both actions and pages.
 *
 * The origin comes from `appUrl()` (NEXT_PUBLIC_APP_URL, defaulting to
 * http://localhost:3000), so these work with an empty environment too.
 */
import { appUrl } from "./env";

/** Join the app origin with a path, tolerating a leading slash or not. */
function abs(path: string): string {
  const origin = appUrl().replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${rel}`;
}

/**
 * The single billing webhook endpoint. Both the admin "connection status" card
 * (which shows the operator what to paste into the provider dashboard) and any
 * server-side reference must agree on this exact path.
 */
export function webhookUrl(): string {
  return abs("/api/webhooks/billing");
}

/** OAuth / magic-link callback the auth flow redirects back through. */
export function authCallbackUrl(): string {
  return abs("/auth/confirm");
}
