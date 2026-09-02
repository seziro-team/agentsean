import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Badge } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconBolt } from "../components/icons.js";

type Row = { kind: string; tier: number; auto: boolean; locked: boolean; note: string };

function status(row: Row): JSX.Element {
  if (row.tier === 4) return <Badge className="tier-num-4">refused</Badge>;
  if (row.locked) return <Badge className="tier-num-3">gated</Badge>;
  if (row.auto) return <Badge className="tier-num-1">auto</Badge>;
  return <Badge>off</Badge>;
}

export function Automations(ctx: Ctx): JSX.Element {
  const q = useQuery({
    queryKey: ["settings", ctx.siteId],
    queryFn: () =>
      api<{ matrix: Row[] }>(
        `/api/automations${ctx.siteId ? `?siteId=${ctx.siteId}` : ""}`,
      ),
  });

  return (
    <>
      <PageHeader
        kicker="Work"
        title="Automations"
        lead="The full autonomy matrix. Every action kind has a fixed tier the planner cannot change. T0 observes, T1/T2 apply automatically, T3 is gated behind a human click, and T4 is refused — there is no setting for it, on purpose."
      />
      <AsyncBoundary
        query={q}
        loading="Loading autonomy matrix…"
        isEmpty={(d) => d.matrix.length === 0}
        empty={
          <EmptyState
            icon={<IconBolt className="ico" />}
            title="No action kinds loaded"
            body="The daemon returned an empty matrix. This usually means it is still starting up."
          />
        }
      >
        {(d) => (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Tier</th>
                  <th>Default</th>
                  <th>Behaviour</th>
                </tr>
              </thead>
              <tbody>
                {d.matrix.map((row) => (
                  <tr key={row.kind}>
                    <td>
                      <code>{row.kind}</code>
                    </td>
                    <td>
                      <Badge className={`tier-num-${row.tier}`}>T{row.tier}</Badge>
                    </td>
                    <td>{status(row)}</td>
                    <td className="dim">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
