import { InviteForm } from "./invite-form";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/ui/copy-button";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { adminConfigured, listAllInvites } from "@/lib/admin-api";
import { isEmailConfigured } from "@/lib/email";
import { getBillingProvider } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invites — Admin" };

export default async function AdminInvitesPage() {
  const [invites, provider] = await Promise.all([
    listAllInvites(),
    getBillingProvider(),
  ]);
  const emailConfigured = isEmailConfigured();

  return (
    <>
      <PageHeader
        title="Payment invites"
        description="Send a custom payment link to any email."
      />

      <div className="space-y-6">
        {!adminConfigured() ? (
          <Banner tone="warning" title="Service-role key not configured">
            Set <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to create
            and list invites.
          </Banner>
        ) : null}
        {!provider.isConfigured() ? (
          <Banner tone="warning" title="Payment provider not connected">
            Connect a provider in{" "}
            <a href="/admin/billing" className="underline">
              /admin/billing
            </a>{" "}
            before creating payment links.
          </Banner>
        ) : null}

        <Card>
          <CardHeader title="New payment link" />
          <CardBody>
            <InviteForm emailConfigured={emailConfigured} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent invites" />
          <CardBody className="p-0">
            {invites.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No invites yet"
                  description="Custom payment links you send will appear here."
                />
              </div>
            ) : (
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Email</TH>
                    <TH>Amount</TH>
                    <TH>Grants</TH>
                    <TH>Status</TH>
                    <TH>Created</TH>
                    <TH>
                      <span className="sr-only">Link</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {invites.map((inv) => (
                    <TR key={inv.id}>
                      <TD>{inv.email}</TD>
                      <TD mono>{formatMoney(inv.amount_cents, inv.currency)}</TD>
                      <TD>{inv.grant_plan ? PLANS[inv.grant_plan]?.name : "—"}</TD>
                      <TD>
                        <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                      </TD>
                      <TD mono>{formatDate(inv.created_at)}</TD>
                      <TD className="text-right">
                        {inv.checkout_url ? (
                          <CopyButton value={inv.checkout_url} label="Copy link" />
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
