import { DangerZone } from "./danger-zone";
import { TelemetryToggle } from "./telemetry-toggle";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentContext } from "@/lib/api";
import { planOf } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Agent Sean" };

export default async function SettingsPage() {
  const ctx = await getCurrentContext();
  if (!ctx.tenant || !ctx.profile) {
    return (
      <>
        <PageHeader title="Settings" />
        <Banner tone="warning" title="Sign in to view settings" />
      </>
    );
  }
  const plan = planOf(ctx.tenant.plan);

  return (
    <>
      <PageHeader
        title="Settings"
        description="API access, telemetry, and your data."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="API keys"
            description="Programmatic access to your workspace."
          />
          <CardBody>
            {plan.apiAccess ? (
              <EmptyState
                title="API keys are issued by your daemon"
                description="Your daemon holds credentials and mints API tokens locally — the control plane never stores them. Run `sean api-key create` on your daemon host."
              />
            ) : (
              <Banner tone="info" title="API access is not on your plan">
                Upgrade to Business or Agency for API access.{" "}
                <a href="/dashboard/billing" className="underline">
                  See plans
                </a>
                .
              </Banner>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Telemetry" description="Control anonymous usage data." />
          <CardBody>
            <TelemetryToggle />
          </CardBody>
        </Card>

        <Card className="border-[var(--color-danger)]/40">
          <CardHeader
            title="Danger zone"
            description="Irreversible actions for your workspace."
          />
          <CardBody>
            <DangerZone workspaceName={ctx.tenant.name} />
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <form action="/dashboard/billing">
            <Button type="submit" variant="ghost" size="sm">
              Manage billing →
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
