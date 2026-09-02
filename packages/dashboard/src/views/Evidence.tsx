import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Badge, Note } from "../components/Page.js";
import { AsyncBoundary } from "../components/State.js";

type ClaimsData = {
  headline: string;
  meaning: Record<string, string>;
  claims: Array<{
    id: string;
    evidenceTier: string;
    statement: string;
    causationClaimed: boolean;
    metric: string;
  }>;
};

type Power = {
  message: string;
  splitMde: number;
  prePostMde: number;
  typicalTier: string;
};

const LADDER = ["A", "B", "C", "D", "E"];

export function Evidence(ctx: Ctx): JSX.Element {
  const [busy, setBusy] = useState(false);
  const claims = useQuery({
    queryKey: ["claims", ctx.siteId],
    queryFn: () =>
      api<ClaimsData>(`/api/claims${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
    enabled: Boolean(ctx.siteId),
  });
  const power = useQuery({
    queryKey: ["power", ctx.siteId],
    queryFn: () =>
      api<Power>(`/api/measure/power${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
    enabled: Boolean(ctx.siteId),
  });

  const recompute = () => {
    setBusy(true);
    void api("/api/measure", { method: "POST", body: { siteId: ctx.siteId } })
      .then(() => Promise.all([claims.refetch(), power.refetch()]))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        kicker="Insight"
        title="Evidence"
        lead="Every claim carries a tier. Only a controlled tier-A experiment permits a causation claim; everything else is reported honestly as correlation or as applied-but-not-measurable. Peeking early downgrades a result rather than reporting a false win."
        actions={
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy || !ctx.siteId}
            onClick={recompute}
          >
            {busy ? "Recomputing…" : "Recompute"}
          </button>
        }
      />
      <AsyncBoundary query={claims} loading="Loading evidence…">
        {(d) => (
          <div className="stack">
            <Card>
              <strong style={{ fontSize: "1rem" }}>
                {d.headline || "No measured claims yet."}
              </strong>
              {power.data?.message ? (
                <p className="lead" style={{ marginTop: 8 }}>
                  {power.data.message}
                </p>
              ) : null}
            </Card>

            {d.claims.length > 0 ? (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Causation</th>
                      <th>Statement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.claims.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Badge className={`ev-${c.evidenceTier}`}>
                            {c.evidenceTier}
                          </Badge>
                        </td>
                        <td className={c.causationClaimed ? "" : "dim"}>
                          {c.causationClaimed ? "claimed" : "refused"}
                        </td>
                        <td>{c.statement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Note>
                No claims computed yet. As changes age and data accumulates, Sean
                measures them and files a claim at the highest tier the evidence
                supports.
              </Note>
            )}

            <Card title="The ladder">
              <div className="items">
                {LADDER.map((t) => (
                  <div className="item" key={t}>
                    <Badge className={`ev-${t}`}>{t}</Badge>
                    <div className="grow">
                      <div className="m" style={{ color: "var(--fg-2)" }}>
                        {d.meaning[t] ?? ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
