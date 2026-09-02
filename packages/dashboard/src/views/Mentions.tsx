import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Note } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconLink } from "../components/icons.js";
import { bareHost } from "../lib/format.js";

type MentionsData = {
  mentions: Array<{
    id: string;
    url: string;
    snippet: string;
    linked: number;
    score: number;
    kind: string;
  }>;
  inbound404s: Array<{
    id: string;
    sourceUrl: string;
    targetUrl: string;
    status: number | null;
  }>;
  outreach: Array<{ id: string; subject: string; state: string }>;
  sendRequiresApproval: boolean;
};

export function Mentions(ctx: Ctx): JSX.Element {
  const [busyId, setBusyId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["mentions", ctx.siteId],
    queryFn: () =>
      api<MentionsData>(`/api/mentions${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
    enabled: Boolean(ctx.siteId),
  });

  const draft = (mentionId: string) => {
    setBusyId(mentionId);
    void api("/api/mentions", {
      method: "POST",
      body: { siteId: ctx.siteId, mentionId },
    })
      .then(() => q.refetch())
      .finally(() => setBusyId(null));
  };

  return (
    <>
      <PageHeader
        kicker="Insight"
        title="Off-page & brand authority"
        lead="Mention-first. Branded web mentions correlate 0.656–0.709 with AI-assistant visibility, versus 0.266–0.326 for Domain Rating. Outreach send is gated (T3); disavow stays locked unless a manual action exists."
      />
      <AsyncBoundary query={q} loading="Loading mentions…">
        {(d) => {
          const nothing =
            d.mentions.length === 0 &&
            d.inbound404s.length === 0 &&
            d.outreach.length === 0;
          if (nothing) {
            return (
              <EmptyState
                icon={<IconLink className="ico" />}
                title="No mention opportunities yet"
                body="Run the AI visibility panel to harvest branded mentions and find unlinked references worth a polite outreach. Broken inbound links show up here too."
                actions={
                  <button className="btn btn-ghost" onClick={() => ctx.go("/ai")}>
                    AI visibility
                  </button>
                }
              />
            );
          }
          return (
            <div className="stack">
              <Card title="Unlinked mentions">
                {d.mentions.length === 0 ? (
                  <Note>None stored. Run the AI visibility job to harvest.</Note>
                ) : (
                  <div className="items">
                    {d.mentions.map((m) => (
                      <div className="item" key={m.id}>
                        <div className="grow">
                          <div className="t">{bareHost(m.url)}</div>
                          <div className="m">
                            {m.kind} · score {m.score}
                            {m.snippet ? ` — ${m.snippet}` : ""}
                          </div>
                        </div>
                        {m.linked ? (
                          <span className="badge">linked</span>
                        ) : (
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={busyId === m.id || !ctx.siteId}
                            onClick={() => draft(m.id)}
                          >
                            {busyId === m.id ? "Drafting…" : "Draft outreach"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Inbound 404 recovery">
                {d.inbound404s.length === 0 ? (
                  <Note>No broken inbound targets stored.</Note>
                ) : (
                  <div className="items">
                    {d.inbound404s.map((row) => (
                      <div className="item" key={row.id}>
                        <div className="grow">
                          <div className="t">{bareHost(row.targetUrl)}</div>
                          <div className="m">from {bareHost(row.sourceUrl)}</div>
                        </div>
                        <span className="badge tier-num-4">{row.status ?? 404}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Outreach drafts">
                <p className="lead" style={{ marginBottom: 10 }}>
                  {d.sendRequiresApproval
                    ? "Send requires per-message two-key approval. No auto-send setting exists."
                    : ""}
                </p>
                {d.outreach.length === 0 ? (
                  <Note>No drafts yet.</Note>
                ) : (
                  <div className="items">
                    {d.outreach.map((o) => (
                      <div className="item" key={o.id}>
                        <div className="grow">
                          <div className="t">{o.subject}</div>
                          <div className="m">{o.state}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          );
        }}
      </AsyncBoundary>
    </>
  );
}
