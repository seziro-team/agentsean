import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Stat, Field, Note } from "../components/Page.js";
import { AsyncBoundary } from "../components/State.js";
import { money, pct, shortDate } from "../lib/format.js";

type AiData = {
  engines: string[];
  citationShare: number;
  shareOfVoice: number;
  estimatedUsd: number;
  bingShare: number | null;
  bingRows?: Array<{
    groundingQuery: string;
    citations: number;
    citationShare: number;
  }>;
  ranAt: string | null;
  /** Forecast cost of one panel run, from PANEL_COST_USD on the daemon. */
  panelCostUsd?: number;
  refusals: Array<{ claim: string; truth: string }>;
  note: string;
};

export function AiVisibility(ctx: Ctx): JSX.Element {
  const [bingCsv, setBingCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["ai", ctx.siteId],
    queryFn: () => api<AiData>(`/api/ai${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
    enabled: Boolean(ctx.siteId),
  });

  const run = () => {
    setBusy(true);
    const body: { siteId: string | undefined; bingCsv?: string } = {
      siteId: ctx.siteId,
    };
    if (bingCsv.trim()) body.bingCsv = bingCsv;
    void api("/api/ai", { method: "POST", body })
      .then(() => q.refetch())
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        kicker="Insight"
        title="AI visibility"
        lead="A DIY prompt panel (~20 prompts across ChatGPT and Gemini) plus your Bing Webmaster AI Performance CSV. Citation share is measured, not sold as a schema or llms.txt trick — training crawlers are not citation crawlers."
      />
      <AsyncBoundary query={q} loading="Loading AI visibility…">
        {(d) => (
          <div className="stack">
            <div className="stat-grid">
              <Stat
                label="Citation share"
                value={d.ranAt ? pct(d.citationShare) : "—"}
                foot={d.ranAt ? shortDate(d.ranAt) : "No panel run yet"}
              />
              <Stat
                label="Share of voice"
                value={d.ranAt ? pct(d.shareOfVoice) : "—"}
                foot={`engines: ${d.engines.join(", ") || "—"}`}
              />
              <Stat
                label="Bing citation share"
                value={
                  d.bingShare === null || d.bingShare === undefined
                    ? "—"
                    : pct(d.bingShare)
                }
                foot="CSV ingest — Bing has no API"
              />
            </div>

            <Card title="Run the panel" sub="Monthly cadence">
              {/* Two different numbers: what a run is forecast to cost, and
                  what your last one actually cost. These were collapsed into
                  one `estimatedUsd || 1.11`, so a site that had never run a
                  panel — estimatedUsd is 0 there — showed the literal as if it
                  were measured, and a run that genuinely cost nothing showed
                  it too. */}
              <p className="lead" style={{ marginBottom: 12 }}>
                About {money(d.panelCostUsd ?? 1.11)} per run at 2026 API rates
                {d.ranAt ? <> · your last run cost {money(d.estimatedUsd)}</> : null}.
                Requires a BYOK LLM key configured in Settings.
              </p>
              <Field
                label="Optional: Bing AI Performance CSV"
                htmlFor="bing-csv"
                hint="Paste the export from Bing Webmaster Tools to add its citation share."
              >
                <textarea
                  id="bing-csv"
                  rows={4}
                  value={bingCsv}
                  onChange={(e) => setBingCsv(e.target.value)}
                  placeholder="query,citations,…"
                />
              </Field>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  disabled={busy || !ctx.siteId}
                  onClick={run}
                >
                  {busy ? "Running…" : "Run now"}
                </button>
              </div>
            </Card>

            {d.refusals.length > 0 ? (
              <Card title="Not sold as AEO levers">
                <div className="items">
                  {d.refusals.map((r, i) => (
                    <div className="item" key={i}>
                      <div className="grow">
                        <div className="t strike">{r.claim}</div>
                        <div className="m">{r.truth}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Note>{d.note}</Note>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
