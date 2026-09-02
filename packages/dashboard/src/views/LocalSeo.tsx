import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Badge, Note } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconPin, IconWarn } from "../components/icons.js";

type LocalData = {
  locations: Array<{
    id: string;
    locationName: string;
    title: string | null;
    primaryCategory: string | null;
    approvalStatus: string;
  }>;
  gap: { gap: boolean; message: string };
  editsPerMin: number;
  qpm: number;
  reviewGeneration: string;
  cityServicePages: string;
};

export function LocalSeo(ctx: Ctx): JSX.Element {
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["local", ctx.siteId],
    queryFn: () =>
      api<LocalData>(`/api/local${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`),
    enabled: Boolean(ctx.siteId),
  });

  const applyHours = (locationId: string) => {
    setBusyId(locationId);
    setErr(null);
    void api("/api/local", {
      method: "POST",
      body: { siteId: ctx.siteId, locationId, kind: "hours", payload: { touch: true } },
    })
      .then(() => q.refetch())
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 409) {
          setErr(
            "Google has not granted Basic API Access for this profile yet, so writes are refused.",
          );
        } else if (e instanceof ApiError && e.status === 429) {
          setErr("Rate limit hit for this profile. GBP writes are token-bucketed.");
        } else {
          setErr(e instanceof Error ? e.message : "Edit failed.");
        }
      })
      .finally(() => setBusyId(null));
  };

  return (
    <>
      <PageHeader
        kicker="Insight"
        title="Local SEO"
        lead="Google Business Profile writes are token-bucketed per profile. Quota starts at zero until Google approves Basic API Access, so Local is read-only until then. Review generation and city×service pages are refused (T4)."
      />
      <AsyncBoundary query={q} loading="Loading local profiles…">
        {(d) => (
          <div className="stack">
            <div className="row">
              <Badge>{d.editsPerMin} edits/min</Badge>
              <Badge>{d.qpm} QPM</Badge>
              <Badge className="tier-num-4">reviews refused</Badge>
              <Badge className="tier-num-4">city×service refused</Badge>
            </div>

            {d.gap.gap ? (
              <Note variant="warn" icon={<IconWarn className="ico" />}>
                {d.gap.message}
              </Note>
            ) : null}

            {d.locations.length === 0 ? (
              <EmptyState
                icon={<IconPin className="ico" />}
                title="No Business Profile connected"
                body="Connect Google Business Profile to see locations here. Until Google approves Basic API Access, Local stays read-only — Sean advises but does not write."
                actions={
                  <button
                    className="btn btn-primary"
                    onClick={() => ctx.go("/connect")}
                  >
                    Connect Google
                  </button>
                }
              />
            ) : (
              <div className="items">
                {d.locations.map((loc) => (
                  <div className="item" key={loc.id}>
                    <div className="grow">
                      <div className="t">{loc.title ?? loc.locationName}</div>
                      <div className="m">
                        {loc.primaryCategory ?? "uncategorised"} · {loc.approvalStatus}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-ghost"
                      disabled={busyId === loc.id || !ctx.siteId}
                      onClick={() => applyHours(loc.id)}
                    >
                      {busyId === loc.id ? "Applying…" : "Apply hours edit"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {err ? (
              <Note variant="warn" icon={<IconWarn className="ico" />}>
                {err}
              </Note>
            ) : null}

            <Note>
              Title keyword-stuffing is advisory-only — Sean flags it but will not do
              it.
            </Note>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
