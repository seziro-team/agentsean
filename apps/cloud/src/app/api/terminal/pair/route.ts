import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getCurrentContext } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { provisionTerminalSession } from "@/lib/terminal/pairing";
import { planAllowsInteractiveTerminal } from "@/lib/terminal/protocol";

/**
 * Mint a single-use pairing code + waiting session for the authenticated user's
 * tenant. This is the programmatic sibling of the terminal page's server
 * action; it exists so tooling can request a pairing over HTTP.
 *
 * Interactive is enforced server-side against the plan — the request cannot opt
 * itself into interactive input on a plan that does not allow it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const ctx = await getCurrentContext();
  if (!ctx.tenant || !ctx.profile) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400 });
  }

  let body: { siteId?: unknown; interactive?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const wantInteractive = body.interactive === true;
  if (wantInteractive && !planAllowsInteractiveTerminal(ctx.tenant.plan)) {
    return NextResponse.json({ error: "interactive_not_entitled" }, { status: 403 });
  }
  const siteId = typeof body.siteId === "string" ? body.siteId : null;

  const supabase = await createClient();
  const result = await provisionTerminalSession(supabase, {
    tenantId: ctx.tenant.id,
    planId: ctx.tenant.plan,
    userId: ctx.profile.id,
    siteId,
    interactive: wantInteractive,
  });
  if (!result) {
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });
  }

  return NextResponse.json({
    code: result.code,
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
    interactive: result.interactive,
  });
}
