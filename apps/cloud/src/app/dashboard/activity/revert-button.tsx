"use client";
import { useActionState } from "react";
import { revertChange, type RevertState } from "./actions";
import { Button } from "@/components/ui/button";

const initial: RevertState = { status: "idle" };

/**
 * Revert control. Renders a real button that posts to the revert action. The
 * action currently reports that cloud-dispatched reverts are not yet wired
 * (they execute in the daemon), so the button surfaces that honestly rather
 * than silently doing nothing.
 */
export function RevertButton({ changeId }: { changeId: string }) {
  const [state, action, pending] = useActionState(revertChange, initial);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="changeId" value={changeId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Reverting…" : "Revert"}
      </Button>
      {state.status === "unavailable" ? (
        <span className="max-w-56 text-right text-[11px] text-[var(--color-faint)]">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
