import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Stat, Pill, Note, Money } from "../components/Page.js";
import { AsyncBoundary } from "../components/State.js";
import { Arc } from "../components/Arc.js";
import { IconArrow, IconCheck, IconWarn } from "../components/icons.js";
import { num, daysUntil, bareHost } from "../lib/format.js";
import { Onboarding } from "./Onboarding.js";

type OverviewData = {
  origin: string | null;
  siteId?: string;
  score: { score: number; version: string; formula: string; band: string } | null;
  findings: Record<string, number>;
  thisWeek: { applied: number; queued: number; reverted: number };
  costUsd: number;
  observeUntil: string | null;
  evidence?: { headline: string; byTier: Record<string, number> };
};

const SEV_ORDER = ["critical", "high", "medium", "low", "insight"];

export function Overview(ctx: Ctx): JSX.Element {
  const q = useQuery({
    queryKey: ["overview", ctx.siteId],
    queryFn: () => api<OverviewData>(`/api/overview?siteId=${ctx.siteId ?? ""}`),
    enabled: Boolean(ctx.siteId),
  });

  if (!ctx.siteId) return <Onboarding {...ctx} />;

  return (
    <>
      <PageHeader
        kicker="Overview"
        title={ctx.origin ? bareHost(ctx.origin) : "Your site"}
        lead="Where Sean is on the arc — connect, observe for 7 days, propose, fix, then you verify or revert. Every number here is derived from your own crawl and Search Console; nothing is invented."
      />
      <AsyncBoundary query={q} loading="Loading overview…">
        {(d) => {
          const openFindings = Object.values(d.findings).reduce((a, b) => a + b, 0);
          const observeLeft = daysUntil(d.observeUntil);
          return (
            <div className="stack">
              <Arc
                go={ctx.go}
                connected
                observeLeft={observeLeft}
                openFindings={openFindings}
                applied={d.thisWeek.applied}
                queued={d.thisWeek.queued}
              />

              <div className="stat-grid">
                <Stat
                  label="Site score"
                  value={d.score ? d.score.score : "—"}
                  foot={
                    d.score
                      ? `${d.score.band} · ${d.score.version}`
                      : "Run a crawl to score"
                  }
                />
                <Stat
                  label="Applied this week"
                  value={num(d.thisWeek.applied)}
                  foot={`${d.thisWeek.queued} queued · ${d.thisWeek.reverted} reverted`}
                />
                <Stat
                  label="Open findings"
                  value={num(openFindings)}
                  foot="Issues Sean can see"
                />
                <Stat
                  label="Cost this week"
                  value={<Money usd={d.costUsd} />}
                  foot="BYOK — your keys, your bill"
                  plain
                />
              </div>

              <Card
                title="Findings by severity"
                sub={
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => ctx.go("/findings")}
                  >
                    Open findings <IconArrow className="ico" />
                  </button>
                }
              >
                {openFindings === 0 ? (
                  <Note variant="good" icon={<IconCheck className="ico" />}>
                    No open findings on the latest crawl. Sean keeps watching.
                  </Note>
                ) : (
                  <div className="row">
                    {SEV_ORDER.filter((s) => d.findings[s]).map((s) => (
                      <Pill key={s} className={`sev-${s}`} n={d.findings[s]}>
                        {s}
                      </Pill>
                    ))}
                  </div>
                )}
              </Card>

              {d.thisWeek.queued > 0 ? (
                <Note variant="warn" icon={<IconWarn className="ico" />}>
                  {d.thisWeek.queued} change{d.thisWeek.queued === 1 ? "" : "s"} need a
                  human decision.{" "}
                  <a
                    href="/approvals"
                    onClick={(e) => {
                      e.preventDefault();
                      ctx.go("/approvals");
                    }}
                  >
                    Review approvals →
                  </a>
                </Note>
              ) : null}

              <Card title="Evidence" sub="What we can honestly claim">
                <p className="lead" style={{ marginBottom: 12 }}>
                  {d.evidence?.headline ??
                    "No measured claims yet. Most changes on a small site land in tier E — applied, not measurable. Only Sean says so out loud."}
                </p>
                <div className="row">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => ctx.go("/evidence")}
                  >
                    Evidence ladder
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => ctx.go("/changes")}
                  >
                    Activity &amp; revert
                  </button>
                </div>
              </Card>

              {d.score ? (
                <Card title="Score formula" sub="Public and versioned">
                  <pre className="block">{d.score.formula}</pre>
                </Card>
              ) : null}
            </div>
          );
        }}
      </AsyncBoundary>
    </>
  );
}
