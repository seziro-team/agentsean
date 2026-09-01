import {
  htmlTitle,
  patchHtmlTitle,
  requireTitle,
  verifyLiveTitle,
  type Action,
  type ActionTarget,
  type AdapterApplyResult,
  type AdapterCapabilities,
  type AdapterDryRun,
  type AdapterRead,
  type AdapterVerifyResult,
  type AppliedChange,
  type SiteAdapter,
} from "@agentsean/actions";

export type HttpTitleWriter = (
  url: string,
  title: string,
  before: string,
) => Promise<void>;

export function createHttpTitleAdapter(opts: {
  kind: string;
  fetch?: typeof fetch | undefined;
  write: HttpTitleWriter;
}): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  const adapter: SiteAdapter = {
    kind: opts.kind,
    capabilities(): AdapterCapabilities {
      return {
        kind: opts.kind,
        reads: true,
        writes: true,
        pullRequests: false,
        rollback: true,
      };
    },
    async read(target: ActionTarget): Promise<AdapterRead> {
      const res = await fetchFn(target.url);
      return {
        targetRef: target.url,
        body: await res.text(),
        contentType: "text/html",
      };
    },
    async dryRun(action: Action): Promise<AdapterDryRun> {
      const title = requireTitle(action.payload);
      const read = await adapter.read(action.target);
      return {
        targetRef: action.target.url,
        before: read.body,
        after: patchHtmlTitle(read.body, title),
        summary: `${opts.kind} title → ${title}`,
      };
    },
    async apply(action: Action): Promise<AdapterApplyResult> {
      const title = requireTitle(action.payload);
      const before = await adapter.read(action.target);
      await opts.write(action.target.url, title, before.body);
      return {
        targetRef: action.target.url,
        before: before.body,
        after: patchHtmlTitle(before.body, title),
        summary: `${opts.kind} title on ${action.target.url}`,
      };
    },
    async verify(change: AppliedChange): Promise<AdapterVerifyResult> {
      const expected = htmlTitle(change.after);
      if (!expected) return { ok: false, detail: "no title in after snapshot" };
      const live = await verifyLiveTitle(change.targetRef, expected, fetchFn);
      return { ok: live.ok, detail: live.detail };
    },
    async rollback(change: AppliedChange): Promise<AdapterApplyResult> {
      const previous = htmlTitle(change.before);
      if (previous) await opts.write(change.targetRef, previous, change.after);
      return {
        targetRef: change.targetRef,
        before: change.after,
        after: change.before,
        summary: `Rolled back ${opts.kind} title on ${change.targetRef}`,
      };
    },
  };
  return adapter;
}
