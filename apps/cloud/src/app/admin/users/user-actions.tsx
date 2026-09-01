"use client";
import { useState } from "react";
import { changePlan, grantComp, impersonateUser, setSuspended } from "./actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { BILLABLE_PLAN_IDS, PLANS, type PlanId } from "@/lib/plans";

/**
 * Inline row actions for a user. Each is a real <form> posting to a server
 * action (which re-checks superadmin + writes an audit row). Impersonation is
 * visually flagged as dangerous. "View" links to the detail page for delete /
 * comp-revoke and the full history.
 */
export function UserActions({
  userId,
  currentPlan,
  suspended,
}: {
  userId: string;
  currentPlan: PlanId | null;
  suspended: boolean;
}) {
  const [plan, setPlan] = useState<PlanId>(currentPlan ?? "cloud_starter");

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <form action={changePlan} className="flex items-center gap-1">
        <input type="hidden" name="userId" value={userId} />
        <Select
          name="plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value as PlanId)}
          className="h-8 w-32 py-1 text-xs"
          aria-label="Set plan"
        >
          {BILLABLE_PLAN_IDS.map((id) => (
            <option key={id} value={id}>
              {PLANS[id].name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Set
        </Button>
      </form>

      <form action={grantComp}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="plan" value={plan} />
        <Button type="submit" variant="ghost" size="sm">
          Comp
        </Button>
      </form>

      <form action={setSuspended}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
        <Button type="submit" variant="ghost" size="sm">
          {suspended ? "Unsuspend" : "Suspend"}
        </Button>
      </form>

      <form
        action={impersonateUser}
        onSubmit={(e) => {
          if (
            !confirm(
              "Impersonate this user? This is logged to the audit trail and " +
                "will sign you in AS them in this browser.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="danger" size="sm">
          Impersonate
        </Button>
      </form>

      <a
        href={`/admin/users/${userId}`}
        className="text-xs text-[var(--color-accent)] hover:underline"
      >
        View
      </a>
    </div>
  );
}
