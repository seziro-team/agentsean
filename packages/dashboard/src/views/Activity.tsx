import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Badge, Note } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { Diff } from "../components/Diff.js";
import { IconDiff, IconExternal, IconCheck } from "../components/icons.js";
import { ago, shortDate } from "../lib/format.js";

type Change = {
  id: string;
  summary: string;
  appliedAt: string;
  revertedAt: string | null;
  revertible: boolean;
  before: string;
  after: string;
  prUrl: string | null;
  evidenceTier: string;
  causationClaimed: boolean;
  evidenceStatement: string;
};

function ChangeCard(props: { change: Change; onReverted: () => void }): JSX.Element {
  const c = props.change;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const revert = () => {
    setBusy(true);
    setErr(null);
    void api(`/api/changes/${c.id}/revert`, { method: "POST", body: {} })
      .then(() => props.onReverted())
      .catch((e: unknown) => {
        setErr(
          e instanceof ApiError && e.status === 409
            ? "Already reverted."
            : e instanceof Error
              ? e.message
              : "Revert failed.",
        );
        setBusy(false);
      });
  };

  return (
    <Card>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <IconDiff className="ico" />
            <strong style={{ fontSize: "0.98rem" }}>{c.summary}</strong>
          </div>
          <div className="small dim" style={{ marginTop: 4 }}>
            {c.revertedAt
              ? `reverted ${ago(c.revertedAt)}`
              : `applied ${shortDate(c.appliedAt)} · ${ago(c.appliedAt)}`}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Badge className={`ev-${c.evidenceTier}`}>tier {c.evidenceTier}</Badge>
          {c.causationClaimed ? null : <Badge>no causal claim</Badge>}
        </div>
      </div>

      <Diff before={c.before} after={c.after} label="before → after" />

      <div className="spread" style={{ marginTop: 12 }}>
        <span className="small dim">{c.evidenceStatement}</span>
        <div className="row" style={{ gap: 8 }}>
          {c.prUrl ? (
            <a
              className="btn btn-sm btn-ghost"
              href={c.prUrl}
              target="_blank"
              rel="noreferrer"
            >
              Pull request <IconExternal className="ico" />
            </a>
          ) : null}
          {c.revertible ? (
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={revert}>
              {busy ? "Reverting…" : "Revert"}
            </button>
          ) : (
            <span className="pill" style={{ color: "var(--fg-3)" }}>
              <IconCheck className="ico" /> reverted
            </span>
          )}
        </div>
      </div>
      {err ? (
        <div style={{ marginTop: 10 }}>
          <Note variant="warn">{err}</Note>
        </div>
      ) : null}
    </Card>
  );
}

export function Activity(ctx: Ctx): JSX.Element {
  const q = useQuery({
    queryKey: ["changes"],
    queryFn: () => api<{ changes: Change[] }>("/api/changes"),
  });

  return (
    <>
      <PageHeader
        kicker="Activity"
        title="Every change is a reversible diff"
        lead="This is the whole thesis. Sean snapshots the live page, writes the change, re-fetches to confirm it landed, and records the before/after. One click puts it back. The model that decided never held a credential."
      />
      <AsyncBoundary
        query={q}
        loading="Loading change log…"
        isEmpty={(d) => d.changes.length === 0}
        empty={
          <EmptyState
            icon={<IconDiff className="ico" />}
            title="No changes yet"
            body="When Sean applies a fix — or you approve one — it shows here with a full before/after and a Revert button. Safe fixes apply automatically after the 7-day observe window."
            actions={
              <>
                <button className="btn btn-ghost" onClick={() => ctx.go("/findings")}>
                  See findings
                </button>
                <button className="btn btn-ghost" onClick={() => ctx.go("/approvals")}>
                  Review approvals
                </button>
              </>
            }
          />
        }
      >
        {(d) => (
          <div className="stack">
            {d.changes.map((c) => (
              <ChangeCard key={c.id} change={c} onReverted={() => void q.refetch()} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
