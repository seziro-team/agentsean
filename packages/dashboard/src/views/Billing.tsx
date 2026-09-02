import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api.js";
import type { Ctx } from "../router.js";
import {
  PageHeader,
  Card,
  Stat,
  Field,
  Note,
  Badge,
  Money,
} from "../components/Page.js";
import { AsyncBoundary } from "../components/State.js";
import { IconCheck } from "../components/icons.js";
import { money, pct } from "../lib/format.js";

/** Self-host default (no tenant). */
type SelfHost = { plan: "self_host"; priceUsd: number; note: string };
/** Hosted tenant status. */
type Hosted = {
  tenant: { id: string; status: string; email: string };
  plan: { id: string; name: string; priceUsdMonth: number; sites: number };
  cost: {
    sites: number;
    siteCap: number;
    ledgerUsd: number;
    cogsUsd: number;
    byok: boolean;
  };
};
type BillingData = SelfHost | Hosted;

function isSelfHost(d: BillingData): d is SelfHost {
  return (d as SelfHost).plan === "self_host";
}

const PLAN_OPTIONS = [
  { value: "cloud_starter", label: "Cloud — $9/mo · 1 site" },
  { value: "team", label: "Team — $14.99/seat · up to 25 sites" },
  { value: "enterprise", label: "Enterprise — talk to us" },
];

export function Billing(_ctx: Ctx): JSX.Element {
  const q = useQuery({
    queryKey: ["billing"],
    queryFn: () => api<BillingData>("/api/billing"),
  });
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("cloud_starter");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const signup = () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    void api<{ checkoutUrl?: string }>("/api/billing/signup", {
      method: "POST",
      body: { email, plan },
    })
      .then((r) => {
        setMsg(
          r.checkoutUrl
            ? "Checkout created. Continue in the tab that opens."
            : "Tenant created.",
        );
        if (r.checkoutUrl) window.open(r.checkoutUrl, "_blank", "noopener");
        void q.refetch();
      })
      .catch((e: unknown) =>
        setErr(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Failed.",
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        kicker="Setup"
        title="Billing"
        lead="Self-hosting is free and unlimited. The hosted tier exists only for people who would rather not run the daemon. BYOK is not optional on hosted — without it, cost of goods runs above the price."
      />
      <AsyncBoundary query={q} loading="Loading billing…">
        {(d) =>
          isSelfHost(d) ? (
            <div className="stack">
              <Card title="You are self-hosting" sub="Free forever">
                <div className="row" style={{ marginBottom: 12 }}>
                  <Badge className="tier-num-1">$0 / month</Badge>
                  <Badge>unlimited sites</Badge>
                  <Badge>BYOK</Badge>
                  <Badge>white-label included</Badge>
                </div>
                <Note variant="good" icon={<IconCheck className="ico" />}>
                  {d.note}
                </Note>
              </Card>

              <Card title="Prefer hosted?" sub="Optional">
                <p className="lead" style={{ marginBottom: 14 }}>
                  Cloud is $9/mo for one site with weekly ranks. Team is $14.99/seat for
                  up to 25 sites with daily ranks and AI visibility. All hosted plans
                  are BYOK.
                </p>
                <div className="grid-2">
                  <Field label="Email" htmlFor="bill-email">
                    <input
                      id="bill-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Field label="Plan" htmlFor="bill-plan">
                    <select
                      id="bill-plan"
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                    >
                      {PLAN_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !email.includes("@")}
                    onClick={signup}
                  >
                    {busy ? "Starting…" : "Start checkout"}
                  </button>
                </div>
                {msg ? (
                  <div style={{ marginTop: 10 }}>
                    <Note variant="good" icon={<IconCheck className="ico" />}>
                      {msg}
                    </Note>
                  </div>
                ) : null}
                {err ? (
                  <div style={{ marginTop: 10 }}>
                    <Note variant="warn">{err}</Note>
                  </div>
                ) : null}
              </Card>
            </div>
          ) : (
            <div className="stack">
              <div className="stat-grid">
                <Stat
                  label="Plan"
                  value={d.plan.name}
                  foot={`${money(d.plan.priceUsdMonth, 2)}/mo · ${d.cost.sites}/${d.cost.siteCap} sites`}
                  plain
                />
                <Stat
                  label="Ledger this month"
                  value={<Money usd={d.cost.ledgerUsd} />}
                  foot={`COGS ${money(d.cost.cogsUsd)}`}
                />
                <Stat
                  label="BYOK"
                  value={d.cost.byok ? "On" : "Off"}
                  foot={d.cost.byok ? "your keys, your bill" : "required on hosted"}
                  plain
                />
              </div>
              <Card title="Tenant">
                <div className="row">
                  <Badge>{d.tenant.email}</Badge>
                  <Badge className={d.tenant.status === "active" ? "tier-num-1" : ""}>
                    {d.tenant.status}
                  </Badge>
                  {d.cost.byok ? null : (
                    <Badge className="tier-num-4">BYOK required</Badge>
                  )}
                </div>
                {d.cost.byok ? null : (
                  <div style={{ marginTop: 12 }}>
                    <Note variant="warn">
                      Without BYOK, cost of goods (
                      {pct(d.cost.cogsUsd / (d.plan.priceUsdMonth || 1))} of price)
                      exceeds the plan price. Add your own LLM key in Settings.
                    </Note>
                  </div>
                )}
              </Card>
            </div>
          )
        }
      </AsyncBoundary>
    </>
  );
}
