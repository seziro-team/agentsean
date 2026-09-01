import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Banner } from "@/components/ui/banner";
import { Sparkline } from "@/components/ui/sparkline";
import { adminConfigured, getAdminKpis } from "@/lib/admin-api";
import { formatMoney } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Agent Sean" };

export default async function AdminOverview() {
  const configured = adminConfigured();
  const kpis = await getAdminKpis();

  return (
    <>
      <PageHeader
        title="Overview"
        description="Business KPIs, computed from live database rows."
      />

      {!configured ? (
        <div className="mb-6">
          <Banner tone="warning" title="Service-role key not configured">
            Admin KPIs read across all tenants using the Supabase service role. Set{" "}
            <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to populate
            these. Until then the figures below are zero.
          </Banner>
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Signups" value={kpis.totalSignups} />
          <Stat
            label="Active subs"
            value={kpis.activeSubscriptions}
            tone={kpis.activeSubscriptions > 0 ? "success" : undefined}
          />
          <Stat label="MRR" value={formatMoney(kpis.mrrCents)} tone="accent" />
          <Stat label="Revenue (mo)" value={formatMoney(kpis.revenueThisMonthCents)} />
          <Stat label="Trials" value={kpis.trials} tone="warning" />
          <Stat
            label="Churned (mo)"
            value={kpis.churnedThisMonth}
            tone={kpis.churnedThisMonth > 0 ? "danger" : undefined}
          />
        </div>

        <Card>
          <CardHeader
            title="Signups over time"
            description="Last 30 days (zero-filled)."
          />
          <CardBody>
            <Sparkline points={kpis.signupsByDay.map((d) => d.count)} width={640} />
            <div className="mt-2 flex justify-between text-[11px] text-[var(--color-faint)]">
              <span>{kpis.signupsByDay[0]?.date ?? ""}</span>
              <span>{kpis.signupsByDay[kpis.signupsByDay.length - 1]?.date ?? ""}</span>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
