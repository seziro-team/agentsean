import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, establishSession } from "./api.js";
import { useInvalidation } from "./sse.js";
import { usePath } from "./router.js";
import type { Ctx } from "./router.js";
import { Nav } from "./components/Nav.js";
import { BrandMark } from "./components/icons.js";
import { Overview } from "./views/Overview.js";
import { Onboarding } from "./views/Onboarding.js";
import { Findings } from "./views/Findings.js";
import { Approvals } from "./views/Approvals.js";
import { Activity } from "./views/Activity.js";
import { Automations } from "./views/Automations.js";
import { Content } from "./views/Content.js";
import { Keywords } from "./views/Keywords.js";
import { Reports } from "./views/Reports.js";
import { SearchPerf } from "./views/SearchPerf.js";
import { Evidence } from "./views/Evidence.js";
import { AiVisibility } from "./views/AiVisibility.js";
import { LocalSeo } from "./views/LocalSeo.js";
import { Mentions } from "./views/Mentions.js";
import { Crawls } from "./views/Crawls.js";
import { Billing } from "./views/Billing.js";
import { Settings } from "./views/Settings.js";

type Site = { id: string; origin: string; name: string | null; observeUntil: string | null };

type Overview = {
  findings: Record<string, number>;
  thisWeek: { applied: number; queued: number; reverted: number };
};

function View(props: { path: string; ctx: Ctx }): JSX.Element {
  switch (props.path) {
    case "/onboarding":
      return <Onboarding {...props.ctx} />;
    case "/findings":
      return <Findings {...props.ctx} />;
    case "/approvals":
      return <Approvals {...props.ctx} />;
    case "/changes":
      return <Activity {...props.ctx} />;
    case "/automations":
      return <Automations {...props.ctx} />;
    case "/content":
      return <Content {...props.ctx} />;
    case "/keywords":
      return <Keywords {...props.ctx} />;
    case "/reports":
      return <Reports {...props.ctx} />;
    case "/search":
      return <SearchPerf {...props.ctx} />;
    case "/evidence":
      return <Evidence {...props.ctx} />;
    case "/ai":
      return <AiVisibility {...props.ctx} />;
    case "/local":
      return <LocalSeo {...props.ctx} />;
    case "/mentions":
      return <Mentions {...props.ctx} />;
    case "/crawls":
      return <Crawls {...props.ctx} />;
    case "/billing":
      return <Billing {...props.ctx} />;
    case "/settings":
      return <Settings {...props.ctx} />;
    default:
      return <Overview {...props.ctx} />;
  }
}

export function App(): JSX.Element {
  const [path, go] = usePath();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeSite, setActiveSite] = useState<string | undefined>(undefined);
  const client = useQueryClient();

  useEffect(() => {
    void establishSession().then(setAuthed);
  }, []);

  useInvalidation(client, authed === true);

  const health = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ halted: boolean }>("/api/settings"),
    enabled: authed === true,
  });
  const sites = useQuery({
    queryKey: ["sites"],
    queryFn: () => api<{ sites: Site[] }>("/api/sites"),
    enabled: authed === true,
  });

  const list = sites.data?.sites ?? [];
  const siteId = activeSite && list.some((s) => s.id === activeSite)
    ? activeSite
    : list[0]?.id;
  const origin = list.find((s) => s.id === siteId)?.origin;

  // Overview drives the nav badges (open findings, pending approvals).
  const overview = useQuery({
    queryKey: ["overview", siteId],
    queryFn: () => api<Overview>(`/api/overview?siteId=${siteId ?? ""}`),
    enabled: authed === true && Boolean(siteId),
  });
  const findingCount = Object.values(overview.data?.findings ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  const approvalCount = overview.data?.thisWeek.queued ?? 0;
  const halted = health.data?.halted ?? false;

  if (authed === null) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="brand">
            <BrandMark />
            <span>Agent Sean</span>
          </div>
          <p className="lead" style={{ margin: "0 auto" }}>
            Connecting to the local daemon…
          </p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="brand">
            <BrandMark />
            <span>Agent Sean</span>
          </div>
          <h2 style={{ marginBottom: 12 }}>Open this from the daemon</h2>
          <p className="lead" style={{ margin: "0 auto 20px" }}>
            The dashboard talks only to Sean running on this machine. Start it and
            open the link it prints, so the local session cookie can be set — a
            hosted page can never reach <code>127.0.0.1</code>.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <span className="cmd">
              <span className="p" aria-hidden="true">
                $
              </span>
              <code>sean start</code>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Empty install: no sites yet → the whole app is the onboarding flow.
  const empty = list.length === 0;
  const screen = empty ? "/onboarding" : path;
  const ctx: Ctx = { siteId, origin, go };

  return (
    <div className="shell">
      {empty ? null : (
        <Nav
          path={path}
          go={go}
          sites={list}
          siteId={siteId}
          onSite={setActiveSite}
          counts={{ findings: findingCount, approvals: approvalCount }}
          halted={halted}
        />
      )}
      <div className="content">
        {halted ? (
          <div className="banner halt" role="status">
            <BrandMark />
            <span>
              <strong>Writes are frozen.</strong> Sean will not apply any change
              until you unfreeze.
            </span>
            <span className="b-act">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => go("/settings")}
              >
                Manage
              </button>
            </span>
          </div>
        ) : null}
        <main className="page rv" key={screen}>
          <View path={screen} ctx={ctx} />
        </main>
      </div>
    </div>
  );
}
