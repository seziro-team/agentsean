# 10 — CMS & Platform Write-Integrations: How the Agent Actually Applies Changes

**Research date:** 2026-08-31
**Scope:** For every major website platform: auth, exact write mechanism, what can/cannot be written, rate limits, preview/sandbox, rollback. Ends with an integration priority order and a universal `SEOChangeAdapter` interface spec.

**Source-quality legend used throughout:**
`[P]` = primary/official docs or changelog · `[C]` = official community/support forum · `[B]` = marketing/SEO blog (treat as weak) · `[STALE?]` = could only be verified from 2024 or earlier.

---

## 0. Executive summary — the shape of the problem

There are effectively **five classes** of write target, and our adapter layer should be designed around these five, not around 15 platform names:

| Class | Platforms | Write mechanism | Rollback |
|---|---|---|---|
| **A. Open self-hosted CMS** | WordPress, Drupal, Ghost, Strapi, Payload | Authenticated REST/JSON:API against the user's own server; near-total write access | Read-before-write snapshot + inverse write; native revisions |
| **B. Closed SaaS with a real write API** | Shopify, Webflow, Wix, HubSpot, Duda, Framer, Contentful, Sanity, Storyblok | Vendor API, scoped tokens, hard rate limits, no HTML-level control | Snapshot + inverse write; some have draft/publish separation |
| **C. Git-backed static** | Next.js, Astro, Hugo, Jekyll, Docusaurus, Nuxt | GitHub/GitLab API → branch + commit + PR | Native: revert the PR/commit. **Best rollback story of all.** |
| **D. Closed SaaS with NO write API** | Squarespace (SEO fields), Weebly, most page builders | None. Edge layer or human-in-the-loop only | N/A |
| **E. Edge overlay (universal fallback)** | Cloudflare Workers / Snippets, Netlify Edge, Vercel Middleware, Fastly | HTMLRewriter patching of `<head>` + 301s at the edge | Delete/disable the route; keep versioned KV config |

Two hard constraints shape the whole architecture:

1. **Almost no platform lets you write "a title tag."** They let you write *a field that the platform's own template renders into a title tag*. The adapter's job is to map an abstract `SEOChange` onto whatever field the platform actually owns, and to **verify by re-fetching the live HTML**, not by trusting the API's 200 response. Wix documents this explicitly: *"This method's own response isn't a read of the published revision either, so don't treat it as confirmation that the live page changed — check the live page to confirm that."* `[P]`
2. **WordPress is the only platform where you can write essentially everything, and it is also the platform where the SEO fields are partly hidden by default.** As of 2026, AIOSEO, SEOPress and Rank Math all ship usable native write paths, and Yoast ≥ 27.7 exposes three keys — **but only on the `post` post type**. So a companion WP plugin is still the single highest-leverage piece of code in the product: it is mandatory for Yoast sites writing to pages/CPTs/products/terms, and it is what gives us one normalized write surface instead of four code paths. (See §1.3 for the exact per-plugin, per-version matrix.)

---

## 1. WordPress (self-hosted) — the flagship integration

### 1.1 Auth: Application Passwords

**Mechanism:** WordPress ≥ 5.6 ships Application Passwords in core. Credentials are passed as HTTP Basic Auth (RFC 7617) over HTTPS. `[P]`

```
curl --user "USERNAME:xxxx xxxx xxxx xxxx xxxx xxxx" \
  https://site.com/wp-json/wp/v2/users?context=edit
```

**Exact user-facing steps to put in our onboarding UI:**
1. WP Admin → **Users → Profile** (or Users → Edit User for a dedicated agent user).
2. Scroll to **Application Passwords**.
3. Enter a name, e.g. `seo-agent`. Click **Add New Application Password**.
4. Copy the 24-character space-separated string. **WordPress never shows it again** (stored bcrypt-hashed in `usermeta` under `_application_passwords`).
5. Paste into our dashboard along with the username and site URL.

**Known failure modes to detect and surface with a fix-it message:**
- Application Passwords are **hidden on non-HTTPS sites** and can be disabled via the `wp_is_application_passwords_available` filter.
- Apache/CGI/FastCGI and many reverse proxies **strip the `Authorization` header**. Symptom: 401 with `rest_not_logged_in` even with correct credentials. Fix: add to `.htaccess`
  `SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1` (or the `CGIPassAuth On` directive).
- Security plugins (Wordfence, iThemes, "Disable REST API") frequently block `/wp-json/`. Our preflight check must GET `/wp-json/wp/v2/types` unauthenticated and `/wp-json/wp/v2/users/me?context=edit` authenticated, and report which one failed. The Redirection plugin's own docs describe exactly this class of failure (403 from a security plugin, 404 when REST is disabled). `[P]`

**Recommended posture:** create a **dedicated WP user** with `editor` or a custom role, not the site owner's admin account. Application Passwords inherit the user's capabilities; there is no scope system.

### 1.2 The core REST surface (always available)

| Change type | Endpoint | Notes |
|---|---|---|
| Body content / title / slug / excerpt | `POST /wp-json/wp/v2/posts/<id>` (also `pages`, and any CPT with `show_in_rest`) | Fields: `title`, `content`, `excerpt`, `slug`, `status`, `date` |
| Create draft | `POST /wp-json/wp/v2/posts` with `"status":"draft"` | **This is our preview mechanism** |
| **Image alt text** | `POST /wp-json/wp/v2/media/<id>` with `{"alt_text": "..."}` | `alt_text` is a **first-class schema field** on the media endpoint (maps to `_wp_attachment_image_alt`). No plugin needed. `[P]` |
| Image caption/description | same endpoint, `caption`, `description` | |
| Taxonomy | `/wp/v2/categories`, `/wp/v2/tags` | |
| Custom meta | `"meta": {...}` on the post payload | **Only for meta registered with `show_in_rest => true`** |
| Site title/tagline | `POST /wp-json/wp/v2/settings` | requires `manage_options` |

**Critical gotcha:** the `meta` object silently ignores unregistered keys. A 200 response does **not** mean the meta was written. Always read back.

### 1.3 SEO plugin meta — the exact situation per plugin (2026)

This is the single most important table in this document.

| Plugin | Exposed via REST by default? | Write mechanism | Exact keys |
|---|---|---|---|
| **Yoast SEO** | **Partially — and only since 27.7 (2026-05-27).** As of Yoast **27.7+** (current: 28.3, 2026-08-18), `inc/class-wpseo-meta.php` performs a *second* `register_meta()` call with `'show_in_rest' => true` for **exactly three keys**: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw`. So `POST /wp/v2/posts/{id}` with `{"meta":{"_yoast_wpseo_metadesc":"..."}}` **does** persist, no companion plugin needed. **The killer caveat:** that registration carries `'object_subtype' => 'post'`, scoping it to the `post` post type **only**. On `/wp/v2/pages`, any CPT, WooCommerce `product`, and **all taxonomy terms**, the meta is still NOT REST-writable and writes silently no-op with a 200 (Yoast's own code comment: *"Register only for 'post' post type. Other post types don't expose these fields."*). Canonical, OG/Twitter, cornerstone and robots keys remain non-writable at every version. On Yoast **≤ 27.6** nothing is REST-writable at all. Read access is additionally stripped for users lacking `edit_post` via a `rest_prepare_post` filter. Note this change has **no entry in the official 27.7 changelog** — it is an undocumented behavior change, so pin behavior by version detection, not by docs. The `/yoast/v1/` namespace and `yoast_head`/`yoast_head_json` remain **read-only** (Yoast docs, verbatim: *"The Yoast REST API is currently read-only, and doesn't currently support POST or PUT calls to update the data."*; the JSON form requires Yoast ≥ 16.7). `[P — verified by grepping the shipped 27.6 vs 27.7 vs 28.3 plugin ZIPs]` | **Detect `WPSEO_VERSION`.** ≥ 27.7 **and** target is a `post` → write the 3 keys via core `meta`. Otherwise (≤ 27.6, or target is a page/CPT/product/term, or any other field) → `register_post_meta(..., 'show_in_rest' => true)` from our companion plugin. | `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw` (**the only three REST-exposed, and only on `post`**); needing our plugin: `_yoast_wpseo_canonical`, `_yoast_wpseo_meta-robots-noindex` (`0/1/2`), `_yoast_wpseo_meta-robots-nofollow` (`0/1`), `_yoast_wpseo_opengraph-title`, `_yoast_wpseo_opengraph-description`, `_yoast_wpseo_opengraph-image`, `_yoast_wpseo_twitter-title`, `_yoast_wpseo_twitter-description`, `_yoast_wpseo_schema_page_type`, `_yoast_wpseo_schema_article_type` |
| **Rank Math** | **No** for the standard `meta` route — verified in 1.0.277.2 (2026-08-31): Rank Math makes **zero** `register_meta`/`register_post_meta` calls in its own code, so `rank_math_title`/`rank_math_description` are not writable via `/wp/v2/posts`. **But a companion plugin is NOT required.** | **Use Rank Math's own native write endpoint: `POST /wp-json/rankmath/v1/updateMeta`** (`includes/rest/class-shared.php`, `'methods' => WP_REST_Server::CREATABLE`, `'permission_callback' => Rest_Helper::get_object_permissions_check` which enforces `current_user_can('edit_post'/'edit_term'/'edit_user', $id)`). Body: `objectID`, `objectType` (`post`\|`term`\|`user`), `meta{}`. Bulk variant: `POST /wp-json/rankmath/v1/updateMetaBulk` (`includes/rest/class-post.php`). This is the same route Rank Math's own Gutenberg sidebar uses, so **Application Password / Basic auth works — no `wp_rest` nonce required** (the earlier "nonce-only" belief was wrong). It does **not** require the Headless CMS Support toggle (only the read-only `GET /wp-json/rankmath/v1/getHead?url=…` does). **Risks:** the endpoint is **undocumented** in the public KB (which documents only `getHead`), so it carries no stability contract; and it has a bad security history (missing `permission_callback` → unauthenticated privilege escalation in Rank Math < 1.0.41, CVE-2020-11514, patched 2020). Keep the register-meta fallback in our plugin as a hedge. `[P — verified in the shipped 1.0.277.2 ZIP]` | `rank_math_title`, `rank_math_description`, `rank_math_canonical_url`, `rank_math_robots` (array), `rank_math_focus_keyword`, `rank_math_advanced_robots`, `rank_math_facebook_title`, `rank_math_facebook_description`, `rank_math_twitter_title`, `rank_math_rich_snippet`, `rank_math_permalink` |
| **All in One SEO (AIOSEO)** | **YES — natively, free tier included.** AIOSEO adds `aioseo_head`, `aioseo_head_json` (read) and **`aioseo_meta_data` (read/write)** to core post/page/CPT endpoints. Verified in `app/Common/RestApi/Controllers/Post.php` of AIOSEO 5.0.1.1 (2026-08-28): `register_rest_field($postType, 'aioseo_meta_data', ['get_callback' => getMetaData, 'update_callback' => updateMetaData])` (`@since 4.9.8`), Lite **and** Pro. `aioseo_meta_data` is the **only** writable field. `[P — verified in the shipped ZIP]` | `POST /wp-json/wp/v2/posts/<id>` with body `{"aioseo_meta_data": {"title": "...", "description": "..."}}` | Keys inside `aioseo_meta_data` mirror AIOSEO's DB columns: `title`, `description`, `canonical_url`, `keyphrases`, `og_title`, `og_description`, `twitter_title`, `twitter_description`, `robots_default`, `robots_noindex`, `robots_nofollow`, `schema`. **Three gotchas:** (a) the field is only registered for post types whose `$postTypeObject->show_in_rest` is true; (b) writes require `current_user_can('edit_post', $postId)` **AND** one of `aioseo_page_general_settings`, `aioseo_page_social_settings`, `aioseo_page_schema_settings`, `aioseo_page_advanced_settings` (`Controllers/Base.php::canEditMetaData()`) — these are AIOSEO **custom caps**, so a plain Editor/Author may silently fail; (c) a site can disable writes entirely via the `aioseo_rest_api_allow_update` filter. Failures return silently (the update callback just `return`s) — **always read back**. `[P]` |
| **SEOPress** | **YES — first-class REST API.** The write routes have existed since **SEOPress 4.7.0** (`@since 4.7.0` docblock in `src/Actions/Api/TitleDescriptionMeta.php`); what **6.8** added was **Application Password authentication support** specifically. Terms and global-options routes came in 5.5+, redirections listing in 8.8+. Verified in SEOPress 10.1 (2026-07-29). `[P]` | Dedicated namespace `/wp-json/seopress/v1/...`. **Method is `PUT`, not `POST`.** Each route's `permission_callback` is `current_user_can('edit_post', $id)`. | `PUT /posts/{id}/title-description-metas` → `_seopress_titles_title`, `_seopress_titles_desc`; `PUT /posts/{id}/meta-robot-settings` → `_seopress_robots_*`, `_seopress_robots_canonical`; `PUT /posts/{id}/redirection-settings` → `_seopress_redirections_*`; `PUT /posts/{id}/social-settings`; `PUT /posts/{id}/target-keywords`; **PRO:** `GET/POST/PUT/DELETE /schemas`, `/posts/{id}/video-sitemap`, `/posts/{id}/google-news-settings`, `/posts/{id}/generate-metas-by-ai` |

**Design conclusion: we still ship a companion plugin — but for a narrower reason than "nothing is writable."**

Corrected picture (2026-09-01): you do **not** need a companion plugin for **AIOSEO** (native `aioseo_meta_data`), **SEOPress** (native `PUT /seopress/v1/...`), or **Rank Math** (native `POST /rankmath/v1/updateMeta`). The plugin is required for **Yoast**, and only when:
- the site runs **Yoast ≤ 27.6** (nothing REST-writable), **or**
- — and this is the case that hits **almost every real customer** — the target is a **page, CPT, WooCommerce product, or taxonomy term**, which Yoast does not expose at *any* version, **or**
- the field is anything other than title / meta description / focus keyword.

It is also required for the *normalized* surface (capabilities manifest, redirect abstraction, `robots.txt` filter, JSON-LD head hook, change ledger, dry-run) and as a hedge against Rank Math's undocumented endpoint changing. So: **branch on detected plugin + version; treat the bridge plugin as required for Yoast sites and strongly recommended everywhere else.** And because **all four plugins fail silently on capability errors**, always verify a write by re-reading the meta rather than trusting the 200.

### 1.4 Spec for our companion WordPress plugin (`seo-agent-bridge`)

Ship it on wordpress.org (free, GPLv2) *and* make it installable in one click from our dashboard via `POST /wp-json/wp/v2/plugins` (core endpoint, requires `install_plugins`). Design it to be **strictly additive and removable** — if the user deletes it, nothing breaks.

Responsibilities:

1. **Register SEO meta for REST.** On `init`, detect which SEO plugin is active **and its version** (`WPSEO_VERSION`, `class_exists('RankMath')`, `defined('AIOSEO_VERSION')`, `defined('SEOPRESS_VERSION')`) and `register_post_meta()` the corresponding keys with `show_in_rest => true`, `single => true`, `auth_callback => current_user_can('edit_post', $post_id)`, plus proper `sanitize_callback`. Do this for **every** public post type, including CPTs and WooCommerce `product`, **and for taxonomy terms** (`register_term_meta`) — terms are exposed by no SEO plugin at any version. Note Yoast ≥ 27.7 already registers `_yoast_wpseo_title`/`_yoast_wpseo_metadesc`/`_yoast_wpseo_focuskw` for REST **scoped to `object_subtype => 'post'`**; our registration must be **subtype-specific for the other post types** so it merges with (rather than fights) Yoast's own registration in `WP_REST_Meta_Fields::get_registered_fields()`.
2. **Expose a normalized capability manifest.** `GET /wp-json/seo-agent/v1/capabilities` returning: WP version, PHP version, active SEO plugin + version, active redirect plugin, whether `robots.txt` is physical or virtual, permalink structure, list of public post types, whether the theme is block/classic, sitemap provider, object cache in use, whether WP-Cron is disabled. Our planner branches on this.
3. **Normalized SEO write endpoint.** `POST /wp-json/seo-agent/v1/seo/{post_id}` taking a *plugin-agnostic* body (`{title, description, canonical, robots:{index,follow,max_snippet,...}, og:{}, twitter:{}, schema:[]}`) and translating to whichever plugin is installed. This means our adapter code doesn't need four code paths.
4. **Redirects abstraction.** `POST /wp-json/seo-agent/v1/redirects` that writes to Redirection / Rank Math redirections / Yoast Premium redirects / SEOPress redirects if present, else falls back to the plugin's own lightweight `wp_redirect` table on `template_redirect`.
5. **`robots.txt` and `llms.txt` filters.** Hook `robots_txt` filter (virtual robots.txt) so we can add/remove directives without touching the filesystem; write a physical file only if one already exists.
6. **Head injection for JSON-LD** via `wp_head` at priority 99, storing payloads in post meta `_seo_agent_jsonld` — needed when the SEO plugin can't express the schema type.
7. **Change log + rollback store.** Every write records `{post_id, field, old_value, new_value, ts, change_id}` in a custom table `wp_seo_agent_changes`. `POST /wp-json/seo-agent/v1/rollback/{change_id}` restores. This is our safety net on the one platform where we have the most power to break things.
8. **Dry-run mode.** Every write endpoint accepts `?dry_run=1` and returns the computed diff without persisting.
9. **Media optimization hooks (optional).** Regenerate WebP/AVIF via the existing image editor; never destroy originals.

**What we deliberately do NOT do in the plugin:** no direct SQL against `postmeta` bypassing the plugin's own storage (Yoast/Rank Math also maintain indexed tables — Yoast's `wp_yoast_indexable`, Rank Math's `wp_rank_math_internal_meta`). Writing raw meta can leave those caches stale. Prefer calling plugin APIs (`WPSEO_Meta::set_value()`, `RankMath\Helper::update_post_meta()`) where they exist and only fall back to `update_post_meta`. **Always trigger a re-index** (Yoast: `YoastSEO()->classes->get(Indexable_Post_Builder::class)`; simplest reliable path is `do_action('wpseo_save_indexable', ...)` or just re-save the post via `wp_update_post`).

### 1.5 WP-CLI (for self-hosted users who give us SSH)

Not required, but a large accuracy/perf win when available:
- `wp post meta update <id> _yoast_wpseo_metadesc "..."`
- `wp post list --post_type=post --format=json --fields=ID,post_title,post_name`
- `wp media regenerate --yes`
- `wp rewrite flush`
- `wp db export` before any bulk operation ← **best possible WordPress rollback**
- `wp plugin install seo-agent-bridge --activate`

Offer an "advanced: SSH/WP-CLI" connection mode. Detect with `wp --info`.

### 1.6 WordPress: what CAN and CANNOT be written

**CAN:** title tag, meta description, canonical, robots meta, OG/Twitter, JSON-LD (via plugin or our head hook), body HTML, headings (as part of body), internal links (body rewrite), image `alt_text`, slugs, taxonomies, redirects (via plugin), virtual `robots.txt`, sitemap settings, hreflang (Polylang/WPML REST or via head hook), scheduled publishing.
**CANNOT (without filesystem/theme access):** theme template markup (e.g. changing `<h1>` structure in a classic theme), server-level headers, `.htaccess` (unless we install a plugin that writes it — do not), Core Web Vitals fixes that require theme surgery.

### 1.7 WordPress.com (hosted) — different animal
`public-api.wordpress.com/wp/v2/sites/{site}/...` with OAuth2. Plugin installation (and therefore Yoast/Rank Math meta) is **Business plan and above only**. Free/Personal/Premium plans have no plugin support → SEO meta is limited to the built-in fields. Treat as a separate adapter with reduced capabilities. `[B]` — verify against `developer.wordpress.com` before shipping.

---

## 2. Shopify

### 2.1 Auth and app model — decide this early, it's expensive to change

Three options:

| Model | How the user gets credentials | Theme write access | App review |
|---|---|---|---|
| **Custom app (admin-created)** | Shopify admin → Settings → Apps and sales channels → **Develop apps** → Create an app → configure Admin API scopes → **Install app** → reveal **Admin API access token** (`shpat_...`) | Historically the only path that could write theme assets without an exemption | **None** |
| **Custom distribution app** (Partner Dashboard, single store) | Merchant installs via a generated link | Same scope machinery as public apps | None |
| **Public app (App Store)** | OAuth 2.0 authorization code grant | `write_themes` requires an **exemption** | Full app review |

**Recommendation for a self-hosted OSS tool: instruct the user to create a custom app in their own admin and paste the `shpat_` token.** This sidesteps app review entirely and is the only realistic path for theme-level work.
For our hosted $8/mo tier, we will eventually need a public app → OAuth → and an exemption request for `write_themes` under the **"Platform tools (SEO, content locking, developer tooling)"** exemption category, which Shopify explicitly lists as eligible. `[P]`

**Header:** `X-Shopify-Access-Token: shpat_...`
**Endpoint:** `POST https://{shop}.myshopify.com/admin/api/2026-07/graphql.json`

### 2.2 GraphQL only

- **2024-10-01:** the entire REST Admin API was marked **legacy/deprecated**. `[P changelog]`
- **2025-02-01:** REST product/variant endpoints stopped working for new apps.
- **2025-04-01:** *"all new public apps submitted to the App Store must only use GraphQL"*, and custom apps for new organizations must use GraphQL. `[P changelog]`

**Build GraphQL-only. Do not write a REST fallback.**

### 2.3 Rate limits (exact) `[P]`

| Plan (doc column name) | Points/second restore `[P]` | Bucket (`maximumAvailable`) — **observed, not documented** |
|---|---|---|
| Standard limit (Basic/Grow) | 100 | **2,000** |
| Advanced Shopify limit | 200 | **4,000** |
| Shopify Plus limit | 1,000 | **20,000** |
| Shopify for enterprise (Commerce Components) | 2,000 | **40,000** ⚠️ unverified — must be confirmed during implementation (inferred from the 20× ratio; never directly observed) |

> **Correction:** an earlier draft of this document listed buckets of 1,000 / 2,000 / 10,000 / 20,000 — **every one of those was exactly half the real value.** Those are the 20× buckets of the *pre-2024* restore rates (50 / 100 / 500, with Commerce Components then listed as "None"/unthrottled). Shopify doubled all tiers around Feb–May 2024 and the buckets doubled with them; the draft paired post-2024 rates with pre-2024 buckets.

**Read this carefully: Shopify does not publish bucket sizes anywhere.** The limits page lists **only** points/second, and says merely *"Each combination of app and store is given a bucket size and restore rate based on API and plan tier."* The bucket column above is derived from `extensions.cost.throttleStatus.maximumAvailable` values posted in real 2025–2026 responses on Shopify's own developer forum (restoreRate 100 → 2000 across topics 8059/16087/19556/20112/22172/23313/26828/36754/37104, 2025-02-11 → 2026-08-24; 200 → 4000 across 19963/22970/32572/36518/36720; 1000 → 20000 in 29274 and 36181). `[C]`

**⚠️ DO NOT HARDCODE BUCKET SIZES.** Two observed 2026 responses show `maximumAvailable: 7500` with `restoreRate: 100` — a bespoke, non-20× bucket (community.shopify.dev topics 34833 on 2026-06-02 and 32866 on 2026-04-02); another 2026-03-27 response still showed 1000/50. The docs also warn: *"Shopify may temporarily reduce API rate limits to protect platform stability."* **Read `extensions.cost.throttleStatus.{maximumAvailable, currentlyAvailable, restoreRate}` off every response and drive the token bucket from those values.** The table above is for capacity planning only.

Confirmed verbatim from `shopify.dev/docs/api/usage/limits` (2026-09-01):
- Leaky-bucket. *"A single query may not exceed a cost of 1,000 points, regardless of plan limits. This limit is enforced before a query is executed based on the query's requested cost."*
- *"Input arguments that accept an array have a maximum size of 250. Queries and mutations return an error if an input array exceeds 250 items."*
- Default field costs: Scalar 0, Enum 0, Object 1, Connection sized by `first`/`last`, **Mutation 10**. But *"Shopify also reserves the right to set manual costs on fields"* — so don't assume 10.
- Pagination capped at **25,000 objects**; count queries return **25001** as a sentinel above that. Use `bulkOperationRunQuery` beyond that.
- The **REST Admin API row has been removed from the limits table entirely** — only GraphQL Admin, Storefront, Payments Apps and Customer Account remain.
- Stores past **500,000 product variants** get an extra throttle: no more than **10,000 new variants per day**.

**The 250-item array cap is a global ceiling, not the operative one.** Individual mutations impose lower caps — notably `metafieldsSet`: *"Allows a maximum of 25 metafields to be set at a time, with a maximum total request payload size of 10MB."* That is the mutation an SEO meta rewrite actually uses, so **25, not 250**, is the batch size to design around.

**Practical consequence (corrected math):** on Standard, 100 pts/s ÷ 10 pts per default-cost mutation = **~10 mutations/s sustained**, with a 2,000-point bucket giving a **~200-mutation burst**. 20,000 SKUs × 1 mutation ≈ **33 minutes**, not "multi-hour." It only becomes hours once you add the read query, a second write, and retries (~20–40 pts/SKU → **65–130+ min**). The architectural conclusion is unchanged and in fact reinforced by the "temporarily reduce" clause: design the executor as a **durable, resumable queue with a token-bucket governor keyed on the shop domain**, not a for-loop — and prefer **`bulkOperationRunMutation`** for store-wide jobs.

### 2.4 What to write, per resource

| Target | Mutation | SEO field |
|---|---|---|
| Product | `productUpdate(input: ProductInput)` | `seo: { title, description }` (`SEOInput`), plus `title`, `descriptionHtml`, `handle`, `metafields` |
| Collection | `collectionUpdate` | `seo: SEOInput`, `handle`, `descriptionHtml` |
| Page | `pageUpdate` | `title`, `body`, `handle`, `metafield`/`metafields` |
| Blog article | `articleUpdate` | `title`, `body`, `handle`, `summary`, `image { altText }`, metafields |
| Blog | `blogUpdate` | |
| **Image alt text** | **`fileUpdate(files: [FileUpdateInput!]!)`** with `{ id, alt }`. `productUpdateMedia` is **deprecated → use `fileUpdate`**. `[P]` **Known bug:** setting `alt: ""` silently no-ops (returns success, doesn't persist). Use a single space or delete/recreate if you must clear. `[C, 2025/2026 forum]` |
| **URL redirects** | `urlRedirectCreate(urlRedirect: UrlRedirectInput{path, target})`, `urlRedirectUpdate`, `urlRedirectDelete`, `urlRedirectBulkDeleteAll`, `urlRedirectImportCreate` (CSV bulk) | **Scope: `write_online_store_navigation`** `[P]` |
| Metafields (any resource) | `metafieldsSet(metafields: [MetafieldsSetInput!]!)` — up to 25 per call | |

**The legacy SEO metafield path** (still valid and sometimes the only path for older code): namespace `global`, keys `title_tag` and `description_tag`, type `single_line_text_field`. Shopify's own "Optimize storefront SEO" guide documents products/collections/pages/blogs/articles all supporting this. **Do not use namespace `seo` with keys `title`/`description`** — that's the wrong pair and a common failure. `[P]`
Also documented: namespace `seo`, key `hidden`, type `number_integer` → adds `noindex, nofollow` to a resource. That is the **only supported per-resource robots control** on Shopify. `[P]`

**Scopes to request:** `read_products, write_products, read_content, write_content, read_online_store_pages, write_online_store_pages, read_online_store_navigation, write_online_store_navigation, read_files, write_files, read_themes` (+ `write_themes` only in the custom-app path).

### 2.5 Theme files — the 2023-04+ restriction, restated precisely

Official wording: *"If an app that's distributed in the Shopify App Store needs to use Asset resource `PUT` or `DEL` requests, then it needs to be granted an exemption by Shopify to use the `write_themes` access scope."* Deadline for existing apps to migrate or get an exemption was **March 31, 2024**. `GET` (reading theme files) needs **no** exemption. `[P]`

GraphQL equivalents: `themeFilesUpsert` (max **50 files per request**, returns an async `job`), `themeFilesCopy`, `themeFilesDelete`, `themeCreate`, `themePublish`. All gated behind `write_themes` + exemption for public apps. `[P]`

Exemption-eligible categories, verbatim from Shopify: page builders, backup and restoration, adding Liquid to repeating blocks, and **platform tools (SEO, content locking, developer tooling)**. Review turnaround ~2 weeks. `[P]`

**Our strategy:**
- **v1 (OSS, custom app):** use `themeFilesUpsert` for `robots.txt.liquid`, `sitemap`-adjacent templates, and JSON-LD snippets — but **always via a duplicated theme**, never the live one (see rollback below).
- **v1 (hosted/public app):** ship a **theme app extension** with an **app embed block** targeting `head`. Shopify renders app embed blocks and injects them **before the closing `</head>` and `</body>` tags**. `[P]` This is the sanctioned way to inject JSON-LD, hreflang `<link>` tags, and canonical overrides without touching theme code, and it survives theme updates. Theme app extensions require **no additional access scopes**. `[P]`
- Apply for the `write_themes` exemption in parallel, citing the SEO platform-tool category.

**`robots.txt.liquid`:** Shopify allows a custom `templates/robots.txt.liquid`. Since **2025-03-25** you can branch on `request.host` to emit per-domain rules for Shopify Markets. Shopify explicitly calls this an *unsupported customization* that Support won't help with, and strongly recommends keeping the default Liquid objects (`for group in robots.default_groups`) so their maintained defaults keep flowing through. `[P]`

**Sandbox/preview:** duplicate the theme (`themeDuplicate`/`themeCreate` from the live theme's source), apply changes to the **unpublished** copy, give the user the preview URL (`?preview_theme_id=`), then `themePublish` on approval. This is the cleanest preview+rollback story on any SaaS platform. Shopify also offers **development stores** (free, via Partner Dashboard) as a true sandbox for our own CI.

### 2.6 Shopify: CANNOT
- `<h1>`/heading structure inside theme templates (without theme file write).
- Server response headers, HTTP/2 push, `Link: rel=canonical` headers.
- `sitemap.xml` content (Shopify-generated; you can only exclude via the `seo.hidden` metafield).
- Arbitrary URL structure — `/products/`, `/collections/` prefixes are immutable.
- `robots.txt` on plans below... (all plans can edit `robots.txt.liquid` since 2021; but **only via theme file write**, so a public app without exemption cannot).
- Image compression at the CDN level (Shopify CDN handles it; you can only replace the file).

---

## 3. Webflow

**Auth:** Bearer token. Two flavors — **Site API token** (Site settings → Apps & integrations → API access → Generate API token; simplest for self-hosted users) or **OAuth 2.0 app** (needed for our hosted tier). Scopes are granular: `pages:read`, `pages:write`, `cms:read`, `cms:write`, `sites:read`, `sites:write` (publish).

**Key endpoints:**
- `GET /v2/sites/{site_id}/pages`
- `GET /v2/pages/{page_id}` — page metadata
- **`PUT /v2/pages/{page_id}`** — scope `pages:write`. Body: `title`, `slug`, `seo: { title, description }`, `openGraph: { title, titleCopied, description, descriptionCopied }`. Response includes `publishedPath`. `[P]`
- **Bulk page metadata: up to 100 pages in a single request** (shipped 2026-03-11 per the Webflow changelog) — `title`, `slug`, `seo`, `openGraph`. `[P]` **This is a big deal for us: 100 title/description fixes in one call.**
- `GET/POST/PATCH /v2/collections/{collection_id}/items` — CMS items. `PATCH /v2/collections/{cid}/items/{iid}/live` writes straight to the live item.
- `POST /v2/sites/{site_id}/publish` — publish to domains. **Limited to 1 publish per minute.** `[P]`
- `localeId` query param for localized pages. Secondary-locale **slug** changes require the Advanced or Enterprise localization add-on. `[P]`

**Rate limits (exact) `[P]`:**
| Plan | req/min |
|---|---|
| Starter, Basic | 60 |
| CMS, eCommerce, Business | 120 |
| Enterprise | custom |

Per-API-key. Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` on 429. Cached CDN reads are effectively unlimited.

**CAN write:** page SEO title/description, OG title/description, slug, CMS field values (including any rich-text body and any custom "SEO" fields the designer created), CMS item publish state, site publish.
**CANNOT write:** the Designer canvas / DOM structure (that's the separate **Designer Extension API**, which only runs inside the Designer app, not server-side), custom code in `<head>` per page (site-level custom code is Site settings only; there is no Data API v2 endpoint for it — **verify before relying on it**), `robots.txt` (Site settings UI only), 301 redirects (Site settings → Publishing → 301 redirects; **no Data API endpoint** — this is a real gap; flag it to users and route to the edge layer).

**Preview/rollback:** Webflow keeps site **backups** (Site settings → Backups) and CMS items have a draft state. Our rollback = read-before-write snapshot + inverse `PUT`. There is no atomic transaction. **Publishing is site-wide**, so batch all changes, then publish once.

---

## 4. Wix — surprisingly good, and explicitly AI-aware

Wix shipped a proper **SEO API family**: **Site SEO Tags**, **SEO Patterns**, and **Item SEO Tags**. `[P, dev.wix.com]`

**Auth:** Wix OAuth app (App Market or a private "Custom App" installed on the user's site) or API key + `wix-site-id` header. **Required scope: `SCOPE.PROMOTE.MANAGE-SEO`** ("Manage SEO Settings"). `[P]`

**The write endpoint (exact):**
```
PATCH https://www.wixapis.com/promote/seo/v1/item-seo-tags/{itemType}/{itemId}
Body: { "itemSeoTags": { "tags": [...], "focusKeywords": [...] }, "fieldMask": "tags" }
Query/body: publish: true|false
```
`[P]`

**Item types:** `STATIC_PAGE`, `BLOG_POST`, `STORES_PRODUCT`, bookings services, events (`EVENTS_PAGE` is **read-only** — writes not yet supported), portfolio collections, and `WIX_DATA_PAGE_ITEM-{pageId}` for dynamic pages.

**Tag model:** each tag is `{ type, props, meta, children, custom, disabled }` where `type ∈ {title, meta, script, link}`.
- `title` → use `children` for the text.
- `meta` → `props: {name: "description", content: "..."}` — also `robots`, OG, Twitter.
- `link` → `props: {rel: "canonical", href: "..."}`.
- **`script` with `props.type: "application/ld+json"` and the JSON-LD in `children` → this is how you write structured data.** `[P]`

**Hard limits and traps (all from official docs, all load-bearing):** `[P]`
- `tags` max **100** items; `focusKeywords` max **5**; `resolvedTags` max 500.
- **`tags` replaces the item's tags in full.** Read first, merge, write the complete set. To revert to inherited values, call **Reset Item SEO Tags To Default** — sending an empty list is wrong.
- **`custom: true` on a `title` or `script` tag is rejected with `TAG_TYPE_NOT_ALLOWED`.** For JSON-LD, omit `custom` or set it `false`.
- **Site SEO Tags rejects `script` unconditionally** → *"There is currently no way to set site-wide, every-page structured data through any of these APIs — write a per-page `script` tag through the Item SEO Tags API instead."*
- **Writes are primary-language only.** Sending `language` fails with `LANGUAGE_NOT_SUPPORTED` even if `fieldMask` doesn't name it. **So Wix hreflang/multilingual SEO is not writable today.**
- **Static pages:** `publish: true` updates only the *published* revision and **does not update the saved/draft revision**; `Get`/`List` always read the saved revision, so they will keep returning stale values. **Do both writes** (with and without `publish`) or accept divergence.
- `publishStatus` for `STATIC_PAGE` always returns `PUBLISH_STATUS_UNSPECIFIED` — it cannot tell you whether a page is live.
- Bulk variant: **Bulk Set Item SEO Tags** (per-item results so one bad item doesn't fail the batch).
- Errors: `INVALID_FIELD_MASK`, `INVALID_TAGS` (incl. unsupported `robots` directives), `UNSUPPORTED_ITEM_TYPE`, `ITEM_NOT_FOUND`.

**Notably, Wix models an `Origin` enum that includes `ORIGIN_AI`: "An AI agent or an automated suggestion flow."** Wix is explicitly designing for agents like ours.

**Velo (`wix-seo` module)** is the in-site alternative for runtime tag manipulation, but it requires code in the site — treat as a fallback, not primary.

**CANNOT:** body content (use Wix Blog/Stores/Data APIs separately), redirects (Wix has a URL Redirects API for site migrations — **verify**; the SEO API doesn't do it), `robots.txt` (dashboard only), image alt text (per-collection APIs).

---

## 5. Squarespace — **confirmed: no SEO or content write API**

**The headline holds, but the earlier "only three product lines" description was wrong** — Squarespace ships far more APIs than that; none of them touch content or SEO. Corrected picture as of **2026-09-01**:

**Confirmed: there is no public, supported Squarespace API that reads or writes SEO titles, meta descriptions, or page content.** Squarespace's own API-key UI offers exactly four permission scopes — **Orders, Forms, Inventory, Transactions** — and no SEO/content/pages scope exists anywhere in the documented surface. SEO titles/descriptions are edited only through **Page Settings → SEO** in the UI. `[P]`

**What the developer platform actually ships.** The authoritative Developer Tools list (support.squarespace.com article 41325887099533) names **~15 APIs**: Acuity, Contacts, Discounts, Domains Search, Domains Management, Incoming Webhooks, Inventory, Orders, Products, Profiles, Reseller, Scripts, Transactions, UI Component Registrations, Webhook Subscriptions — with the note that *"some of these Developer Tools are available for use by all developers, and some are invite-only."* **None of the 15 touch page content or SEO metadata.** `[P]`

**The Reseller API is NOT "coming soon" — it is live in production.** It has its own status page (status-resellerapi.squarespace.com) reporting "All Systems Operational," 100.0% uptime over 90 days, and scheduled maintenance windows into Sept 12–13, 2026. The "Coming soon" label on the developers.squarespace.com marketing homepage is a **stale marketing page — do not cite it.** Caveat: the Reseller API is gated behind the Reseller Program (partner/invite) and provisions **sites and domains, not content**, so it does not help us. `[P — the production status page is the stronger primary source; developers.squarespace.com and developers-preview.squarespace.com disagree with each other on this and should both be treated as subordinate to it.]`

**A "Websites API" exists but is read-only.** Three GET endpoints: `/1.0/authorization/member`, `/1.0/authorization/website` (returns `currency`, `id`, `language`, `location`, `measurementStandard`, `siteId`, `timeZone`, `title`, `url`), and `/1.0/commerce/store_pages` (returns `id`, `isEnabled`, `title`, `urlSlug`). **No POST/PUT/PATCH.** The `title` it returns is the **site** title, not a page SEO title, and there is **no meta description field anywhere.** `[P]`

**There is now an official Squarespace MCP server — and it does not help.** `developers-preview.squarespace.com/mcp/overview` exposes exactly **two read-only tools**, `domains_generate_names` and `domains_search`, requires no authentication (*"no API key, OAuth flow, or Squarespace account is needed"*), and explicitly cannot register domains or charge payment methods. **Zero content or SEO capability.** Expect this to be raised internally as a counter-argument; it is not one. `[P]`

**Write access that does exist is commerce-only and irrelevant to SEO:** the Products API can create/edit/remove products and variants; Inventory, Orders, Discounts, Contacts and Webhook Subscriptions also write. **None expose a per-page SEO title or meta description field.** (This also resolves open question #6 below: the Products API does **not** give us product SEO metadata.)

**Plan gating makes the SMB case worse.** Commerce API keys (Orders, Inventory, Transactions) require **Core, Plus, Advanced, or Commerce Advanced**. The Forms API key requires Core, Plus, Advanced, Business, Commerce Basic or Commerce Advanced. **Squarespace's cheapest/Personal tier — where much of our SMB target segment sits — gets no API key at all.** So even the commerce surface is unavailable to a chunk of the addressable market. `[P]`

### 5.1 🚫 The tempting shortcut is a ToS violation — flag this to engineering now

An **undocumented internal endpoint set** (`/api/content/SaveSiteContent`, `/api/config/SaveInjectionSettings`) *does* allow full content editing, and third-party MCP servers (e.g. 141+-tool community wrappers, MCPEngage) use it via **captured Squarespace session cookies plus a session "crumb" CSRF token**. **We must not.** Squarespace's Developer Terms prohibit it in explicit terms:

> *"Squarespace APIs which are not listed here are not Developer Tools. You are not authorized to use any software which is not a Developer Tool."*

and forbid *"Access or attempt to access our Developer Tools by any means other than as described in the Documentation."* On top of the contractual problem, the technique requires **harvesting and storing customers' session cookies** — an auth-credential-custody liability. **Not shippable. Do not prototype it.** `[P — squarespace.com/developer-terms]`

### 5.2 Implications (revised)

- Squarespace remains a **class-D platform**. Our only options are (a) generate a human task list ("here are 42 pages with missing meta descriptions, here is the text, click here to open each page's SEO panel"), or (b) the **Cloudflare edge layer** if the user proxies their domain through Cloudflare (Squarespace supports custom domains behind Cloudflare, though it is fiddly and Squarespace does not officially support proxying).
- **The edge overlay is therefore a hard dependency for any write-like support on this segment**, not a nice-to-have — which reinforces the priority of the Cloudflare Workers layer (§13, priority #5).
- **Positioning honesty check:** a "works on any website" claim is only defensible if "works" is explicitly defined to include **advisory and edge-overlay modes**. It is **not** honest if it implies a native write adapter for Squarespace. Fix the marketing copy accordingly.
- Squarespace does support **code injection** (site-wide header/footer, per-page header) in the UI — a human can paste our JSON-LD loader once and then we manage it via a small JS loader. This is a legitimate v2 escape hatch.
- **Live migration risk:** Squarespace is **decommissioning the old OAuth application creation form on 2026-09-30** in favor of self-service OAuth app creation. If we ever build any Squarespace adapter (even read-only, e.g. for site discovery), **build against the new self-service OAuth flow.** `[P]`

**Product decision (unchanged, and now better supported): do not build a Squarespace write adapter. Build a Squarespace *advisory* adapter + a first-class "manual task queue" UX, with the Cloudflare edge overlay as the only write path.** That queue is reusable for every class-D platform.

---

## 6. Ghost

**Auth:** Ghost Admin API key from Settings → Integrations → Add custom integration. Format `{id}:{secret}` (hex). You must mint a **short-lived JWT**: `[P]`
- Header: `{ alg: "HS256", typ: "JWT", kid: <id> }`
- Payload: `{ iat, exp (max iat + 5 minutes), aud: "/admin/" }`
- Sign with `Buffer.from(secret, 'hex')` — **the secret must be hex-decoded to binary before signing.**
- Send `Authorization: Ghost <token>` and an `Accept-Version` header.

**Base URL:** `https://{admin_domain}/ghost/api/admin/`

**Endpoints:** `/posts/`, `/pages/` (browse/read/edit/add/copy/delete), `/images/upload/`, `/themes/upload|activate`, `/webhooks/`, `/site/` (read), `/tiers/`, `/newsletters/`.

**Writable SEO fields on a post/page (this is one of the richest field sets of any platform):** `meta_title`, `meta_description`, `og_title`, `og_description`, `og_image`, `twitter_title`, `twitter_description`, `twitter_image`, `canonical_url`, `codeinjection_head`, `codeinjection_foot`, `custom_excerpt`, `feature_image`, `feature_image_alt`, `feature_image_caption`, `slug`, `tags`, `html`/`lexical`, `visibility`, `published_at`. `[P]`

**JSON-LD:** write to `codeinjection_head` per post — clean and fully supported.
**Redirects:** Ghost uses a `redirects.json`/`redirects.yaml` file uploaded via Settings → Labs (`POST /db/redirects/upload/` on some versions — **verify against the current Admin API version**).
**`robots.txt`:** theme-level (`/robots.txt` in the theme package) — writable by uploading a theme, which is heavy. Prefer Ghost's default.

**Critical mechanic:** `PUT /posts/{id}/` **requires the current `updated_at` value in the payload** as collision protection. If it doesn't match, Ghost rejects the edit. This is **built-in optimistic locking** — our adapter should treat it as the model for every platform. `[P]`

**Pagination:** defaults to 15 records. **Rate limits:** Ghost(Pro) applies rate limiting on auth endpoints; the Admin API content endpoints are not documented with hard numbers — self-throttle to ~5 req/s and honor 429s.

**Preview:** create/update with `status: "draft"` → Ghost generates a preview URL (`/p/{uuid}/`). Excellent preview story.
**Rollback:** Ghost has post revision history in newer versions; still, snapshot before write.

---

## 7. Headless CMSs

All of these are "class B with a good API." The work is not the API — it's **field mapping**, because in a headless CMS the SEO fields are whatever the developer named them.

**Design rule: for every headless adapter, run a one-time "schema introspection + field mapping" wizard** that shows the user their content type's fields and asks them to map `seoTitle`, `seoDescription`, `canonical`, `ogImage`, `body`, `slug`. Persist the mapping. Never guess.

### Contentful (CMA)
- Base: `https://api.contentful.com`; `Authorization: Bearer <CMA token>`. Personal Access Token from Settings → API keys → Content management tokens (or an OAuth app for the hosted tier).
- `PUT /spaces/{space}/environments/{env}/entries/{id}` with header **`X-Contentful-Version: <n>`** — **mandatory optimistic locking**; a mismatch returns 409. Publish separately: `PUT .../entries/{id}/published` with `X-Contentful-Version`.
- **Environments are a first-class sandbox**: clone `master` → `seo-agent-staging`, apply, verify, then merge/apply to master. Best sandbox model of any headless CMS.
- **Rate limits:** the official docs page 429'd during research. Community/blog consensus is **~7 requests/second for the CMA** (10 hard cap) with an hourly limit, `X-Contentful-RateLimit-Reset` on 429. `[B/C — VERIFY against contentful.com/developers/docs/references/content-management-api/ before shipping]`

### Sanity
- `POST https://{projectId}.api.sanity.io/v{date}/data/mutate/{dataset}` with `Authorization: Bearer <write token>`.
- Mutations: `patch` with `set`/`unset`/`setIfMissing`, plus `ifRevisionID` for optimistic locking. **Transactions batch many mutations atomically** — use them.
- **Rate limit: 25 requests/second combined across `POST /data/mutate` and `POST /data/actions`.** `[C — sanity.io/answers, 2025]` Request body cap **4 MB**.
- Draft/published is native (`drafts.` document ID prefix) → **excellent preview model.**
- Sanity has **document history/revisions** → real rollback.

### Strapi (self-hosted, v5)
- `PUT /api/{plural-api-id}/{documentId}` with `Authorization: bearer <API token>`.
- Tokens: Settings → API Tokens (Content API) vs **Admin Tokens** (admin routes). **They are not interchangeable — a Content API token is rejected on admin routes and vice versa.** `[P]`
- Draft & Publish is per-content-type; `status=draft|published` query param in v5.
- Rate limits: self-hosted → whatever the user's server allows. Strapi Cloud has its own.

### Payload CMS
- REST auto-generated from collection configs: `PATCH /api/{collection}/{id}`.
- Auth: enable `auth.useAPIKey: true` on a collection, then header **`Authorization: {collection-slug} API-Key {key}`** (case-sensitive, note the collection slug prefix — a common integration bug). `[P]`
- Versions/drafts are opt-in per collection (`versions: { drafts: true }`). If enabled → preview + rollback for free.

### Storyblok
- Management API: `https://mapi.storyblok.com/v1/spaces/{space_id}/stories/{story_id}` (PUT), `Authorization: <personal access token>`.
- `publish=1` query param publishes on save; otherwise it stays a draft. **Native draft/publish → good preview.**
- Rate limits documented on storyblok.com/docs/api/management — **exact numbers not verified in this pass; the SDK sets different limits for CDN vs Management API.** `[VERIFY]`
- Storyblok has a **Visual Editor preview URL** we can deep-link the user into for approval.

---

## 8. Git-backed static sites — the best-rollback platform, and our differentiator

### 8.1 Mechanism (GitHub; GitLab is near-identical)

**Auth options, in order of preference:**
1. **GitHub App** (best for hosted tier): fine-grained permissions (`contents: write`, `pull_requests: write`, `metadata: read`), installation access tokens, and higher rate limits. User clicks "Install app", picks repos.
2. **Fine-grained PAT** (best for self-hosted): user creates at github.com/settings/personal-access-tokens with repo-scoped `Contents: Read and write` + `Pull requests: Read and write`.
3. Classic PAT with `repo` scope (discouraged — too broad).

**The commit flow (use the Git Data API, not the Contents API, so all files land in one commit):**
```
GET  /repos/{o}/{r}                      → default_branch
GET  /repos/{o}/{r}/git/ref/heads/{base} → base sha
POST /repos/{o}/{r}/git/blobs            → one per changed file (content, encoding: base64)
POST /repos/{o}/{r}/git/trees            → base_tree = base commit tree, entries: {path, mode:"100644", type:"blob", sha}
POST /repos/{o}/{r}/git/commits          → {message, tree, parents:[base_sha]}
POST /repos/{o}/{r}/git/refs             → {ref: "refs/heads/seo-agent/2026-08-31-meta-fixes", sha: commit_sha}
POST /repos/{o}/{r}/pulls                → {title, head, base, body}
POST /repos/{o}/{r}/issues/{n}/labels    → ["seo-agent","automated"]
```
(Or just use `octokit-plugin-create-pull-request`, which implements exactly this.)

**Rate limits (exact) `[P]`:**
| Identity | Primary limit |
|---|---|
| Unauthenticated | 60 / hour |
| Personal access token | 5,000 / hour |
| GitHub App installation (default) | 5,000 / hour |
| GitHub App on Enterprise Cloud | 15,000 / hour |
| GitHub App scaled (non-EC) | +50/hr per repo beyond 20 and per user beyond 20, **capped at 12,500/hr** |
| OAuth app (client credentials) | 5,000 / hour (15,000 EC) |
| `GITHUB_TOKEN` in Actions | 1,000 / hour per repository (15,000 for EC) |

Note on the App-installation rows: **5,000/hour is a *floor* for GitHub App installations, not their ceiling.** Non-Enterprise installations scale up automatically (+50/hr per repo beyond 20 **and** +50/hr per org user beyond 20, capped at 12,500/hr); Enterprise Cloud-owned installations get a flat 15,000/hr. Do not size the architecture against a hard 5,000 — that understates available headroom. `[P]`

Also new since this doc's predecessor: as of the **2025-07-21 changelog, request timeouts now count against your primary rate limit.** `[P]`

**Secondary limits `[P]` (verbatim from docs.github.com, API version 2026-03-10):**
- **≤ 100 concurrent requests** — *"shared across the REST API and GraphQL API."*
- **≤ 900 points/minute for REST endpoints, and ≤ 2,000 points/minute for the GraphQL API endpoint** — ⚠️ **this is PER ENDPOINT, not a global account-wide cap.** The doc's trigger heading is *"Make too many requests to a single endpoint per minute."* It is measured in **points, not requests**: GET/HEAD/OPTIONS = 1 point, POST/PATCH/PUT/DELETE = 5 points (GraphQL: query = 1, mutation = 5). So 900 pts/min per endpoint ≈ **up to 180 writes/min against any single endpoint** — far looser than a flat 900-requests reading, and **never the binding constraint for our workflow.** (An earlier draft described this as a flat 900 requests/minute account-wide and omitted the GraphQL figure; both were wrong.)
- **≤ 90 seconds of CPU time per 60 seconds of real time** (no more than 60 of those seconds for GraphQL).
- **≤ 2,000 OAuth access token requests per hour.**
- **≤ 80 content-generating requests/minute and ≤ 500/hour.** Trigger heading: *"Create too much content on GitHub in a short amount of time."*

**What the content-generation cap actually costs us — corrected.** One PR per fix costs roughly **4–6 content-generating writes** (create blob, create tree, create commit, create/update ref, create PR — or fewer via the Contents API: one PUT per file + ref + PR). At ~5 writes/PR, 500/hour permits roughly **100 PRs per hour**, *not* "we hit the ceiling almost immediately." The tighter practical constraint on bursts is the 80/minute limit, and GitHub's own best-practices page already caps you below it: *"If you are making a large number of POST, PATCH, PUT, or DELETE requests, wait at least one second between each request"* → **60 writes/min max by policy.** The consequence of tripping a secondary limit is a **403 or 429 with a `retry-after` header** (wait that many seconds; absent the header, wait ≥ 1 minute then exponential backoff) — not a durable soft-ban.

**Caveats that cut the other way, and that we must design around:**
- *"Some endpoints have lower content creation limits."*
- *"Content creation limits include actions taken on the GitHub web interface as well as via the REST API and GraphQL API"* — **human maintainers clicking around in the web UI under the same account consume the same 500/hour budget.**
- *"These secondary rate limits are subject to change without notice"*, and you may hit one *"for undisclosed reasons."*
- ⚠️ **unverified — must be confirmed during implementation:** GitHub publishes **no definitive list** of which endpoints are "content-generating." The only documented examples are creating issues, posting comments, and modifying pull requests. **Whether Git Data API blob/tree/commit creation counts is undocumented.** Do not architect around an assumption either way — test empirically against a scratch repo and instrument the 403/429 rate.

**Conclusion (revised):** batching many file changes into a single commit and PR is still the right call — it conserves the 500/hour budget, avoids review noise, and is robust to GitHub silently tightening these undisclosed limits. But it is a **scaling-headroom decision, not an emergency**: the ceiling only binds at roughly **100 PRs/hour**. Batch aggressively anyway: **one PR containing 200 file changes, not 200 PRs.**

### 8.2 Finding the right file for a URL — the actual hard problem

This is the part everyone underestimates. Algorithm:

1. **Detect the framework** by reading `package.json` (deps: `next`, `astro`, `@docusaurus/core`, `nuxt`, `gatsby`), or `config.toml`/`hugo.toml` (Hugo), `_config.yml` (Jekyll).
2. **Build a URL→file index** using framework conventions:
   - **Next.js App Router:** `app/**/page.{tsx,jsx,mdx}` → route = directory path; `[slug]` segments resolve via the data source. Metadata lives in the exported `metadata` object or `generateMetadata()`.
   - **Next.js Pages Router:** `pages/**/*.{tsx,js,mdx}`; metadata in `<Head>`/`next-seo`.
   - **Astro:** `src/pages/**/*.{astro,md,mdx}` → route mirrors path; frontmatter `title`/`description`; content collections in `src/content/**` with a `[...slug].astro` renderer.
   - **Hugo:** `content/**/*.md` → permalink from frontmatter `slug`/`url` + `permalinks` config; frontmatter `title`, `description`, `canonical`, `aliases` (**Hugo `aliases` = built-in redirects**).
   - **Jekyll:** `_posts/YYYY-MM-DD-slug.md` + `permalink` frontmatter; `jekyll-redirect-from` plugin gives `redirect_from:`.
   - **Docusaurus:** `docs/**/*.md` + `slug`/`id` frontmatter; `blog/**`.
3. **Verify the index** by cross-referencing the live sitemap.xml and, where ambiguous, by grepping the repo for a distinctive string from the live page's `<title>` or first `<h1>`.
4. **Persist the mapping** in our DB with a confidence score; never write to a file below a confidence threshold — queue it for human confirmation instead.

**Write targets in a static repo:** YAML/TOML/JSON frontmatter keys (`title`, `description`, `canonical`, `image`, `noindex`), markdown body (headings, internal links), `public/robots.txt`, `static/robots.txt`, `netlify.toml` `[[redirects]]`, `vercel.json` `redirects`, `_redirects`, `next.config.js` `redirects()`, Hugo `aliases`, `sitemap` config, and image files (compressed/converted).

**Sandbox/preview:** free and excellent. Vercel/Netlify/Cloudflare Pages **deploy previews on every PR**. Our dashboard should surface the preview URL and, ideally, run our own Lighthouse/crawl against it before asking for approval.
**Rollback:** `git revert` / close the PR. **This is the only platform where rollback is genuinely free and complete.**

**Marketing angle:** "Your SEO agent opens pull requests." Developers trust this in a way they will never trust an agent with an admin password.

---

## 9. Framer

Two APIs, both relevant:
- **Plugin API 3.0** (March 2025): plugins get access to **all** CMS collections (not just plugin-managed ones), can create posts, bulk-edit, find/replace. Runs **inside the Framer editor** — requires the user to have Framer open. `[P, framer.com/updates]`
- **Framer Server API** (2026): *"programmatic access from any server without having to open Framer."* npm package `framer-api`. Auth: **generate an API key in the project's Site Settings → General**; the key authenticates as the creating user and is **bound to a specific project**. Connect via `connect(apiKey, "https://framer.com/projects/<id>")`. Documented operations: retrieve project info, list changed paths since last publish, **publish preview versions**, **promote a version to production**, query added/removed/modified files, sync CMS collections, update the canvas, change project settings. `[P, docs page dated 2026-08-31]`

**Assessment:** Framer's Server API is new and evolving. **Rate limits and plan requirements are not documented** — flag as unknown. The publish-preview-then-promote flow is exactly the dry-run/approve model we want. **Treat Framer as a tier-3 integration** until the docs stabilize, but build the adapter against the Server API (not the Plugin API), because our agent is headless.

---

## 10. Duda

- REST, base `https://api.duda.co`. HTTP Basic auth with API user + password (Partner-level credentials). `[P]`
- **Pages API accepts an `seo` object** to set page title, meta description, OG image, and **index status** (`no_index`). `[B/P — duda.co/website-builder/automation is a marketing page; verify the exact field names in developer.duda.co/reference before shipping]`
- Also documented as API-automatable: **URL redirects and schema/JSON-LD injection**, plus a **Duda MCP server** for LLM-driven operations.
- **Rate limit: 10 calls/second, 429 on breach.** `[B — verify at developer.duda.co]`
- Dynamic Pages API exists for collection-driven pages.
- Duda is agency/partner-oriented; individual site owners usually can't get API credentials. **Tier-3 priority.**

---

## 11. HubSpot CMS

- **Auth:** Private App access token (Settings → Integrations → Private Apps → create → select scopes → copy token, format `pat-...`). API keys were **deprecated 2022-11-30**. Header `Authorization: Bearer pat-...`. For the hosted tier: OAuth app.
- **Scopes needed:** `content` (legacy) / `cms.knowledge_base.articles.write`, `cms.pages.write`-family, `cms.blogs.write` — confirm exact modern scope names in the Private App UI.
- **Endpoints:**
  - `GET/PATCH /cms/v3/pages/site-pages/{objectId}`
  - `GET/PATCH /cms/v3/pages/landing-pages/{objectId}`
  - `GET/PATCH /cms/v3/blogs/posts/{objectId}`
  - Batch: `POST /cms/v3/pages/site-pages/batch/update` (and `/batch/read`)
  - `POST /cms/v3/pages/site-pages/{id}/draft` + `/draft/push-live` → **native draft → live workflow = built-in dry-run/approve.**
  - `POST /cms/v3/pages/site-pages/{id}/revisions/{revisionId}/restore` → **native rollback.**
  - URL redirects: `/cms/v3/url-redirects` (create/update/delete).
- **Writable SEO fields:** `htmlTitle` ("the page title … seen in the title bar of the tab as well as the title of the page in search results"), `metaDescription`, `slug`, `head_html` (per-page head HTML → **JSON-LD goes here**), `footer_html`, `language`, `translations` (hreflang groups), `publish_date`, `widgets`/`layoutSections` for body. `[P]`
- **Rate limits:** commonly cited as **100–200 requests per 10 seconds** burst and **250,000–1,000,000/day** depending on tier, with **Search endpoints at 4 req/s**. `[B — scopiousdigital / zoominfo blogs. The official `developers.hubspot.com/docs/apis/usage-details` URL 404'd during research; find the current canonical usage-limits page and re-verify before shipping.]`

**Assessment:** HubSpot has the best native draft/revision/restore model of any SaaS CMS. Good tier-2 integration, but the addressable audience overlaps heavily with "already pays for enterprise SEO tooling."

---

## 12. Drupal

- **Mechanism:** core **JSON:API** module (`/jsonapi/node/{type}/{uuid}`, `PATCH`, `Content-Type: application/vnd.api+json`). Must enable **"Accept all JSON:API create, read, update, and delete operations"** at `/admin/config/services/jsonapi` — **read-only is the default**. `[P]`
- **Auth:** enable the **HTTP Basic Authentication** core module (Basic auth), or OAuth2 via the `simple_oauth` contrib module (preferred for production). Also `X-CSRF-Token` for cookie auth.
- **SEO fields:** Drupal has no built-in meta description. The **Metatag** module owns them, stored in a `field_metatags` (serialized) field. Metatag's JSON:API normalization has been a long-running issue (d.o issues #2636852, #2945817, #3384664) — **default metatag values are frequently NOT exposed in JSON:API responses**, and writing the serialized field via PATCH is fragile. `[P issue queue]`
- **Practical recommendation:** for Drupal, require a small **companion Drupal module** (mirroring the WP plugin) that exposes a normalized `/seo-agent/v1/...` REST resource reading/writing Metatag via its PHP API. Same pattern, same value.
- Redirects: the **Redirect** contrib module has entity CRUD available over JSON:API (`/jsonapi/redirect/redirect`) once enabled.
- **Tier-3.** Drupal is a small slice of the market and a large slice of the engineering budget.

---

## 13. Cloudflare as a universal "edge SEO" layer

### 13.1 Why it matters
It's the only way to fix SEO on class-D platforms (Squarespace, Weebly, bespoke legacy CMSs, sites where the user won't give us admin access). It also lets us do things no CMS API allows: response headers, `X-Robots-Tag`, hreflang `Link` headers, canonical headers on PDFs, edge 301s, and injecting JSON-LD into pages we cannot otherwise touch.

### 13.2 Snippets vs Workers — exact facts `[P, developers.cloudflare.com]`

**Cloudflare Snippets:**
| Plan | Available | Max snippets | Max subrequests |
|---|---|---|---|
| Free | **No** | 0 | 0 |
| Pro | Yes | 25 | 2 |
| Business | Yes | 50 | 3 |
| Enterprise | Yes | 300 | 5 |

- **5 ms CPU max, 2 MB memory, 32 KB package size.**
- **HTMLRewriter IS available in the Snippets runtime** — so streaming `<head>` patching is possible. `[P]`
- **No usage-based charges** — included with Pro/Business/Enterprise. Cloudflare Pro is **$20/mo annual, $25/mo monthly**; Business **$200/$250**. `[B for prices — verify on cloudflare.com/plans]`
- Snippets are attached via **Snippet Rules** (filter expressions), so you can scope a snippet to `http.request.uri.path matches "^/blog/"`.

**Cloudflare Workers:** `[P]`
- **Free:** 100,000 requests/day, 10 ms CPU per invocation.
- **Paid: $5/month minimum** → **10 million requests included**, then **$0.30/million**; **30 million CPU-ms included**, then **$0.02/million CPU-ms**. No egress charges. Subrequests are not billed.
- Max CPU 30 s default (up to 5 min configurable).
- Workers can be bound to a **route** on the customer's zone (`example.com/*`) and are available on the **Free plan**, unlike Snippets.

**Decision: build the edge layer on Workers, not Snippets.** Reasons: (1) Snippets are unavailable on Cloudflare Free, which is where most small sites are; (2) 5 ms CPU is tight once you add KV lookups and multiple HTMLRewriter handlers; (3) Workers + Workers KV gives us a versioned config store; (4) Workers Free (100k req/day) covers most small-business sites at zero cost. Offer Snippets as a lighter alternative for Pro/Business users who don't want a Worker.

### 13.3 What the edge Worker should do

```js
// Pseudocode — the "SEO Edge Patch" worker
export default {
  async fetch(req, env) {
    const res = await fetch(req);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return res;

    const url = new URL(req.url);
    const patch = await env.SEO_KV.get(`patch:${url.pathname}`, 'json');
    if (!patch) return res;

    let out = new HTMLRewriter()
      .on('title', new ReplaceText(patch.title))
      .on('meta[name="description"]', new SetAttr('content', patch.description))
      .on('link[rel="canonical"]', new SetAttr('href', patch.canonical))
      .on('head', new AppendHTML(patch.jsonld ? `<script type="application/ld+json">${patch.jsonld}</script>` : ''))
      .on('img', new AltTextFiller(patch.alts))
      .transform(res);

    out = new Response(out.body, out);
    if (patch.xRobotsTag) out.headers.set('X-Robots-Tag', patch.xRobotsTag);
    return out;
  }
}
```
Plus a route-level 301 map read from KV before the origin fetch, and `/robots.txt` / `/sitemap.xml` synthesis when the origin's is unfixable.

**Config storage:** Workers KV, keyed by pathname, written by our control plane. Every write is versioned (`patch:{path}:v{n}` + a pointer) so rollback is a pointer flip. **Deploy via the Cloudflare API** (`PUT /accounts/{id}/workers/scripts/{name}`) using a scoped API token the user creates at dash.cloudflare.com/profile/api-tokens with **Workers Scripts: Edit, Workers KV Storage: Edit, Zone: Workers Routes: Edit** on their specific zone.

### 13.4 The cloaking risk — be precise, and be conservative

Google's spam policies (page last updated **2026-08-28**) define cloaking as: *"the practice of presenting different content to users and search engines **with the intent to manipulate search rankings and mislead users**."* The listed example that's closest to what an edge layer could do wrong: *"Inserting text or keywords into a page only when the user agent that is requesting the page is a search engine, not a human visitor."* `[P]`

**Therefore, the hard architectural rule for our edge layer:**
> **The Worker must never branch on user-agent, IP, or reverse-DNS. Every patch is applied identically to every request.** If a human and Googlebot fetch the same URL, they get byte-identical HTML.

If we hold that line, edge patching is **not** cloaking — it is server-side templating, which is what every CMS does anyway. Enforce it in code: refuse to persist any patch rule whose predicate references `request.headers.get('user-agent')`, `cf.botManagement`, or `cf.clientTrustScore`. Make this a documented, non-configurable guarantee and put it in the README — it is a trust asset.

**Secondary risks to warn users about:**
- **Divergence:** the CMS says one title, the edge says another. Users get confused, and if the Worker is ever removed the site silently reverts. **Mitigation:** the dashboard must always show "source of truth: edge overlay" with a big banner, and we should continuously diff origin HTML vs edge HTML.
- **Single point of failure:** a Worker exception on a route can 5xx the whole site. **Mitigation:** wrap everything in try/catch that returns the untouched origin response; deploy to a `*.preview` route first; use Cloudflare's gradual deployments (percentage rollout).
- **AI-crawler cloaking:** there is reporting (`[B — ppc.land, 2026]`) that Google and Bing signalled that serving *modified content specifically to AI crawlers* (e.g., separate markdown for AI bots) constitutes cloaking, and that the 2026-08 spam-policy update formalizes the basis for this. **Do not ship an "AI-crawler-specific content" feature.** The no-user-agent-branching rule already covers it.
- **Sneaky redirects:** Google treats redirects as spam only "when the redirect is intended to deceive." Our 301s must be 1:1 old→new for genuinely moved content, never many→one for link equity funneling.

---

## 14. Integration priority order (opinionated)

Ranked by (addressable sites) × (write capability) × (build cost)⁻¹:

| # | Platform | Why | Est. effort |
|---|---|---|---|
| **1** | **WordPress (self-hosted) + companion plugin** | ~40%+ of the web; full write access; the plugin is a moat and a distribution channel (wordpress.org listing = free acquisition) | 4–6 weeks incl. plugin |
| **2** | **Git-backed static (GitHub PR flow)** | Best rollback, best trust story, developer audience = our early adopters, and it's the same adapter for Next/Astro/Hugo/Jekyll/Docusaurus | 3–4 weeks (the URL→file mapper is the work) |
| **3** | **Shopify (custom app, GraphQL)** | Huge commercial value per site; clear API; theme-duplication preview is excellent | 3–4 weeks |
| **4** | **Webflow (Data API v2)** | Clean API, bulk-100 page metadata endpoint, design-agency audience with real budgets | 1–2 weeks |
| **5** | **Cloudflare Workers edge layer** | Unlocks every class-D platform + capabilities no CMS API offers. Also the hosted-tier upsell | 2–3 weeks |
| **6** | **Ghost** | Tiny effort, richest SEO field set, publisher audience that cares about SEO | 3–5 days |
| **7** | **Wix** | Genuinely good SEO API incl. JSON-LD; large SMB base; Wix is explicitly courting AI agents (`ORIGIN_AI`) | 1–2 weeks |
| **8** | **Sanity + Contentful** | Cover the headless market with the shared "field mapping wizard" | 2 weeks for both |
| **9** | **Strapi + Payload** | Self-hosted headless; overlaps with our OSS audience | 1 week for both |
| **10** | **HubSpot CMS** | Great draft/revision APIs, but audience already tooled up | 1–2 weeks |
| **11** | **Storyblok, Framer, Duda, Drupal** | Long tail | as demanded |
| **—** | **Squarespace** | **Advisory-only adapter + manual task queue** (plus the edge overlay as the only write path). No content/SEO write API exists at any plan tier; the internal-endpoint workaround is a ToS violation. | 3 days |

**Also build early, before adapter #4: the "manual task queue" / "copy-paste pack" surface.** Every platform hits fields it can't write. A well-designed "here are 40 changes, each with a deep link into your CMS and a one-click copy button" is what makes the product useful on day one for the long tail, and it's the graceful-degradation path for every adapter.

---

## 15. The universal `SEOChangeAdapter` interface

### 15.1 Core types

```ts
type ChangeKind =
  | 'meta.title' | 'meta.description' | 'meta.canonical' | 'meta.robots'
  | 'meta.og' | 'meta.twitter'
  | 'schema.jsonld'
  | 'content.body' | 'content.heading' | 'content.internal_links'
  | 'media.alt' | 'media.compress' | 'media.filename'
  | 'url.slug' | 'url.redirect'
  | 'site.robots_txt' | 'site.sitemap' | 'site.hreflang'
  | 'perf.headers';

type Support = 'native' | 'via_plugin' | 'via_edge' | 'manual_only' | 'unsupported';

interface Capability {
  kind: ChangeKind;
  support: Support;
  scope: 'per_page' | 'per_site' | 'per_media';
  requiresPublish: boolean;      // change lands in a draft until published
  reversible: boolean;           // can we deterministically restore?
  maxLength?: number;            // e.g. platform truncates at N chars
  notes?: string;                // e.g. "Wix: writes primary language only"
}

interface ResourceRef {          // stable identity of the thing we're editing
  platform: string;
  siteId: string;
  resourceType: string;          // 'post' | 'product' | 'STATIC_PAGE' | 'file' | ...
  resourceId: string;
  url: string;                   // canonical live URL, for verification
  etag?: string;                 // updated_at / X-Contentful-Version / git sha / ifRevisionID
}

interface SEOChange {
  id: string;
  kind: ChangeKind;
  target: ResourceRef;
  before: unknown;               // captured by the adapter, never trusted from the planner
  after: unknown;
  rationale: string;             // shown to the user; also the PR body / commit message
  riskTier: 'low' | 'medium' | 'high';
  evidence?: { gscQueries?: string[]; crawlIssueId?: string };
}

interface ApplyResult {
  changeId: string;
  status: 'applied' | 'staged' | 'failed' | 'skipped' | 'needs_manual';
  externalRef?: string;          // PR URL, Shopify theme id, Wix job id
  previewUrl?: string;
  verifiedAt?: string;           // set only after live-HTML re-fetch confirmed it
  inverse?: SEOChange;           // precomputed rollback
  error?: { code: string; message: string; retryable: boolean };
}
```

### 15.2 The interface every adapter implements

```ts
interface SEOChangeAdapter {
  // --- identity & health ---
  connect(creds: unknown): Promise<{ siteId: string; scopesGranted: string[] }>;
  preflight(): Promise<{ ok: boolean; problems: Problem[] }>;   // auth, REST reachable, plugin present, header stripping, etc.
  capabilities(): Promise<Capability[]>;                        // MUST be discovered at runtime, not hardcoded

  // --- discovery ---
  listResources(opts: { types?: string[]; since?: string; cursor?: string }): Promise<Page<ResourceRef>>;
  readResource(ref: ResourceRef): Promise<ResourceSnapshot>;    // includes etag

  // --- the four-phase write model ---
  plan(changes: SEOChange[]): Promise<PlannedBatch>;            // validate, dedupe, cost, reject unsupported
  dryRun(batch: PlannedBatch): Promise<Diff[]>;                 // NO writes. field-level before/after
  stage(batch: PlannedBatch): Promise<StagedBatch>;             // draft / branch / duplicated theme / new environment
  apply(batch: StagedBatch | PlannedBatch): Promise<ApplyResult[]>;

  // --- verification & undo ---
  verify(results: ApplyResult[]): Promise<VerificationReport>;  // re-fetch LIVE HTML, assert the change is rendered
  rollback(changeIds: string[]): Promise<ApplyResult[]>;

  // --- governance ---
  rateLimiter: TokenBucket;                                     // per-site, adapter-declared
}
```

### 15.3 Non-negotiable rules for every adapter

1. **Never trust a 200.** `verify()` re-fetches the live URL with a cache-busting param and asserts the rendered HTML contains the new value. Wix's docs say this in so many words; Shopify's `fileUpdate` alt-text bug proves it; WordPress silently drops unregistered meta. **A change is `applied` only after `verifiedAt` is set.**
2. **Read-before-write, always.** `before` is captured by the adapter at apply time, not taken from a stale plan. Store it. `inverse` is computed from it.
3. **Optimistic locking wherever the platform offers it.** Ghost `updated_at`, Contentful `X-Contentful-Version`, Sanity `ifRevisionID`, Git parent SHA, Webflow/Shopify → fall back to a hash of the pre-image and abort if it changed since planning.
4. **Full-object replacement is a footgun.** Wix `tags` and many CMS fields replace the whole array. The adapter must always merge against a fresh read.
5. **One batch, one blast radius.** Group changes so a single failure doesn't leave a half-applied site: Git = one PR; Shopify = one duplicated theme + one publish; Webflow = many PUTs + one publish; Contentful = one environment.
6. **Per-site token bucket, declared by the adapter — and *discovered at runtime* wherever the platform reports it.** Shopify 100/200/1000/2000 points/s with buckets read live from `extensions.cost.throttleStatus` (**never hardcoded** — bespoke buckets exist in the wild); Webflow 60/120 rpm; GitHub 500 content-creations/hour (≈100 PRs/hr) plus a per-endpoint 900 pts/min REST / 2,000 pts/min GraphQL cap; Sanity 25 rps; Duda 10 rps. Persist bucket state across process restarts.
7. **Autonomy tiers map to change kinds, not to a global slider.** Suggested defaults:
   - **auto-apply (low risk):** `media.alt`, `meta.description` on pages with none, `schema.jsonld` additions, internal link additions.
   - **auto-stage, human approves (medium):** `meta.title` rewrites, `content.body` edits, `meta.canonical`.
   - **always human (high):** `url.slug`, `url.redirect`, `site.robots_txt`, `meta.robots` noindex, bulk deletions. **Never let an agent autonomously noindex or redirect at scale** — it's the one class of change that can zero a site's traffic in a week.
8. **Every change gets an immutable audit record** `{change_id, adapter, target, before, after, rationale, actor, approved_by, applied_at, verified_at, inverse, external_ref}`. This table is the product's insurance policy and the basis of the "what did the agent do last week" report.
9. **Kill switch:** a single `PAUSE` that (a) stops the queue, (b) for edge deploys flips the KV pointer to the null patch set, (c) surfaces a "revert all changes from the last N days" button that replays inverses in reverse chronological order.
10. **Degrade to the manual queue.** If `capabilities()` says `manual_only`, emit a task with the exact value, a deep link into the platform's editor, and a copy button. Don't silently skip.

### 15.4 Preview/sandbox capability by platform (summary)

| Platform | Native staging | Preview URL | Notes |
|---|---|---|---|
| Git/static | ✅ branch + PR | ✅ Vercel/Netlify/CF Pages deploy preview | best in class |
| Shopify | ✅ duplicated unpublished theme | ✅ `?preview_theme_id=` | + free dev stores |
| Contentful | ✅ environments | ✅ preview API | best headless |
| Sanity | ✅ drafts dataset | ✅ presentation tool | |
| HubSpot | ✅ draft + push-live + revision restore | ✅ | best SaaS CMS |
| Ghost | ✅ draft | ✅ `/p/{uuid}/` | |
| WordPress | ✅ draft/revision | ✅ `?preview=true&_wpnonce=` | revisions = rollback |
| Storyblok / Payload / Strapi | ✅ draft | ✅ | opt-in per collection |
| Webflow | ⚠️ CMS item draft only; pages publish site-wide | ⚠️ `.webflow.io` staging | no page-level staging |
| Wix | ⚠️ static pages have draft/published split, but with the documented read/write divergence bug | ⚠️ | |
| Framer | ✅ publish preview → promote | ✅ | |
| Duda | ⚠️ site is live/staged per Duda's own model | | |
| Squarespace | ❌ (no API at all) | | |
| Cloudflare edge | ✅ preview route + gradual deployment | ✅ | |

---

## 16. Concrete build checklist (turn this into tickets)

**Shared infra**
- [ ] `SEOChangeAdapter` interface + conformance test suite (every adapter must pass the same 40 tests against a fixture site)
- [ ] Durable job queue with per-site token buckets, persisted across restarts
- [ ] Change ledger table + rollback executor + global kill switch
- [ ] Live-HTML verifier (fetch, parse `<head>`, assert, screenshot-diff optional)
- [ ] Manual task queue UI with deep links + copy buttons
- [ ] Credential vault (age/libsodium-encrypted at rest; never log tokens; redact in traces)

**WordPress**
- [ ] Application Password onboarding with the 5-step wizard + preflight diagnostics for header stripping / security plugins / disabled REST
- [ ] `seo-agent-bridge` plugin (capabilities manifest, normalized SEO write, redirect abstraction, `robots_txt` filter, JSON-LD head hook, change log + rollback, dry-run) — submit to wordpress.org
- [ ] One-click install via `POST /wp-json/wp/v2/plugins`
- [ ] Adapters for Yoast (**version-gated:** ≥ 27.7 native core `meta` for 3 keys on `post` only; bridge plugin otherwise and for all pages/CPTs/products/terms) / Rank Math (native `POST /rankmath/v1/updateMeta`, with register-meta fallback) / AIOSEO (native `aioseo_meta_data`) / SEOPress (native `PUT /seopress/v1/`) / none
- [ ] Read-back verification on every meta write — **all four SEO plugins fail silently on capability errors and return 200**
- [ ] `alt_text` writer via `/wp/v2/media/{id}`
- [ ] Optional WP-CLI-over-SSH mode with `wp db export` pre-flight backup

**Git/static**
- [ ] GitHub App + fine-grained PAT auth
- [ ] Framework detector (Next App/Pages, Astro, Hugo, Jekyll, Docusaurus, Nuxt, Gatsby)
- [ ] URL→file resolver with sitemap cross-check and confidence scoring
- [ ] Frontmatter reader/writer preserving YAML/TOML formatting and comments
- [ ] Single-commit multi-file PR builder (Git Data API), respecting **80 content-creations/min, 500/hour** (≈ 100 PRs/hr at ~5 writes/PR; the practical burst cap is GitHub's own "≥ 1 s between writes" guidance = 60/min)
- [ ] **Empirically determine whether Git Data blob/tree/commit creation counts as "content-generating"** — undocumented; instrument 403/429 rates against a scratch repo before sizing the queue
- [ ] Deploy-preview URL detection + pre-approval crawl
- [ ] GitLab parity

**Shopify**
- [ ] Custom-app token onboarding (Develop apps → scopes → install → `shpat_`)
- [ ] GraphQL-only client with `extensions.cost.throttleStatus` governor
- [ ] `productUpdate`/`collectionUpdate`/`pageUpdate`/`articleUpdate` SEO writers + `global.title_tag`/`description_tag` fallback
- [ ] `fileUpdate` alt-text writer (guard against the empty-string no-op)
- [ ] `urlRedirectCreate`/`urlRedirectImportCreate` (scope `write_online_store_navigation`)
- [ ] Theme duplication → `themeFilesUpsert` (≤50 files) → preview → `themePublish`
- [ ] Theme app extension with an app embed block targeting `head` for JSON-LD/hreflang (for the hosted public app)
- [ ] `write_themes` exemption application citing "platform tools (SEO)"

**Edge layer**
- [ ] Worker script + KV patch store, versioned, pointer-based rollback
- [ ] Cloudflare API deploy with a scoped token (Workers Scripts: Edit, KV: Edit, Zone Workers Routes: Edit)
- [ ] **Hard-coded prohibition on user-agent/bot-signal branching**, with a test that fails the build if `user-agent` appears in a patch predicate
- [ ] Origin-vs-edge HTML diff monitor
- [ ] Gradual rollout + automatic disable on 5xx-rate spike

---

## 17. Open questions / things to re-verify before shipping

1. **Contentful CMA exact rate limits** — official docs page 429'd; the "7 req/s" figure is community-sourced.
2. **HubSpot's current canonical usage-limits URL and exact per-tier numbers** — `developers.hubspot.com/docs/apis/usage-details` 404'd.
3. **Storyblok Management API exact rate limits.**
4. **Webflow: is there any Data API endpoint for 301 redirects or site-level custom code?** Current evidence says no. If confirmed no, Webflow redirects must go through the edge layer or the manual queue.
5. **Duda's exact `seo` object field names** and whether individual (non-partner) site owners can obtain API credentials.
6. ~~**Squarespace Commerce Products API** — does it expose product SEO title/description?~~ **RESOLVED (2026-09-01): no.** The Products API writes products and variants but exposes no SEO title or meta description field; no Squarespace API of any kind does. See §5.
7. **Framer Server API** rate limits, plan gating, and whether it can write page-level SEO metadata (as opposed to CMS fields).
8. **Shopify custom apps (admin-created)**: confirm whether they can call `themeFilesUpsert` with `write_themes` **without** an exemption in the current API version. Forum reports are contradictory; this determines whether our OSS theme-editing path works at all.
9. **Wix**: confirm whether a "Custom App" installed on the user's own site can obtain `SCOPE.PROMOTE.MANAGE-SEO` without App Market review.
10. **Google/Bing position on AI-crawler-specific content** — currently only sourced from a news blog; watch Search Central for formal wording.
11. **WordPress.com hosted** plan gating for plugins and REST write access.

---

## Sources

All accessed **2026-08-31** unless noted.

**WordPress**
- Authentication — REST API Handbook: https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/ `[P]`
- Media endpoint reference (`alt_text`): https://developer.wordpress.org/rest-api/reference/media/ `[P]`
- AIOSEO — Fetching & Updating AIOSEO Data via the WordPress REST API: https://aioseo.com/docs/fetching-updating-aioseo-data-via-the-wordpress-rest-api/ `[P]`
- AIOSEO — REST API now free for all users: https://aioseo.com/newsroom/aioseo-rest-api/ `[P]`
- SEOPress — Get started with the SEOPress REST API: https://www.seopress.org/support/guides/get-started-with-the-seopress-rest-api/ `[P]`
- Redirection plugin REST API: https://redirection.me/developer/rest-api/ `[P]`
- Redirection plugin — REST API troubleshooting: https://redirection.me/support/problems/rest-api/ `[P]`
- Yoast issue #12548 (term metadata not exposed): https://github.com/Yoast/wordpress-seo/issues/12548 `[P]`
- Wordfence — Rank Math `updateMeta` missing `permission_callback` (CVE-2020-11514): https://www.wordfence.com/blog/2020/03/critical-vulnerabilities-affecting-over-200000-sites-patched-in-rank-math-seo-plugin/ `[P, 2020 — STALE but the endpoint's design is unchanged]`

**Shopify**
- API rate limits: https://shopify.dev/docs/api/usage/limits `[P]`
- Asset API (legacy) + `write_themes` exemption policy: https://shopify.dev/docs/apps/build/online-store/asset-legacy `[P]`
- `themeFilesUpsert`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert `[P]`
- `urlRedirectCreate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/urlRedirectCreate `[P]`
- `productUpdate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate `[P]`
- `fileUpdate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileUpdate `[P]`
- Optimize storefront SEO (global.title_tag / description_tag, seo.hidden): https://shopify.dev/docs/apps/build/marketing-analytics/optimize-storefront-seo `[P]`
- Changelog — April 2025 GraphQL-only for new public apps: https://shopify.dev/changelog/starting-april-2025-new-public-apps-submitted-to-shopify-app-store-must-use-graphql `[P]`
- Customize robots.txt: https://shopify.dev/docs/storefronts/themes/seo/robots-txt `[P]`
- `robots.txt.liquid` template: https://shopify.dev/docs/storefronts/themes/architecture/templates/robots-txt-liquid `[P]`
- Changelog — customize robots.txt rules by domain (2025-03-25): https://changelog.shopify.com/posts/customize-robots-txt-rules-by-domain `[P]`
- Configure theme app extensions (`head`/`body`/`compliance_head` targets): https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration `[P]`
- Forum — `fileUpdate` empty-string alt text silently ignored: https://community.shopify.dev/t/bug-report-fileupdate-mutation-silently-ignores-empty-string-alt-text/32744 `[C]`

**Webflow**
- Rate limits: https://developers.webflow.com/data/reference/rate-limits `[P]`
- Update Page Metadata (`PUT /v2/pages/{page_id}`): https://developers.webflow.com/data/reference/pages-and-components/pages/update-page-settings `[P]`
- Changelog — bulk update page metadata (up to 100 pages), 2026-03-11: https://developers.webflow.com/home/changelog/2026/3/11 `[P]`

**Wix**
- Item SEO Tags API — Introduction: https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/introduction `[P]`
- Set Item SEO Tags (`PATCH /promote/seo/v1/item-seo-tags/{itemType}/{itemId}`): https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/set-item-seo-tags `[P]`
- Site SEO Tags API: https://dev.wix.com/docs/api-reference/business-management/seo/site-seo-tags-v1/introduction `[P]`

**Squarespace**
- Developer platform index: https://developers.squarespace.com/ `[P — STALE marketing page; still labels the Reseller API "Coming soon". Do not cite.]`
- Developer Tools / APIs at Squarespace (the authoritative ~15-API list): https://support.squarespace.com/hc/en-us/articles/41325887099533-Developer-Tools-APIs-at-Squarespace `[P]`
- Commerce APIs overview: https://developers.squarespace.com/commerce-apis/overview `[P]`
- Websites API (read-only GETs): https://developers.squarespace.com/commerce-apis/websites `[P]`
- Developer preview: https://developers-preview.squarespace.com/ `[P]`
- Squarespace MCP server overview (two read-only domain tools): https://developers-preview.squarespace.com/mcp/overview `[P]`
- Reseller API status page (proves it is live, not "coming soon"): https://status-resellerapi.squarespace.com `[P — authoritative over both developer sites]`
- Squarespace API keys (four scopes; plan gating): https://support.squarespace.com/hc/en-us/articles/236297987-Squarespace-API-keys `[P]`
- Squarespace Developer Terms (prohibit undocumented-endpoint access): https://www.squarespace.com/developer-terms `[P]`

**Ghost**
- Admin API: https://docs.ghost.org/admin-api/ `[P]`

**Git / GitHub**
- Rate limits for the REST API (primary + secondary): https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api `[P]`
- REST endpoints for pull requests: https://docs.github.com/en/rest/pulls/pulls `[P]`
- octokit-plugin-create-pull-request: https://github.com/gr2m/octokit-create-pull-request `[P]`

**Cloudflare**
- Snippets (plan limits, 5 ms CPU, 2 MB, 32 KB): https://developers.cloudflare.com/rules/snippets/ `[P]`
- When to use Snippets vs Workers: https://developers.cloudflare.com/rules/snippets/when-to-use/ `[P]`
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/ `[P]`
- HTMLRewriter: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/ `[P]`
- Snippets GA announcement: https://blog.cloudflare.com/snippets/ `[P]`

**Google policy**
- Spam policies for Google Web Search (cloaking, sneaky redirects; page last updated 2026-08-28): https://developers.google.com/search/docs/essentials/spam-policies `[P]`
- ppc.land — Google spam policies now cover AI Overviews and AI Mode: https://ppc.land/google-spam-policies-now-officially-cover-ai-overviews-and-ai-mode-in-search/ `[B — treat the AI-crawler-cloaking claim as unconfirmed]`

**Headless / other**
- Contentful CMA reference: https://www.contentful.com/developers/docs/references/content-management-api/ `[P — returned 429 during this research pass; re-verify rate limits]`
- Sanity mutation API: https://www.sanity.io/docs/http-reference/mutation `[P]`
- Sanity technical limits: https://www.sanity.io/docs/content-lake/technical-limits `[P]`
- Sanity — 25 rps mutation limit: https://www.sanity.io/answers/api-rate-limit-error-and-waiting-time-for-batch-deletion `[C, 2025]`
- Strapi 5 REST API reference: https://docs.strapi.io/cms/api/rest `[P]`
- Strapi 5 API tokens: https://docs.strapi.io/cms/features/api-tokens `[P]`
- Payload REST API overview: https://payloadcms.com/docs/rest-api/overview `[P]`
- Payload API Key strategy (`Authorization: {slug} API-Key {key}`): https://payloadcms.com/docs/authentication/api-keys `[P]`
- Storyblok Management API: https://www.storyblok.com/docs/api/management `[P]`
- Storyblok technical limits: https://www.storyblok.com/pricing/technical-limits `[P]`
- HubSpot CMS Pages API guide: https://developers.hubspot.com/docs/api-reference/legacy/cms/pages/guide `[P]`
- HubSpot CMS Blog Posts API guide: https://developers.hubspot.com/docs/api-reference/cms-posts-v3/guide `[P]`
- HubSpot private vs public apps: https://developers.hubspot.com/blog/hubspot-integration-choosing-private-public-hubspot-apps `[P]`
- Drupal JSON:API — updating resources (PATCH): https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/updating-existing-resources-patch `[P]`
- Drupal Metatag + JSON:API issue queue: https://www.drupal.org/project/metatag/issues/2945817 `[P]`
- Framer Server API introduction: https://www.framer.com/developers/server-api-introduction `[P]`
- Framer Server API quick start (API key in Site Settings → General): https://www.framer.com/developers/server-api-quick-start `[P, page dated 2026-08-31]`
- Framer Plugin API 3.0 (CMS access, March 2025): https://www.framer.com/updates/plugins-3-0 `[P]`
- Duda API getting started: https://developer.duda.co/reference/getting-started-with-the-duda-api `[P]`
- Duda website APIs & automations (SEO object on Pages API, MCP server): https://www.duda.co/website-builder/automation `[B — marketing page]`

---

## Fact-check log

Independent adversarial fact-check completed **2026-09-01**. Six load-bearing claims were checked; **two CONFIRMED clean**, **four PARTIALLY_TRUE and corrected inline above**. Every wrong number has been fixed at the point of use, not just recorded here.

### FC-1 — Squarespace has no SEO/content write API · **PARTIALLY_TRUE** · corrected in §5

**Claim as written:** *"Squarespace has NO public API for editing SEO titles, meta descriptions, or page content — its developer platform ships only Commerce APIs, Webhooks, and a 'coming soon' Reseller API. Any Squarespace support must be advisory-only or via an edge overlay."*

**Correction — the business conclusion is right; the platform description was stale and materially inaccurate. Ship the conclusion, not the reasoning.**
- **Confirmed:** no public, supported API reads or writes SEO titles, meta descriptions, or page content. The API-key UI offers exactly four scopes (Orders, Forms, Inventory, Transactions).
- **Wrong #1:** not "only Commerce, Webhooks, Reseller" — the authoritative list names **~15 APIs** (Acuity, Contacts, Discounts, Domains Search, Domains Management, Incoming Webhooks, Inventory, Orders, Products, Profiles, Reseller, Scripts, Transactions, UI Component Registrations, Webhook Subscriptions), some invite-only. None touch content or SEO.
- **Wrong #2:** the **Reseller API is live in production**, not "coming soon" — its own status page reports All Systems Operational, 100.0% 90-day uptime, and maintenance scheduled into Sept 12–13 2026. The "Coming soon" label is a stale marketing page.
- **Missing #3:** an official Squarespace **MCP server** now exists and exposes only two unauthenticated read-only domain tools — **zero** content/SEO capability. Not a counter-argument.
- **Missing #4:** a **read-only Websites API** exists (3 GETs); its `title` is the *site* title, and there is no meta description field.
- **Added gating:** Commerce API keys require Core/Plus/Advanced/Commerce Advanced; Forms adds Business/Commerce Basic. **The Personal tier gets no API key at all** — so even the commerce surface is unavailable to much of the SMB segment.
- **Added risk:** the undocumented `/api/content/SaveSiteContent` + `/api/config/SaveInjectionSettings` path used by community MCP servers (via captured session cookies + a "crumb" CSRF token) is an **explicit Developer Terms violation** and a credential-custody liability. Not shippable.
- **Added migration risk:** the old OAuth application creation form is **decommissioned 2026-09-30**; build against self-service OAuth app creation.
- **Recommendation impact:** advisory-only + edge overlay stands, and the edge overlay is now documented as a **hard dependency** for this segment. Marketing's "works on any website" line is only honest if "works" explicitly includes advisory/overlay modes.
- **Reliability caveat:** developers.squarespace.com and developers-preview.squarespace.com disagree on Reseller status; the **production status page is authoritative over both**.

**Sources:** https://developers.squarespace.com/ · https://support.squarespace.com/hc/en-us/articles/41325887099533-Developer-Tools-APIs-at-Squarespace · https://developers.squarespace.com/commerce-apis/overview · https://developers.squarespace.com/commerce-apis/websites · https://developers-preview.squarespace.com/ · https://developers-preview.squarespace.com/mcp/overview · https://status-resellerapi.squarespace.com · https://support.squarespace.com/hc/en-us/articles/236297987-Squarespace-API-keys · https://www.squarespace.com/developer-terms

### FC-2 — Shopify `write_themes` exemption · **CONFIRMED** · §2.5 unchanged

**Claim:** Asset API PUT/DEL and `themeFilesUpsert` require `write_themes` **and**, for App Store-distributed apps, a Shopify-granted exemption; *"platform tools (SEO, content locking, developer tooling)"* is an explicitly listed exemption-eligible category; read-only GET needs no exemption. **Verdict: CONFIRMED as written. No change.**

**Sources:** https://shopify.dev/docs/apps/build/online-store/asset-legacy · https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert

### FC-3 — WordPress SEO-plugin REST writability · **PARTIALLY_TRUE** · corrected in §0, §1.3, §1.4, §16

**Claim as written:** Yoast and Rank Math don't expose SEO meta as writable via the WP REST API by default and must be registered with `register_post_meta(..., 'show_in_rest' => true)`; AIOSEO natively exposes writable `aioseo_meta_data`; SEOPress ships `/wp-json/seopress/v1/` write endpoints with Application Password support since 6.8.

**Correction.** AIOSEO and SEOPress halves correct. Yoast half **stale since 2026-05-27**; Rank Math half technically true but leads to the wrong engineering conclusion. Verified by downloading and grepping the shipped plugin ZIPs from wordpress.org — the entire SEO-blog corpus still repeats pre-May-2026 Yoast behavior.
- **Yoast — REFUTED as of 27.7.** `inc/class-wpseo-meta.php` has **zero** `show_in_rest` occurrences in 22.9 / 24.9 / 26.0 / 27.0 / 27.5 / 27.6, and **8 occurrences starting in 27.7** (2026-05-27), persisting through 28.3 (2026-08-18). A second `register_meta()` call marks exactly three keys REST-writable: `_yoast_wpseo_focuskw`, `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`. **Critical caveat:** `'object_subtype' => 'post'` scopes it to the `post` post type only — pages, CPTs, WooCommerce products and all terms still silently no-op with a 200. The change has **no entry in the official 27.7 changelog** (an undocumented behavior change). `/yoast/v1/` and `yoast_head`/`yoast_head_json` remain read-only.
- **Rank Math — premise confirmed, conclusion wrong.** 1.0.277.2 makes zero `register_meta` calls of its own, but **you don't need a companion plugin**: it natively ships `POST /wp-json/rankmath/v1/updateMeta` (`WP_REST_Server::CREATABLE`, `permission_callback` → `Rest_Helper::get_object_permissions_check`, enforcing `current_user_can('edit_post'/'edit_term'/'edit_user')`), plus `updateMetaBulk`. Same route its own Gutenberg sidebar uses. **Risks:** undocumented in the public KB (no stability contract) and a bad security history (CVE-2020-11514, missing `permission_callback`, patched 1.0.41 in 2020). Does **not** require the Headless CMS Support toggle (only `getHead` does).
- **AIOSEO — CONFIRMED**, with three omitted gotchas now documented: registered only where the post type's `show_in_rest` is true; writes need `edit_post` **plus** an AIOSEO custom cap; writes can be killed site-wide by the `aioseo_rest_api_allow_update` filter; failures return silently.
- **SEOPress — CONFIRMED with a version correction.** Method is **PUT**, not POST. Endpoints date to **4.7.0**, not 6.8; what **6.8** added was **Application Password support** specifically.
- **Recommendation impact:** §1.3's "we ship a companion plugin / 30% → 95%" conclusion was rewritten. The plugin is now scoped as **mandatory for Yoast** (≤ 27.6, or any page/CPT/product/term target, or any field beyond the three) and as the normalized-surface layer everywhere else. §1.4 now requires subtype-specific registration plus `register_term_meta`. Detect Yoast's version and gate on it; always verify by re-reading, since **all four plugins fail silently on capability errors**.

**Sources:** https://aioseo.com/docs/fetching-updating-aioseo-data-via-the-wordpress-rest-api/ · https://developer.yoast.com/customization/apis/rest-api/ · https://developer.yoast.com/changelog/yoast-seo/27.7/ · https://www.seopress.org/support/guides/get-started-with-the-seopress-rest-api/ · https://rankmath.com/kb/headless-cms-support/ · https://support.rankmath.com/ticket/unable-to-update-meta-title-description-via-rest-api/ · https://github.com/Yoast/wordpress-seo/issues/21966 · https://api.wordpress.org/plugins/info/1.0/{wordpress-seo,seo-by-rank-math,all-in-one-seo-pack,wp-seopress}.json · plugin ZIPs: wordpress-seo.28.3 (`inc/class-wpseo-meta.php` L100-345), 27.6 vs 27.7 bisect, seo-by-rank-math.1.0.277.2 (`includes/rest/class-shared.php`, `class-post.php`, `class-rest-helper.php`), all-in-one-seo-pack.5.0.1.1 (`app/Common/RestApi/Controllers/Post.php`, `Base.php`), wp-seopress.10.1 (`src/Actions/Api/TitleDescriptionMeta.php`)

### FC-4 — Shopify GraphQL Admin rate limits · **PARTIALLY_TRUE** · corrected in §2.3, §15.3 rule 6, §16

**Claim as written:** *"100 points/second (1,000 bucket) Standard, 200 (2,000) Advanced, 1,000 (10,000) Plus, 2,000 (20,000) Enterprise/Commerce Components, hard cap of 1,000 points per query and a 250-item cap on input arrays."*

**Correction — the three restore rates and both hard caps are correct and current; every bucket size was wrong, each exactly half the real value.**
- **Confirmed verbatim:** restore rates 100 / 200 / 1000 / 2000 pts/s; *"A single query may not exceed a cost of 1,000 points, regardless of plan limits…"*; *"Input arguments that accept an array have a maximum size of 250…"*; default costs Scalar 0 / Enum 0 / Object 1 / Connection by `first`\|`last` / **Mutation 10** — but *"Shopify also reserves the right to set manual costs on fields."*
- **Refuted:** Shopify **publishes no bucket sizes anywhere**. Observed `extensions.cost.throttleStatus.maximumAvailable` from real 2025–2026 responses on Shopify's own forum show bucket = **20× restoreRate** — i.e. **double** the claimed figures: 100 → **2000** (topics 8059, 16087, 19556, 20112, 22172, 23313, 26828, 36754, 37104; 2025-02-11 → 2026-08-24), 200 → **4000** (19963, 22970, 32572, 36518, 36720), 1000 → **20000** (29274, 36181). Enterprise → **40000** by the same ratio, ⚠️ **inferred, never directly observed**.
- **Why it was wrong:** 1000/2000/10000/20000 are the 20× buckets of the **pre-2024** restore rates (50/100/500, Commerce Components then "None"). Shopify doubled all tiers ~Feb–May 2024 and buckets doubled with them; the claim paired post-2024 rates with pre-2024 buckets. Shopify's own docs seed the error — the live page's example JSON still reads `"maximumAvailable": 1000, "currentlyAvailable": 954, "restoreRate": 50`, inconsistent with its own table — as does Shopify's partner blog.
- **Do not hardcode buckets:** two 2026 responses showed `maximumAvailable: 7500` with `restoreRate: 100` (topics 34833, 32866) — bespoke, non-20× — and one 2026-03-27 response still showed 1000/50. Docs warn *"Shopify may temporarily reduce API rate limits to protect platform stability."* Drive the token bucket off `throttleStatus` on every response.
- **"Why it matters" math corrected:** the 250-item cap is a global ceiling, not the operative one — `metafieldsSet` *"Allows a maximum of 25 metafields to be set at a time, with a maximum total request payload size of 10MB"*, and that is the mutation an SEO meta rewrite uses. Standard throughput ≈ **10 mutations/s** with a **~200-mutation burst**; 20,000 SKUs × 1 mutation ≈ **33 minutes, not "multi-hour"** — it reaches 65–130+ min only with reads, second writes and retries. The durable/resumable per-shop token-bucket queue conclusion **stands**, reinforced by the "temporarily reduce" clause and by `bulkOperationRunMutation` being the better path for store-wide jobs.
- **Also added:** the REST Admin API row has been **removed** from the limits table; pagination caps at 25,000 objects with **25001** as a count sentinel; stores past 500,000 variants are capped at 10,000 new variants/day; "Commerce Components" is now labeled "Shopify for enterprise."

**Sources:** https://shopify.dev/docs/api/usage/limits.md · https://shopify.dev/docs/api/usage/limits · Wayback captures 2024-01-16, 2024-05-30, 2025-05-30 of /docs/api/usage/rate-limits and 2026-08-17 of /docs/api/usage/limits · https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet.md · https://community.shopify.dev/t/graphql-rate-limiting-increase/2208 · community.shopify.dev topics 36518, 29274, 36720, 34833 · https://www.shopify.com/partners/blog/graphql-rate-limits `[STALE]`

### FC-5 — GitHub rate limits · **PARTIALLY_TRUE** · corrected in §8.1, §15.3 rule 6, §16

**Claim as written:** *"GitHub imposes secondary rate limits of no more than 80 content-generating requests per minute and 500 per hour, plus 100 concurrent requests and 900 points/minute, on top of the 5,000/hour primary limit for PATs and GitHub App installations."*

**Correction — the four headline numbers are quoted correctly and current as of API version 2026-03-10, but two framings were materially wrong and the architectural inference was overstated by ~2 orders of magnitude.**
- **Confirmed verbatim:** *"In general, no more than 80 content-generating requests per minute and no more than 500 content-generating requests per hour are allowed"*; *"No more than 100 concurrent requests are allowed"*; PATs 5,000/hour.
- **Wrong #1:** the 900-point limit is **per endpoint**, not a global cap. Heading: *"Make too many requests to a single endpoint per minute"* → *"No more than 900 points per minute … for REST API endpoints, and no more than 2,000 points per minute … for the GraphQL API endpoint."* It is **points, not requests**: GET/HEAD/OPTIONS = 1, POST/PATCH/PUT/DELETE = 5 (GraphQL query 1, mutation 5) → up to **180 writes/min per endpoint**. Far looser than the claim implied, and never our binding constraint. The claim also omitted GraphQL's 2,000.
- **Wrong #2:** 5,000/hour is a **floor** for App installations. Non-Enterprise installations scale +50/hr per repo beyond 20 and +50/hr per user beyond 20, capped at **12,500/hr**; Enterprise Cloud-owned installations get a flat **15,000/hr**. (Contrast: `GITHUB_TOKEN` in Actions = 1,000/hr per repo, 15,000 EC; unauthenticated 60/hr.)
- **Omitted limits now added:** ≤ 90 s CPU per 60 s real time (≤ 60 s for GraphQL); ≤ 2,000 OAuth access token requests/hour; the 100-concurrent limit is *"shared across the REST API and GraphQL API."*
- **Omitted caveats now added:** *"Some endpoints have lower content creation limits"*; content-creation limits *"include actions taken on the GitHub web interface"* — so human maintainers on the same account spend our budget; *"subject to change without notice"* and you may trip one *"for undisclosed reasons."* ⚠️ **unverified — must be confirmed during implementation:** GitHub publishes no definitive list of "content-generating" endpoints (documented examples: creating issues, posting comments, modifying PRs); **whether Git Data blob/tree/commit creation counts is undocumented.**
- **Inference corrected:** one PR ≈ **4–6 content-generating writes**, so 500/hour ≈ **100 PRs/hour** — not "we hit the ceiling almost immediately." The tighter burst constraint is 80/min, and GitHub's own best-practices page already caps below it (*"wait at least one second between each request"* → 60/min). Tripping a limit yields a **403/429 with `retry-after`**, not a durable soft-ban.
- **Recommendation impact:** batching many file changes into one commit/PR **stands** — it conserves budget, avoids review noise, and is robust to undisclosed tightening — but it is now framed as a **scaling-headroom decision, not an emergency**. Also noted: per the **2025-07-21 changelog, request timeouts now count against the primary rate limit.**

**Sources:** https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api (and `?apiVersion=2022-11-28`, `?apiVersion=2026-03-10`) · https://docs.github.com/en/graphql/overview/rate-limits-and-node-limits-for-the-graphql-api · https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api · https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/rate-limits-for-github-apps · https://raw.githubusercontent.com/github/docs/main/data/reusables/rest-api/secondary-rate-limit-rest-graphql.md · https://github.blog/changelog/2025-07-21-including-timeouts-in-primary-rate-limits/ · https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/

### FC-6 — Cloudflare Snippets vs Workers · **CONFIRMED** · §13.2 unchanged

**Claim:** Snippets unavailable on Free (0 snippets); 5 ms CPU / 2 MB memory / 32 KB package on paid plans (Pro 25, Business 50, Enterprise 300); Workers available on Free with 100,000 requests/day and 10 ms CPU per invocation, and on Paid from $5/month with 10 million requests and 30 million CPU-ms included. **Verdict: CONFIRMED as written. No change.** (The Pro/Business **dollar prices** in §13.2 remain `[B]` and are still unverified.)

**Sources:** https://developers.cloudflare.com/rules/snippets/ · https://developers.cloudflare.com/rules/snippets/when-to-use/ · https://developers.cloudflare.com/workers/platform/pricing/
