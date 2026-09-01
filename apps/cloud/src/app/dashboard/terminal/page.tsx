import { NewSession } from "./new-session";
import { closeSession } from "./actions";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { getCurrentContext, listPairings, listTerminalSessions } from "@/lib/api";
import { formatDate } from "@/lib/cn";
import { planAllowsInteractiveTerminal } from "@/lib/terminal/protocol";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terminal — Agent Sean" };

export default async function TerminalPage() {
  const ctx = await getCurrentContext();
  if (!ctx.supabaseConfigured || !ctx.tenant) {
    return (
      <>
        <PageHeader title="Terminal" description="Attach to your daemon's terminal." />
        <Banner tone="warning" title="Sign in to use the terminal" />
      </>
    );
  }

  const [sessions, pairings] = await Promise.all([
    listTerminalSessions(ctx.tenant.id),
    listPairings(ctx.tenant.id),
  ]);
  const canInteractive = planAllowsInteractiveTerminal(ctx.tenant.plan);

  return (
    <>
      <PageHeader
        title="Terminal"
        description="Attach a browser terminal to your self-hosted daemon."
      />

      <div className="space-y-6">
        <Banner tone="info" title="How this works">
          Your daemon binds to <code className="font-mono">127.0.0.1</code> and never
          opens an inbound port. Instead, it dials OUT to this relay using a single-use
          pairing code, and your browser attaches to the same session. Sessions are{" "}
          <strong>read-only by default</strong>; input requires an interactive session
          on an eligible plan.
        </Banner>

        <Card>
          <CardHeader
            title="Start a session"
            description="Mint a pairing code, then run it on your daemon host."
          />
          <CardBody>
            <NewSession canInteractive={canInteractive} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent sessions" />
          <CardBody className="p-0">
            {sessions.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No terminal sessions yet"
                  description="Start a session above to pair your daemon and attach."
                />
              </div>
            ) : (
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Session</TH>
                    <TH>Status</TH>
                    <TH>Mode</TH>
                    <TH>Created</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {sessions.map((s) => (
                    <TR key={s.id}>
                      <TD mono>{s.id.slice(0, 12)}</TD>
                      <TD>
                        <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                      </TD>
                      <TD>{s.interactive ? "interactive" : "read-only"}</TD>
                      <TD mono>{formatDate(s.created_at)}</TD>
                      <TD className="text-right">
                        {s.status !== "closed" ? (
                          <form action={closeSession}>
                            <input type="hidden" name="sessionId" value={s.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Close
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

        {pairings.length > 0 ? (
          <Card>
            <CardHeader
              title="Pairings"
              description="Only code hashes are stored — the plaintext code is shown once."
            />
            <CardBody className="p-0">
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Pairing</TH>
                    <TH>Status</TH>
                    <TH>Expires</TH>
                    <TH>Created</TH>
                  </TR>
                </THead>
                <TBody>
                  {pairings.map((p) => (
                    <TR key={p.id}>
                      <TD mono>{p.id.slice(0, 12)}</TD>
                      <TD>
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      </TD>
                      <TD mono>{formatDate(p.expires_at)}</TD>
                      <TD mono>{formatDate(p.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
