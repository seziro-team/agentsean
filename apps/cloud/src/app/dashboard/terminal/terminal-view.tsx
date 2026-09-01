"use client";
import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { SSE_EVENT } from "@/lib/terminal/protocol";

type Status = "connecting" | "attached" | "closed" | "error";

/**
 * Browser terminal. Attaches to /api/terminal/[sessionId] over SSE for output.
 *
 * READ-ONLY BY DEFAULT: terminal.onData (keystrokes) is wired ONLY when
 * `interactive` is true. A read-only view never attaches an input handler, so
 * it is structurally incapable of sending keystrokes — the server also rejects
 * input on non-interactive sessions, so this is defence in depth, not the sole
 * gate. See src/lib/terminal/protocol.ts.
 *
 * xterm is imported dynamically inside the effect so it never runs during SSR
 * (it touches `window`/`document`).
 */
export function TerminalView({
  sessionId,
  interactive,
}: {
  sessionId: string;
  interactive: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    let source: EventSource | null = null;
    let observer: ResizeObserver | null = null;
    let cleanupFit: (() => void) | null = null;

    async function boot() {
      const host = hostRef.current;
      if (!host) return;
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;

      term = new XTerm({
        convertEol: true,
        cursorBlink: interactive,
        disableStdin: !interactive,
        fontSize: 13,
        fontFamily:
          'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
        theme: {
          background: "#0c1018",
          foreground: "#e6edf3",
          cursor: interactive ? "#58a6ff" : "#0c1018",
          selectionBackground: "#264f78",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      try {
        fit.fit();
      } catch {
        /* container not measured yet */
      }

      term.writeln("\x1b[90mWaiting for the daemon to attach…\x1b[0m");
      if (!interactive) {
        term.writeln("\x1b[90m(read-only session — input is disabled)\x1b[0m");
      }

      // Output stream via SSE.
      source = new EventSource(`/api/terminal/${sessionId}`);
      source.addEventListener(SSE_EVENT.data, (e) => {
        term?.write((e as MessageEvent<string>).data);
      });
      source.addEventListener(SSE_EVENT.status, (e) => {
        const msg = (e as MessageEvent<string>).data;
        if (msg === "attached") setStatus("attached");
        if (msg === "closed") setStatus("closed");
        if (msg && msg !== "attached" && msg !== "closed") {
          term?.writeln(`\x1b[90m${msg}\x1b[0m`);
        }
      });
      source.addEventListener(SSE_EVENT.error, (e) => {
        const msg = (e as MessageEvent<string>).data;
        if (msg) term?.writeln(`\x1b[31m${msg}\x1b[0m`);
      });
      source.addEventListener("open", () =>
        setStatus((s) => (s === "connecting" ? "attached" : s)),
      );
      source.addEventListener("error", () => setStatus("error"));

      // Input only when interactive.
      if (interactive) {
        term.onData((data) => {
          void fetch(`/api/terminal/${sessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data }),
          });
        });
      }

      // Refit on container resize.
      observer = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      });
      observer.observe(host);
      cleanupFit = () => observer?.disconnect();
    }

    void boot();

    return () => {
      disposed = true;
      source?.close();
      cleanupFit?.();
      term?.dispose();
    };
  }, [sessionId, interactive]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-1.5">
        <span className="font-mono text-xs text-[var(--color-faint)]">
          terminal · {sessionId.slice(0, 8)}
        </span>
        <StatusPill status={status} />
      </div>
      <div ref={hostRef} className="h-80 w-full p-2" />
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; color: string }> = {
    connecting: { label: "connecting", color: "var(--color-warning)" },
    attached: { label: "attached", color: "var(--color-success)" },
    closed: { label: "closed", color: "var(--color-faint)" },
    error: { label: "error", color: "var(--color-danger)" },
  };
  const s = map[status];
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: s.color }}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.color }}
        aria-hidden
      />
      {s.label}
    </span>
  );
}
