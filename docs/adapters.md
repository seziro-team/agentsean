# Platform adapters

Phase 8. Sean writes the same typed `Action` to the platforms customers actually
use. Every adapter implements `capabilities`, `read`, `dryRun`, `apply`,
`verify`, `rollback`. **Verify re-fetches live HTML.** A 200 from the write API
is not confirmation.

## WordPress

Companion plugin `plugins/wordpress` (`sean-bridge`, GPL-2.0-or-later). Auth is
Application Passwords. Yoast/Rank Math meta is registered for REST on every
public post type; AIOSEO and SEOPress keep their native write paths. The plugin
also exposes redirects, virtual `robots.txt`, JSON-LD, media alt, and a
revision-restore endpoint core lacks.

```bash
sean connect wordpress --api-key USER:xxxx-xxxx-xxxx-xxxx
```

The daemon stays AGPL. The plugin is a separate GPL-2.0-or-later work so it can
live in the WordPress.org directory.

## Shopify

Admin GraphQL only (`2026-07`). Writes `seo { title, description }` on products,
collections, pages, articles; metafields; `urlRedirect`; image alt via
`fileUpdate`. **Theme file writes are refused.** `write_themes` is a protected
scope; Shopify denied the exemption on 2026-06-20 even for merchant-approved
single-file edits. JSON-LD goes in via metafields consumed by a snippet the
merchant pastes once. Product structured data is the e-commerce priority
(Merchant API v1; Content API for Shopping v2.1 sunset 2026-08-18).

Rate limits are a leaky bucket. Read `extensions.cost.throttleStatus` off every
response — do not hardcode bucket sizes.

## Git / static

Next.js, Astro, Hugo, Jekyll, Docusaurus. URL→file resolution, branch + commit +
PR. Best rollback story in the product.

CI/CD assertion gate: Vercel silently omits `X-Robots-Tag: noindex` when a
custom domain is assigned to a non-production branch. Crawler bypass headers:

- Vercel: `x-vercel-protection-bypass`
- Cloudflare Access: `CF-Access-Client-Id` / `CF-Access-Client-Secret`

## Cloudflare edge overlay

Fallback for platforms with no write API (Squarespace has none). A Worker
patches HTML from an overlay map. **It never branches on user-agent or bot
signals.** That is cloaking. Identical HTML to every visitor, or it does not
ship.

## Others

Webflow Data API v2 (no restore API — shadow ledger mandatory), Ghost Admin API
(JWT from `id:hexsecret`), Wix `SCOPE.PROMOTE.MANAGE-SEO` (unlisted install-link
apps need zero review), BigCommerce `store_v2_content` (merchant self-creates
the token), Contentful / Sanity / Strapi / Payload.
