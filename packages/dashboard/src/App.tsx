import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api, establishSession } from "./api.js";
import { useInvalidation } from "./sse.js";

const ROUTES = [
  ["/", "Overview"],
  ["/findings", "Findings"],
  ["/crawls", "Crawls"],
  ["/changes", "Activity"],
  ["/approvals", "Approvals"],
  ["/automations", "Automations"],
  ["/content", "Content"],
  ["/search", "Search"],
  ["/ai", "AI visibility"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
  ["/onboarding", "Onboarding"],
] as const;

function usePath(): [string, (p: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return [
    path,
    (p: string) => {
      history.pushState(null, "", p);
      setPath(p);
    },
  ];
}

type Site = { id: string; origin: string; name: string | null; observeUntil: string | null };

export function App() {
  const [path, go] = usePath();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const client = useQueryClient();

  useEffect(() => {
    void establishSession().then(setAuthed);
  }, []);

  useInvalidation(client, authed === true);

  const health = useQuery({
    queryKey: ["overview"],
    queryFn: () => api<{ halted: boolean; version: string }>("/api/health"),
    enabled: authed === true,
  });
  const sites = useQuery({
    queryKey: ["sites"],
    queryFn: () => api<{ sites: Site[] }>("/api/sites"),
    enabled: authed === true,
  });

  if (authed === null) return <p className="page muted">Loading…</p>;
  if (!authed) {
    return (
      <main className="page">
        <h2>Agent Sean</h2>
        <p className="lead">
          Open this dashboard from <code>sean start</code> so the local session cookie can be set.
          A hosted page never talks to this machine.
        </p>
      </main>
    );
  }

  const list = sites.data?.sites ?? [];
  const siteId = list[0]?.id;
  const empty = list.length === 0;
  const screen = empty && path === "/" ? "/onboarding" : path;

  return (
    <div className="shell">
      <nav className="side">
        <h1>Agent Sean</h1>
        {ROUTES.filter(([p]) => (empty ? p === "/onboarding" || p === "/settings" : true)).map(
          ([p, label]) => (
            <a
              key={p}
              href={p}
              className={screen === p ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                go(p);
              }}
            >
              {label}
            </a>
          ),
        )}
        <p className="muted" style={{ marginTop: "1rem" }}>
          <a href="/connect">Connect Google</a>
          <br />
          <a href="/activity">Activity (simple)</a>
        </p>
      </nav>
      <div>
        {health.data?.halted ? (
          <div className="banner halt">Writes are frozen. Sean will not apply Actions until you unfreeze.</div>
        ) : null}
        <main className="page">
          <Screen path={screen} siteId={siteId} go={go} />
        </main>
      </div>
    </div>
  );
}

function Screen(props: { path: string; siteId: string | undefined; go: (p: string) => void }) {
  switch (props.path) {
    case "/findings":
      return <Findings siteId={props.siteId} />;
    case "/crawls":
      return <Crawls siteId={props.siteId} />;
    case "/changes":
      return <Activity siteId={props.siteId} />;
    case "/approvals":
      return <Approvals siteId={props.siteId} />;
    case "/automations":
      return <Automations siteId={props.siteId} />;
    case "/content":
      return <Content siteId={props.siteId} />;
    case "/search":
      return <SearchPerf siteId={props.siteId} />;
    case "/ai":
      return <AiVisibility />;
    case "/reports":
      return <Reports siteId={props.siteId} />;
    case "/settings":
      return <Settings />;
    case "/onboarding":
      return <Onboarding go={props.go} />;
    default:
      return <Overview siteId={props.siteId} go={props.go} />;
  }
}

function Overview(props: { siteId: string | undefined; go: (p: string) => void }) {
  const q = useQuery({
    queryKey: ["overview", props.siteId],
    queryFn: () =>
      api<{
        origin: string;
        score: { score: number; version: string; formula: string; band: string } | null;
        findings: Record<string, number>;
        thisWeek: { applied: number; queued: number; reverted: number };
        costUsd: number;
        observeUntil: string | null;
      }>(`/api/overview${props.siteId ? `?siteId=${props.siteId}` : ""}`),
    enabled: Boolean(props.siteId),
  });
  if (!props.siteId) return <Onboarding go={props.go} />;
  if (q.isLoading) return <p className="muted">Loading overview…</p>;
  const d = q.data;
  return (
    <>
      <h2>Overview</h2>
      <p className="lead">{d?.origin} — site score formula is public and versioned.</p>
      <div className="grid">
        <div className="card">
          <div className="muted">Site score</div>
          <div className="metric">{d?.score?.score ?? "—"}</div>
          <div className="muted">{d?.score?.band} · {d?.score?.version}</div>
        </div>
        <div className="card">
          <div className="muted">This week</div>
          <div className="metric">{d?.thisWeek.applied ?? 0}</div>
          <div className="muted">applied · {d?.thisWeek.queued ?? 0} queued</div>
        </div>
        <div className="card">
          <div className="muted">Cost meter</div>
          <div className="metric">${(d?.costUsd ?? 0).toFixed(2)}</div>
          <div className="muted">BYOK — your keys, your bill</div>
        </div>
      </div>
      <div className="card">
        <strong>Findings by severity</strong>
        <div className="row" style={{ marginTop: "0.5rem" }}>
          {Object.entries(d?.findings ?? {}).map(([sev, n]) => (
            <span key={sev} className={`pill sev-${sev}`}>
              {sev} {n}
            </span>
          ))}
        </div>
      </div>
      <pre className="formula card">{d?.score?.formula}</pre>
    </>
  );
}

function Onboarding(props: { go: (p: string) => void }) {
  const [url, setUrl] = useState("https://");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ pages: number; findings: number; score: number } | null>(null);
  return (
    <>
      <h2>Onboarding</h2>
      <p className="lead">URL → crawl → first findings. Then offer Google. No account required.</p>
      <div className="card">
        <label>Site URL</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setErr(null);
              void api<{ pages: number; findingCount: number; score: { score: number } }>("/api/onboard", {
                method: "POST",
                body: { url, maxPages: 80, render: false },
              })
                .then((r) => {
                  setDone({ pages: r.pages, findings: r.findingCount, score: r.score.score });
                  props.go("/");
                })
                .catch((e: Error) => setErr(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Crawling…" : "Crawl now"}
          </button>
        </div>
        {err ? <p className="err">{err}</p> : null}
        {done ? (
          <p className="ok">
            {done.pages} pages, {done.findings} findings, score {done.score}. Connect Google when you want
            clicks data.
          </p>
        ) : null}
      </div>
    </>
  );
}

function Findings(props: { siteId: string | undefined }) {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [tier, setTier] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const search = useQuery({
    queryKey: ["findings", props.siteId, q, severity, tier, cursor],
    queryFn: () => {
      const p = new URLSearchParams();
      if (props.siteId) p.set("siteId", props.siteId);
      if (q) p.set("q", q);
      if (severity) p.set("severity", severity);
      if (tier) p.set("tier", tier);
      if (cursor) p.set("cursor", cursor);
      p.set("limit", "50");
      return api<{
        findings: Array<{
          id: string;
          title: string;
          severity: string;
          autonomyTier: string;
          ruleId: string;
          firstDetectedAt: string;
        }>;
        nextCursor: string | null;
      }>(`/api/findings?${p}`);
    },
    enabled: Boolean(props.siteId),
  });
  return (
    <>
      <h2>Findings</h2>
      <p className="lead">Server-side table, keyset pagination, FTS5.</p>
      <div className="row">
        <input
          placeholder="Search title / explanation"
          value={q}
          onChange={(e) => {
            setCursor(undefined);
            setQ(e.target.value);
          }}
          style={{ maxWidth: 280 }}
        />
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          {["critical", "high", "medium", "low", "insight"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">All tiers</option>
          {["T0", "T1", "T2", "T3", "T4"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Tier</th>
            <th>Finding</th>
            <th>Rule</th>
          </tr>
        </thead>
        <tbody>
          {(search.data?.findings ?? []).map((f) => (
            <tr key={f.id}>
              <td className={`sev-${f.severity}`}>{f.severity}</td>
              <td>{f.autonomyTier}</td>
              <td>{f.title}</td>
              <td className="muted">{f.ruleId}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {search.data?.nextCursor ? (
        <button className="secondary" onClick={() => setCursor(search.data?.nextCursor ?? undefined)}>
          Next page
        </button>
      ) : null}
    </>
  );
}

function Crawls(props: { siteId: string | undefined }) {
  const [filter, setFilter] = useState("all");
  const crawls = useQuery({
    queryKey: ["crawls", props.siteId],
    queryFn: () =>
      api<{ crawls: Array<{ id: string; startedAt: string; status: string; pagesSeen: number }> }>(
        `/api/crawls?siteId=${props.siteId}`,
      ),
    enabled: Boolean(props.siteId),
  });
  const a = crawls.data?.crawls[0]?.id;
  const b = crawls.data?.crawls[1]?.id;
  const diff = useQuery({
    queryKey: ["crawls", "diff", a, b, filter],
    queryFn: () =>
      api<{
        rows: Array<{ url: string; mode: string; statusCode: number | null }>;
      }>(`/api/crawls/${a}/diff?otherId=${b}&filter=${filter}`),
    enabled: Boolean(a && b),
  });
  const rows = diff.data?.rows ?? [];
  const parent = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 28,
    overscan: 12,
  });
  return (
    <>
      <h2>Crawl explorer</h2>
      <p className="lead">Crawl-to-crawl diff. filter_mode: added / new / removed / missing / no_change.</p>
      <div className="row">
        {["all", "added", "new", "removed", "missing", "no_change", "changed"].map((m) => (
          <button key={m} className={filter === m ? "" : "secondary"} onClick={() => setFilter(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="virtual" ref={parent}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index];
            if (!row) return null;
            return (
              <div
                key={v.key}
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${v.start}px)`,
                  width: "100%",
                  padding: "0.25rem 0.5rem",
                }}
              >
                <span className="pill">{row.mode}</span> {row.url}{" "}
                <span className="muted">{row.statusCode ?? ""}</span>
              </div>
            );
          })}
        </div>
      </div>
      {crawls.data?.crawls.length === 1 ? (
        <p className="muted">Need two crawls to diff. Sean crawls weekly by default.</p>
      ) : null}
    </>
  );
}

function Activity(_props: { siteId: string | undefined }) {
  const q = useQuery({
    queryKey: ["changes"],
    queryFn: () =>
      api<{
        changes: Array<{
          id: string;
          summary: string;
          appliedAt: string;
          revertible: boolean;
          before: string;
          after: string;
          prUrl: string | null;
        }>;
      }>("/api/changes"),
  });
  return (
    <>
      <h2>Activity</h2>
      <p className="lead">Every write is a reversible diff. One click reverts it. The LLM never holds credentials.</p>
      {(q.data?.changes ?? []).map((c) => (
          <div className="card" key={c.id}>
            <strong>{c.summary}</strong>
            <div className="muted">{c.appliedAt}</div>
            <pre className="diff">
              <span className="del">{c.before.slice(0, 400)}</span>
              {"\n"}
              <span className="ins">{c.after.slice(0, 400)}</span>
            </pre>
            {c.prUrl ? <p><a href={c.prUrl}>Pull request</a></p> : null}
            {c.revertible ? (
              <button
                className="secondary"
                onClick={() => {
                  void api(`/api/changes/${c.id}/revert`, { method: "POST", body: {} }).then(() =>
                    q.refetch(),
                  );
                }}
              >
                Revert
              </button>
            ) : (
              <span className="muted">Already reverted</span>
            )}
          </div>
        ))}
    </>
  );
}

function Approvals(props: { siteId: string | undefined }) {
  const [mode, setMode] = useState<"rendered" | "source" | "serp" | "jsonld">("source");
  const q = useQuery({
    queryKey: ["approvals", props.siteId],
    queryFn: () =>
      api<{
        actions: Array<{
          id: string;
          kind: string;
          targetRef: string;
          rationale: string[];
          diffs: Record<string, { before: string; after: string }>;
          blast: string;
          expires: string | null;
        }>;
      }>(`/api/approvals${props.siteId ? `?siteId=${props.siteId}` : ""}`),
  });
  return (
    <>
      <h2>Approvals</h2>
      <p className="lead">T3 queue. Four diff modes. Two-key rule is not overridable.</p>
      <div className="row">
        {(["rendered", "source", "serp", "jsonld"] as const).map((m) => (
          <button key={m} className={mode === m ? "" : "secondary"} onClick={() => setMode(m)}>
            {m === "jsonld" ? "structured data" : m === "serp" ? "SERP snippet" : m}
          </button>
        ))}
      </div>
      {(q.data?.actions ?? []).map((a) => (
        <div className="card" key={a.id}>
          <strong>{a.kind}</strong> <span className="muted">{a.targetRef}</span>
          <ul>
            {a.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <pre className="diff">
            <span className="del">{a.diffs[mode]?.before}</span>
            {"\n"}
            <span className="ins">{a.diffs[mode]?.after}</span>
          </pre>
          <p className="muted">{a.blast}</p>
        </div>
      ))}
      {(q.data?.actions ?? []).length === 0 ? <p className="muted">Nothing waiting for a human.</p> : null}
    </>
  );
}

function Automations(props: { siteId: string | undefined }) {
  const q = useQuery({
    queryKey: ["settings", props.siteId],
    queryFn: () =>
      api<{
        matrix: Array<{ kind: string; tier: number; auto: boolean; locked: boolean; note: string }>;
        t1: boolean;
        t2: boolean;
      }>(`/api/automations${props.siteId ? `?siteId=${props.siteId}` : ""}`),
  });
  return (
    <>
      <h2>Automations</h2>
      <p className="lead">Full autonomy matrix. T3 is gated. T4 is refused. No setting exists for T4.</p>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Tier</th>
            <th>Default</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(q.data?.matrix ?? []).map((row) => (
            <tr key={row.kind}>
              <td>
                <code>{row.kind}</code>
              </td>
              <td>T{row.tier}</td>
              <td>{row.locked ? "locked" : row.auto ? "auto" : "off"}</td>
              <td className="muted">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Content(props: { siteId: string | undefined }) {
  const q = useQuery({
    queryKey: ["content", props.siteId],
    queryFn: () =>
      api<{
        items: Array<{ id: string; kind: string; state: string; createdAt: string; targetRef: string }>;
        drafts: Array<{
          id: string;
          state: string;
          title: string | null;
          evidenceTier: string;
          createdAt: string;
          publishedAt: string | null;
        }>;
        briefs: Array<{ id: string; kind: string; targetUrl: string; score: number; createdAt: string }>;
        cap: { newPagesPerDay: number; contentRefreshPerDay: number; overridable: boolean };
        evidence: { default: string; meaning: string };
      }>(`/api/content${props.siteId ? `?siteId=${props.siteId}` : ""}`),
  });
  return (
    <>
      <h2>Content</h2>
      <p className="lead">
        Default is rewrite-in-place. Cap: {q.data?.cap.contentRefreshPerDay ?? 2} refreshes/day and{" "}
        {q.data?.cap.newPagesPerDay ?? 2} new pages/day, not overridable. Evidence: {q.data?.evidence.default} —{" "}
        {q.data?.evidence.meaning}
      </p>
      <h3>Drafts</h3>
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
          {(q.data?.drafts ?? []).map((d) => (
            <tr key={d.id}>
              <td>{(d.publishedAt ?? d.createdAt).slice(0, 10)}</td>
              <td>{d.title ?? "—"}</td>
              <td>{d.state}</td>
              <td>{d.evidenceTier}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Actions</h3>
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
          {(q.data?.items ?? []).map((i) => (
            <tr key={i.id}>
              <td>{i.createdAt.slice(0, 10)}</td>
              <td>{i.kind}</td>
              <td>{i.state}</td>
              <td className="muted">{i.targetRef}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SearchPerf(props: { siteId: string | undefined }) {
  const q = useQuery({
    queryKey: ["search", props.siteId],
    queryFn: () =>
      api<{
        metric: "clicks";
        impressionsContaminated: boolean;
        strikingDistance: Array<{ page: string; clicks: number; position: number }>;
        decay: { currentClicks: number; previousClicks: number; delta: number };
        brand: { brandClicks: number; nonBrandClicks: number };
        ctrOutliers: Array<{ query: string; ctr: number }>;
        cannibalizationNote: string;
      }>(`/api/search${props.siteId ? `?siteId=${props.siteId}` : ""}`),
    enabled: Boolean(props.siteId),
  });
  const d = q.data;
  return (
    <>
      <h2>Search performance</h2>
      <p className="lead">Default metric is clicks. GSC impressions 2025-05-13 → 2026-04-27 are contaminated.</p>
      {d?.impressionsContaminated ? (
        <p className="warn">Impressions / CTR / position in the bug window are not used as the default.</p>
      ) : null}
      <div className="grid">
        <div className="card">
          <div className="muted">This week (clicks)</div>
          <div className="metric">{d?.decay.currentClicks ?? "—"}</div>
          <div className="muted">Δ {d?.decay.delta ?? 0} vs prior week</div>
        </div>
        <div className="card">
          <div className="muted">Brand / non-brand</div>
          <div className="metric">
            {d?.brand.brandClicks ?? 0} / {d?.brand.nonBrandClicks ?? 0}
          </div>
        </div>
      </div>
      <h3>Striking distance (pos 8–20)</h3>
      <ul>
        {(d?.strikingDistance ?? []).map((r) => (
          <li key={r.page}>
            {r.page} · pos {r.position.toFixed(1)} · {r.clicks} clicks
          </li>
        ))}
      </ul>
      <p className="muted">{d?.cannibalizationNote}</p>
    </>
  );
}

function AiVisibility() {
  return (
    <>
      <h2>AI visibility</h2>
      <p className="lead">
        Citation share by engine and the prompt panel land with the provider/MCP layer (Phase 6 / 9). The site
        score already has an AI-bot robots pillar so the number is not a void.
      </p>
      <div className="card muted">No citation providers configured. Connect them later — this screen stays empty rather than inventing share.</div>
    </>
  );
}

function Reports(props: { siteId: string | undefined }) {
  const q = useQuery({
    queryKey: ["reports", props.siteId],
    queryFn: () =>
      api<{ reports: Array<{ id: string; title: string; createdAt: string; hash: string }> }>(
        `/api/reports${props.siteId ? `?siteId=${props.siteId}` : ""}`,
      ),
  });
  return (
    <>
      <h2>Reports</h2>
      <p className="lead">Immutable snapshots. Hash covers the payload. White-label hides Agent Sean in the PDF.</p>
      <button
        disabled={!props.siteId}
        onClick={() => {
          void api("/api/reports", { method: "POST", body: { siteId: props.siteId } }).then(() => q.refetch());
        }}
      >
        Snapshot now
      </button>
      <ul>
        {(q.data?.reports ?? []).map((r) => (
          <li key={r.id}>
            {r.title} · {r.createdAt.slice(0, 16)} · <a href={`/api/reports/${r.id}.pdf`}>PDF</a>
            <div className="muted">{r.hash.slice(0, 16)}…</div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Settings() {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () =>
      api<{
        halted: boolean;
        budgetUsdDaily: number;
        observeDays: number;
        whiteLabel: boolean;
        rankCadence: string;
        notifications: string;
        llmProvider: string;
        llmConfigured: boolean;
        aiDisclosure: string;
        caps: { newPagesPerDay: number; contentRefreshPerDay: number; overridable: boolean };
      }>("/api/settings"),
  });
  const [budget, setBudget] = useState("");
  useEffect(() => {
    if (q.data) setBudget(String(q.data.budgetUsdDaily));
  }, [q.data]);
  const d = q.data;
  return (
    <>
      <h2>Settings</h2>
      <p className="lead">Providers, budgets, notifications, kill switch. Remote access is Tailscale / Cloudflare Tunnel — never bind 0.0.0.0.</p>
      <div className="card">
        <strong>Kill switch</strong>
        <p className="muted">Halts all writes across every site and survives restart. Same as <code>sean freeze</code>.</p>
        <button
          onClick={() => {
            void api("/api/freeze", { method: "POST", body: { halted: !d?.halted } }).then(() => q.refetch());
          }}
        >
          {d?.halted ? "Unfreeze" : "Freeze writes"}
        </button>
      </div>
      <div className="card">
        <label>Daily budget (USD)</label>
        <input value={budget} onChange={(e) => setBudget(e.target.value)} />
        <button
          className="secondary"
          onClick={() => {
            void api("/api/settings", {
              method: "POST",
              body: { budgetUsdDaily: Number(budget) },
            }).then(() => q.refetch());
          }}
        >
          Save
        </button>
        <p className="muted">Observe period: {d?.observeDays ?? 7} days (shortenable to 24h, not zero). Rank cadence: {d?.rankCadence ?? "weekly"}.</p>
      </div>
      <div className="card">
        <strong>LLM (BYOK)</strong>
        <p className="muted">
          Provider {d?.llmProvider ?? "anthropic"} · {d?.llmConfigured ? "key configured" : "no key"} · disclosure{" "}
          {d?.aiDisclosure ?? "html_comment"}. The model never holds CMS credentials and never calls a write API.
        </p>
        <p className="muted">
          Content caps: {d?.caps.contentRefreshPerDay ?? 2} refreshes/day, {d?.caps.newPagesPerDay ?? 2} new
          pages/day. Not overridable.
        </p>
      </div>
    </>
  );
}


