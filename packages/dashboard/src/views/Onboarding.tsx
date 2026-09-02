import { useState } from "react";
import type { JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Card, Field, Note, Stat } from "../components/Page.js";
import { IconCheck, IconWarn, IconArrow } from "../components/icons.js";

type OnboardResult = {
  siteId: string;
  origin: string;
  pages: number;
  findingCount: number;
  score: { score: number; band?: string };
  power?: { message: string };
  vertical?: { preset: string };
};

type VerticalData = {
  preset: string;
  confidence: number;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
  rules: string[];
};

export function Onboarding(ctx: Ctx): JSX.Element {
  const client = useQueryClient();
  const [url, setUrl] = useState("https://");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<OnboardResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const vertical = useQuery({
    queryKey: ["vertical", done?.siteId],
    queryFn: () => api<VerticalData>(`/api/vertical?siteId=${done?.siteId ?? ""}`),
    enabled: Boolean(done?.siteId),
  });

  const crawl = () => {
    setBusy(true);
    setErr(null);
    void api<OnboardResult>("/api/onboard", {
      method: "POST",
      body: { url, maxPages: 80, render: false },
    })
      .then((r) => {
        setDone(r);
        void client.invalidateQueries({ queryKey: ["sites"] });
      })
      .catch((e: unknown) => {
        setErr(
          e instanceof ApiError &&
            e.body &&
            typeof e.body === "object" &&
            "error" in e.body
            ? `The URL looked invalid (${String((e.body as { error: unknown }).error)}). Include the scheme, e.g. https://example.com`
            : e instanceof Error
              ? e.message
              : "Crawl failed.",
        );
      })
      .finally(() => setBusy(false));
  };

  const questions = vertical.data?.questions ?? [];

  return (
    <>
      <PageHeader
        kicker="Get started"
        title="Point Sean at your site"
        lead="No account, no credentials, no signup. Sean crawls the URL, runs 425 checks, and shows the first findings in about 90 seconds. Connecting Google later adds clicks data."
      />

      <Card title="1 · Crawl a site">
        <Field
          label="Site URL"
          htmlFor="onboard-url"
          hint="Public pages only. Sean respects robots.txt and never scrapes Google."
        >
          <input
            id="onboard-url"
            value={url}
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy && url.length > 9) crawl();
            }}
            placeholder="https://example.com"
          />
        </Field>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            disabled={busy || url.length < 10}
            onClick={crawl}
          >
            {busy ? "Crawling…" : "Crawl now"}
          </button>
          <span className="small dim">Up to 80 pages on the first pass.</span>
        </div>
        {err ? (
          <div style={{ marginTop: 12 }}>
            <Note variant="warn" icon={<IconWarn className="ico" />}>
              {err}
            </Note>
          </div>
        ) : null}
      </Card>

      {done ? (
        <>
          <Card
            title="2 · First read"
            sub={
              <button
                className="btn btn-sm btn-primary"
                onClick={() => ctx.go("/findings")}
              >
                See findings <IconArrow className="ico" />
              </button>
            }
          >
            <div className="stat-grid">
              <Stat label="Pages crawled" value={done.pages} plain />
              <Stat label="Findings" value={done.findingCount} plain />
              <Stat
                label="Site score"
                value={done.score.score}
                foot={done.score.band ?? undefined}
              />
            </div>
            <div style={{ marginTop: 14 }}>
              <Note variant="good" icon={<IconCheck className="ico" />}>
                Crawled <strong>{done.origin}</strong>. Most changes on a small site
                land in evidence tier E — applied, not measurable. That is true of every
                SEO tool; only Sean says so.
              </Note>
            </div>
            {done.power?.message ? (
              <div style={{ marginTop: 10 }}>
                <Note variant="warn" icon={<IconWarn className="ico" />}>
                  {done.power.message}
                </Note>
              </div>
            ) : null}
          </Card>

          {questions.length > 0 ? (
            <Card
              title="3 · Six questions"
              sub={
                done.vertical?.preset ? `Detected: ${done.vertical.preset}` : undefined
              }
            >
              <p className="lead" style={{ marginBottom: 14 }}>
                A generic checklist gives opposite advice per vertical. Answer these so
                Sean applies the right rules. Affiliate and YMYL sites hard-block
                content generation.
              </p>
              <div className="stack">
                {questions.map((qn) => (
                  <Field key={qn.id} label={qn.prompt} htmlFor={`q-${qn.id}`}>
                    <select
                      id={`q-${qn.id}`}
                      value={answers[qn.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((p) => ({ ...p, [qn.id]: e.target.value }))
                      }
                    >
                      <option value="">Select…</option>
                      {qn.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <button
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => {
                    setSaving(true);
                    void api("/api/vertical", {
                      method: "POST",
                      body: { siteId: done.siteId, answers },
                    })
                      .then(() => ctx.go("/"))
                      .finally(() => setSaving(false));
                  }}
                >
                  {saving ? "Saving…" : "Save and open dashboard"}
                </button>
                <button className="btn btn-ghost" onClick={() => ctx.go("/")}>
                  Skip for now
                </button>
              </div>
            </Card>
          ) : (
            <div className="row">
              <button className="btn btn-primary" onClick={() => ctx.go("/")}>
                Open dashboard <IconArrow className="ico" />
              </button>
            </div>
          )}
        </>
      ) : (
        <Card title="What happens next">
          <ol className="lead" style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
            <li>Sean crawls up to 80 pages and runs every check.</li>
            <li>You see findings ranked by a published, versioned formula.</li>
            <li>
              Connect Google for clicks; Sean observes for 7 days before it writes.
            </li>
            <li>
              Safe fixes auto-apply as reversible diffs; risky ones wait for your click.
            </li>
          </ol>
        </Card>
      )}
    </>
  );
}
