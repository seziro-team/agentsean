import { startCheckout, openPortal } from "./actions";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge, statusTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { getBillingView, getCurrentContext } from "@/lib/api";
import { getBillingProvider } from "@/lib/billing";
import { BILLABLE_PLAN_IDS, PLANS, quotaLabel } from "@/lib/plans";
import { formatMoney } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing — Agent Sean" };

const ERRORS: Record<string, string> = {
  bad_plan: "That plan is not available.",
  billing_not_configured: "Billing is not configured yet. Contact the operator.",
  checkout_failed: "We could not start checkout. Please try again.",
  portal_failed: "We could not open the billing portal. Please try again.",
  no_customer: "No billing account yet — subscribe to a paid plan first.",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getCurrentContext();
  if (!ctx.tenant) {
    return (
      <>
        <PageHeader title="Billing" />
        <Banner tone="warning" title="Sign in to manage billing" />
      </>
    );
  }

  const view = await getBillingView(ctx.tenant);
  const provider = await getBillingProvider();
  const billingConfigured = provider.isConfigured();
  const currentPlan = PLANS[view.planId];

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, usage, and payment management."
      />

      <div className="space-y-6">
        {sp.checkout === "success" ? (
          <Banner tone="success" title="Payment received">
            Thanks! Your plan will update as soon as the payment is confirmed.
          </Banner>
        ) : null}
        {sp.error ? (
          <Banner tone="danger" title="Billing error">
            {ERRORS[sp.error] ?? sp.error}
          </Banner>
        ) : null}
        {!billingConfigured ? (
          <Banner tone="warning" title="Billing is not configured">
            The operator has not connected a payment provider yet. You can keep using
            the free self-host plan in the meantime.
          </Banner>
        ) : null}

        <Card>
          <CardHeader
            title="Current plan"
            action={<Badge tone={statusTone(view.status)}>{view.status}</Badge>}
          />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Plan"
                value={view.planName}
                sub={
                  currentPlan.priceUsdMonth === 0
                    ? "Free"
                    : `${formatMoney(currentPlan.priceUsdMonth * 100)} / month`
                }
              />
              <Stat
                label="Sites"
                value={`${view.sitesUsed} / ${quotaLabel(view.sitesQuota)}`}
              />
              <Stat label="Seats" value={quotaLabel(view.seatsQuota)} />
            </div>
            {view.customerId ? (
              <div className="mt-4">
                <form action={openPortal}>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={!billingConfigured}
                  >
                    Manage billing
                  </Button>
                </form>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Plans"
            description="Upgrade or change your plan. Checkout is handled by our payment provider."
          />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {BILLABLE_PLAN_IDS.map((id) => {
                const plan = PLANS[id];
                const isCurrent = id === view.planId;
                return (
                  <div
                    key={id}
                    className="flex flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">{plan.name}</h4>
                      {isCurrent ? <Badge tone="accent">current</Badge> : null}
                    </div>
                    <p className="mt-2 font-mono text-xl font-semibold">
                      {formatMoney(plan.priceUsdMonth * 100)}
                      <span className="text-xs font-normal text-[var(--color-faint)]">
                        {" "}
                        /mo
                      </span>
                    </p>
                    <ul className="mt-3 flex-1 space-y-1 text-xs text-[var(--color-muted)]">
                      <li>{quotaLabel(plan.sites)} sites</li>
                      <li>{plan.ranks === "daily" ? "Daily" : "Weekly"} ranks</li>
                      <li>{quotaLabel(plan.seats)} seats</li>
                      {plan.aiVisibility ? <li>AI visibility</li> : null}
                      {plan.whiteLabel ? <li>White-label</li> : null}
                    </ul>
                    <form action={startCheckout} className="mt-4">
                      <input type="hidden" name="plan" value={id} />
                      <Button
                        type="submit"
                        variant={isCurrent ? "secondary" : "primary"}
                        className="w-full"
                        disabled={isCurrent || !billingConfigured}
                      >
                        {isCurrent ? "Current plan" : "Choose"}
                      </Button>
                    </form>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
