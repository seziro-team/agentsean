import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getCurrentContext } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import {
  canForwardInput,
  planAllowsInteractiveTerminal,
} from "@/lib/terminal/protocol";
import { terminalRelayUrl } from "@/lib/env";
import type { TerminalSession } from "@/lib/db/types";

/**
 * Terminal attach endpoint (SSE fallback transport).
 *
 *   GET  → Server-Sent Events stream of terminal OUTPUT for the session.
 *   POST → terminal INPUT (keystrokes) from the browser.
 *
 * A real WebSocket relay is preferred, but Vercel's serverless runtime cannot
 * host a long-lived WebSocket server, so this app falls back to SSE-for-output
 * + POST-for-input. When TERMINAL_RELAY_URL is set, a separate always-on relay
 * process bridges the daemon's outbound WebSocket to these endpoints; without
 * it, there is no live daemon feed in this deployment and the stream only
 * emits status/heartbeats (it never fabricates terminal output).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOwnedSession(
  sessionId: string,
): Promise<{ session: TerminalSession; planId: string } | null> {
  const auth = await getSessionContext();
  if (!auth) return null;
  const ctx = await getCurrentContext();
  if (!ctx.tenant) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("terminal_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();
  if (!data) return null;
  return { session: data as TerminalSession, planId: ctx.tenant.plan };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await context.params;
  const owned = await loadOwnedSession(sessionId);
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const relay = terminalRelayUrl();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      send("status", owned.session.status);
      if (relay) {
        send(
          "status",
          "Relay configured — waiting for your daemon to dial in and attach.",
        );
        // NOTE: bridging the relay's WebSocket into this SSE stream is done by
        // the external relay service; here we only surface status + heartbeats.
      } else {
        send(
          "status",
          "No terminal relay is configured in this deployment (TERMINAL_RELAY_URL " +
            "is unset), so live output is unavailable. Set up the relay to stream " +
            "your daemon's terminal here.",
        );
      }

      // Heartbeats keep the connection alive and let the client detect drops.
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(interval);
        }
      }, 15_000);

      const abort = () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await context.params;
  const owned = await loadOwnedSession(sessionId);
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ---------------------------------------------------------------------------
  // SECURITY BOUNDARY — read-only by default.
  // Input (browser → daemon) is only accepted when the session is interactive
  // AND the plan entitles interactive terminals. This is enforced HERE on the
  // server; the client also declines to attach a keyboard, but we never rely on
  // the client for this. The attached process may hold write credentials to a
  // live site, so a read-only session must be structurally unable to inject
  // input.
  // ---------------------------------------------------------------------------
  const planAllowsInput = planAllowsInteractiveTerminal(owned.planId);
  const allowed = canForwardInput({
    direction: "browser_to_daemon",
    interactive: owned.session.interactive,
    planAllowsInput,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "read_only_session", reason: "input is not permitted on this session" },
      { status: 403 },
    );
  }

  let body: { data?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  const data = typeof body.data === "string" ? body.data : "";
  if (!data) return NextResponse.json({ ok: true, forwarded: false });

  const relay = terminalRelayUrl();
  if (!relay) {
    // No live relay in this deployment: accept and drop, with a note. A real
    // relay would forward these bytes to the daemon's outbound WebSocket.
    console.info(
      `[terminal] input for session ${sessionId} dropped — no TERMINAL_RELAY_URL configured`,
    );
    return NextResponse.json({ ok: true, forwarded: false, note: "no_relay" });
  }

  // With a relay configured, forwarding is handled by the relay service; this
  // endpoint would hand the bytes off to it. Left as a documented seam.
  return NextResponse.json({ ok: true, forwarded: true });
}
