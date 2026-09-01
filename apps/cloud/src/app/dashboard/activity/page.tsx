import { RevertButton } from "./revert-button";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { getCurrentContext, listActivity } from "@/lib/api";
import { formatDate } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity — Agent Sean" };

const CONNECT_CMD = "sean connect --cloud <pairing-code>";

/**
 * The change log: what Sean changed, when, on which URL, the diff, the evidence
 * tier, and a Revert button. The executor writes these on the daemon side; the
 * ingestion path into the control plane is not built yet, so listActivity()
 * returns [] and we render an honest empty state. The table below is the
 * intended shape and renders as soon as entries exist — no placeholder rows.
 */
export default async function ActivityPage() {
  const ctx = await getCurrentContext();
  if (!ctx.tenant) {
    return (
      <>
        <PageHeader title="Activity" />
        <Banner tone="warning" title="Sign in to view activity" />
      </>
    );
  }

  const entries = await listActivity(ctx.tenant.id);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change Sean applied, with its evidence tier and a revert."
      />

      <Card>
        <CardHeader title="Change log" />
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No changes recorded yet"
                description="When a connected daemon applies a change, it appears here with the before/after diff, its evidence tier (A–E), and a one-click revert."
                command={CONNECT_CMD}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>URL</TH>
                  <TH>Change</TH>
                  <TH>Evidence</TH>
                  <TH>Applied</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((entry) => (
                  <TR key={entry.id}>
                    <TD mono>{entry.url}</TD>
                    <TD>
                      <div>{entry.summary}</div>
                      {entry.diff ? (
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-[var(--color-bg)] p-2 font-mono text-[11px] text-[var(--color-muted)]">
                          {entry.diff}
                        </pre>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge tone="accent">Tier {entry.evidenceTier}</Badge>
                    </TD>
                    <TD mono>{formatDate(entry.appliedAt)}</TD>
                    <TD className="text-right">
                      {entry.reverted ? (
                        <Badge tone="neutral">reverted</Badge>
                      ) : (
                        <RevertButton changeId={entry.id} />
                      )}
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
