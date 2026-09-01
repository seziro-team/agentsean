import { PageHeader } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { adminConfigured, listAudit } from "@/lib/admin-api";
import { formatDate } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log — Admin" };

/** Actions that warrant a louder visual flag in the log. */
const DANGEROUS = new Set(["user_impersonated", "user_deleted", "erasure_requested"]);

export default async function AuditPage() {
  const entries = await listAudit(300);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every mutating admin action, newest first."
      />

      {!adminConfigured() ? (
        <div className="mb-6">
          <Banner tone="warning" title="Service-role key not configured">
            Set <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to read the
            audit log.
          </Banner>
        </div>
      ) : null}

      <Card>
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No audit entries yet"
                description="Admin actions (plan changes, comps, suspensions, impersonation, deletions) are recorded here."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Target</TH>
                  <TH>IP</TH>
                  <TH>Change</TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD mono>{formatDate(e.created_at)}</TD>
                    <TD>{e.actor_email ?? e.actor_id ?? "system"}</TD>
                    <TD>
                      <Badge tone={DANGEROUS.has(e.action) ? "danger" : "neutral"}>
                        {e.action}
                      </Badge>
                    </TD>
                    <TD mono>
                      {e.target_type ? `${e.target_type}:${short(e.target_id)}` : "—"}
                    </TD>
                    <TD mono>{e.ip ?? "—"}</TD>
                    <TD>
                      {e.before || e.after ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-[var(--color-accent)]">
                            diff
                          </summary>
                          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-[var(--color-bg)] p-2 font-mono text-[11px] text-[var(--color-muted)]">
                            {JSON.stringify(
                              { before: e.before, after: e.after },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
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
    </>
  );
}

function short(id: string | null): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}
