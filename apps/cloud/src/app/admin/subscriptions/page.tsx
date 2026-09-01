import { cancelSubscription } from "./actions";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { adminConfigured, listAllSubscriptions } from "@/lib/admin-api";
import { PLANS } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscriptions — Admin" };

export default async function AdminSubscriptionsPage() {
  const subs = await listAllSubscriptions();

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description={`${subs.length} subscription${subs.length === 1 ? "" : "s"}`}
      />

      {!adminConfigured() ? (
        <div className="mb-6">
          <Banner tone="warning" title="Service-role key not configured">
            Set <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to list
            subscriptions.
          </Banner>
        </div>
      ) : null}

      <Card>
        <CardBody className="p-0">
          {subs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No subscriptions yet"
                description="Paid subscriptions appear here as customers check out."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Plan</TH>
                  <TH>Provider</TH>
                  <TH>Status</TH>
                  <TH>Amount</TH>
                  <TH>Period end</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {subs.map((s) => (
                  <TR key={s.id}>
                    <TD>{s.ownerEmail ?? "—"}</TD>
                    <TD>{PLANS[s.plan]?.name ?? s.plan}</TD>
                    <TD>{s.provider}</TD>
                    <TD>
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </TD>
                    <TD mono>
                      {s.amount_cents != null
                        ? formatMoney(s.amount_cents, s.currency)
                        : "—"}
                    </TD>
                    <TD mono>{formatDate(s.current_period_end)}</TD>
                    <TD className="text-right">
                      {s.status !== "canceled" ? (
                        <form action={cancelSubscription}>
                          <input type="hidden" name="subscriptionId" value={s.id} />
                          <input
                            type="hidden"
                            name="providerSubscriptionId"
                            value={s.provider_subscription_id ?? ""}
                          />
                          <Button type="submit" variant="ghost" size="sm">
                            Cancel
                          </Button>
                        </form>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </>
  );
}
