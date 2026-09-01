import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "../env";
import type { Database } from "../db/types";

/**
 * Refreshes the Supabase auth session on every request and guards private
 * route trees. Because Server Components cannot write cookies, the token
 * refresh MUST happen here in middleware or sessions silently expire.
 *
 * Route protection here is coarse (redirect unauthenticated users away from
 * /dashboard and /admin to /login). Fine-grained authorization — especially
 * the superadmin check that makes /admin return 404 rather than redirect — is
 * enforced again server-side in the route layouts. Middleware is defence in
 * depth, not the sole gate.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = supabaseEnv();
  if (!env.isConfigured || !env.url || !env.anonKey) {
    // No auth backend configured — let requests through so the app can render
    // its "connect Supabase" banners. Nothing sensitive is reachable because
    // every data path also checks configuration and session server-side.
    return response;
  }

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: getUser() (not getSession()) revalidates the token with the
  // auth server; getSession() trusts the cookie and can be spoofed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPrivate = path.startsWith("/dashboard") || path.startsWith("/admin");

  if (!user && isPrivate) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
