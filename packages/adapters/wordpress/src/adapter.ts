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

export type WordpressAdapterOptions = {
  origin: string;
  username: string;
  appPassword: string;
  fetch?: typeof fetch | undefined;
};

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

export function createWordpressAdapter(opts: WordpressAdapterOptions): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  const origin = opts.origin.replace(/\/+$/, "");
  const auth = basicAuth(opts.username, opts.appPassword);

  async function api(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", auth);
    headers.set("Content-Type", "application/json");
    return fetchFn(`${origin}${path}`, { ...init, headers });
  }

  const adapter: SiteAdapter = {
    kind: "wordpress",
    capabilities(): AdapterCapabilities {
      return { kind: "wordpress", reads: true, writes: true, pullRequests: false, rollback: true };
    },
    async read(target: ActionTarget): Promise<AdapterRead> {
      const res = await api(`/wp-json/sean/v1/seo?url=${encodeURIComponent(target.url)}`);
      if (!res.ok) throw new Error(`wordpress read ${res.status}`);
      const body = (await res.json()) as { title?: string; html?: string };
      const html = body.html ?? `<html><head><title>${body.title ?? ""}</title></head></html>`;
      return { targetRef: target.url, body: html, contentType: "text/html" };
    },
    async dryRun(action: Action): Promise<AdapterDryRun> {
      const title = requireTitle(action.payload);
      const read = await adapter.read(action.target);
      return {
        targetRef: action.target.url,
        before: read.body,
        after: patchHtmlTitle(read.body, title),
        summary: `wordpress title → ${title}`,
      };
    },
    async apply(action: Action): Promise<AdapterApplyResult> {
      const title = requireTitle(action.payload);
      const beforeRead = await adapter.read(action.target);
      const res = await api("/wp-json/sean/v1/seo", {
        method: "POST",
        body: JSON.stringify({
          url: action.target.url,
          title,
          changeId: action.id,
        }),
      });
      if (!res.ok) throw new Error(`wordpress apply ${res.status}: ${await res.text()}`);
      const after = patchHtmlTitle(beforeRead.body, title);
      return {
        targetRef: action.target.url,
        before: beforeRead.body,
        after,
        summary: `WordPress title on ${action.target.url}`,
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
      const res = await api(`/wp-json/sean/v1/rollback/${encodeURIComponent(change.actionId)}`, {
        method: "POST",
      });
      if (!res.ok && previous) {
        await api("/wp-json/sean/v1/seo", {
          method: "POST",
          body: JSON.stringify({ url: change.targetRef, title: previous, changeId: `revert-${change.id}` }),
        });
      }
      return {
        targetRef: change.targetRef,
        before: change.after,
        after: change.before,
        summary: `Rolled back WordPress title on ${change.targetRef}`,
      };
    },
  };
  return adapter;
}
