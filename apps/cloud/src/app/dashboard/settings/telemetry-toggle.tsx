"use client";
import { useActionState } from "react";
import { updateTelemetry, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";

const initial: SettingsState = { status: "idle" };

/** Telemetry preference. Advisory — applies when the daemon next syncs. */
export function TelemetryToggle() {
  const [state, action, pending] = useActionState(updateTelemetry, initial);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="telemetry"
          defaultChecked
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        <span className="text-[var(--color-fg)]">Send anonymous usage telemetry</span>
      </label>
      <p className="text-xs text-[var(--color-faint)]">
        Telemetry is emitted by your daemon. This preference is applied the next time
        your daemon syncs with the control plane.
      </p>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save preference"}
      </Button>
      {state.status === "ok" ? <Banner tone="success">{state.message}</Banner> : null}
      {state.status === "error" ? <Banner tone="danger">{state.message}</Banner> : null}
    </form>
  );
}
