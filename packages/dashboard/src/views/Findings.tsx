import { useState } from "react";
import type { JSX } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Pill, Badge } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconList, IconSearch } from "../components/icons.js";
import { bareHost, shortDate } from "../lib/format.js";

type Finding = {
  id: string;
  title: string;
  severity: string;
  autonomyTier: string;
  ruleId: string;
  firstDetectedAt: string;
};

const SEVS = ["critical", "high", "medium", "low", "insight"];
const TIERS = ["T0", "T1", "T2", "T3", "T4"];

export function Findings(ctx: Ctx): JSX.Element {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [tier, setTier] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const search = useQuery({
    queryKey: ["findings", ctx.siteId, q, severity, tier, cursor],
    queryFn: () => {
      const p = new URLSearchParams();
      if (ctx.siteId) p.set("siteId", ctx.siteId);
      if (q) p.set("q", q);
      if (severity) p.set("severity", severity);
      if (tier) p.set("tier", tier);
      if (cursor) p.set("cursor", cursor);
      p.set("limit", "50");
      return api<{ findings: Finding[]; nextCursor: string | null }>(
        `/api/findings?${p}`,
      );
    },
    enabled: Boolean(ctx.siteId),
    placeholderData: keepPreviousData,
  });

  const resetCursor = () => setCursor(undefined);

  return (
    <>
      <PageHeader
        kicker="Work"
        title="Findings"
        lead={`Everything Sean can see on ${ctx.origin ? bareHost(ctx.origin) : "your site"}, ranked by a published formula. Each finding carries the autonomy tier of its fix — T1 applies automatically, T3 needs your click, T4 is refused.`}
      />

      <div className="row" style={{ marginBottom: 14 }} role="search">
        <input
          aria-label="Search findings"
          placeholder="Search title or explanation…"
          value={q}
          onChange={(e) => {
            resetCursor();
            setQ(e.target.value);
          }}
          style={{ flex: "1 1 240px", minWidth: 0 }}
        />
        <select
          aria-label="Severity"
          value={severity}
          onChange={(e) => {
            resetCursor();
            setSeverity(e.target.value);
          }}
          style={{ maxWidth: 170 }}
        >
          <option value="">All severities</option>
          {SEVS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Tier"
          value={tier}
          onChange={(e) => {
            resetCursor();
            setTier(e.target.value);
          }}
          style={{ maxWidth: 140 }}
        >
          <option value="">All tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <AsyncBoundary
        query={search}
        loading="Searching findings…"
        isEmpty={(d) => d.findings.length === 0}
        empty={
          q || severity || tier ? (
            <EmptyState
              inline
              icon={<IconSearch className="ico" />}
              title="No findings match"
              body="Try clearing the filters or search term."
              actions={
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    resetCursor();
                    setQ("");
                    setSeverity("");
                    setTier("");
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<IconList className="ico" />}
              title="No open findings"
              body="Either this site is clean on the latest crawl, or it has not been crawled yet. Re-crawl from the CLI to refresh."
              command={`sean audit ${ctx.origin ?? "https://example.com"}`}
            />
          )
        }
      >
        {(d) => (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Fix tier</th>
                    <th>Finding</th>
                    <th>Rule</th>
                    <th>Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {d.findings.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Pill className={`sev-${f.severity}`}>{f.severity}</Pill>
                      </td>
                      <td>
                        <Badge
                          className={`tier-${f.autonomyTier.replace("T", "num-")}`}
                        >
                          {f.autonomyTier}
                        </Badge>
                      </td>
                      <td>
                        <strong>{f.title}</strong>
                      </td>
                      <td>
                        <code>{f.ruleId}</code>
                      </td>
                      <td className="dim nowrap">{shortDate(f.firstDetectedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.nextCursor ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCursor(d.nextCursor ?? undefined)}
                >
                  Load more
                </button>
              </div>
            ) : null}
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
