"use client";
import { useActionState, useState } from "react";
import { requestErasure, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";

const initial: SettingsState = { status: "idle" };

/**
 * GDPR erasure request, gated behind typing the workspace name — the button
 * only enables on an exact match, so an accidental click cannot trigger it.
 */
export function DangerZone({ workspaceName }: { workspaceName: string }) {
  const [state, action, pending] = useActionState(requestErasure, initial);
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim() === workspaceName;

  return (
    <div className="space-y-4">
      {state.status === "ok" ? (
        <Banner tone="success" title="Request received">
          {state.message}
        </Banner>
      ) : null}
      {state.status === "error" ? (
        <Banner tone="danger" title="Could not submit">
          {state.message}
        </Banner>
      ) : null}

      <p className="text-sm text-[var(--color-muted)]">
        Requesting erasure schedules deletion of your workspace, sites, and associated
        data. This cannot be undone.
      </p>

      <form action={action} className="space-y-3">
        <Field label={`Type "${workspaceName}" to confirm`} htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={workspaceName}
            autoComplete="off"
          />
        </Field>
        <Button type="submit" variant="danger" disabled={!matches || pending}>
          {pending ? "Submitting…" : "Request data erasure"}
        </Button>
      </form>
    </div>
  );
}
