import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every request except static assets. Refreshes the Supabase session
 * cookie (required — Server Components cannot write cookies) and performs
 * coarse redirect-based route protection. The authoritative authorization
 * (including the /admin superadmin 404) lives in the route layouts.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon and common static file extensions
     * - the billing webhook (verified by signature, not session)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
