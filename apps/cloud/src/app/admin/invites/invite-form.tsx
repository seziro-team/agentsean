"use client";
import { useActionState } from "react";
import { createInvite, type InviteState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";
import { CopyField } from "@/components/ui/copy-button";
import { BILLABLE_PLAN_IDS, PLANS } from "@/lib/plans";

const initial: InviteState = { status: "idle" };

/** Create a custom payment link and show it with a copy button once created. */
export function InviteForm({ emailConfigured }: { emailConfigured: boolean }) {
  const [state, action, pending] = useActionState(createInvite, initial);

  return (
    <div className="space-y-4">
      {state.status === "error" ? (
        <Banner tone="danger" title="Could not create invite">
          {state.message}
        </Banner>
      ) : null}
      {state.status === "created" ? (
        <Banner tone="success" title="Invite created">
          {state.message}
        </Banner>
      ) : null}

      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer email" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="off" />
          </Field>
          <Field label="Description" htmlFor="description">
            <Input
              id="description"
              name="description"
              type="text"
              placeholder="Custom plan, setup fee, …"
            />
          </Field>
          <Field label="Amount" htmlFor="amount">
            <Input
              id="amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="49.00"
            />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Select id="currency" name="currency" defaultValue="USD">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="INR">INR</option>
              <option value="AUD">AUD</option>
              <option value="CAD">CAD</option>
            </Select>
          </Field>
          <Field
            label="Grant plan on payment (optional)"
            htmlFor="grantPlan"
            hint="Activates this plan on the buyer's workspace when paid."
          >
            <Select id="grantPlan" name="grantPlan" defaultValue="">
              <option value="">Don&apos;t grant a plan</option>
              {BILLABLE_PLAN_IDS.map((id) => (
                <option key={id} value={id}>
                  {PLANS[id].name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <input
            type="checkbox"
            name="sendEmail"
            disabled={!emailConfigured}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Email the link to the customer
          {!emailConfigured ? (
            <span className="text-xs text-[var(--color-faint)]">
              (RESEND_API_KEY not set — link will be shown to copy instead)
            </span>
          ) : null}
        </label>

        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create payment link"}
        </Button>
      </form>

      {state.status === "created" && state.checkoutUrl ? (
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--color-muted)]">
            Payment link
          </p>
          <CopyField value={state.checkoutUrl} label="Copy link" />
        </div>
      ) : null}
    </div>
  );
}
