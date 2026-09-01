import {
  htmlTitle,
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
import { overlayFor, rewriteHtml, type OverlayMap } from "./rewrite.js";

export type CloudflareAdapterOptions = {
  origin: string;
  overlays?: OverlayMap | undefined;
  fetch?: typeof fetch | undefined;
  persist?: ((url: string, overlay: OverlayMap[string]) => Promise<void>) | undefined;
};

export function createCloudflareAdapter(opts: CloudflareAdapterOptions): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  const overlays: OverlayMap = opts.overlays ?? {};
  const origin = opts.origin.replace(/\/+$/, "");

  function keyOf(url: string): string {
    const u = new URL(url, origin);
    return `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}`;
  }

  const adapter: SiteAdapter = {
    kind: "cloudflare",
    capabilities(): AdapterCapabilities {
      return { kind: "cloudflare", reads: true, writes: true, pullRequests: false, rollback: true };
    },
    async read(target: ActionTarget): Promise<AdapterRead> {
      const res = await fetchFn(target.url);
      const html = await res.text();
      return { targetRef: target.url, body: rewriteHtml(html, overlayFor(target.url, overlays)), contentType: "text/html" };
    },
    async dryRun(action: Action): Promise<AdapterDryRun> {
      const title = requireTitle(action.payload);
      const originHtml = await (await fetchFn(action.target.url)).text();
      const after = rewriteHtml(originHtml, { title });
      return {
        targetRef: action.target.url,
        before: rewriteHtml(originHtml, overlayFor(action.target.url, overlays)),
        after,
        summary: `edge overlay title → ${title}`,
      };
    },
    async apply(action: Action): Promise<AdapterApplyResult> {
      const title = requireTitle(action.payload);
      const originHtml = await (await fetchFn(action.target.url)).text();
      const before = rewriteHtml(originHtml, overlayFor(action.target.url, overlays));
      const key = keyOf(action.target.url);
      overlays[key] = { title };
      if (opts.persist) await opts.persist(key, overlays[key]);
      return {
        targetRef: action.target.url,
        before,
        after: rewriteHtml(originHtml, overlays[key]),
        summary: `Cloudflare edge overlay on ${action.target.url}`,
      };
    },
    async verify(change: AppliedChange): Promise<AdapterVerifyResult> {
      const expected = htmlTitle(change.after);
      if (!expected) return { ok: false, detail: "no title in after snapshot" };
      const live = await verifyLiveTitle(change.targetRef, expected, async (url, init) => {
        const res = await fetchFn(url, init);
        const html = rewriteHtml(await res.text(), overlayFor(String(url), overlays));
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      });
      return { ok: live.ok, detail: live.detail };
    },
    async rollback(change: AppliedChange): Promise<AdapterApplyResult> {
      const previous = htmlTitle(change.before);
      const key = keyOf(change.targetRef);
      if (previous) overlays[key] = { title: previous };
      else delete overlays[key];
      if (opts.persist) await opts.persist(key, overlays[key] ?? {});
      return {
        targetRef: change.targetRef,
        before: change.after,
        after: change.before,
        summary: `Removed/restored edge overlay on ${change.targetRef}`,
      };
    },
  };
  return adapter;
}
