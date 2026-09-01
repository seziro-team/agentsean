import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentContext, getOverview } from "@/lib/api";
import { planOf, quotaLabel } from "@/lib/plans";
import { formatDate } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview — Agent Sean" };

const CONNECT_CMD = "sean connect --cloud <pairing-code>";

export default async function DashboardOverview() {
  const ctx = await getCurrentContext();
  if (!ctx.supabaseConfigured) {
    return (
      <>
        <PageHeader title="Overview" />
        <Banner tone="warning" title="Supabase is not configured">
          Set the <code className="font-mono">NEXT_PUBLIC_SUPABASE_*</code> variables to
          load your workspace.
        </Banner>
      </>
    );
  }
  if (!ctx.tenant || !ctx.profile) {
    return (
      <>
        <PageHeader title="Overview" />
        <Banner tone="warning" title="No workspace found">
          We could not load your workspace. Try signing out and back in.
        </Banner>
      </>
    );
  }

  const plan = planOf(ctx.tenant.plan);
  const overview = await getOverview(ctx.tenant.id);

  return (
    <>
      <PageHeader
        title={ctx.tenant.name}
        description={`${plan.name} plan · ${quotaLabel(plan.sites)} site${plan.sites === 1 ? "" : "s"}`}
        action={
          <Link href="/dashboard/sites">
            <Button variant="secondary">Manage sites</Button>
          </Link>
        }
      />

      {overview.sitesCount === 0 ? (
        <EmptyState
          title="No sites connected yet"
          description="Add your first site to start auditing. Then connect a daemon to let Sean apply and track changes."
          action={
            <Link href="/dashboard/sites">
              <Button>Add a site</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Connected sites" value={overview.sitesCount} />
            <Stat
              label="Avg. site score"
              value={overview.averageScore ?? "—"}
              sub={
                overview.averageScore === null
                  ? "Awaiting first crawl"
                  : "Across your sites"
              }
              tone={overview.averageScore === null ? undefined : "accent"}
            />
            <Stat
              label="Changes (30d)"
              value={overview.feedAvailable ? overview.changesLast30d : "—"}
              sub={overview.feedAvailable ? undefined : "No daemon feed yet"}
            />
            <Stat
              label="Next run"
              value={overview.nextRunAt ? formatDate(overview.nextRunAt) : "—"}
              sub={overview.nextRunAt ? undefined : "Scheduled by your daemon"}
            />
          </div>

          <Card>
            <CardHeader
              title="Findings by severity"
              description="Reported by your connected daemon."
            />
            <CardBody>
              {overview.feedAvailable ? (
                <div className="grid grid-cols-4 gap-4">
                  <Stat
                    label="Critical"
                    value={overview.findingsBySeverity.critical}
                    tone="danger"
                  />
                  <Stat
                    label="High"
                    value={overview.findingsBySeverity.high}
                    tone="warning"
                  />
                  <Stat label="Medium" value={overview.findingsBySeverity.medium} />
                  <Stat label="Low" value={overview.findingsBySeverity.low} />
                </div>
              ) : (
                <EmptyState
                  title="No findings feed yet"
                  description="Connect a daemon to this workspace and it will stream findings and applied changes here. We never show placeholder metrics."
                  command={CONNECT_CMD}
                />
              )}
            </CardBody>
          </Card>

          {!overview.anyDaemonConnected ? (
            <Banner tone="info" title="Connect a daemon to see live activity">
              Your sites are added, but no daemon has reported in yet. Install the
              open-source daemon on your host and pair it from the{" "}
              <Link href="/dashboard/terminal" className="underline">
                Terminal
              </Link>{" "}
              tab.
            </Banner>
          ) : null}
        </div>
      )}
    </>
  );
}
