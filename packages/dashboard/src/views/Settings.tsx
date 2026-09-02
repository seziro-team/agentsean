import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Field, Note, Badge } from "../components/Page.js";
import { AsyncBoundary } from "../components/State.js";
import { IconWarn, IconCheck } from "../components/icons.js";

type SettingsData = {
  halted: boolean;
  budgetUsdDaily: number;
  observeDays: number;
  whiteLabel: boolean;
  rankCadence: string;
  llmProvider: string;
  llmConfigured: boolean;
  aiDisclosure: string;
  providers: { dataforseo: boolean; bing: boolean; openpagerank: boolean };
  caps: { newPagesPerDay: number; contentRefreshPerDay: number };
  telemetry?: { enabled: boolean };
};

function Conn(props: { on: boolean; children: string }): JSX.Element {
  return (
    <Badge className={props.on ? "tier-num-1" : ""}>
      {props.children} {props.on ? "· on" : "· off"}
    </Badge>
  );
}

export function Settings(_ctx: Ctx): JSX.Element {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsData>("/api/settings"),
  });
  const adapters = useQuery({
    queryKey: ["adapters"],
    queryFn: () => api<{ adapters: Array<{ kind: string }> }>("/api/adapters"),
  });

  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data) setBudget(String(q.data.budgetUsdDaily));
  }, [q.data]);

  const post = (body: Record<string, unknown>) => {
    setSaving(true);
    void api("/api/settings", { method: "POST", body })
      .then(() => q.refetch())
      .finally(() => setSaving(false));
  };

  return (
    <>
      <PageHeader
        kicker="Setup"
        title="Settings"
        lead="Budgets, providers, disclosure, and the kill switch. Remote access should go through Tailscale or a Cloudflare Tunnel — the daemon binds to 127.0.0.1 and refuses to expose itself without auth."
      />
      <AsyncBoundary query={q} loading="Loading settings…">
        {(d) => (
          <div className="stack">
            <Card title="Kill switch" sub="Same as sean freeze">
              <p className="lead" style={{ marginBottom: 12 }}>
                Halts every write across all sites. It survives restart because it is a
                file, not memory.
              </p>
              <div className="row" style={{ alignItems: "center" }}>
                <FreezeButton halted={d.halted} onDone={() => void q.refetch()} />
                <span className="row" style={{ gap: 6 }}>
                  <span
                    className={`dot ${d.halted ? "frozen" : "live"}`}
                    style={{ width: 8, height: 8, borderRadius: "50%" }}
                  />
                  <span className="small dim">
                    {d.halted ? "Writes are frozen" : "Writes enabled"}
                  </span>
                </span>
              </div>
            </Card>

            <Card title="Budget & cadence">
              <Field
                label="Daily budget (USD)"
                htmlFor="budget"
                hint={`Observe window: ${d.observeDays} days (shortenable to 24h, never zero). Rank cadence: ${d.rankCadence}.`}
              >
                <input
                  id="budget"
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  style={{ maxWidth: 200 }}
                />
              </Field>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={saving || Number.isNaN(Number(budget))}
                  onClick={() => post({ budgetUsdDaily: Number(budget) })}
                >
                  Save budget
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <Note>
                  Content caps: {d.caps.contentRefreshPerDay} refreshes/day,{" "}
                  {d.caps.newPagesPerDay} new pages/day. Not overridable.
                </Note>
              </div>
            </Card>

            <Card title="LLM (bring your own key)">
              <div className="row" style={{ marginBottom: 10 }}>
                <Badge>{d.llmProvider}</Badge>
                {d.llmConfigured ? (
                  <Badge className="tier-num-1">key configured</Badge>
                ) : (
                  <Badge className="tier-num-4">no key</Badge>
                )}
                <Badge>disclosure: {d.aiDisclosure}</Badge>
              </div>
              <Note
                icon={
                  d.llmConfigured ? (
                    <IconCheck className="ico" />
                  ) : (
                    <IconWarn className="ico" />
                  )
                }
              >
                The model never holds CMS credentials and never calls a write API. Set a
                key from the CLI:
              </Note>
              <div style={{ marginTop: 10 }}>
                <pre className="block">
                  sean connect llm --provider {d.llmProvider} --api-key …
                </pre>
              </div>
            </Card>

            <Card title="Platform adapters">
              <AsyncBoundary query={adapters} loading="…">
                {(a) => (
                  <p className="lead">
                    {a.adapters.length === 0
                      ? "None connected. Title-tag writes go through WordPress, Shopify, Git, or the Cloudflare edge overlay (Squarespace / Framer / Duda). Each apply is verified by re-fetching live HTML."
                      : a.adapters.map((x) => x.kind).join(" · ")}
                  </p>
                )}
              </AsyncBoundary>
              <div style={{ marginTop: 10 }}>
                <pre className="block">
                  sean connect wordpress --api-key USER:APP_PASSWORD{"\n"}
                  sean connect shopify --api-key shpat_…
                </pre>
              </div>
            </Card>

            <Card title="Demand providers" sub="Free by default">
              <div className="row" style={{ marginBottom: 10 }}>
                <Conn on={d.providers.dataforseo}>DataForSEO</Conn>
                <Conn on={d.providers.bing}>Bing Webmaster</Conn>
                <Conn on={d.providers.openpagerank}>OpenPageRank</Conn>
              </div>
              <Note>
                The free default is Search Console + Bing + autocomplete. Sean never
                scrapes Google. Store keys with{" "}
                <code>sean connect dataforseo --api-key login:password</code>.
              </Note>
            </Card>

            <Card title="Privacy & telemetry">
              <p className="lead" style={{ marginBottom: 12 }}>
                Anonymous usage events only — install method, OS, version, CMS type,
                command names. Never domains, URLs, queries, keys, or IPs.{" "}
                <code>DO_NOT_TRACK=1</code> is honoured.
              </p>
              <div className="row">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={saving}
                  onClick={() => post({ telemetryEnabled: !d.telemetry?.enabled })}
                >
                  {d.telemetry?.enabled ? "Turn telemetry off" : "Turn telemetry on"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={saving}
                  onClick={() => post({ whiteLabel: !d.whiteLabel })}
                >
                  {d.whiteLabel ? "White-label on" : "Turn white-label on"}
                </button>
              </div>
            </Card>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}

/** The freeze/unfreeze control uses the dedicated /api/freeze endpoint. */
function FreezeButton(props: { halted: boolean; onDone: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={props.halted ? "btn btn-primary" : "btn btn-danger"}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void api("/api/freeze", { method: "POST", body: { halted: !props.halted } })
          .then(() => props.onDone())
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "…" : props.halted ? "Unfreeze writes" : "Freeze writes"}
    </button>
  );
}
