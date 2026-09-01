import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteUser } from "./delete-user";
import { revokeComp } from "../actions";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { getUserDetail } from "@/lib/admin-api";
import { PLANS } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, tenant, subscriptions, invites } = await getUserDetail(id);
  if (!profile) notFound();

  return (
    <>
      <PageHeader
        title={profile.email}
        description={profile.full_name ?? undefined}
        action={
          <Link href="/admin/users">
            <Button variant="ghost" size="sm">
              ← All users
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Field label="Role">
                <Badge tone={profile.role === "superadmin" ? "purple" : "neutral"}>
                  {profile.role}
                </Badge>
              </Field>
              <Field label="Status">
                {profile.suspended ? (
                  <Badge tone="danger">suspended</Badge>
                ) : (
                  <Badge tone="success">active</Badge>
                )}
              </Field>
              <Field label="Signed up">
                <span className="font-mono text-xs">
                  {formatDate(profile.created_at)}
                </span>
              </Field>
              <Field label="Last seen">
                <span className="font-mono text-xs">
                  {profile.last_seen_at ? formatDate(profile.last_seen_at) : "—"}
                </span>
              </Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Workspace"
            action={
              tenant?.comp ? (
                <form action={revokeComp}>
                  <input type="hidden" name="userId" value={profile.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Revoke comp
                  </Button>
                </form>
              ) : null
            }
          />
          <CardBody>
            {tenant ? (
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <Field label="Name">{tenant.name}</Field>
                <Field label="Plan">
                  {PLANS[tenant.plan].name}
                  {tenant.comp ? (
                    <Badge tone="purple" className="ml-2">
                      comp
                    </Badge>
                  ) : null}
                </Field>
                <Field label="Status">
                  <Badge tone={statusTone(tenant.status)}>{tenant.status}</Badge>
                </Field>
                <Field label="Customer">
                  <span className="font-mono text-xs">
                    {tenant.billing_customer_id ?? "—"}
                  </span>
                </Field>
              </dl>
            ) : (
              <EmptyState
                title="No workspace"
                description="This user has no tenant yet."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Subscriptions" />
          <CardBody className="p-0">
            {subscriptions.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No subscriptions" />
              </div>
            ) : (
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Plan</TH>
                    <TH>Provider</TH>
                    <TH>Status</TH>
                    <TH>Amount</TH>
                    <TH>Period end</TH>
                  </TR>
                </THead>
                <TBody>
                  {subscriptions.map((s) => (
                    <TR key={s.id}>
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
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        {invites.length > 0 ? (
          <Card>
            <CardHeader title="Payment invites" />
            <CardBody className="p-0">
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Amount</TH>
                    <TH>Description</TH>
                    <TH>Status</TH>
                    <TH>Created</TH>
                  </TR>
                </THead>
                <TBody>
                  {invites.map((inv) => (
                    <TR key={inv.id}>
                      <TD mono>{formatMoney(inv.amount_cents, inv.currency)}</TD>
                      <TD>{inv.description ?? "—"}</TD>
                      <TD>
                        <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                      </TD>
                      <TD mono>{formatDate(inv.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </CardBody>
          </Card>
        ) : null}

        <Card className="border-[var(--color-danger)]/40">
          <CardHeader
            title="Danger zone"
            description="Permanently delete this user and erase their data (GDPR)."
          />
          <CardBody>
            <DeleteUser userId={profile.id} email={profile.email} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/** Small definition-list field used in the detail cards. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-faint)]">{label}</dt>
      <dd className="mt-1 text-[var(--color-fg)]">{children}</dd>
    </div>
  );
}
