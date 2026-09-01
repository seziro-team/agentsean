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

export const SHOPIFY_API_VERSION = "2026-07";

export type ShopifyAdapterOptions = {
  shop: string;
  accessToken: string;
  storefrontOrigin?: string | undefined;
  fetch?: typeof fetch | undefined;
};

export function refuseThemeFileWrite(): never {
  throw new Error(
    "Shopify theme file writes are unavailable. write_themes is a protected scope; Shopify denied the exemption on 2026-06-20 even for merchant-approved single-file edits. Use SEO fields, metafields, or a theme snippet the merchant pastes once. JSON-LD goes in via metafields.",
  );
}

export type ShopifyResource = {
  type: "product" | "collection" | "page" | "article";
  handle: string;
};

export function resourceFromUrl(pageUrl: string): ShopifyResource {
  const path = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
  const segs = path.split("/").filter(Boolean);
  if (segs[0] === "products" && segs[1]) return { type: "product", handle: segs[1] };
  if (segs[0] === "collections" && segs[1])
    return { type: "collection", handle: segs[1] };
  if (segs[0] === "pages" && segs[1]) return { type: "page", handle: segs[1] };
  if (segs[0] === "blogs" && segs[2]) return { type: "article", handle: segs[2] };
  return { type: "page", handle: segs[segs.length - 1] ?? "index" };
}

function shopHost(shop: string): string {
  const raw = shop.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return raw.includes(".") ? raw : `${raw}.myshopify.com`;
}

export function createShopifyAdapter(opts: ShopifyAdapterOptions): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  const host = shopHost(opts.shop);
  const gql = `https://${host}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const liveOrigin = (opts.storefrontOrigin ?? `https://${host}`).replace(/\/+$/, "");

  async function graphql(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    if (/themeFilesUpsert|themeFilesDelete|themeCreate|Asset/i.test(query)) {
      refuseThemeFileWrite();
    }
    const res = await fetchFn(gql, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": opts.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`shopify graphql ${res.status}`);
    const json = (await res.json()) as {
      data?: unknown;
      errors?: Array<{ message: string }>;
      extensions?: {
        cost?: {
          throttleStatus?: {
            currentlyAvailable?: number;
            restoreRate?: number;
            maximumAvailable?: number;
          };
        };
      };
    };
    if (json.errors?.length)
      throw new Error(json.errors.map((e) => e.message).join("; "));
    return json.data;
  }

  function liveUrl(target: ActionTarget): string {
    return target.url.startsWith("http") ? target.url : `${liveOrigin}${target.url}`;
  }

  const adapter: SiteAdapter = {
    kind: "shopify",
    capabilities(): AdapterCapabilities {
      return {
        kind: "shopify",
        reads: true,
        writes: true,
        pullRequests: false,
        rollback: true,
      };
    },
    async read(target: ActionTarget): Promise<AdapterRead> {
      const html = await (await fetchFn(liveUrl(target))).text();
      return { targetRef: liveUrl(target), body: html, contentType: "text/html" };
    },
    async dryRun(action: Action): Promise<AdapterDryRun> {
      const title = requireTitle(action.payload);
      const read = await adapter.read(action.target);
      return {
        targetRef: liveUrl(action.target),
        before: read.body,
        after: patchHtmlTitle(read.body, title),
        summary: `shopify seo.title → ${title}`,
      };
    },
    async apply(action: Action): Promise<AdapterApplyResult> {
      const title = requireTitle(action.payload);
      const before = await adapter.read(action.target);
      const resource = resourceFromUrl(action.target.url);
      const mutation =
        resource.type === "product"
          ? `mutation ($input: ProductInput!) { productUpdate(input: $input) { product { id seo { title } } userErrors { message } } }`
          : resource.type === "collection"
            ? `mutation ($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id seo { title } } userErrors { message } } }`
            : `mutation ($id: ID!, $title: String!) { pageUpdate(id: $id, page: { title: $title }) { page { id title } userErrors { message } } }`;
      await graphql(mutation, {
        input: { handle: resource.handle, seo: { title } },
        id: `gid://shopify/Page/${resource.handle}`,
        title,
      });
      return {
        targetRef: liveUrl(action.target),
        before: before.body,
        after: patchHtmlTitle(before.body, title),
        summary: `Shopify ${resource.type} SEO title ${resource.handle}`,
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
      if (!previous) throw new Error("no previous title to restore");
      const resource = resourceFromUrl(change.targetRef);
      await graphql(
        `
          mutation ($input: ProductInput!) {
            productUpdate(input: $input) {
              product {
                id
                seo {
                  title
                }
              }
              userErrors {
                message
              }
            }
          }
        `,
        { input: { handle: resource.handle, seo: { title: previous } } },
      );
      return {
        targetRef: change.targetRef,
        before: change.after,
        after: change.before,
        summary: `Rolled back Shopify SEO title on ${change.targetRef}`,
      };
    },
  };
  return adapter;
}
