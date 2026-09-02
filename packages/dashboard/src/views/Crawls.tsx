import { useRef, useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "../api.js";
import type { Ctx } from "../router.js";
import { PageHeader, Note, Segmented } from "../components/Page.js";
import { AsyncBoundary, EmptyState } from "../components/State.js";
import { IconSpider } from "../components/icons.js";
import { pathOf } from "../lib/format.js";

type Crawl = { id: string; startedAt: string; status: string; pagesSeen: number };
type DiffRow = { url: string; mode: string; statusCode: number | null };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "added", label: "Added" },
  { value: "new", label: "New" },
  { value: "removed", label: "Removed" },
  { value: "changed", label: "Changed" },
  { value: "no_change", label: "No change" },
] as const;

const MODE_CLASS: Record<string, string> = {
  new: "tier-num-1",
  added: "tier-num-1",
  removed: "tier-num-4",
  changed: "tier-num-3",
};

function DiffList(props: { rows: DiffRow[] }): JSX.Element {
  const parent = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: props.rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 40,
    overscan: 12,
  });
  return (
    <div
      className="tw"
      ref={parent}
      style={{ maxHeight: 520, overflowY: "auto" }}
      role="list"
      aria-label="Crawl diff rows"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = props.rows[v.index];
          if (!row) return null;
          return (
            <div
              key={v.key}
              role="listitem"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${v.start}px)`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span
                className={`badge ${MODE_CLASS[row.mode] ?? ""}`}
                style={{ flex: "none" }}
              >
                {row.mode}
              </span>
              <span
                className="mono small"
                style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}
              >
                {pathOf(row.url)}
              </span>
              <span className="dim small nowrap">{row.statusCode ?? ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Crawls(ctx: Ctx): JSX.Element {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const crawls = useQuery({
    queryKey: ["crawls", ctx.siteId],
    queryFn: () => api<{ crawls: Crawl[] }>(`/api/crawls?siteId=${ctx.siteId ?? ""}`),
    enabled: Boolean(ctx.siteId),
  });

  const a = crawls.data?.crawls[0]?.id;
  const b = crawls.data?.crawls[1]?.id;
  const diff = useQuery({
    queryKey: ["crawls", "diff", a, b, filter],
    queryFn: () =>
      api<{ rows: DiffRow[] }>(`/api/crawls/${a}/diff?otherId=${b}&filter=${filter}`),
    enabled: Boolean(a && b),
  });

  return (
    <>
      <PageHeader
        kicker="Setup"
        title="Crawl explorer"
        lead="Diff any two crawls to see exactly what changed on the site between them — pages added, removed, or altered. Sean crawls weekly by default and uses ETag / If-Modified-Since to stay cheap."
        actions={
          crawls.data && crawls.data.crawls.length >= 2 ? (
            <Segmented
              value={filter}
              options={FILTERS}
              onChange={setFilter}
              ariaLabel="Crawl diff filter"
            />
          ) : null
        }
      />
      <AsyncBoundary
        query={crawls}
        loading="Loading crawls…"
        isEmpty={(d) => d.crawls.length < 2}
        empty={
          <EmptyState
            icon={<IconSpider className="ico" />}
            title={
              crawls.data?.crawls.length === 1 ? "One crawl so far" : "No crawls yet"
            }
            body={
              crawls.data?.crawls.length === 1
                ? "Sean needs two crawls to compute a diff. It crawls weekly by default, or you can trigger one from the CLI."
                : "Run a crawl to populate the explorer."
            }
            command={`sean audit ${ctx.origin ?? "https://example.com"}`}
          />
        }
      >
        {() => (
          <div className="stack">
            <AsyncBoundary
              query={diff}
              loading="Computing diff…"
              isEmpty={(d) => d.rows.length === 0}
              empty={<Note>No rows for this filter.</Note>}
            >
              {(d) => <DiffList rows={d.rows} />}
            </AsyncBoundary>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
