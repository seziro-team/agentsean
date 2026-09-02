import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Badge, Note, Segmented } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { Diff } from "../components/Diff.js";
import { IconCheck } from "../components/icons.js";

type Approval = {
  id: string;
  kind: string;
  targetRef: string;
  rationale: string[];
  blast: string;
  diffs: Record<string, { before: string; after: string }>;
};

type Mode = "source" | "rendered" | "serp" | "jsonld";
const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: "source", label: "Source" },
  { value: "rendered", label: "Rendered" },
  { value: "serp", label: "SERP snippet" },
  { value: "jsonld", label: "Structured data" },
];

function ApprovalCard(props: {
  approval: Approval;
  mode: Mode;
  onApproved: () => void;
}): JSX.Element {
  const a = props.approval;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const diff = a.diffs[props.mode] ?? { before: "", after: "" };

  const approve = () => {
    const actor = window.prompt(
      "Approving requires a named human. Two distinct approvals are needed to apply a T3 change. Your name or initials:",
    );
    if (!actor || !actor.trim()) return;
    setBusy(true);
    setErr(null);
    void api<{ remaining: number }>(`/api/approvals/${a.id}/approve`, {
      method: "POST",
      body: { actor: actor.trim() },
    })
      .then((r) => {
        setMsg(
          r.remaining > 0
            ? `Recorded. ${r.remaining} more distinct approval needed before this applies.`
            : "Recorded. Two-key threshold met.",
        );
        props.onApproved();
      })
      .catch((e: unknown) => {
        setErr(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Failed.",
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <div className="spread" style={{ marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <Badge className="tier-num-3">T3</Badge>
            <strong>{a.kind}</strong>
          </div>
          <code className="small dim" style={{ wordBreak: "break-all" }}>
            {a.targetRef}
          </code>
        </div>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={approve}>
          {busy ? "Recording…" : "Approve"}
        </button>
      </div>

      {a.rationale.length > 0 ? (
        <ul className="lead" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
          {a.rationale.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}

      <Diff before={diff.before} after={diff.after} label={props.mode} />

      <div style={{ marginTop: 12 }}>
        <Note>{a.blast}</Note>
      </div>
      {msg ? (
        <div style={{ marginTop: 8 }}>
          <Note variant="good" icon={<IconCheck className="ico" />}>
            {msg}
          </Note>
        </div>
      ) : null}
      {err ? (
        <div style={{ marginTop: 8 }}>
          <Note variant="warn">{err}</Note>
        </div>
      ) : null}
    </Card>
  );
}

export function Approvals(ctx: Ctx): JSX.Element {
  const [mode, setMode] = useState<Mode>("source");
  const q = useQuery({
    queryKey: ["approvals", ctx.siteId],
    queryFn: () =>
      api<{ actions: Approval[] }>(
        `/api/approvals${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`,
      ),
  });

  return (
    <>
      <PageHeader
        kicker="Work"
        title="Approvals"
        lead="The T3 queue: changes to canonicals, redirects, and robots.txt that Sean will never apply on its own. Each needs two distinct human approvals — the two-key rule is not overridable. Preview the same change four ways."
        actions={
          <Segmented
            value={mode}
            options={MODES}
            onChange={setMode}
            ariaLabel="Diff mode"
          />
        }
      />
      <AsyncBoundary
        query={q}
        loading="Loading approvals…"
        isEmpty={(d) => d.actions.length === 0}
        empty={
          <EmptyState
            icon={<IconCheck className="ico" />}
            title="Nothing waiting for a human"
            body="When Sean proposes a high-stakes change, it lands here for your sign-off. Lower-risk fixes apply automatically and show up in Activity."
            actions={
              <button className="btn btn-ghost" onClick={() => ctx.go("/changes")}>
                See what has been applied
              </button>
            }
          />
        }
      >
        {(d) => (
          <div className="stack">
            {d.actions.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                mode={mode}
                onApproved={() => void q.refetch()}
              />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
