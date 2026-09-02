import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Note } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconKey, IconRefresh } from "../components/icons.js";

type KeywordsData = {
  origin: string;
  keywords: Array<{
    query: string;
    source: string;
    clicks: number;
    position: number | null;
  }>;
  clusters: Array<{ label: string; memberCount: number; serpConfirmed: number }>;
  ranks: Array<{
    query: string;
    position: number | null;
    provider: string;
    estimatedUsd: number;
  }>;
  strikingDistance: Array<{ query: string; position: number | null; clicks: number }>;
};

export function Keywords(ctx: Ctx): JSX.Element {
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["keywords", ctx.siteId],
    queryFn: () =>
      api<KeywordsData>(`/api/keywords${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
    enabled: Boolean(ctx.siteId),
  });

  const refresh = () => {
    setBusy(true);
    void api("/api/keywords", { method: "POST", body: { siteId: ctx.siteId } })
      .then(() => q.refetch())
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Keywords"
        lead="Demand from Search Console, a volume proxy from Bing Webmaster, and clusters at cosine ≈ 0.78. Zero paid keys required; a DataForSEO key upgrades rank tracking in place. Sean never scrapes Google."
        actions={
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy || !ctx.siteId}
            onClick={refresh}
          >
            <IconRefresh className="ico" />{" "}
            {busy ? "Refreshing…" : "Refresh opportunities"}
          </button>
        }
      />
      <AsyncBoundary
        query={q}
        loading="Loading keywords…"
        isEmpty={(d) =>
          d.keywords.length === 0 &&
          d.clusters.length === 0 &&
          d.strikingDistance.length === 0
        }
        empty={
          <EmptyState
            icon={<IconKey className="ico" />}
            title="No keyword data yet"
            body="Keywords come from Google Search Console. Connect Google, then refresh opportunities to cluster demand and find pages sitting in striking distance."
            actions={
              <>
                <button className="btn btn-primary" onClick={() => ctx.go("/connect")}>
                  Connect Google
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!ctx.siteId}
                  onClick={refresh}
                >
                  Refresh anyway
                </button>
              </>
            }
          />
        }
      >
        {(d) => (
          <div className="stack">
            <Card title="Striking distance" sub="Positions 8–20 — nearest wins">
              {d.strikingDistance.length === 0 ? (
                <Note>
                  Nothing in positions 8–20 yet. Connect Google for ranking data.
                </Note>
              ) : (
                <div className="items">
                  {d.strikingDistance.map((r) => (
                    <div className="item" key={r.query}>
                      <div className="grow">
                        <div className="t">{r.query}</div>
                        <div className="m">{r.clicks} clicks</div>
                      </div>
                      <span className="badge">
                        pos {r.position === null ? "—" : r.position.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {d.clusters.length > 0 ? (
              <Card title="Clusters">
                <div className="row">
                  {d.clusters.map((c) => (
                    <span className="pill" key={c.label}>
                      {c.label}
                      <span className="n">{c.memberCount}</span>
                      {c.serpConfirmed ? " · SERP" : ""}
                    </span>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card title="Licensed ranks" sub="Optional DataForSEO upgrade">
              {d.ranks.length === 0 ? (
                <Note>
                  No licensed rank snapshots. Configure DataForSEO in Settings to
                  upgrade rank tracking in place — everything else keeps working without
                  it.
                </Note>
              ) : (
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Query</th>
                        <th>Rank</th>
                        <th>Provider</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.ranks.map((r) => (
                        <tr key={`${r.query}:${r.provider}`}>
                          <td>{r.query}</td>
                          <td>#{r.position ?? "—"}</td>
                          <td className="dim">{r.provider}</td>
                          <td className="dim">${r.estimatedUsd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
