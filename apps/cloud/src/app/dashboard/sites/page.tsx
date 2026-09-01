import { AddSiteForm } from "./add-site-form";
import { removeSite } from "./actions";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { getCurrentContext, listSites } from "@/lib/api";
import { planOf, quotaLabel } from "@/lib/plans";
import { relativeDays } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sites — Agent Sean" };

export default async function SitesPage() {
  const ctx = await getCurrentContext();
  if (!ctx.tenant) {
    return (
      <>
        <PageHeader title="Sites" />
        <Banner tone="warning" title="Sign in to manage sites" />
      </>
    );
  }

  const plan = planOf(ctx.tenant.plan);
  const sites = await listSites(ctx.tenant.id);
  const atQuota = Number.isFinite(plan.sites) && sites.length >= plan.sites;

  return (
    <>
      <PageHeader
        title="Sites"
        description={`${sites.length} of ${quotaLabel(plan.sites)} used on the ${plan.name} plan.`}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Add a site"
            description="A new site starts a 7-day observe window before Sean applies any change."
          />
          <CardBody>
            {atQuota ? (
              <Banner tone="warning" title="Site quota reached">
                Your {plan.name} plan includes {quotaLabel(plan.sites)} site
                {plan.sites === 1 ? "" : "s"}.{" "}
                <a href="/dashboard/billing" className="underline">
                  Upgrade
                </a>{" "}
                to add more.
              </Banner>
            ) : (
              <AddSiteForm atQuota={atQuota} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your sites" />
          <CardBody className="p-0">
            {sites.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No sites yet"
                  description="Add your first site above to start auditing."
                />
              </div>
            ) : (
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Site</TH>
                    <TH>Observe window</TH>
                    <TH>Score</TH>
                    <TH>Daemon</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {sites.map((site) => {
                    const observing =
                      site.observe_until != null &&
                      new Date(site.observe_until).getTime() > Date.now();
                    return (
                      <TR key={site.id}>
                        <TD>
                          <div className="font-medium">{site.name ?? site.origin}</div>
                          <div className="font-mono text-xs text-[var(--color-faint)]">
                            {site.origin}
                          </div>
                        </TD>
                        <TD>
                          {observing ? (
                            <Badge tone="warning">
                              observing · ends {relativeDays(site.observe_until)}
                            </Badge>
                          ) : (
                            <Badge tone="success">active</Badge>
                          )}
                        </TD>
                        <TD mono>{site.score ?? "—"}</TD>
                        <TD>
                          {site.connected_daemon_at ? (
                            <Badge tone="success">connected</Badge>
                          ) : (
                            <Badge tone="neutral">not connected</Badge>
                          )}
                        </TD>
                        <TD className="text-right">
                          <form action={removeSite}>
                            <input type="hidden" name="siteId" value={site.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Remove
                            </Button>
                          </form>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </TableWrap>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
