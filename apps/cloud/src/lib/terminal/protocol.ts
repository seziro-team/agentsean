import { PLANS, isPlanId } from "../plans";
/**
 * Terminal relay protocol.
 *
 * The self-hosted daemon binds 127.0.0.1 only and MUST NOT open an inbound port
 * (ARCHITECTURE.md §1/§3). So attaching a browser terminal cannot mean the
 * browser connecting to the daemon. Instead:
 *
 *   daemon  ──dials OUT──▶  relay  ◀──attaches──  browser
 *
 * The daemon opens an OUTBOUND WebSocket to this control plane's relay using a
 * long-lived session token that it obtained by redeeming a short-lived, single-
 * use pairing code. The browser attaches to the same `sessionId`. Neither side
 * ever listens for inbound connections on the customer's machine.
 *
 * Transport: a real WebSocket relay is preferred. Vercel's serverless runtime
 * cannot hold a WebSocket server, so this app ALSO supports an SSE-for-output +
 * POST-for-input fallback (see app/api/terminal/[sessionId]/route.ts). The
 * message envelope below is transport-agnostic and used by both paths.
 *
 * SECURITY BOUNDARY — READ-ONLY BY DEFAULT:
 * `data` frames flowing browser→daemon (keystrokes) are only forwarded when the
 * session is explicitly marked interactive AND the attaching user's plan has
 * the terminal-input entitlement. This is NOT a cosmetic feature flag: a
 * read-only session must be structurally incapable of injecting input, because
 * the attached process may hold write credentials to a live site. The relay
 * drops inbound `data` frames on non-interactive sessions rather than trusting
 * the client to disable its own keyboard. See `canForwardInput`.
 */

export type TerminalMessageType = "attach" | "data" | "resize" | "detach" | "error";

/** Wire envelope. `payload` meaning depends on `t`. */
export type TerminalMessage =
  | { t: "attach"; sessionId: string; payload: AttachPayload }
  | { t: "data"; sessionId: string; payload: string }
  | { t: "resize"; sessionId: string; payload: ResizePayload }
  | { t: "detach"; sessionId: string; payload?: undefined }
  | { t: "error"; sessionId: string; payload: string };

export type AttachPayload = {
  /** Who is attaching. "daemon" produces output; "browser" consumes it. */
  role: "daemon" | "browser";
  /** Session token (daemon) or the user's attach grant (browser). */
  token: string;
  /** Terminal geometry the attaching side wants. */
  cols?: number;
  rows?: number;
};

export type ResizePayload = { cols: number; rows: number };

/** Direction a `data` frame is travelling through the relay. */
export type DataDirection = "daemon_to_browser" | "browser_to_daemon";

/**
 * The single authorization gate for input. Browser→daemon keystrokes are only
 * permitted when the session was provisioned interactive AND the user's plan
 * entitles interactive terminals. Output (daemon→browser) always flows.
 */
export function canForwardInput(opts: {
  direction: DataDirection;
  interactive: boolean;
  planAllowsInput: boolean;
}): boolean {
  if (opts.direction === "daemon_to_browser") return true;
  return opts.interactive && opts.planAllowsInput;
}

/** Which plans may run an interactive (input-enabled) terminal. */
export function planAllowsInteractiveTerminal(planId: string): boolean {
  // Gate on the capability, not on a hardcoded list of plan names — a list has
  // to be found and updated every time packaging changes, and missing one is a
  // silent privilege change. Read-only attach stays available to anyone with a
  // connected daemon.
  if (!isPlanId(planId)) return false;
  return PLANS[planId].apiAccess;
}

export function isTerminalMessage(value: unknown): value is TerminalMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { t?: unknown; sessionId?: unknown };
  if (typeof v.sessionId !== "string") return false;
  return (
    v.t === "attach" ||
    v.t === "data" ||
    v.t === "resize" ||
    v.t === "detach" ||
    v.t === "error"
  );
}

export function encodeMessage(msg: TerminalMessage): string {
  return JSON.stringify(msg);
}

export function decodeMessage(raw: string): TerminalMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isTerminalMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** SSE event names used by the fallback transport. */
export const SSE_EVENT = {
  data: "data",
  status: "status",
  error: "error",
} as const;
