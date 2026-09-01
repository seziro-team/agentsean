"use client";
import { useActionState, useState } from "react";
import {
  saveBillingSettings,
  sendTestWebhook,
  type BillingAdminState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";
import { BILLABLE_PLAN_IDS, PLANS, type PlanId } from "@/lib/plans";

const initial: BillingAdminState = { status: "idle" };

type StatusMeta = {
  provider: "polar" | "paddle";
  polarConfigured: boolean;
  paddleConfigured: boolean;
} | null;

/**
 * Connect-a-payment-account form. Secret fields are write-only: they render as
 * empty password inputs even when a value is stored (we never send secrets back
 * to the browser), and leaving them blank preserves the saved value.
 */
export function BillingForm({
  status,
  encryptionConfigured,
}: {
  status: StatusMeta;
  encryptionConfigured: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState(saveBillingSettings, initial);
  const [testState, testAction, testing] = useActionState(sendTestWebhook, initial);
  const [provider, setProvider] = useState<"polar" | "paddle">(
    status?.provider ?? "polar",
  );

  return (
    <div className="space-y-8">
      {!encryptionConfigured ? (
        <Banner tone="danger" title="ADMIN_SECRET_KEY is not set">
          Credentials can only be saved when an encryption key is configured. Set{" "}
          <code className="font-mono">ADMIN_SECRET_KEY</code> (see{" "}
          <code className="font-mono">.env.example</code>) and reload.
        </Banner>
      ) : null}

      {saveState.status === "saved" ? (
        <Banner tone="success" title="Saved">
          {saveState.message}
        </Banner>
      ) : null}
      {saveState.status === "error" ? (
        <Banner tone="danger" title="Could not save">
          {saveState.message}
        </Banner>
      ) : null}

      <form action={saveAction} className="space-y-6">
        <Field label="Active provider" htmlFor="provider">
          <Select
            id="provider"
            name="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as "polar" | "paddle")}
          >
            <option value="polar">Polar.sh (primary)</option>
            <option value="paddle">Paddle Billing (fallback)</option>
          </Select>
        </Field>

        <fieldset className="space-y-4 rounded-lg border border-[var(--color-line)] p-4">
          <legend className="px-2 text-xs font-semibold text-[var(--color-muted)]">
            Polar.sh {status?.polarConfigured ? "· connected" : "· not connected"}
          </legend>
          <Field
            label="Organization Access Token"
            htmlFor="polar_access_token"
            hint="Starts polar_oat_… — leave blank to keep the saved value."
          >
            <Input
              id="polar_access_token"
              name="polar_access_token"
              type="password"
              autoComplete="off"
              placeholder={status?.polarConfigured ? "•••••••• (saved)" : "polar_oat_…"}
            />
          </Field>
          <Field
            label="Webhook secret"
            htmlFor="polar_webhook_secret"
            hint="From Polar → Settings → Webhooks. Starts whsec_…"
          >
            <Input
              id="polar_webhook_secret"
              name="polar_webhook_secret"
              type="password"
              autoComplete="off"
              placeholder="whsec_…"
            />
          </Field>
          <Field label="Organization ID (optional)" htmlFor="polar_org_id">
            <Input id="polar_org_id" name="polar_org_id" type="text" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <input
              type="checkbox"
              name="polar_sandbox"
              defaultChecked
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Use sandbox API
          </label>
          <ProductMap prefix="polar_product" label="Polar product id" />
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-[var(--color-line)] p-4">
          <legend className="px-2 text-xs font-semibold text-[var(--color-muted)]">
            Paddle Billing{" "}
            {status?.paddleConfigured ? "· connected" : "· not connected"}
          </legend>
          <Field
            label="API key"
            htmlFor="paddle_api_key"
            hint="Starts pdl_live_apikey_… or pdl_sdbx_apikey_…"
          >
            <Input
              id="paddle_api_key"
              name="paddle_api_key"
              type="password"
              autoComplete="off"
              placeholder={status?.paddleConfigured ? "•••••••• (saved)" : "pdl_…"}
            />
          </Field>
          <Field label="Webhook secret" htmlFor="paddle_webhook_secret">
            <Input
              id="paddle_webhook_secret"
              name="paddle_webhook_secret"
              type="password"
              autoComplete="off"
              placeholder="pdl_ntfset_…"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <input
              type="checkbox"
              name="paddle_sandbox"
              defaultChecked
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Use sandbox API
          </label>
          <ProductMap prefix="paddle_price" label="Paddle price id" />
        </fieldset>

        <Button type="submit" disabled={saving || !encryptionConfigured}>
          {saving ? "Saving…" : "Save billing settings"}
        </Button>
      </form>

      <div className="border-t border-[var(--color-line)] pt-6">
        <h3 className="text-sm font-semibold">Send a test webhook</h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Runs a sample event through the active provider&apos;s normalization so you
          can confirm the wiring before going live.
        </p>
        <form action={testAction} className="mt-3 flex items-end gap-2">
          <Field label="Plan" htmlFor="test_plan">
            <Select id="test_plan" name="plan" className="w-40">
              {BILLABLE_PLAN_IDS.map((id: PlanId) => (
                <option key={id} value={id}>
                  {PLANS[id].name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={testing}>
            {testing ? "Testing…" : "Send test"}
          </Button>
        </form>
        {testState.status === "tested" ? (
          <div className="mt-3">
            <Banner tone="info" title="Test result">
              {testState.message}
            </Banner>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Per-plan product/price id inputs. */
function ProductMap({ prefix, label }: { prefix: string; label: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BILLABLE_PLAN_IDS.map((id) => (
        <Field
          key={id}
          label={`${PLANS[id].name} — ${label}`}
          htmlFor={`${prefix}_${id}`}
        >
          <Input
            id={`${prefix}_${id}`}
            name={`${prefix}_${id}`}
            type="text"
            autoComplete="off"
            placeholder="leave blank to keep"
          />
        </Field>
      ))}
    </div>
  );
}
