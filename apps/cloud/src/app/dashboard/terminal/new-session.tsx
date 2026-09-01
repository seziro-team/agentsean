"use client";
import { useActionState, useState } from "react";
import { createPairing, type NewSessionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { CopyField } from "@/components/ui/copy-button";
import { TerminalView } from "./terminal-view";

const initial: NewSessionState = { status: "idle" };

/**
 * Creates a pairing and, once created, shows the one-time code + the attach
 * view. Interactive toggle is only offered when the plan allows it.
 */
export function NewSession({ canInteractive }: { canInteractive: boolean }) {
  const [state, action, pending] = useActionState(createPairing, initial);
  const [interactive, setInteractive] = useState(false);

  return (
    <div className="space-y-4">
      {state.status === "error" ? (
        <Banner tone="danger" title="Could not start a session">
          {state.message}
        </Banner>
      ) : null}

      {state.status !== "created" ? (
        <form action={action} className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <input
              type="checkbox"
              name="interactive"
              checked={interactive}
              onChange={(e) => setInteractive(e.target.checked)}
              disabled={!canInteractive}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Interactive (allow input)
          </label>
          {!canInteractive ? (
            <span className="text-xs text-[var(--color-faint)]">
              Interactive input needs the Business, Agency, or self-host plan. Read-only
              attach is available on every plan.
            </span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "New session"}
          </Button>
        </form>
      ) : null}

      {state.status === "created" && state.code && state.sessionId ? (
        <div className="space-y-4">
          <Banner tone="success" title="Session ready — pair your daemon">
            Run this on the machine where the Agent Sean daemon is installed. The code
            is single-use and expires shortly.
          </Banner>
          <CopyField
            value={`sean connect --cloud ${state.code}`}
            label="Copy command"
          />
          <div className="flex items-center gap-2 text-xs text-[var(--color-faint)]">
            <span>Session</span>
            <code className="font-mono text-[var(--color-muted)]">
              {state.sessionId}
            </code>
            <span>·</span>
            <span>{state.interactive ? "interactive" : "read-only"}</span>
          </div>
          <TerminalView
            sessionId={state.sessionId}
            interactive={Boolean(state.interactive)}
          />
        </div>
      ) : null}
    </div>
  );
}
