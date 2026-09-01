import { createHmac } from "node:crypto";
import { createHttpTitleAdapter } from "./http-title.js";
import type { SiteAdapter } from "@agentsean/actions";

export { createHttpTitleAdapter } from "./http-title.js";

export type TokenOpts = {
  origin: string;
  token: string;
  fetch?: typeof fetch | undefined;
};

function jsonWrite(
  kind: string,
  opts: TokenOpts,
  pathFor: (url: string) => string,
  bodyFor: (title: string) => unknown,
  extraHeaders?: Record<string, string>,
): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  return createHttpTitleAdapter({
    kind,
    fetch: fetchFn,
    write: async (url, title) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
      };
      if (extraHeaders) Object.assign(headers, extraHeaders);
      const res = await fetchFn(pathFor(url), {
        method: "PUT",
        headers,
        body: JSON.stringify(bodyFor(title)),
      });
      if (!res.ok) throw new Error(`${kind} write ${res.status}`);
    },
  });
}

/** Webflow Data API v2. No restore API — shadow ledger is mandatory. */
export function createWebflowAdapter(
  opts: TokenOpts & { pageId?: string | undefined },
): SiteAdapter {
  return jsonWrite(
    "webflow",
    opts,
    (url) => {
      const id = opts.pageId ?? encodeURIComponent(url);
      return `https://api.webflow.com/v2/pages/${id}`;
    },
    (title) => ({ seo: { title } }),
  );
}

function ghostJwt(id: string, secretHex: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }),
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }),
  ).toString("base64url");
  const sig = createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

/** Ghost Admin API. Token format id:hexSecret. */
export function createGhostAdapter(opts: {
  origin: string;
  adminKey: string;
  fetch?: typeof fetch | undefined;
}): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  const [id, secret] = opts.adminKey.split(":");
  if (!id || !secret) throw new Error("Ghost admin key must be id:hexsecret");
  const adapter = createHttpTitleAdapter({
    kind: "ghost",
    fetch: fetchFn,
    write: async (url, title) => {
      const token = ghostJwt(id, secret);
      const res = await fetchFn(
        `${opts.origin.replace(/\/+$/, "")}/ghost/api/admin/posts/?filter=url:${encodeURIComponent(url)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Ghost ${token}`,
            "Accept-Version": "v5.0",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ posts: [{ meta_title: title }] }),
        },
      );
      if (!res.ok) throw new Error(`ghost write ${res.status}`);
    },
  });
  return adapter;
}

/** Wix Item SEO Tags. SCOPE.PROMOTE.MANAGE-SEO. Unlisted install-link apps need zero review. */
export function createWixAdapter(
  opts: TokenOpts & { siteId?: string | undefined },
): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  return createHttpTitleAdapter({
    kind: "wix",
    fetch: fetchFn,
    write: async (url, title) => {
      const itemId = encodeURIComponent(url);
      const res = await fetchFn(
        `https://www.wixapis.com/promote/seo/v1/item-seo-tags/STATIC_PAGE/${itemId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: opts.token,
            "Content-Type": "application/json",
            ...(opts.siteId ? { "wix-site-id": opts.siteId } : {}),
          },
          body: JSON.stringify({
            itemSeoTags: { tags: [{ type: "title", children: title }] },
            fieldMask: "tags",
            publish: true,
          }),
        },
      );
      if (!res.ok) throw new Error(`wix write ${res.status}`);
    },
  });
}

/** BigCommerce store_v2_content. Merchant self-creates the token, no gate. */
export function createBigCommerceAdapter(opts: {
  storeHash: string;
  token: string;
  fetch?: typeof fetch | undefined;
}): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  return createHttpTitleAdapter({
    kind: "bigcommerce",
    fetch: fetchFn,
    write: async (url, title) => {
      const res = await fetchFn(
        `https://api.bigcommerce.com/stores/${opts.storeHash}/v2/pages`,
        {
          method: "PUT",
          headers: {
            "X-Auth-Token": opts.token,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ url, meta_title: title }),
        },
      );
      if (!res.ok) throw new Error(`bigcommerce write ${res.status}`);
    },
  });
}

export type HeadlessKind = "contentful" | "sanity" | "strapi" | "payload";

export function createHeadlessAdapter(opts: {
  kind: HeadlessKind;
  endpoint: string;
  token: string;
  fetch?: typeof fetch | undefined;
}): SiteAdapter {
  const fetchFn = opts.fetch ?? fetch;
  const adapter = createHttpTitleAdapter({
    kind: opts.kind,
    fetch: fetchFn,
    write: async (url, title) => {
      const res = await fetchFn(opts.endpoint, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${opts.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, title }),
      });
      if (!res.ok) throw new Error(`${opts.kind} write ${res.status}`);
    },
  });
  return adapter;
}
