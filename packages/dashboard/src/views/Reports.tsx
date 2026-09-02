import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Note } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconDoc, IconExternal } from "../components/icons.js";
import { shortDate, ago } from "../lib/format.js";

type Report = {
  id: string;
  title: string;
  createdAt: string;
  hash: string;
  whiteLabel?: boolean;
};

export function Reports(ctx: Ctx): JSX.Element {
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["reports", ctx.siteId],
    queryFn: () =>
      api<{ reports: Report[] }>(
        `/api/reports${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`,
      ),
  });

  const snapshot = () => {
    setBusy(true);
    void api("/api/reports", { method: "POST", body: { siteId: ctx.siteId } })
      .then(() => q.refetch())
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Reports"
        lead="Immutable snapshots of the site's state. The hash covers the payload, so a report cannot be quietly edited after the fact. White-label hides Agent Sean in the PDF."
        actions={
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !ctx.siteId}
            onClick={snapshot}
          >
            {busy ? "Capturing…" : "Snapshot now"}
          </button>
        }
      />
      <AsyncBoundary
        query={q}
        loading="Loading reports…"
        isEmpty={(d) => d.reports.length === 0}
        empty={
          <EmptyState
            icon={<IconDoc className="ico" />}
            title="No snapshots yet"
            body="Take a snapshot to freeze the current score and open findings into a hash-stamped PDF you can share or archive."
            actions={
              <button
                className="btn btn-primary"
                disabled={!ctx.siteId}
                onClick={snapshot}
              >
                Snapshot now
              </button>
            }
          />
        }
      >
        {(d) => (
          <div className="items">
            {d.reports.map((r) => (
              <div className="item" key={r.id}>
                <div className="grow">
                  <div className="t">{r.title}</div>
                  <div className="m">
                    {shortDate(r.createdAt)} · {ago(r.createdAt)} ·{" "}
                    <span className="mono">{r.hash.slice(0, 16)}…</span>
                  </div>
                </div>
                <a
                  className="btn btn-sm btn-ghost"
                  href={`/api/reports/${r.id}.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF <IconExternal className="ico" />
                </a>
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>
      <div style={{ marginTop: 14 }}>
        <Note>
          Turn on white-label in Settings to remove Agent Sean branding from the PDF.
        </Note>
      </div>
    </>
  );
}
