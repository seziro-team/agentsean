import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Badge, Note } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconDoc } from "../components/icons.js";
import { shortDate, pathOf } from "../lib/format.js";

type ContentData = {
  cap: { newPagesPerDay: number; contentRefreshPerDay: number; overridable: boolean };
  evidence: { default: string; meaning: string };
  briefs: Array<{
    id: string;
    kind: string;
    targetUrl: string;
    score: number;
    createdAt: string;
  }>;
  drafts: Array<{
    id: string;
    state: string;
    title: string | null;
    evidenceTier: string;
    createdAt: string;
    publishedAt: string | null;
  }>;
  items: Array<{
    id: string;
    kind: string;
    state: string;
    createdAt: string;
    targetRef: string;
  }>;
};

export function Content(ctx: Ctx): JSX.Element {
  const q = useQuery({
    queryKey: ["content", ctx.siteId],
    queryFn: () =>
      api<ContentData>(`/api/content${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
  });

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Content"
        lead="Default is rewrite-in-place, not mass generation. New pages and refreshes are hard-capped per day and the cap is not overridable — scaled content abuse is defined by scale."
      />
      <AsyncBoundary query={q} loading="Loading content…">
        {(d) => {
          const nothing =
            d.drafts.length === 0 && d.items.length === 0 && d.briefs.length === 0;
          return (
            <div className="stack">
              <div className="row">
                <Badge>{d.cap.contentRefreshPerDay} refreshes/day</Badge>
                <Badge>{d.cap.newPagesPerDay} new pages/day</Badge>
                <Badge>not overridable</Badge>
                <Badge className={`ev-${d.evidence.default}`}>
                  default tier {d.evidence.default}
                </Badge>
              </div>

              {nothing ? (
                <EmptyState
                  icon={<IconDoc className="ico" />}
                  title="No drafts or briefs yet"
                  body="Sean writes briefs from striking-distance keywords and drafts refreshes for pages that are close to ranking. Connect Google so it has demand data to work from."
                  actions={
                    <>
                      <button
                        className="btn btn-ghost"
                        onClick={() => ctx.go("/keywords")}
                      >
                        Keywords
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => ctx.go("/connect")}
                      >
                        Connect Google
                      </button>
                    </>
                  }
                />
              ) : (
                <>
                  {d.drafts.length > 0 ? (
                    <Card title="Drafts">
                      <div className="tw">
                        <table>
                          <thead>
                            <tr>
                              <th>When</th>
                              <th>Title</th>
                              <th>State</th>
                              <th>Evidence</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.drafts.map((row) => (
                              <tr key={row.id}>
                                <td className="dim nowrap">
                                  {shortDate(row.publishedAt ?? row.createdAt)}
                                </td>
                                <td>
                                  <strong>{row.title ?? "Untitled"}</strong>
                                </td>
                                <td>{row.state}</td>
                                <td>
                                  <Badge className={`ev-${row.evidenceTier}`}>
                                    {row.evidenceTier}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  ) : null}

                  {d.briefs.length > 0 ? (
                    <Card title="Briefs">
                      <div className="items">
                        {d.briefs.map((b) => (
                          <div className="item" key={b.id}>
                            <div className="grow">
                              <div className="t">{pathOf(b.targetUrl)}</div>
                              <div className="m">
                                {b.kind} · score {b.score}
                              </div>
                            </div>
                            <span className="dim small nowrap">
                              {shortDate(b.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : null}

                  {d.items.length > 0 ? (
                    <Card title="Content actions">
                      <div className="tw">
                        <table>
                          <thead>
                            <tr>
                              <th>When</th>
                              <th>Kind</th>
                              <th>State</th>
                              <th>Target</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.items.map((i) => (
                              <tr key={i.id}>
                                <td className="dim nowrap">{shortDate(i.createdAt)}</td>
                                <td>{i.kind}</td>
                                <td>{i.state}</td>
                                <td>
                                  <code>{pathOf(i.targetRef)}</code>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  ) : null}
                </>
              )}

              <Note>{d.evidence.meaning}</Note>
            </div>
          );
        }}
      </AsyncBoundary>
    </>
  );
}
