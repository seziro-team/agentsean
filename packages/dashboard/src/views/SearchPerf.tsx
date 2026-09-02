import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Stat, Note } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconSearch, IconWarn } from "../components/icons.js";
import { num, pathOf } from "../lib/format.js";

type SearchData = {
  metric: "clicks";
  impressionsContaminated: boolean;
  strikingDistance: Array<{ page: string; clicks: number; position: number }>;
  decay: { currentClicks: number; previousClicks: number; delta: number };
  brand: { brandClicks: number; nonBrandClicks: number };
  ctrOutliers: Array<{ query: string; ctr: number }>;
  cannibalizationNote: string;
};

export function SearchPerf(ctx: Ctx): JSX.Element {
  const q = useQuery({
    queryKey: ["search", ctx.siteId],
    queryFn: () =>
      api<SearchData>(`/api/search${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
    enabled: Boolean(ctx.siteId),
  });

  return (
    <>
      <PageHeader
        kicker="Insight"
        title="Search performance"
        lead="Clicks are the default metric — impressions, CTR, and position across the 2025-05-13 → 2026-04-27 Search Console logging error are contaminated and Sean will not lead with them."
      />
      <AsyncBoundary
        query={q}
        loading="Loading Search Console data…"
        isEmpty={(d) =>
          d.decay.currentClicks === 0 &&
          d.decay.previousClicks === 0 &&
          d.strikingDistance.length === 0
        }
        empty={
          <EmptyState
            icon={<IconSearch className="ico" />}
            title="No Search Console data"
            body="Connect Google and let a sync run. Sean pulls clicks by page and query, then flags decay, brand split, and cannibalisation."
            actions={
              <button className="btn btn-primary" onClick={() => ctx.go("/connect")}>
                Connect Google
              </button>
            }
          />
        }
      >
        {(d) => (
          <div className="stack">
            {d.impressionsContaminated ? (
              <Note variant="warn" icon={<IconWarn className="ico" />}>
                Impressions / CTR / position inside the bug window are suppressed, not
                used as the default.
              </Note>
            ) : null}

            <div className="stat-grid">
              <Stat
                label="Clicks this week"
                value={num(d.decay.currentClicks)}
                foot={`${d.decay.delta >= 0 ? "+" : ""}${d.decay.delta} vs prior week`}
              />
              <Stat
                label="Brand / non-brand"
                value={`${num(d.brand.brandClicks)} / ${num(d.brand.nonBrandClicks)}`}
                foot="clicks split"
                plain
              />
            </div>

            <Card title="Striking distance" sub="Positions 8–20">
              {d.strikingDistance.length === 0 ? (
                <Note>Nothing in striking distance yet.</Note>
              ) : (
                <div className="items">
                  {d.strikingDistance.map((r) => (
                    <div className="item" key={r.page}>
                      <div className="grow">
                        <div className="t">{pathOf(r.page)}</div>
                        <div className="m">{r.clicks} clicks</div>
                      </div>
                      <span className="badge">pos {r.position.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {d.cannibalizationNote ? <Note>{d.cannibalizationNote}</Note> : null}
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
