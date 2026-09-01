# Gap 07 — Site Migrations, Replatforms, and Shipping SEO Through a Dev Team's Release Cycle

**Research date:** 2026-09-01
**Scope:** Migration taxonomy and risk, executable migration checklists, staging/pre-prod access, SEO regression testing in CI/CD, server/CDN log analysis, and the organisational reality of getting SEO shipped.
**Bias note:** Primary sources (Google Search Central, Google Search Console Help, Cloudflare/Vercel/AWS/Netlify official docs, Screaming Frog user guide) are prioritised. Every vendor-marketing or blog-only statistic is explicitly flagged **[BLOG-ONLY]** or **[VENDOR]**.

---

## 0. Executive summary for the build

Five load-bearing conclusions:

1. **Google's two authoritative retention numbers conflict and both matter.** The Search Central site-move doc says keep redirects "for as long as possible, generally **at least 1 year**." The Search Console Change of Address help page says Google forwards signals for **180 days**, after which "Google does not recognize any relationship between the old and new sites." These are not the same clock: 180 days is the *signal-forwarding* window, 1 year is the *redirect-retention recommendation*. Our tool must model both and must never advise removing redirects at 180 days.
2. **Zone-level CDN logs are an Enterprise-only product at Cloudflare.** Cloudflare `http_requests` Logpush is Enterprise. The widely-quoted "10M free then $0.05/million" figure is **Workers Trace Events Logpush** on the Workers Paid plan — a different product that does not give you HTTP request logs for a normal proxied zone. Any log-analysis feature we build must assume most sub-$8/mo customers cannot supply CDN logs.
3. **The single highest-ROI, lowest-risk thing we can ship is a deploy-time assertion gate**, not an autonomous migration executor. Assertions on `<title>`, canonical, `meta robots`, `X-Robots-Tag`, `robots.txt`, status codes and hreflang against a golden snapshot are cheap, deterministic, and catch the catastrophic class of failure (staging `noindex`/`Disallow: /` shipping to prod).
4. **Vercel and Netlify preview environments are crawlable with documented bypass credentials** (`x-vercel-protection-bypass` header; Netlify Basic Auth / `CF-Access-Client-Id` + `CF-Access-Client-Secret` for Cloudflare Access). This is a solved integration problem — we should implement it as a first-class connector.
5. **An autonomous agent must not execute a migration.** It should generate, validate, and monitor. The redirect map, the DNS cutover, and the rollback are human-gated. Section F enumerates the refuse/escalate list.

---

## 1. Migration taxonomy and risk profile

### 1.1 Google's own classification

Google Search Central splits site moves into exactly two documented categories:

| Google doc | Covers | URL |
|---|---|---|
| **Site move with URL changes** | Domain change, protocol change, path/IA restructure | `developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes` |
| **Site move without URL changes** | Hosting change, CDN change, IP change, CMS replatform that preserves URLs | `developers.google.com/search/docs/crawling-indexing/site-move-no-url-changes` |

Everything practitioners call a "migration" maps onto one or both of these.

### 1.2 Per-type risk table

Risk score is our own synthesis (1 = low, 5 = catastrophic), grounded in which signals are simultaneously invalidated.

| # | Migration type | URL changes? | Change of Address applies? | Signals simultaneously reset | Risk | Typical recovery (see caveats §1.4) |
|---|---|---|---|---|---|---|
| 1 | **Domain change / rebrand** (`a.com` → `b.com`) | Yes | **Yes** | Host authority, all backlinks, all canonicals, brand entity | **5** | Weeks to years; SEJ study mean 523 days |
| 2 | **HTTP → HTTPS** | Yes (scheme) | **No** — explicitly excluded | Canonicals, internal links, hreflang, sitemaps | 2 | Days–weeks |
| 3 | **www ↔ non-www** | Yes (host) | **No** — explicitly excluded ("does not move subdomains automatically"; www is treated as a separate property, so a www↔apex move technically *is* a subdomain move — see §1.3 conflict) | Canonicals, internal links | 2 | Days–weeks |
| 4 | **CMS replatform, URLs preserved** (e.g. WP → Next.js, same paths) | No | No | Rendering, HTML templates, response headers, TTFB, structured data | **4** — highest "silent failure" rate | Days if clean; permanent if templates broke |
| 5 | **CMS replatform + URL change** (Shopify → Next.js with new path scheme) | Yes | No (same domain) | Everything in #4 **plus** every URL | **5** | Weeks–months |
| 6 | **URL-structure / IA change** (same platform) | Yes | No | Canonicals, internal link graph, breadcrumb, sitemaps | 4 | Weeks |
| 7 | **Subdomain → subdirectory** (`blog.x.com` → `x.com/blog`) | Yes | **Yes** (subdomain move is supported: "a.example.com to b.example.com") | Host-level signals consolidate | 3 | Weeks; usually net-positive |
| 8 | **Internationalisation / hreflang rollout** | Usually yes (new locale paths) | No | Adds new cluster; risk is *self-canonicalisation* and hreflang return-tag errors | 3 | Weeks; failure mode is wrong-locale serving, not traffic loss |
| 9 | **Design refresh, template change, URLs preserved** | No | No | On-page content volume, internal links per template, heading structure, CWV | 3 | Reversible; SearchPilot data shows single-template changes can swing ±4–17% |
| 10 | **Site consolidation after M&A** (n domains → 1) | Yes | Yes, one CoA per source domain | Multiple host authorities merging, massive duplicate-content overlap | **5** | Months |
| 11 | **Domain split** (1 domain → n) | Yes | Yes, but CoA cannot express a partial move | Authority dilution; CoA is all-or-nothing at domain level | **5** | Months; frequently unrecoverable |

**Key architectural consequence for us:** types 4 and 9 (URLs preserved) are invisible to a redirect-map-centric tool and are exactly where a *golden-snapshot diff* catches things a redirect checker never will. Our module must not be redirect-only.

### 1.3 What the Change of Address tool actually does and does not do

From `support.google.com/webmasters/answer/9370220` (accessed 2026-09-01):

**Does:**
- "Tells Google to emphasize crawling and indexing your new site over crawling your old site."
- "Forwards various signals from the old site to the new site."
- Tells Google to prefer the new site when determining canonical pages.
- Runs pre-move checks: verifies you own **both** properties under the same Google account, and checks for 301s on a sample of pages.
- Operates for **180 days**.

**Does not:**
- Does **not** remove the old site from the index.
- Does **not** work for **HTTP → HTTPS**.
- Does **not** work for **path-level** properties — "properties at the path level, such as `http://example.com/petstore/`, cannot use this tool."
- Does **not** automatically move subdomains — each `www`, `m.`, etc. requires its own migration.
- Does **not** substitute for 301s. It is an accelerant, not a mechanism.

**⚠ Documented conflict our tool must encode:** Google's site-move doc says you do *not* need the Change of Address tool for www/non-www switches, while the CoA help page says subdomains must be migrated separately. Practical resolution: for a `www.example.com` → `example.com` move on a **URL-prefix property** setup, file a CoA between the two URL-prefix properties; on a **Domain property** setup there is nothing to file because both are the same property. Our tool should detect the property type via the Search Console API `sites.list` (`siteUrl` beginning `sc-domain:` vs `https://`) and branch accordingly.

**After 180 days:** "Google does not recognize any relationship between the old and new sites, and treats the old site as an unrelated site, if still present and crawlable." → Our tool must raise a **hard alert at day 150** if the old domain still returns 200 on any URL, because at day 181 that content becomes an unrelated duplicate competitor.

### 1.4 Empirical traffic-impact and recovery data

**The best available quantitative source** — flag as *practitioner study, third-party traffic estimates, not Google data*:

- **Search Engine Journal, Dan Taylor, "How Long Should An SEO Migration Take? [Study Updated]", published/updated 2025-01-08.** Sample **892 domain migrations** (up from 171 in the 2023 version). Data collected 2024-10-22, traffic estimated from **Ahrefs (unfiltered)** plus an open call to the SEO community.
  - **Mean time for the new domain to reach the old domain's organic traffic: 523 days.**
  - **17%** of the sample had not recovered after **1,000 days** (down from 42% in the 2023 study).
  - **Fastest recoveries: 19, 22, 23 and 33 days.**
  - **2.8%** classified inconclusive due to traffic instability.
  - **Scope caveat that is routinely dropped when this stat is quoted:** this is a **domain-change/rebrand** dataset (migration type #1 only). It is *not* a general migration dataset and must never be presented as the expected outcome of an HTTPS or replatform migration.

- **Google's own statements on timeline** (Search Central, site move with URL changes, accessed 2026-09-01): "for medium-sized websites, it can take a few weeks or more for Google to gradually start showing the new URLs instead of the old ones (and for larger sites, even longer)"; "visibility of your content in Search may fluctuate temporarily during the move. This is normal and a site's rankings will settle down over time."

- **Google on crawl-rate behaviour after a no-URL-change move:** "it's normal to see a temporary drop in Googlebot's crawl rate immediately after the launch, followed by a steady increase over the next few days."

- **[BLOG-ONLY / UNVERIFIED]** Widely repeated figures such as "60–80% of migrations lose significant traffic", "only 10% of migrations improve SEO", and "50% traffic loss is common" appear across many 2025–2026 SEO blogs with **no traceable primary study**. Several of these pages appear to be AI-generated content citing each other. **Do not hard-code these as thresholds.** They are useful only as narrative colour.

- **SearchPilot (SEO A/B testing platform) 2025 case studies** — vendor-published but methodologically strong (they run split tests with statistical significance on real client sites). Relevant because they quantify *template-change* impact, i.e. migration type #9:
  - Removing video carousels from brand-based PLPs: **+4.1%** organic traffic, statistically significant; the same change on class-based PLPs was inconclusive.
  - Replacing templated content with unique human-written content: **+14%**.
  - Adding "Updated Daily" to title tags on a listings site: **~+11%**.
  - Capitalising title tag content: **+17.5%** in one test; "half of all tests involving capitalization of title tag content at SearchPilot have been positive."
  - **Implication:** a design refresh that changes one template can move traffic double digits in either direction. A migration module that only checks status codes will miss this entirely. Template-level before/after content diffing is required.

### 1.5 Recovery-timeline model to implement

Rather than a single number, encode a **per-type expected-recovery envelope**. If observed recovery is outside the envelope, escalate.

```
RECOVERY_ENVELOPE = {
  "domain_change":        {"trough_day": 7,  "p50_recovery_days": 120, "p90_recovery_days": 523, "expected_trough_pct": -35},
  "https":                {"trough_day": 3,  "p50_recovery_days": 14,  "p90_recovery_days": 45,  "expected_trough_pct": -10},
  "www_switch":           {"trough_day": 3,  "p50_recovery_days": 14,  "p90_recovery_days": 45,  "expected_trough_pct": -10},
  "replatform_same_urls": {"trough_day": 3,  "p50_recovery_days": 10,  "p90_recovery_days": 30,  "expected_trough_pct": -8},
  "replatform_new_urls":  {"trough_day": 7,  "p50_recovery_days": 45,  "p90_recovery_days": 120, "expected_trough_pct": -25},
  "ia_change":            {"trough_day": 7,  "p50_recovery_days": 35,  "p90_recovery_days": 90,  "expected_trough_pct": -20},
  "subdomain_to_subdir":  {"trough_day": 7,  "p50_recovery_days": 30,  "p90_recovery_days": 90,  "expected_trough_pct": -15},
  "i18n_rollout":         {"trough_day": 14, "p50_recovery_days": 45,  "p90_recovery_days": 120, "expected_trough_pct": -5},
  "template_refresh":     {"trough_day": 7,  "p50_recovery_days": 21,  "p90_recovery_days": 60,  "expected_trough_pct": -5},
  "ma_consolidation":     {"trough_day": 14, "p50_recovery_days": 150, "p90_recovery_days": 400, "expected_trough_pct": -40},
  "domain_split":         {"trough_day": 14, "p50_recovery_days": 180, "p90_recovery_days": 500, "expected_trough_pct": -45},
}
```

**Provenance and honesty requirement:** only `domain_change.p90_recovery_days = 523` is externally sourced (SEJ 2025). Every other cell is our engineering judgement calibrated against Google's "a few weeks or more" language. **The dashboard must label these as heuristic priors, not measured benchmarks**, and they should be updated from our own hosted-tier telemetry once we have ≥50 observed migrations.

---

## 2. Google's hard technical constraints (all primary-sourced)

These are the numbers the module compiles against. All accessed 2026-09-01.

| Constraint | Value | Source |
|---|---|---|
| Redirect hops Googlebot follows | **up to 10** | `developers.google.com/search/docs/crawling-indexing/http-network-errors` |
| Signal treatment: 301, 308, instant meta refresh, "crypto redirect" | Permanent — "the indexing pipeline uses the redirect as a signal that the redirect target should be canonical" | `/crawling-indexing/301-redirects` |
| Signal treatment: 302, 303, 307, delayed meta refresh | Temporary — "the indexing pipeline **doesn't** use the redirect as a signal that the redirect target should be canonical" | same |
| JS redirects | "should only be used as a last resort… rendering may fail for various reasons" | same |
| robots.txt cache | "Google generally caches the contents of robots.txt file for **up to 24 hours**" | `/crawling-indexing/robots/robots_txt` |
| robots.txt max size | **500 KiB**; content beyond is discarded | same |
| robots.txt 4xx (except 429) | Treated as **no robots.txt exists** → no restrictions | same |
| robots.txt 5xx — first 12 hours | **Crawling halts** while retrying | same |
| robots.txt 5xx — next 30 days | Uses last cached version; if none, assumes no restrictions | same |
| robots.txt 5xx — after 30 days | Either treats as no robots.txt **or stops crawling the site entirely** | same |
| Change of Address signal window | **180 days** | `support.google.com/webmasters/answer/9370220` |
| Recommended redirect retention | "as long as possible, generally **at least 1 year**" | `/crawling-indexing/site-move-with-url-changes` |
| DNS TTL before a no-URL-change move | "lower the TTL to a conservative low value (for example, a few hours)" at least **one week** before | `/crawling-indexing/site-move-no-url-changes` |
| GSC Performance data retention | **16 months**, then permanently deleted | GSC Help / widely documented |
| GSC UI export row limit | **1,000 rows** | GSC Help |
| Search Analytics API row limit | **50,000 rows/day** per property (also the Looker Studio connector ceiling) | GSC Help / API docs |
| URL Inspection API quota | **2,000 QPD** and **600 QPM** per site; **10,000,000 QPD / 15,000 QPM** per Cloud project | `developers.google.com/webmaster-tools/limits` |
| Search Analytics API quota | **1,200 QPM** per site, **1,200 QPM** per user; **30,000,000 QPD / 40,000 QPM** per project | same |
| All other GSC API resources | **20 QPS / 200 QPM** per user; **100,000,000 QPD** per project | same |

**The URL Inspection quota is the binding constraint on post-migration validation.** At 2,000 QPD you cannot inspect a 100k-URL migration. Design accordingly (§4.6).

### 2.1 Verified-Googlebot filtering — exact file locations

For log analysis (§6), Google publishes IP ranges as JSON. **Note the 2025/2026 rename: the file formerly known as `googlebot.json` is now `common-crawlers.json`.** Hard-code all of these and fetch daily:

```
https://developers.google.com/static/crawling/ipranges/common-crawlers.json
https://developers.google.com/static/crawling/ipranges/special-crawlers.json
https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers.json
https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers-google.json
https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json
https://www.gstatic.com/ipranges/goog.json          # non-crawler Google services
```

Fallback rDNS verification (Google's documented four-step procedure):
1. Reverse DNS lookup on the IP.
2. Confirm the domain is one of `googlebot.com`, `google.com`, `googleusercontent.com`.
3. Forward DNS lookup on that hostname.
4. Confirm it resolves back to the original IP.

Valid hostname patterns: `crawl-*-*-*-*.googlebot.com`, `geo-crawl-*-*-*-*.geo.googlebot.com`, `rate-limited-proxy-*-*-*-*.google.com`, `*-*-*-*.gae.googleusercontent.com`, `google-proxy-*-*-*-*.google.com`.

**Implementation note:** prefer the IP-range JSON (O(1) CIDR lookup with a radix trie) over rDNS (two DNS round-trips per unique IP). At 100M log lines/month there are typically only tens of thousands of unique bot IPs, so rDNS with a 30-day cache is viable as a secondary check.

---

## 3. Deliverable (a) — Per-migration-type playbook

**Autonomy tiers** used throughout (consistent with our product's autonomy model):

- **T0 — Observe:** read-only; report only.
- **T1 — Propose:** generate an artefact (redirect map CSV, ticket, PR) for human review; never applies.
- **T2 — Apply-with-approval:** writes only after an explicit human click, one change at a time.
- **T3 — Autonomous:** writes without per-change approval, inside a pre-approved policy envelope.
- **T4 — Never:** the agent must refuse and escalate (see §F).

### 3.1 Universal pre-migration sequence (all types)

| # | Step | Owner | Auto? | Tier |
|---|---|---|---|---|
| P1 | Declare migration: type, planned cutover datetime, freeze window, rollback owner, comms channel | Human (SEO lead) | Manual | T4 input |
| P2 | **Baseline capture** — snapshot everything in §4.1 to immutable local storage | Agent | Full | **T3** |
| P3 | Build **URL inventory** from all 8 sources (§4.2), dedupe, classify | Agent | Full | **T3** |
| P4 | Compute **URL value score** per URL (§4.3); produce the Priority-1 / Priority-2 / Long-tail tiers | Agent | Full | **T3** |
| P5 | Generate **candidate redirect map** (§4.4 algorithm) with per-row confidence | Agent | Full | **T1** |
| P6 | Human review of all rows below confidence threshold + 100% of Priority-1 | Human | Manual | T4 |
| P7 | Staging crawl + golden-snapshot diff (§5) | Agent | Full | **T3** |
| P8 | Pre-deploy gate run (§7 assertions) against staging | Agent/CI | Full | **T3** |
| P9 | Sign-off: freeze the approved redirect map hash; store as `migration_manifest.json` | Human | Manual | T4 |

### 3.2 Type-specific playbooks

#### Type 1 — Domain change / rebrand (risk 5)

| Order | Step | Owner | Auto? | Tier |
|---|---|---|---|---|
| 1 | Verify **both** old and new properties in GSC under one account (CoA prerequisite) | Human | Semi (agent checks, human authorises) | T2 |
| 2 | Detect property type (`sc-domain:` vs URL-prefix) and pick CoA strategy | Agent | Full | T3 |
| 3 | Confirm 301 (not 302) on the sample pages Google will pre-check | Agent | Full | T0 |
| 4 | DNS cutover / redirect deployment | Dev/Infra | **Manual** | **T4** |
| 5 | **File Change of Address in GSC** | Human | **Manual — no API exists** | **T4** |
| 6 | Submit new XML sitemap; keep old sitemap submitted so Google re-crawls old URLs to discover the 301s | Agent | Full | T2 |
| 7 | Update GA4 property/stream hostname, GSC-linked properties, Google Business Profile URL, all self-referencing canonicals | Agent + Human | Semi | T2 |
| 8 | Outreach to top-N referring domains to update links | Agent drafts, human sends | Semi | T1 |
| 9 | **Day-150 alarm:** any 200 on old domain → hard escalation before the 180-day CoA window closes | Agent | Full | T3 |
| 10 | **Day-365 reminder:** redirect-retention minimum reached; recommend keeping indefinitely | Agent | Full | T3 |

**Critical:** there is **no Search Console API method to file a Change of Address.** The Search Console API surface (`sites`, `sitemaps`, `searchanalytics`, `urlInspection`) contains no CoA resource. This is a hard T4 human step and our UI must present it as a blocking checklist item with a deep link to `https://search.google.com/search-console/settings/change-address`.

#### Type 2 — HTTP → HTTPS

| Order | Step | Owner | Auto? | Tier |
|---|---|---|---|---|
| 1 | Certificate validity, chain, SAN coverage for every hostname in the inventory | Agent | Full | T0 |
| 2 | Add the `https://` property to GSC (URL-prefix) or confirm a Domain property covers both | Agent | Semi | T2 |
| 3 | Rewrite all internal links, canonicals, hreflang, sitemap entries, and structured-data `url`/`@id` to https | Agent | Full | **T2** (CMS write) |
| 4 | Enforce 301 http→https at edge; verify **no chain** (`http://www` → `https://www` in one hop, not two) | Dev | Semi | T1 |
| 5 | HSTS: deploy **without** `preload` first; `preload` is effectively irreversible | Dev | Manual | **T4** for preload |
| 6 | Mixed-content scan on every template | Agent | Full | T0 |
| 7 | **Do not** file Change of Address (explicitly unsupported) | — | — | — |

#### Type 4 — CMS replatform, URLs preserved (risk 4 — the silent killer)

This is the Shopify→Next.js / WordPress→headless case. Redirects are a non-issue; **rendered output equivalence is everything.**

| Order | Step | Owner | Auto? | Tier |
|---|---|---|---|---|
| 1 | Golden snapshot of production: for every URL in the Priority tiers capture `title`, `meta description`, canonical, `meta robots`, `X-Robots-Tag`, `link rel=alternate hreflang`, H1, word count, JSON-LD blocks (normalised), internal outlinks set, status code, and `content-hash` of main content | Agent | Full | **T3** |
| 2 | Crawl staging with identical config; diff every field (§5.3 tolerances) | Agent | Full | **T3** |
| 3 | **Render-parity check**: fetch each URL twice — raw HTML and post-JS-render. Flag any URL where a key field exists only after render (SSR regression) | Agent | Full | T3 |
| 4 | Structured-data diff: assert every `@type` present in prod is present in staging | Agent | Full | T3 |
| 5 | Internal-link-graph diff: assert no template lost >20% of its outlinks | Agent | Full | T3 |
| 6 | Response-header diff: `x-robots-tag`, `link`, `vary`, `content-type`, `cache-control` | Agent | Full | T3 |
| 7 | Pagination/faceting parity (ecommerce): assert `rel=next` semantics, parameter handling, canonical targets | Agent | Full | T3 |
| 8 | DNS TTL lowered to a few hours ≥1 week before cutover (Google's explicit guidance) | Infra | Manual | T4 |
| 9 | Cutover; monitor old-origin logs until zero traffic before decommissioning (Google's explicit guidance) | Infra | Semi | T1 |

#### Type 5 — Replatform + URL change (risk 5)

Union of Type 4 (golden snapshot) and the full redirect-map pipeline (§4). **Both must pass.** This is the "Shopify → Next.js replatform" scenario named in the gap brief and is the module's canonical hard case.

Additional Shopify-specific traps to encode as rules:
- Shopify's reserved prefixes `/collections/`, `/products/`, `/pages/`, `/blogs/<handle>/` disappear; a naive path-preserving map produces 100% 404s.
- Shopify serves the **same product under multiple collection paths** (`/collections/x/products/y`) with a canonical to `/products/y`. The inventory must dedupe on canonical, but the **redirect map must still cover the non-canonical variants** because they hold backlinks.
- Shopify `/collections/all` and tag-filtered URLs (`/collections/x/tag1+tag2`) are combinatorial; treat as a *pattern* rule, never as enumerated rows.
- Shopify `.myshopify.com` domain must be 301'd, not left live.

#### Type 7 — Subdomain → subdirectory

| Order | Step | Owner | Auto? | Tier |
|---|---|---|---|---|
| 1 | File CoA from `blog.example.com` → this **is** supported (subdomain to subdomain/domain) | Human | Manual | T4 |
| 2 | Note: CoA requires the *target* to be a domain-level property. If the target is `example.com/blog`, that is a **path-level property and CoA cannot be used** — the doc explicitly excludes `http://example.com/petstore/` | Agent flags | Full | T0 |
| 3 | Therefore: **rely on 301s alone**; do not promise CoA acceleration to the user | Agent | Full | T0 |
| 4 | Reverse-proxy or app-level routing so `/blog/*` is served from the same origin | Dev | Manual | T4 |
| 5 | Consolidate GSC properties; retain the old subdomain property for ≥16 months to preserve its Performance history before it ages out | Agent | Semi | T2 |

**This is a genuinely important and under-documented finding:** the Change of Address tool **cannot** be used for the most common consolidation direction (subdomain → subdirectory), because the destination is a path-level property. Many blog posts claim otherwise.

#### Type 8 — i18n / hreflang rollout

| Order | Step | Owner | Auto? | Tier |
|---|---|---|---|---|
| 1 | Choose the URL pattern (ccTLD / subdomain / subdirectory) and record it in the manifest | Human | Manual | T4 |
| 2 | Generate the full hreflang matrix including **self-referencing** tags and `x-default` | Agent | Full | **T2** |
| 3 | Validate **return-tag reciprocity**: for every A→B annotation there must be a B→A. This is a graph-symmetry check, O(E) | Agent | Full | T3 |
| 4 | Validate every hreflang target returns 200 and is not canonicalised to a different URL (the #1 real-world hreflang failure: hreflang points at a URL whose canonical points elsewhere → annotation silently discarded) | Agent | Full | T3 |
| 5 | Validate language/region codes are valid ISO 639-1 / ISO 3166-1 Alpha-2, and that `en-UK` (invalid) is not used instead of `en-GB` | Agent | Full | T3 |
| 6 | Assert no IP-based auto-redirect that traps Googlebot in one locale | Agent | Full | T0 |

#### Type 9 — Design refresh / template change, URLs preserved

Same as Type 4 steps 1–7, **plus** a content-volume guard: alert if any template's median word count drops >30%, or if H1 presence rate drops below 98%. SearchPilot's 2025 results (§1.4) justify treating a template change as a *measurable intervention*, not a cosmetic one.

#### Types 10/11 — M&A consolidation and domain split

Both are **T4 across the board** for execution. The agent's role:
- Build the **overlap matrix**: for every ranking keyword, which source domains rank, at what position, with what URL. Identify keywords where consolidation will cause cannibalisation.
- Produce a **many-to-one redirect map** with explicit "winner" selection per topic cluster.
- Flag that CoA is **all-or-nothing per domain** — a partial split cannot be expressed, so a split must rely on 301s plus long-term monitoring only.

---

## 4. Deliverable (b) — Redirect map generation and validation algorithm

### 4.1 Baseline capture (step P2) — exactly what to snapshot

Because **GSC data is deleted after 16 months and there is no backfill**, baseline capture is irreversible-in-time. Capture on day 0 and retain indefinitely.

| Snapshot | Source | Granularity | Retention |
|---|---|---|---|
| `perf_by_page_daily` | Search Analytics API, dims `[date, page]` | daily, 16 months back | forever |
| `perf_by_page_query_daily` | Search Analytics API, dims `[date, page, query]` | daily, 16 months back, top 50k/day | forever |
| `perf_by_page_country_device` | Search Analytics API, dims `[page, country, device]` | monthly rollup | forever |
| `gsc_index_status` | GSC Pages report (UI export or Index Status via crawl) | weekly | 24 months |
| `ga4_landing_pages` | GA4 Data API, `landingPagePlusQueryString` × `sessions`, `conversions`, `totalRevenue` | daily, 14 months | forever |
| `full_crawl` | our crawler | one full crawl, all fields | forever (this is the golden snapshot) |
| `sitemaps` | raw XML fetch of every sitemap and index | at capture | forever |
| `internal_link_graph` | derived from `full_crawl` | edge list | forever |
| `backlink_targets` | third-party API (Ahrefs/Majestic/Moz) or GSC Links report export | one-off | forever |
| `server_logs` | if available (§6) | 30 days pre-migration minimum | 13 months |
| `rendered_snapshots` | HTML of top 1,000 URLs, gzip | one-off | forever |

**Storage estimate:** a 100k-URL site's full baseline (16mo of daily page-level GSC + full crawl + rendered top-1k) is roughly **2–6 GB compressed** in Parquet/DuckDB. This is trivially self-hostable and is a strong argument for our local-first architecture: we can retain what GSC deletes.

**This is a differentiated product feature, not just migration plumbing.** "We keep your GSC history past Google's 16-month deletion" is a standalone reason to install the tool before you need it.

### 4.2 URL inventory — the 8 sources (union, not just a crawl)

A crawl alone is provably insufficient because it cannot see orphans. Union these:

| # | Source | Access method | Catches | Typical unique contribution |
|---|---|---|---|---|
| 1 | **Site crawl** | our crawler | linked pages | baseline |
| 2 | **XML sitemaps** (all, incl. index files, image/video/news) | HTTP fetch | declared-but-unlinked | +2–15% |
| 3 | **GSC Performance pages** | Search Analytics API dims `[page]`, 16 months, all `search_type` values incl. `discover`, `googleNews`, `image`, `video` | anything that got an impression | +5–30% (orphans) |
| 4 | **GSC BigQuery bulk export** | `searchdata_url_impression.url` | same as 3 but **no 50k/day row cap** and no sampling | supersedes 3 at scale |
| 5 | **GSC Pages (index status) report** | UI export (1,000-row cap) or Inspection API sampling | indexed-but-zero-impression URLs | +1–10% |
| 6 | **GA4 landing pages** | GA4 Data API `landingPagePlusQueryString` | URLs with any traffic incl. non-organic; catches parameterised variants | +3–20% |
| 7 | **Backlink target URLs** | Ahrefs/Majestic/Moz API, or GSC "Top linked pages" export | dead URLs still holding link equity | +1–5%, disproportionately valuable |
| 8 | **Server/CDN access logs** | §6 | *everything anyone or any bot actually requested*, including URLs absent from all of 1–7 | +5–40% on large/legacy sites |

**Design rule:** the inventory table is `(url_normalised, sources_bitmask, first_seen, last_seen, ...)`. Never discard a URL because only one source saw it. Normalise: lowercase host, strip default port, resolve `.`/`..`, sort or strip query params per a configurable allowlist, decide trailing-slash policy once and record it.

**Orphan definition for our tool:** `url IN (sources 3,4,5,6,7,8) AND url NOT IN (source 1)`. These are the URLs that break migrations, because nobody knew they existed.

### 4.3 URL value scoring (drives review priority and rollback thresholds)

```
value(u) = w1 * norm(clicks_365d(u))
         + w2 * norm(impressions_365d(u))
         + w3 * norm(referring_domains(u))
         + w4 * norm(internal_inlinks(u))
         + w5 * norm(revenue_365d(u))          # GA4, if ecommerce
         + w6 * is_in_sitemap(u)
         + w7 * norm(distinct_ranking_queries(u))

Default weights: w1=.30 w2=.10 w3=.25 w4=.10 w5=.15 w6=.02 w7=.08
```

Tiering:
- **P1 (must be 100% human-reviewed):** top URLs cumulatively accounting for **80% of clicks OR 80% of revenue**, plus any URL with ≥1 referring domain from a DR/DA ≥ 40 site. On a typical 100k-URL site this is 500–5,000 URLs.
- **P2 (spot-check 10%, review all low-confidence rows):** next 15% of clicks.
- **P3 / long-tail (pattern rules only, sampled validation):** the remainder.

This is what makes 1M-URL migrations tractable: **you never review 1M rows; you review ~5k rows and ~50 pattern rules.**

### 4.4 Redirect-map generation algorithm

Six passes, applied in strict order. **First match wins**; each row records `match_method` and `confidence ∈ [0,1]`.

```
PASS 0 — NORMALISE
  canonicalise both sides; build new_urls index.

PASS 1 — EXACT PATH MATCH                                    confidence 1.00
  old.path == new.path  →  map, mark VERIFIED_EXACT.
  (On a pure domain change this resolves 90–100% of rows in O(n).)

PASS 2 — STABLE IDENTIFIER MATCH                             confidence 0.97
  Extract stable IDs from both sides:
    - CMS primary key (WP post_id, Shopify product id / handle, SKU,
      Drupal nid, Magento entity_id)
    - trailing slug after the last '/'
    - any UUID / numeric ID in the path
  Join on identifier. THIS IS THE HIGHEST-VALUE PASS FOR REPLATFORMS
  because the CMS export gives you a ground-truth join key.
  → Always attempt a DB/API-level join before falling back to text similarity.

PASS 3 — DECLARATIVE PATTERN RULES                           confidence 0.95
  Human- or agent-proposed regex/template rules, e.g.
    ^/collections/([^/]+)/products/([^/]+)$  →  /shop/$2
    ^/blogs/news/(.+)$                       →  /blog/$1
  Rules are proposed by mining the P1+P2 verified rows for a common
  transformation, then EXPANDED over the long tail.
  Each rule reports: rows matched, rows whose target 200s, rows conflicting.
  A rule is only accepted if target-200 rate >= 99% on a 500-row sample.

PASS 4 — LEXICAL FUZZY MATCH                                 confidence 0.55–0.90
  Blocking (mandatory at scale): bucket candidates by
    (path_depth, first_path_segment, token 3-gram MinHash/LSH band)
  Score within bucket:
    0.45 * token_set_ratio(path_tokens_old, path_tokens_new)      # RapidFuzz
  + 0.25 * jaro_winkler(slug_old, slug_new)
  + 0.20 * jaccard(path_segments_old, path_segments_new)
  + 0.10 * (1 if same depth else 0)
  Accept top-1 only if score >= 0.85 AND (score_top1 - score_top2) >= 0.08.

PASS 5 — SEMANTIC / EMBEDDING MATCH                          confidence 0.50–0.90
  Only for rows unresolved after Pass 4.
  Embed a composite document per URL:
     f"{title} || {h1} || {meta_description} || {first_200_words} || {slug}"
  Old side comes from the BASELINE CRAWL (pre-migration prod).
  New side comes from the STAGING CRAWL.
  ANN index (HNSW / FAISS / sqlite-vec). Accept top-1 if
     cosine >= 0.86 AND (cos_top1 - cos_top2) >= 0.04.
  Handles the "URL structure changed completely but content is the same"
  case that Pass 4 provably cannot.

PASS 6 — UNMAPPED
  Everything left. Decision per row driven by value tier:
    P1  → BLOCK the migration until a human maps it.
    P2  → map to nearest category/parent page (NOT the homepage), flag.
    P3  → 410 Gone if zero clicks & zero backlinks in 365d,
          else 301 to nearest parent path that 200s.
  NEVER bulk-redirect to the homepage. A homepage catch-all converts a
  clean 404 signal into a mass soft-404 signal and destroys the ability
  to diagnose the migration.
```

**Documented accuracy expectations** (flag as practitioner-reported, not lab-measured):
- A March 2025 practitioner comparison (Chris Lever, `chrisleverseo.com`) concluded that **embeddings and fuzzy matching are complementary, not substitutes**: embeddings handle "major URL changes… especially when structure has completely changed but content remains similar"; fuzzy matching "still works best for minor URL variations"; combining them "reduced false positives and improved accuracy." **[BLOG-ONLY, but methodologically described and consistent with first principles.]**
- Search Engine Land (`searchengineland.com/site-migrations-ai-powered-redirect-mapping-437793`) and Sally Mills' FuzzyMatch Colab script are the two most-cited practitioner implementations; both are RapidFuzz-based Pass-4 implementations with human review of low scores. **[BLOG-ONLY.]**
- **No published false-positive rate exists** for any of these methods. This is a genuine gap. We should measure and publish ours — it would be a credible differentiator.

**Our honest prior on Pass-4/5 accuracy** (to be validated, must be labelled as an estimate in the UI): on a same-content replatform, expect Passes 1–3 to resolve **85–97%** of rows; Passes 4–5 to propose matches for **60–80%** of the remainder at ≥0.85 threshold, of which **5–15% will be wrong**. Therefore: **at a 100k-URL scale, expect 150–1,500 wrong redirects if you ship Pass 4/5 output unreviewed.** This is exactly why P1 tiering exists.

### 4.5 Scale characteristics

| Scale | Pass 1–3 | Pass 4 (blocked LSH) | Pass 5 (embeddings) | Human review load | Wall-clock on a laptop |
|---|---|---|---|---|---|
| **10k URLs** | <1 s | ~2 s | ~30 s embed + <1 s ANN | ~200 P1 rows | **< 2 min** |
| **100k URLs** | ~5 s | ~60 s | ~5 min embed (local model) + ~10 s ANN | ~2,000 P1 rows + ~30 rules | **~15 min** |
| **1M URLs** | ~60 s | ~15 min | ~50 min embed / or **skip Pass 5 entirely** | ~5,000 P1 rows + ~80 rules | **~2 h** |

Notes:
- **Never do O(n²).** A naive 100k×100k fuzzy comparison is 10^10 operations. Blocking is not an optimisation, it is a correctness requirement for the feature to exist.
- At 1M URLs, **Pass 5 should be restricted to P1+P2 only** (~50k URLs). Long-tail rows are handled by pattern rules or 410.
- Use a **local embedding model** (e.g. a small sentence-transformer via ONNX) for the self-hosted tier so a 1M-URL migration does not cost an API bill. Reserve hosted embedding APIs for the paid tier where the user opts in.
- Store the whole pipeline in **DuckDB/Parquet**; it handles 1M-row joins in-process with no server.

### 4.6 Validation of the generated map

Run **all** of these before sign-off, and again post-launch:

```
V1  TARGET_EXISTS       every target returns 200 (on staging pre-launch, prod post-launch)
V2  NO_CHAIN            resolve each source; assert hop_count == 1
                        (Google follows up to 10, but every extra hop is latency
                         and a chance to lose the chain; enforce 1, warn at 2, fail at 3+)
V3  NO_LOOP             detect cycles in the redirect graph (Tarjan SCC); any cycle = FAIL
V4  CORRECT_STATUS      assert 301 or 308, never 302/303/307
                        (Google: temporary redirects do NOT pass the canonical signal)
V5  NO_REDIRECT_TO_404  target must not itself redirect to a 4xx/5xx
V6  NO_HOMEPAGE_DUMP    assert < 2% of all mapped rows target the homepage
V7  NO_CROSS_LOCALE     a /fr/ source must not target a /en/ target
V8  CANONICAL_AGREES    target's canonical == target (self-referencing), or the
                        redirect is pointing at a page that will be canonicalised away
V9  NOT_ROBOTS_BLOCKED  target must not be Disallowed in the new robots.txt
                        (a redirect to a Disallowed URL loses the signal entirely)
V10 NOT_NOINDEXED       target must not carry meta robots noindex or X-Robots-Tag noindex
V11 COVERAGE            assert 100% of P1 URLs and >= 99% of P2 URLs are mapped
V12 BACKLINK_COVERAGE   assert 100% of URLs with >= 1 referring domain are mapped
V13 SITEMAP_CLEAN       assert no redirected URL appears in the NEW sitemap
V14 PARAM_HANDLING      assert query strings are preserved or explicitly dropped per policy
V15 CASE_SENSITIVITY    assert the rule set is case-insensitive on the source side if the
                        old server was
```

**V2 and V4 are the two that most often fail in real deployments** and are trivially automatable — a redirect that is a 302, or a redirect chained through the old HTTP→HTTPS rule, is the most common real defect.

---

## 5. Deliverable — Staging and pre-production access

### 5.1 How to get in (all primary-sourced, all implementable as connectors)

| Environment | Mechanism | Exact credential | Source |
|---|---|---|---|
| **Vercel preview / protected prod** | Protection Bypass for Automation | HTTP header **or** query param named **`x-vercel-protection-bypass`**; value = the project secret, exposed to builds as **`VERCEL_AUTOMATION_BYPASS_SECRET`**. Optional **`x-vercel-set-bypass-cookie: true`** (or `samesitenone` for iframes) to persist via `Set-Cookie` for browser-based crawling | `vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation` |
| **Cloudflare Access (Zero Trust)** | Service Token | Headers **`CF-Access-Client-Id`** and **`CF-Access-Client-Secret`**; the Access policy must use the **Service Auth** action or Access will still prompt for IdP login. Duration configurable (e.g. `8760h` = 1 year) | `developers.cloudflare.com/cloudflare-one/identity/service-tokens/` |
| **Netlify** | Basic Auth via `_headers` / site password | Standard `Authorization: Basic base64(user:pass)`. **Plan-gated: password protection is Pro/Enterprise** for accounts created after 2025-09-04 | Netlify docs (via secondary sources; verify at contract time) |
| **Generic Basic Auth** | `Authorization: Basic …` | — | RFC 7617 |
| **Form-based login** | Session cookie capture | Screaming Frog supports "forms-based auth"; our crawler should support a scripted login + cookie jar | Screaming Frog user guide |
| **IP allowlist** | Source IP | Requires the crawler to run from a known egress IP — **argues for self-hosted deployment**, since a SaaS crawler's IPs are hard to allowlist. Vercel Trusted IPs is Enterprise-only | Vercel docs |
| **VPN / Tailscale** | Network-level | Out of scope for the agent; document as a T4 human prerequisite | — |

**Product implication:** the self-hosted model is a genuine competitive advantage here. A locally-run agent inherits the developer's network position — VPN, `/etc/hosts` overrides, allowlisted office IP — that no SaaS crawler can replicate. **Lead with this.**

### 5.2 Preventing staging from leaking into the index — the four canonical failures

| # | Failure | Detection | Severity |
|---|---|---|---|
| **F1** | **`noindex` left on production** (`<meta name="robots" content="noindex">` or `X-Robots-Tag: noindex`) | Assert on every prod URL, every deploy. Also check the HTTP header, not just the HTML — header-only noindex is invisible to a naive HTML parser | **CATASTROPHIC** |
| **F2** | **`robots.txt` with `Disallow: /` shipped to production** | Fetch `/robots.txt` post-deploy; assert no `Disallow: /` under `User-agent: *` or `Googlebot`. Google caches robots.txt **up to 24h**, so the blast radius is bounded but real | **CATASTROPHIC** |
| **F3** | **Staging URLs indexed** | Query `site:staging.example.com` equivalent; monitor GSC for unexpected hostnames; check whether the staging host serves 200 to an unauthenticated request | **HIGH** (duplicate content + credential/PII exposure) |
| **F4** | **Canonical tags pointing at staging** | Assert every prod canonical's host ∈ allowed_hosts | **HIGH** — silently deindexes prod in favour of an inaccessible host |

**Vercel's specific, documented, easy-to-miss trap (F3):** Vercel adds `X-Robots-Tag: noindex` to preview deployments by default, **but "Vercel omits `X-Robots-Tag: noindex` when a custom domain is assigned to a non-production branch."** So `staging.example.com` mapped to a `staging` branch on Vercel is **fully indexable by default**. This is exactly the kind of provider-specific footgun our tool should ship a named rule for.
Source: `vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines`, accessed 2026-09-01.

### 5.3 Quantifying frequency — what is actually known

**Honest answer: there is no reliable published frequency for "noindex shipped to production."** Everything found is blog assertion.

- **[BLOG-ONLY, unverifiable]** Multiple 2025–2026 launch-checklist posts assert that forgetting to remove staging `noindex` is "the single most common mistake during website launches." No dataset.
- **[VENDOR]** Semrush "2025 Website Health Benchmark Report" is cited as finding **72% of websites fail at least one critical technical SEO factor**, and a separate figure of **76% of audited websites have common SEO errors**. These are vendor-produced audit-tool aggregates over a self-selected user base and are **not** measures of launch incidents.
- **What we can measure ourselves:** once installed, our tool can report, per deploy, whether an F1–F4 assertion fired. Publishing that anonymised rate would be the first real dataset on this and is a strong content/PR asset.

**Recommendation:** do not quote a percentage in marketing. Quote the *mechanism* and the *cost*, and instrument our own rate.

### 5.4 What a staging crawl can and cannot prove

| Staging **can** prove | Staging **cannot** prove |
|---|---|
| HTML output: title, meta, canonical, hreflang, JSON-LD, headings | Real-world Googlebot rendering behaviour and render-queue latency |
| Response status codes for enumerated URLs | Edge/CDN behaviour: the production WAF, bot rules, geo-routing, and cache layers usually differ or are absent |
| Internal link graph of the new templates | Redirect rules that live in the **CDN/edge config**, not the app — these frequently only exist in prod |
| Template regressions vs golden snapshot | `robots.txt` served by prod (staging's is usually deliberately `Disallow: /`) |
| Structured-data validity | Real TTFB/CWV under production load and cache-warm conditions |
| Presence/absence of noindex **in the app layer** | `X-Robots-Tag` injected by a production-only CDN rule or reverse proxy |
| Redirect rules if they are in app code / `next.config.js` / `_redirects` | Whether DNS, certs, and HSTS are correct |
| Sitemap generation logic | Whether the CoA was filed, whether GSC verification survived |

**Design rule:** every staging assertion must be **re-run against production within 5 minutes of cutover**, because roughly half the failure modes are only observable in prod. Our module therefore has two gates: `pre_deploy_gate` (staging) and `post_deploy_gate` (production smoke), and the second is the one that triggers rollback.

---

## 6. SEO regression testing in CI/CD — landscape and deliverable (c)

### 6.1 Existing tooling survey (2025–2026)

| Tool | Type | CI integration | SEO assertion depth | Licence / price | Verdict for us |
|---|---|---|---|---|---|
| **Lighthouse CI** (`GoogleChrome/lighthouse-ci`) | OSS, Google | First-class: `lhci autorun`, GitHub Action, exit codes | **Shallow.** The `seo` category covers ~10 audits (title, meta description, crawlable anchors, `hreflang`, `canonical`, `is-crawlable`, `robots-txt`, viewport, font size, plugins). No golden-snapshot diffing, no site-wide crawl. | MIT, free | **Use it, don't rebuild it.** Wrap it. Its assertion syntax is the right model to copy. |
| **Screaming Frog SEO Spider CLI** | Commercial desktop, headless mode | Manual: run in a Docker container in CI | **Deep.** Full crawl, all fields. | **£199/yr per licence**; free tier capped at **500 URLs** | Good for agencies; **licence cost and desktop-Java footprint make it wrong for an OSS self-hosted tool.** |
| **Lumar (ex-DeepCrawl) "Protect"** | Enterprise SaaS | **GraphQL API**; vendor pages claim GitHub Actions, Jenkins, CircleCI Orb and Azure DevOps integrations (claim appears on secondary pages; Lumar's own developer page confirms only the **GraphQL API** and "automated SEO QA testing") | Deep, test-suite model, can fail a build | Custom enterprise; **[BLOG-ONLY]** estimates of **$400–$2,000+/mo**, one source says ~$2,667/mo | This is the incumbent we are undercutting. Their model (test suites → build failure) is the right shape. |
| **Conductor Website Monitoring (ex-ContentKing)** | Enterprise SaaS | API described by third parties as "early form" | Deep, continuous, ~**every 10 minutes** re-check, real-time change detection, Slack/email alerts | **Custom enterprise only.** ContentKing was acquired by Conductor (Feb 2022) and **since summer 2025 can no longer be bought standalone** — you must buy the whole Conductor suite | **This is the single biggest market opening.** The best-loved continuous-monitoring tool for technical SEOs was removed from the self-serve market in 2025. There is currently no good sub-$100/mo replacement. |
| **Sitebulb / Sitebulb Cloud** | Commercial desktop + cloud | No documented native CI/CD integration | Deep (300+ checks, Evergreen Chromium) | Paid | Audit tool, not a gate. |
| **SiteImprove** | Enterprise SaaS | Some API | Broad (accessibility-led) | Enterprise | Not SEO-gate-shaped. |
| **`juampi92/test-seo`** | OSS | Library | Assertions for title, description, canonical, robots | OSS | Small; useful reference for assertion naming. |
| **`marcortola/behat-seo-contexts`** | OSS (PHP/Behat) | Behat in CI | title, meta description, canonical, hreflang, meta robots, robots.txt, redirects, sitemap validation, HTML validation, performance | OSS | **Closest existing thing to an "SEO unit test framework."** PHP-only, which caps its reach. |
| **`SeoScoreAPI/seo-audit-action`** | GitHub Action | Native | 28 checks, scored report, quality gate | Freemium, API-backed (external dependency) | Requires calling their hosted API — wrong for self-hosted. |
| **Playwright / Puppeteer custom assertions** | OSS | Native | Whatever you write | Free | **This is how most competent teams actually do it today** — hand-rolled `expect(page.locator('link[rel=canonical]'))` assertions. Ad hoc, unmaintained, template-blind. |
| **Vercel / Netlify build-time checks** | Platform | Native | None SEO-specific out of the box; you add your own script as a build step or Netlify Build Plugin | Included | Distribution channel: ship a Netlify Build Plugin and a Vercel-compatible npm script. |

**Conclusion:** the market gap is precise — **a free, self-hostable, framework-agnostic, crawl-aware SEO assertion gate with golden-snapshot diffing.** Lighthouse CI is free but shallow and single-URL. Lumar/Conductor are deep but enterprise-priced and, since 2025, not self-serve.

### 6.2 Deliverable (c) — the assertion catalogue

Design contract: each assertion is a pure function `(observed, baseline, config) -> {status, evidence}` with `status ∈ {PASS, WARN, FAIL}`. Levels follow Lighthouse CI's proven `off | warn | error` model with `minScore` / `maxLength` / `maxNumericValue` options and `aggregationMethod`.

#### Tier A — Blocking, zero-tolerance (`error`). Fail the build. Near-zero false-positive rate.

| ID | Assertion | Pass/fail logic | Why zero-tolerance |
|---|---|---|---|
| `A01` | **robots.txt not blanket-disallow** | FETCH `/robots.txt`. FAIL if any group matching `*` or `Googlebot` contains `Disallow: /` (exact) and the environment is production | The F2 catastrophe |
| `A02` | **robots.txt fetchable and ≤500 KiB** | FAIL if status ≠ 200/404 or `size > 512000` bytes | Google discards >500 KiB; 5xx halts crawling for 12h then risks total crawl stop after 30 days |
| `A03` | **No unexpected noindex (HTML)** | For every sampled prod URL: FAIL if `meta[name=robots]` or `meta[name=googlebot]` content contains `noindex` AND url ∉ `allowed_noindex_patterns` | F1 |
| `A04` | **No unexpected noindex (header)** | FAIL if response header `X-Robots-Tag` contains `noindex` AND url ∉ allowlist. **Must check headers separately** — header-only noindex is invisible to HTML parsing | F1, most-missed variant |
| `A05` | **Canonical host allowlist** | FAIL if `link[rel=canonical]` host ∉ `{production hosts}`. Catches canonical-points-at-staging | F4 |
| `A06` | **Status code parity** | For every URL in the golden snapshot that was 200: FAIL if now 4xx/5xx | Core regression |
| `A07` | **No redirect on indexable sitemap URLs** | FAIL if any URL listed in the new XML sitemap returns 3xx or 4xx | V13 |
| `A08` | **Homepage 200 + indexable** | FAIL if `/` is not 200, or is noindexed, or canonicalises off-host | Blast-radius sentinel |
| `A09` | **No redirect loops** | Build the redirect graph from sampled URLs; FAIL on any cycle | V3 |
| `A10` | **Redirect chain depth** | WARN at 2 hops, FAIL at ≥3. (Google follows up to 10, so this is a quality bar, not a hard Google limit) | V2 |
| `A11` | **Permanent redirects are 301/308** | For URLs in the approved migration manifest: FAIL if the observed status is 302/303/307 | Google: temporary redirects don't pass the canonical signal |
| `A12` | **Migration manifest coverage** | During an active migration: FAIL if any P1 URL is unmapped or returns a status other than its manifest-declared target status | V11 |
| `A13` | **HTTPS everywhere** | FAIL on any `http://` internal link, canonical, hreflang or sitemap entry in a production build | |
| `A14` | **XML sitemap parses and is referenced** | FAIL if sitemap is malformed XML, >50,000 URLs per file, >50 MB uncompressed, or not referenced from robots.txt | Sitemap protocol limits |

#### Tier B — Blocking with a tolerance band (`error` above threshold). Diff against the golden snapshot.

| ID | Assertion | Pass/fail logic | Default threshold |
|---|---|---|---|
| `B01` | **Title presence** | FAIL if `titles_present_rate < threshold` | `>= 0.99` |
| `B02` | **Title churn** | FAIL if `% of URLs whose title changed > threshold`, unless the change is in the approved changeset | `<= 5%` per deploy |
| `B03` | **Canonical presence** | FAIL if `canonical_present_rate < threshold` | `>= 0.98` |
| `B04` | **Canonical churn** | FAIL if `% of URLs whose canonical target changed > threshold` | `<= 2%` |
| `B05` | **Self-referencing canonical rate** | WARN if the share of URLs canonicalising to a *different* URL rises by more than N points | `+5pp` |
| `B06` | **Meta description presence** | WARN below threshold | `>= 0.90` |
| `B07` | **H1 presence** | FAIL below threshold | `>= 0.95` |
| `B08` | **Structured-data type parity** | FAIL if any `@type` present in the baseline for a template is absent in ≥10% of that template's URLs | `<= 10%` loss |
| `B09` | **Structured-data validity** | FAIL on any required-property error for `Product`, `Article`, `FAQPage`, `BreadcrumbList`, `Organization` | 0 errors |
| `B10` | **Internal outlink count per template** | FAIL if median outlinks for any template drops by more than threshold | `<= 20%` drop |
| `B11` | **Orphan creation** | FAIL if the count of URLs with zero internal inlinks increases by more than threshold | `<= 1%` of total |
| `B12` | **Word-count per template** | WARN if median main-content word count drops by more than threshold | `<= 30%` drop |
| `B13` | **hreflang reciprocity** | FAIL if return-tag reciprocity `< threshold` | `>= 0.99` |
| `B14` | **hreflang target health** | FAIL if any hreflang target is non-200 or canonicalises elsewhere | 0 violations |
| `B15` | **Render parity** | FAIL if `% of URLs where title/canonical/H1 exist only after JS render` exceeds threshold | `<= 1%` |
| `B16` | **Pagination/parameter canonical policy** | FAIL if parameterised URLs stop self-canonicalising per the declared policy | 0 violations |

#### Tier C — Advisory (`warn`). Never fail the build. High FP rate; use for the dashboard.

`C01` Lighthouse `categories:seo` `minScore >= 0.9` · `C02` `categories:performance` `minScore >= 0.8` · `C03` CWV field-data regression (needs prod traffic; cannot run pre-deploy) · `C04` image `alt` coverage · `C05` heading hierarchy · `C06` `hreflang` `x-default` present · `C07` OG/Twitter card presence · `C08` `llms.txt` presence · `C09` duplicate-title clusters · `C10` thin-content detection.

### 6.3 Wiring into CI

**GitHub Actions** (the shape to ship):

```yaml
name: SEO Gate
on:
  pull_request:
  deployment_status:

jobs:
  seo-gate:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run SEO assertions against the preview deployment
        env:
          TARGET_URL: ${{ github.event.deployment_status.environment_url }}
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: |
          npx @ourtool/seo-gate \
            --target "$TARGET_URL" \
            --baseline .seo/golden-snapshot.json \
            --config .seo/gate.yml \
            --header "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" \
            --max-urls 500 \
            --sample-strategy template-stratified \
            --format github-annotations \
            --junit-out seo-results.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: seo-report, path: seo-results.xml }
```

Key design decisions:
- **Trigger on `deployment_status` success**, not `pull_request` — you need a deployed URL to crawl.
- **Template-stratified sampling, capped at 300–500 URLs**, keeps PR gate runtime under ~90 seconds. Full-site crawls belong on a nightly/post-deploy schedule, not a PR gate. *This is the single most important choice for adoption* (see §6.4).
- **Emit GitHub annotations** so failures appear inline on the diff. A gate whose output lives in a log file gets ignored.
- **Emit JUnit XML** so GitLab CI, Jenkins, CircleCI, Azure DevOps and Buildkite all render results natively with no bespoke integration.
- Ship a **Netlify Build Plugin** wrapper and a plain `npx` invocation for Vercel/other.

**GitLab CI** equivalent: same binary, `artifacts:reports:junit: seo-results.xml`.

### 6.4 The false-positive problem — why teams disable these gates

**There is no published false-positive rate for SEO CI gates.** Nobody has measured it. What is well-evidenced from the adjacent flaky-test literature and from how these tools are described in practice is the failure mechanism, and it is entirely predictable:

Gates get disabled when **(a)** they fail on changes that are intentional, **(b)** they are slow, or **(c)** the failure message doesn't say what to do.

Mitigations to build in from day one — treat these as requirements, not polish:

1. **Every Tier-B assertion must be diff-based with an approved-changeset escape hatch.** A `.seo/approved-changes.yml` file, committed in the same PR that makes the change, that whitelists intended title/canonical churn. This converts "the gate is wrong" into "declare your intent" — the same pattern as snapshot testing and `CODEOWNERS`.
2. **Two-phase rollout, enforced by the tool itself.** New installs start with **every assertion at `warn`**. After 10 green-ish runs, the tool *proposes* promoting the assertions that never fired to `error`. Never ship a config that fails a team's build on day 1.
3. **Budget-based, not absolute, thresholds** for everything in Tier B. "Title presence must be ≥99%" survives a legitimate new template; "every page must have a title" does not.
4. **Hard runtime budget: 90 seconds for the PR gate.** Enforce it in code — abort and report partial results rather than blocking a merge queue.
5. **Deterministic sampling.** The same PR must crawl the same URL set twice in a row. Seed the sampler from the template inventory hash, not from `random()`. Nondeterministic gates are indistinguishable from flaky ones and are the fastest route to `--no-verify`.
6. **Actionable failure text.** Every failure emits: the URL, the field, baseline value, observed value, the assertion ID, and a one-line remediation. No scores without evidence.
7. **Auto-quarantine.** If a single assertion fails on >30% of runs across 7 days, the tool demotes it to `warn` automatically and tells the user. This is the pressure valve that stops the whole gate being deleted.

---

## 7. Server and CDN log analysis — deliverable (d)

### 7.1 How SEOs actually obtain logs in 2026, and the plan gates

**The headline finding: the plan gate is the whole story.** Access is not a technical problem, it is a billing-tier problem.

| Source | Availability | Destinations | Cost | Verdict |
|---|---|---|---|---|
| **Cloudflare Logpush — zone `http_requests`** | **Enterprise plan only.** Cloudflare docs: "Only Enterprise plans have standard access." | R2, S3, GCS, Azure, Datadog, Splunk, Sumo, and other SIEM/log providers | Included in Enterprise | **Blocked for ~99% of our target users.** |
| **Cloudflare Workers Trace Events Logpush** | **Workers Paid plan** | Same destinations | **10,000,000 requests/mo included, then $0.05/million** | ⚠ **Different product.** Gives you Workers invocation logs, not zone HTTP request logs. **The "$0.05/million Logpush" figure circulating in SEO blogs is this, and it is being misapplied.** |
| **Cloudflare Log Explorer** | Paid tiers (query UI, Cloudflare-hosted) | In-Cloudflare only | **$1/GB ingested, first 10 GB free**; contract customers can retain up to 2 years at **$0.10/GB/month** | Usable for ad-hoc queries; not a bulk export path |
| **Cloudflare Worker-generated logs** | **Any paid Workers plan** | Anywhere you POST to | Workers request pricing | **The realistic escape hatch for non-Enterprise Cloudflare sites.** Deploy a small Worker that samples/filters bot requests and POSTs them to our collector. |
| **AWS CloudFront standard logging (v2)** | **All CloudFront customers** | **S3, CloudWatch Logs, Amazon Data Firehose** | "CloudFront doesn't charge for enabling standard logs." **"There are no additional charges for log delivery to Amazon S3,"** though you pay S3 storage and access. Parquet conversion incurs CloudWatch vended-logs charges. CloudWatch Logs / Firehose destinations incur their own vended-logs charges | **Best-in-class. Free to S3.** Selectable fields, partitioning (`{DistributionId}/{yyyy}/{MM}/{dd}/{HH}`), Hive-compatible paths, output as JSON/Plain/w3c/Raw/Parquet |
| **AWS ALB access logs** | All | S3 | S3 storage only | Free, good |
| **Vercel Drains (`log` schema v1)** | **Pro and Enterprise** (Hobby must upgrade) | Custom HTTP endpoint, or native integrations (Dash0, Braintrust). Audit Log Drains → S3/Splunk/Datadog/Panther, Enterprise only | **$0.50 per GB**, billed on the *uncompressed JSON serialization* of each record regardless of delivery encoding | Workable; **note the billing basis** — compressed delivery does not reduce the bill |
| **Netlify log drains** | **Enterprise only** | — | Custom | Blocked for most |
| **Fastly real-time log streaming** | Included in the base platform for syslog/basic endpoints; **High Volume Logging** is a paid add-on for large volumes to S3/BigQuery | Very wide endpoint list | Base included; HVL custom **[secondary source]** | Good access, cost unclear |
| **Akamai DataStream 2 / 2.1** | Add-on product | Wide | Billed **per log line**; **[BLOG-ONLY]** estimate $0.001–$0.003 per 10K lines. At high volume, log delivery can cost more than the bandwidth it describes | Enterprise-only in practice |
| **Nginx / Apache raw logs** | Any self-managed origin | rsync/scp/S3 | Storage only | **The most accessible source for the SMB/self-hosted segment** — and the one that requires the least negotiation because the user often *is* the sysadmin |
| **Shopify / Wix / Squarespace / most SaaS CMS** | **None** | — | — | **No log access at any price.** Encode this: for these platforms, log analysis is permanently unavailable and the UI should say so rather than nagging. |

### 7.2 What fraction of users can realistically supply logs

No published statistic exists. **Our estimate, derived from the plan gates above** (label as our estimate, not a finding):

| Segment | Realistic log availability | Reason |
|---|---|---|
| Shopify / Wix / Squarespace / Webflow sites | **~0%** | No log product exists |
| WordPress on shared hosting | **~30%** | cPanel raw access logs exist but are often 24h-rotated and users don't know where they are |
| Self-managed VPS / Nginx / Apache | **~70%** | Technically available; needs a cron + rsync |
| Vercel Pro / Netlify Pro | **~40%** | Vercel: yes on Pro at $0.50/GB. Netlify: Enterprise-only |
| AWS CloudFront / ALB | **~80%** | Free to S3, just needs enabling |
| Cloudflare Free/Pro/Business | **~10%** | Enterprise-gated; only reachable via a custom Worker |
| Cloudflare Enterprise | **~90%** | Logpush available |
| **Weighted across our likely user base** | **≈ 20–30%** | |

**Architectural consequence: log analysis must be an optional, gracefully-degrading module.** Every core migration and CI feature must work without logs. Log analysis is an *upgrade*, not a dependency.

### 7.3 Volumes, parsing cost, and the 100M-lines/month reference case

Reference: a site doing **100,000,000 log lines/month** (~3.3M/day, ~38 req/s average).

| Stage | Sizing | Cost |
|---|---|---|
| Raw uncompressed (W3C/combined, ~350 bytes/line) | **~35 GB/month** | — |
| Gzip (~8:1 on log text) | **~4.4 GB/month** | — |
| Parquet + ZSTD, SEO-relevant columns only (12 of ~35 fields) | **~1.2–2 GB/month** | — |
| **S3 Standard storage, 13 months retained, Parquet** | ~20 GB total | **~$0.46/month** (@ $0.023/GB) |
| **S3 → local egress (one-off pull, 4.4 GB gz)** | | **~$0.40** (@ $0.09/GB) |
| **Cloudflare R2 storage** (no egress fee) | ~20 GB | **~$0.30/month** (@ $0.015/GB) |
| **Vercel Drains** at $0.50/GB on **uncompressed JSON** | 35 GB+ (JSON is fatter than W3C; assume ~60 GB) | **~$30/month** ⚠ |
| **Cloudflare Log Explorer** at $1/GB ingested | ~35 GB | **~$25/month** ⚠ |
| **Parsing/ingest compute** (DuckDB, single core, Parquet) | 100M rows | **~2–5 minutes**, <2 GB RAM |
| **Query** (e.g. "Googlebot hits by template, last 30d") | 100M-row Parquet scan with predicate pushdown | **~1–3 seconds** |

**Conclusions:**
1. **Storage and compute are effectively free** at 100M lines/month. **DuckDB + Parquet on local disk is the correct architecture** — no Elasticsearch, no ClickHouse server, no cloud warehouse. This fits the self-hosted, single-binary model perfectly.
2. **The cost is entirely in the delivery layer**, and it is provider-dependent by two orders of magnitude ($0.46/mo via S3 vs ~$30/mo via Vercel Drains for the same data). Our connector must warn the user of the estimated monthly delivery cost *before* they enable it.
3. **Column pruning at ingest is the highest-leverage optimisation.** Keep only: `timestamp`, `host`, `path`, `query`, `method`, `status`, `user_agent`, `client_ip`, `bytes`, `cache_status`, `referer`, `time_taken`. Drop cookies (also a privacy requirement — never ingest `cs(Cookie)`).
4. **Hash or truncate `client_ip` after bot verification.** For GDPR, store the verified-bot flag and the /24 prefix, then discard the full IP. Human traffic IPs should never be persisted.

### 7.4 Reference log-ingestion architecture

```
┌──────────────┐
│  Providers   │  CloudFront→S3 │ CF Logpush→R2 │ CF Worker→HTTP │ Vercel Drain→HTTP │ nginx→rsync
└──────┬───────┘
       │  (pull: S3/R2 list+get on a schedule;  push: authenticated HTTP collector endpoint)
       ▼
┌────────────────────────────────────────────────────────────────────┐
│ INGEST WORKER                                                      │
│  1. format sniffing: W3C tab / CLF / combined / JSON-lines / Parquet│
│  2. column projection (12 fields) + cookie/PII drop                │
│  3. URL normalisation → join key with the crawl inventory          │
│  4. bot classification:                                            │
│       a. UA regex → candidate bot label                            │
│       b. CIDR trie lookup vs Google's 6 IP-range JSON files        │
│       c. rDNS fallback (30-day cache) for anything unmatched       │
│       d. same for Bingbot, and for AI crawlers by UA + published   │
│          IP ranges where available (GPTBot, ClaudeBot, PerplexityBot│
│          Bytespider, Applebot-Extended, Meta-ExternalAgent, CCBot)  │
│  5. template classification: map path → template via the crawl's   │
│     template fingerprint (so "crawl by template" is answerable)    │
│  6. write hourly Parquet partitions: dt=YYYY-MM-DD/hour=HH/        │
└──────┬─────────────────────────────────────────────────────────────┘
       ▼
┌────────────────────────────────────────────────────────────────────┐
│ DuckDB over Parquet  (single file, no server)                      │
│  materialised rollups refreshed hourly:                            │
│   - bot_hits_by_template_day                                       │
│   - bot_hits_by_status_day                                         │
│   - first_seen_by_url (discovery latency)                          │
│   - crawl_waste_by_param                                           │
│   - orphan_crawled  (in logs, absent from crawl)                   │
│   - never_crawled   (in sitemap, absent from logs)                 │
│   - ai_bot_share_day                                               │
└────────────────────────────────────────────────────────────────────┘
```

Retention default: **13 months hot** (allows YoY), raw gz archived to cold storage or deleted after 90 days.

### 7.5 What logs answer that a crawl and GSC cannot

This is the justification for the whole module. Ranked by uniqueness:

| Question | Crawl? | GSC? | Logs? |
|---|---|---|---|
| **Crawl frequency by template** (are PDPs crawled 10× more than blog posts?) | ✗ | ✗ (Crawl Stats is site-level, aggregated, ~90 days) | **✓ exact** |
| **Orphan crawling** — Googlebot requesting URLs absent from your crawl and sitemap | ✗ by definition | ✗ | **✓ the only source** |
| **Crawl waste on parameters** — % of Googlebot budget spent on `?sort=`, `?sessionid=`, faceted combos | ✗ | Partial (URL Parameters tool retired) | **✓ exact, per-parameter** |
| **Discovery latency** — hours from publish to first Googlebot hit on a new URL | ✗ | Coarse | **✓ to the second** |
| **Bot-hit distribution across AI crawlers** — GPTBot vs ClaudeBot vs PerplexityBot vs Googlebot share | ✗ | ✗ | **✓ the only source** |
| **Real 5xx/timeout rate as experienced by Googlebot**, vs. what a crawler sees | Partial | Partial, lagged | **✓ exact, real-time** |
| **Whether Googlebot is actually following the new redirects** during a migration, at hour 1 | ✗ | ✗ (48–72h lag) | **✓ within minutes** — *this is the killer migration use case* |
| **Whether Googlebot is still hitting the old domain** at day 150 of the CoA window | ✗ | Partial | **✓ exact** |
| **Which URLs Googlebot has stopped crawling since the migration** | ✗ | ✗ | **✓** |
| **Cache hit rate for bot traffic** (CDN misconfig burning origin capacity on bots) | ✗ | ✗ | **✓** |

**During a migration, logs are the only near-real-time feedback loop.** GSC Performance data lags 2–3 days; the Index Coverage/Pages report lags longer. If you cut over at 02:00 and the redirects are 302s instead of 301s, logs tell you at 02:05 and GSC tells you on Thursday.

### 7.6 AI-crawler baseline for the log module (primary source)

From **Cloudflare's own blog, "The crawl-to-click gap," published 2025-08-29**, data range January–July 2025:

- **Crawl-to-refer ratios (July 2025):** Anthropic **38,065.7** pages crawled per human referral; OpenAI **1,091.4**; Google **5.4**.
- **AI crawling by purpose (July 2025):** training **79%**, search **17%**, user actions **3.2%**. Year over year, training rose from 72% → 79% and search fell 26% → 17%.

**[BLOG-ONLY / SECONDARY, treat with caution]** Aggregator sites report Cloudflare Radar monthly figures such as ClaudeBot 19.77% and GPTBot 9.40% of AI-bot traffic in June 2026 with Googlebot at 25.18%, and "bots generate 57.5% of web requests." These were not verifiable against a Cloudflare primary source in this research and should not be hard-coded. **Instead: compute these shares from the user's own logs.** That is more defensible and more useful than any industry average.

---

## 8. Post-launch monitoring cadence and deliverable (e) — rollback decision rules

### 8.1 Monitoring cadence

The binding constraint on all of this is **data latency**: logs are real-time; a crawl is minutes; GA4 is ~minutes-to-hours; **GSC Performance lags ~48–72 hours**; GSC Pages/Index Coverage lags ~3–7 days. **You cannot use GSC to make an hour-1 rollback decision.** Any monitoring design that ignores this is fiction.

| Window | Signals available | What to check | Automatable |
|---|---|---|---|
| **T-0 (cutover +0 to 15 min)** | Direct HTTP, logs | `post_deploy_gate`: all Tier-A assertions against **production**. `/robots.txt`, homepage 200 + indexable, top-50 P1 URLs return the manifest-declared status, no `X-Robots-Tag: noindex`, TLS chain valid, DNS resolving | **Full — T3** |
| **Hour 1** | Direct HTTP, logs, GA4 real-time | Full P1 URL sweep (typically 500–5,000 URLs) — status + canonical + robots. Log check: is Googlebot hitting the new URLs? Is it receiving 301s or 302s? Is the 5xx rate elevated? GA4 real-time sessions vs the same hour last week | **Full — T3** |
| **Hour 6** | + broader crawl | Full-site crawl of the new site. Redirect chain/loop scan. Orphan detection. Compare against golden snapshot | **Full — T3** |
| **Day 1** | + GA4 daily, logs | GA4 organic sessions vs 4-week same-weekday baseline. Googlebot request volume vs pre-migration daily baseline. Submit new sitemap; keep old sitemap submitted. Verify GSC property verification survived | **Full — T3**, sitemap submit is **T2** |
| **Day 3** | + **first usable GSC data** | GSC clicks/impressions vs baseline. GSC Pages report: "Page with redirect" and "Not found (404)" counts rising as expected for old URLs. Crawl Stats: response-code distribution | **Full — T3** |
| **Week 1** | All | Per-template traffic delta. Per-query position delta for the top 1,000 queries. Backlink-target 301 verification (100%). Index count on the new host trending up, old host trending down | **Full — T3** |
| **Week 2** | All | First point at which "is this recovering or is it broken?" is answerable with confidence. Compare the observed curve against `RECOVERY_ENVELOPE` for the declared type | **Full — T3** |
| **Week 4** | All | Should be at or above the envelope's expected trough. If not → escalate. Reduce monitoring cadence to weekly if within envelope | **Full — T3** |
| **Month 3** | All | Compare against `p50_recovery_days`. Full re-audit. Long-tail URL recovery. Decide whether to prune redirect rules that have had zero hits in 90 days (**recommendation: don't — keep at least 1 year per Google**) | **T3 report, T4 for any redirect removal** |
| **Day 150** | Logs, direct HTTP | **Hard alarm** — CoA 180-day window closing. Any 200 on the old domain must be fixed now | **T3 alert** |
| **Day 365** | — | Redirect-retention minimum reached. Recommend keeping indefinitely | **T3 alert** |
| **Month 16** | GSC | Pre-migration GSC data begins aging out of Google's 16-month window. Confirm our archive has it | **T3** |

### 8.2 Rollback decision rule set (deliverable e)

**Design principle: rollback must be decided on fast signals, because by the time GSC confirms a disaster it is 72 hours too late.** Named, numbered, thresholded rules. Each returns one of `OK`, `WATCH`, `ESCALATE`, `RECOMMEND_ROLLBACK`, `DEMAND_ROLLBACK`.

#### Tier 1 — Immediate, mechanical. Evaluated at T+0 and every 5 min for 2 hours. `DEMAND_ROLLBACK` = page the on-call human immediately.

| Rule | Condition | Verdict |
|---|---|---|
| **RB-01** | `/robots.txt` on production contains `Disallow: /` for `*` or `Googlebot` | **DEMAND_ROLLBACK** |
| **RB-02** | Homepage returns non-200, or is `noindex` (HTML or `X-Robots-Tag`) | **DEMAND_ROLLBACK** |
| **RB-03** | `noindex` present on **>1%** of sampled production URLs and not in the allowlist | **DEMAND_ROLLBACK** |
| **RB-04** | **>5%** of P1 URLs return 4xx or 5xx | **DEMAND_ROLLBACK** |
| **RB-05** | Site-wide 5xx rate (from logs or synthetic) **>2%** sustained over 10 minutes | **DEMAND_ROLLBACK** |
| **RB-06** | Canonical tags on **>1%** of URLs point to a host outside the production allowlist | **DEMAND_ROLLBACK** |
| **RB-07** | **>10%** of manifest redirects return 302/303/307 instead of 301/308 | **RECOMMEND_ROLLBACK** (fixable forward in minutes — prefer roll-forward if the edge config can be patched) |
| **RB-08** | Any redirect loop detected on a P1 URL | **RECOMMEND_ROLLBACK** |
| **RB-09** | TLS certificate invalid/expired/host-mismatch for any production hostname | **DEMAND_ROLLBACK** |
| **RB-10** | `/robots.txt` returns 5xx (Google halts crawling for 12h, then risks stopping entirely after 30 days) | **DEMAND_ROLLBACK** |

#### Tier 2 — Hour 1 to Day 1. Requires a crawl and log evidence.

| Rule | Condition | Verdict |
|---|---|---|
| **RB-11** | **>2%** of P1 URLs unmapped and 404ing | **RECOMMEND_ROLLBACK** |
| **RB-12** | Googlebot request volume drops **>60%** vs the trailing 7-day same-hour baseline, sustained 6 hours | **ESCALATE** |
| **RB-13** | Googlebot 4xx response rate **>15%** of its requests (was <2% pre-migration) | **ESCALATE** |
| **RB-14** | GA4 organic sessions down **>50%** vs the 4-week same-weekday-same-hour baseline, sustained 6 hours | **RECOMMEND_ROLLBACK** |
| **RB-15** | Structured-data `@type` loss on **>25%** of a revenue-bearing template (e.g. `Product` gone from PDPs) | **ESCALATE** |
| **RB-16** | Median internal outlinks per template down **>50%** | **ESCALATE** |
| **RB-17** | Orphan URL count increased by **>10%** of total inventory | **ESCALATE** |
| **RB-18** | hreflang reciprocity below **90%** on a multi-locale site | **ESCALATE** |

#### Tier 3 — Day 3 to Week 4. GSC-informed. **Rollback is usually the wrong answer here** — a second migration compounds the damage.

| Rule | Condition | Verdict |
|---|---|---|
| **RB-19** | GSC clicks down **>40%** vs baseline at **day 7** | **ESCALATE** (diagnose; do not roll back) |
| **RB-20** | GSC clicks down **>30%** vs baseline at **week 4** AND worse than the type's `expected_trough_pct` | **ESCALATE — full forensic re-audit** |
| **RB-21** | GSC "Page with redirect" count on the old property **not rising** by day 7 (Google isn't seeing the redirects) | **ESCALATE** |
| **RB-22** | New-property indexed-page count **<50%** of the old property's at week 4 | **ESCALATE** |
| **RB-23** | At **month 3**, traffic still below `100% - expected_trough_pct` and outside `p50_recovery_days` | **ESCALATE — recovery project** |

#### Rollback preconditions the tool must verify *before* the migration, and block if absent

A rollback rule set is worthless if rollback is impossible. Assert at step P9:

1. **`rollback_possible: true|false`** must be explicitly declared in the manifest, with a named mechanism (DNS revert with a stated TTL, blue/green swap, feature-flag flip, previous-deployment promotion).
2. **`rollback_rto_minutes`** — the measured, not estimated, time to revert. If it exceeds 60 minutes, Tier-1 rules should be re-tuned toward roll-forward.
3. **DNS TTL** must have been lowered ≥1 week prior (Google's own guidance) — otherwise a DNS-based rollback takes as long as the old TTL.
4. **Database migrations must be reversible or additive-only.** If the replatform destructively migrates data, **rollback is not available and the tool must say so in bold at sign-off.** This is the most common reason a rollback plan turns out to be fictional.
5. **Old origin must remain warm** for at least 72 hours post-cutover. Google's own guidance: only decommission "once old server logs show zero traffic."

**Explicit guidance the tool must surface:** after roughly **hour 24**, rolling back is usually worse than fixing forward, because a rollback is itself a second migration that Google must re-process. The rule tiers encode this: Tier 1 and 2 can demand rollback; Tier 3 never does.

---

## 9. The organisational reality — how SEO actually ships

### 9.1 Hard numbers: what exists and what doesn't

**Honest finding: there is no credible published statistic for "% of SEO recommendations implemented" or "median lag from recommendation to production."** This research found none in 2024–2026 primary or survey literature. Claims that circulate are unsourced.

What *is* available, all secondary and soft:

- **[BLOG-ONLY]** "Enterprise SEO recommendations routinely take six to nine months to implement due to internal red tape and competing priorities." No dataset behind it.
- **[BLOG-ONLY]** Technical SEO change-to-effect timelines are commonly quoted as 1 week (robots.txt/config changes) to 12+ weeks (Core Web Vitals), with "most standard technical optimizations delivering measurable results within 4–8 weeks." This is *time-to-effect*, not *time-to-implementation*, and the two are routinely conflated.
- **[VENDOR]** Conductor's "State of Organic Marketing 2025" and BrightEdge's June 2025 survey (68% of marketers embracing the AI-search shift) exist but address strategy, not implementation throughput.
- **Practitioner consensus**, repeatedly expressed but never quantified: "the most effective enterprise SEO practitioners spend more time on internal communication and stakeholder management than on technical implementation."

**This is itself a strategically important finding.** The core value proposition of an autonomous SEO engineer is *closing the implementation gap* — and the size of that gap is undocumented. **We should instrument it.** Track, per install: recommendation created → ticket opened → PR opened → merged → deployed. Publishing an "SEO Implementation Gap Report" from real telemetry would be both a genuine contribution and the strongest possible marketing asset, because it is the number that justifies the product's existence and nobody has it.

### 9.2 Ticket formats that get picked up vs ignored

Synthesised from practitioner sources; treat as opinionated design guidance, not measured fact.

**Ignored:** a 40-page PDF audit. A spreadsheet of 3,000 URLs. "Improve internal linking." A recommendation with no acceptance criteria. Anything phrased as an SEO score. Anything that requires the developer to learn SEO to evaluate it.

**Picked up:** a ticket that a developer can close without asking a question. The format to generate:

```
Title: [SEO] Add self-referencing canonical to /blog/* template

Context (1 sentence, business impact):
  1,847 blog URLs currently have no canonical tag; Google is
  consolidating 312 of them onto the wrong URL, costing ~4,100
  clicks/month (GSC, last 28d).

Files likely affected:
  app/blog/[slug]/page.tsx  (line ~24, the <head> block)

Change:
  Add: <link rel="canonical" href={`https://example.com/blog/${slug}`} />

Acceptance criteria (each independently verifiable):
  AC1. GET /blog/any-slug returns HTML containing exactly one
       <link rel="canonical"> element.
  AC2. Its href equals the request URL, absolute, https, no query string.
  AC3. Assertion B03 passes at >= 0.98 on the preview deployment.
  AC4. No change to any non-/blog/ route (assertion B04 <= 2%).

Verification: the SEO gate on this PR will assert AC1-AC4 automatically.
Estimated effort: 1 story point.
Rollback: revert the commit; no data migration.
```

Every element earns its place: business impact justifies prioritisation; the file hint removes discovery work; the acceptance criteria are machine-checkable; **the CI gate means the developer does not have to trust the SEO's judgement, only the test.** That last point is the actual unlock — it converts an argument into a build status.

**This is the strongest argument for coupling our recommendation engine to our CI gate.** A recommendation that ships with its own test is qualitatively different from one that doesn't.

### 9.3 Release mechanics the module must model

| Mechanic | Implication for the agent |
|---|---|
| **Sprint cadence** (1–2 weeks) | A "fix" proposed on day 3 of a sprint lands in the *next* sprint at best. Median lag ≥ 2 weeks before any queueing. |
| **Release trains** | Fixes batch. The agent should batch its own PRs to match, not open 40 PRs. |
| **Feature flags** | Increasingly the answer to code freezes — teams "ship code early but keep functionality off, then during the freeze only flip flags." The agent should ask whether a flag exists for a template change. |
| **Code freeze (retail, Nov–Dec)** | Real and widely practised. Documented 2025 examples: one platform set **2025-11-03** as the last day to push site implementations live; another froze **Nov 24 – Dec 2**. **[BLOG/VENDOR-sourced examples, but the practice is uncontested.]** Rationale cited: e-commerce generates 40%+ of annual revenue between Halloween and January. |
| **Other freeze windows** | Fiscal year end, major marketing launches, Prime Day/BFCM, regulated-industry audit periods. |
| **Who owns the deploy** | Almost never the SEO. The agent must have a `deploy_owner` field and route escalations to a human, not a queue. |
| **QA sign-off** | An SEO change that fails QA for an unrelated reason gets dropped from the release. The agent must track ticket state, not just ticket creation. |

**Concrete requirement: a first-class freeze calendar.**

```yaml
# .seo/freeze.yml
freezes:
  - name: "Holiday code freeze"
    start: 2026-11-02
    end:   2027-01-05
    recurrence: annual
    allowed: [content_only, metadata_only]      # what the agent MAY still do
    blocked: [redirects, robots_txt, canonical, template, migration, schema]
  - name: "Fiscal year end"
    start: 2027-03-20
    end:   2027-04-05
    allowed: []
    blocked: [all]
autonomy_during_freeze: T0    # observe only
```

During a freeze the agent must: drop to **T0 (observe)**, continue monitoring and alerting at full fidelity, **queue** recommendations with a post-freeze target date, and **refuse** all writes with a clear message naming the freeze. An autonomous tool that pushes a redirect change on Black Friday is a tool that gets uninstalled and written about.

---

## 10. Deliverable (f) — What an autonomous agent must REFUSE or ESCALATE

### 10.1 Hard refusals (T4 — the agent must never do these, at any autonomy setting)

| # | Action | Why |
|---|---|---|
| R1 | **Execute a domain change or DNS cutover** | Irreversible within DNS TTL; affects email (MX), certificates, and every other service on the domain. Outside SEO's blast radius. |
| R2 | **Deploy a redirect map to production** | A wrong map at scale is the single most destructive act in SEO. Generate + validate + hand over. |
| R3 | **File a Change of Address** | No API exists. Also a legal/ownership assertion about two properties. |
| R4 | **Modify production `robots.txt`** without explicit per-change human approval | The `Disallow: /` blast radius is total, and Google caches it for up to 24h. |
| R5 | **Add or remove `noindex` at template scope** | Same reasoning; a single template edit can deindex a whole site section. |
| R6 | **Enable HSTS `preload`** | Effectively irreversible; removal from the preload list takes months. |
| R7 | **Delete or 410 any URL with recorded clicks or referring domains** | Destroys equity irreversibly. |
| R8 | **Remove redirects** before 365 days post-migration | Contradicts Google's explicit guidance. |
| R9 | **Decommission the old origin/domain** | Google's guidance: only after logs show zero traffic. This is an infra decision. |
| R10 | **Execute a rollback** | Rollback is an incident-response act with non-SEO consequences (data, sessions, payments). Recommend loudly; never pull the trigger. |
| R11 | **Any write during a declared freeze window** | §9.3. |
| R12 | **Change hreflang or canonical policy site-wide** | Cross-locale misconfiguration silently serves the wrong market. |
| R13 | **Push a schema/structured-data change that alters price, availability, review or rating data** | Google policy exposure and, for ecommerce, potential consumer-law exposure. |
| R14 | **Crawl a staging environment it was not explicitly given credentials for** | Credential misuse; also risks triggering WAF/DDoS mitigations. |
| R15 | **Ingest raw logs containing cookies, full IPs of human visitors, or auth headers** | Privacy/GDPR. Strip at ingest, before persistence. |

### 10.2 Mandatory escalations (agent stops and asks a named human)

| # | Trigger |
|---|---|
| E1 | Any P1 URL is unmapped after all six redirect-map passes |
| E2 | Redirect-map confidence below 0.85 on any P1 URL |
| E3 | >5% of the total inventory is unmapped |
| E4 | Any Tier-1 rollback rule fires |
| E5 | The migration manifest declares `rollback_possible: false` |
| E6 | A destructive/non-reversible database migration is detected in the changeset |
| E7 | The site is inside 14 days of a declared freeze window |
| E8 | The migration type is `ma_consolidation` or `domain_split` (always human-led) |
| E9 | GSC property verification is missing on either the old or the new property |
| E10 | Legal/brand implications detected (domain transfer, trademark change, jurisdiction/ccTLD change) |
| E11 | Any assertion in Tier A fails on production |
| E12 | The old domain still returns 200 at day 150 of the CoA window |
| E13 | Log delivery cost estimate exceeds a user-set monthly budget |
| E14 | The user's platform (Shopify/Wix/Squarespace) makes a required step impossible |

### 10.3 Safe autonomous actions during a migration (T3 — no approval needed)

Capture baselines; crawl staging and production; run all assertions; build and score the URL inventory; generate the candidate redirect map (as an artefact, not a deployment); validate V1–V15; monitor all cadences; fire alerts; ingest and analyse logs; produce the post-migration report; draft tickets and PRs (open, never merge); archive GSC data past the 16-month window; verify redirects continuously for 365 days.

---

## 11. Direct implications for our tool

### 11.1 Build these, in this order

**Phase 1 — the SEO gate (highest ROI, lowest risk, no migration required).**
Ship `@ourtool/seo-gate`: a single binary/npm package that crawls a target URL set, diffs against a committed golden snapshot, and exits non-zero. Tier A + Tier B assertions from §6.2. GitHub annotations + JUnit XML output. Vercel bypass header and Cloudflare Access service-token support built in. Two-phase warn→error rollout, 90-second budget, deterministic sampling, auto-quarantine.
*Why first:* it is useful to every user on day 1 with no migration in progress, it is the wedge into the dev team's workflow, it makes every other recommendation we produce verifiable, and **it is the thing that prevents the catastrophic failure class.** It also fills the hole ContentKing left when Conductor withdrew it from self-serve in 2025.

**Phase 2 — baseline archival.**
"We keep your Search Console data past Google's 16-month deletion." Daily Search Analytics API pull into local Parquet, plus optional GSC BigQuery bulk export ingestion (`searchdata_url_impression`, `searchdata_site_impression`, `ExportLog`). Cheap to build, compounding value, and a genuine reason to install *before* you need it. Storage is ~2–6 GB for a 100k-URL site.

**Phase 3 — migration module.**
Manifest-driven. 8-source URL inventory, value scoring, the six-pass redirect map generator, V1–V15 validation, the monitoring cadence, the rollback rule set. Explicitly generate-and-validate, never execute.

**Phase 4 — log ingestion (optional module).**
DuckDB + Parquet. Connectors in order of accessibility: **nginx/Apache file** → **AWS CloudFront/ALB S3** (free) → **Cloudflare Worker collector** (the non-Enterprise escape hatch) → **Vercel Drains** → **Cloudflare Logpush** (Enterprise). Show the estimated monthly delivery cost before enabling.

### 11.2 Specific technical decisions

- **DuckDB + Parquet for everything analytical.** 100M log lines parse in 2–5 minutes and query in 1–3 seconds on a laptop. No server, no Elasticsearch, no warehouse. This is what makes the self-hosted story credible.
- **Blocking/LSH is mandatory in the fuzzy matcher.** Naive O(n²) makes the 100k+ case impossible. Not an optimisation — a correctness requirement.
- **Local ONNX embedding model** for Pass 5 so a 1M-URL migration doesn't generate an API bill on the free tier.
- **Copy Lighthouse CI's assertion config schema** (`off|warn|error`, `minScore`, `maxLength`, `maxNumericValue`, `aggregationMethod`, preset inheritance). It is battle-tested, developers already know it, and it makes our config look native.
- **Check HTTP headers separately from HTML.** `X-Robots-Tag: noindex` is the most-missed failure and is invisible to HTML-only parsing.
- **Ship the Vercel custom-preview-domain rule as a named check.** Vercel omits `X-Robots-Tag: noindex` when a custom domain is on a non-production branch — a documented, common, silent indexing leak.
- **Never bulk-redirect unmapped URLs to the homepage.** Encode this as a hard V6 validation failure at >2%.
- **Model both Google clocks:** 180-day CoA signal window and 365-day redirect-retention recommendation. Alert at day 150 and day 365.
- **Fetch Google's six crawler IP-range JSON files daily** into a CIDR radix trie; rDNS only as a cached fallback.
- **Strip cookies and full human IPs at ingest**, before persistence.

### 11.3 Positioning

- **"Your site's pre-flight checklist"** is a better frame than "AI SEO." It maps onto something dev teams already believe in (CI), it is verifiable, and it is honest about what the tool does.
- **Lead with the disaster prevention story**, quantified by mechanism rather than by a made-up percentage: "A staging `Disallow: /` reaching production is cached by Google for up to 24 hours and can deindex your site. This tool fails the build instead."
- **Do not quote the 523-day figure without its scope.** It is a domain-rebrand-only dataset from third-party traffic estimates. Misusing it is exactly the kind of thing that costs credibility with the technical SEOs we most want as early adopters.
- **The self-hosted deployment is a genuine moat for staging access.** A local agent inherits the developer's VPN, `/etc/hosts`, and allowlisted IP. No SaaS crawler can.
- **Instrument and publish the implementation gap.** Nobody has the number for "% of SEO recommendations that ship, and how long they take." We will be uniquely positioned to measure it.

### 11.4 Honest limitations to state publicly

1. Log analysis will be unavailable to an estimated **70–80%** of users (Shopify/Wix/Squarespace have no log product at all; Cloudflare gates zone logs behind Enterprise). Say so, and degrade gracefully.
2. The **Change of Address tool has no API.** It will always be a human step.
3. **URL Inspection API's 2,000 QPD per site** makes per-URL index verification impossible at scale. Sample; don't promise full coverage.
4. Automated redirect mapping on genuinely restructured sites will produce wrong matches. Our published expectation should be that **Passes 4–5 carry a 5–15% error rate** and that P1 URLs are always human-reviewed. Claiming otherwise is how a tool destroys a client's traffic.
5. **We cannot prove a migration is safe from staging alone.** Roughly half the failure modes (CDN rules, prod robots.txt, DNS, HSTS, certs, edge-injected headers) exist only in production. Two gates, not one.

---

## 12. Sources

All accessed **2026-09-01** unless stated.

### Primary — Google
- Site move with URL changes — https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- Site move without URL changes — https://developers.google.com/search/docs/crawling-indexing/site-move-no-url-changes
- Change of Address tool (Search Console Help) — https://support.google.com/webmasters/answer/9370220
- Redirects and Google Search — https://developers.google.com/search/docs/crawling-indexing/301-redirects
- HTTP status codes, network and DNS errors — https://developers.google.com/search/docs/crawling-indexing/http-network-errors
- robots.txt specification and handling — https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
- Verifying Googlebot and other Google crawlers (IP-range JSON files) — https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
- Search Console API usage limits — https://developers.google.com/webmaster-tools/limits
- Search Console bulk data export setup — https://support.google.com/webmasters/answer/12917675
- Search Console bulk export table reference — https://support.google.com/webmasters/answer/12917991
- Search Console performance data filtering and limits (deep dive) — https://developers.google.com/search/blog/2022/10/performance-data-deep-dive *(2022 — **STALE**, but the 16-month/1,000-row/50,000-row limits it describes remain current)*

### Primary — platforms and infrastructure
- Vercel Deployment Protection — https://vercel.com/docs/deployment-protection *(doc last_updated 2026-08-21)*
- Vercel Protection Bypass for Automation — https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation *(2026-08-11)*
- Vercel: Are preview deployments indexed by search engines? — https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines
- Vercel Drains (pricing, schemas) — https://vercel.com/docs/drains *(2026-08-25)*
- Cloudflare Logpush overview (plan availability) — https://developers.cloudflare.com/logs/logpush/
- Cloudflare `http_requests` Logpush dataset fields — https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/zone/http_requests/
- Cloudflare Access service tokens — https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
- Cloudflare Workers pricing (Workers Logpush $0.05/M) — https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare plans/pricing — https://www.cloudflare.com/plans/
- AWS CloudFront standard logging (v2) — https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logging.html
- Fastly real-time log streaming — https://www.fastly.com/documentation/guides/integrations/streaming-logs/
- Akamai DataStream 2.1 — https://techdocs.akamai.com/datastream2/docs/welcome-datastream2
- Lighthouse CI configuration (assertion syntax) — https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
- Screaming Frog SEO Spider user guide (CLI, £199/yr, 500-URL free cap) — https://www.screamingfrog.co.uk/seo-spider/user-guide/general/
- Lumar for web developers (GraphQL API, Protect) — https://www.lumar.io/by-team/software-tools-for-web-developers/

### Practitioner / study
- Dan Taylor, "How Long Should An SEO Migration Take? [Study Updated]", Search Engine Journal, 2025-01-08 — https://www.searchenginejournal.com/study-how-long-should-seo-migration-take/492050/ *(892 domain migrations; 523-day mean; 17% unrecovered at 1,000 days; Ahrefs-estimated traffic)*
- Cloudflare, "The crawl-to-click gap: Cloudflare data on AI bots, training, and referrals", 2025-08-29 — https://blog.cloudflare.com/crawlers-click-ai-bots-training/ *(Anthropic 38,065.7:1; OpenAI 1,091.4:1; Google 5.4:1; training 79% / search 17% / user actions 3.2%)*
- Aleyda Solis, SEO for Web Migrations hub — https://www.aleydasolis.com/en/search-engine-optimization/seo-for-web-migrations/
- Aleyda Solis, "URLs Changes & Web Migration Minimum Viable SEO Validation Checklist" — https://docs.google.com/spreadsheets/d/1EbO3nilXXJ4kcnReTz-05f4PRKup33EVJdCJ23Ei-8Y/edit
- Aleyda Solis, HTTP→HTTPS Migration SEO Checklist — https://docs.google.com/spreadsheets/d/1XB26X_wFoBBlQEqecj7HB79hQ7DTLIPo97SS5irwsK8/edit
- SearchPilot, "A Look Back at the Most Surprising Tests of 2025" — https://www.searchpilot.com/resources/case-studies/a-look-back-at-the-most-surprising-tests-of-2025 **[VENDOR, but methodologically rigorous split tests]**
- SearchPilot, "10 SEO A/B tests that delivered over 10% more traffic" — https://www.searchpilot.com/resources/blog/10-seo-ab-tests-with-an-impact-of-over-10-percent **[VENDOR]**
- Search Engine Land, "How to speed up site migrations with AI-powered redirect mapping" — https://searchengineland.com/site-migrations-ai-powered-redirect-mapping-437793 **[BLOG]**
- Chris Lever, "Exploring Embeddings for Redirect Mapping" (Mar 2025) — https://chrisleverseo.com/blog/exploring-embeddings-for-redirect-mapping/ **[BLOG-ONLY]**
- Sally Mills, FuzzyMatch for Automated Redirect Mapping (free Colab) — https://sallymills.com/fuzzymatch-for-automated-redirect-mapping-free-colab-script/ **[BLOG-ONLY]**
- Search Engine Land, "The checks that make or break your next website migration" — https://searchengineland.com/website-migration-checks-472260 **[BLOG]**
- SEJ, "A Guide To Enterprise-Level Migrations (100,000+ URLs)" — https://www.searchenginejournal.com/enterprise-level-migrations-guide/489489/ **[BLOG]**

### OSS tooling referenced
- `juampi92/test-seo` — https://github.com/juampi92/test-seo
- `marcortola/behat-seo-contexts` — https://github.com/marcortola/behat-seo-contexts
- `SeoScoreAPI/seo-audit-action` — https://github.com/SeoScoreAPI/seo-audit-action
- `puneetindersingh/open-seo-crawler` — https://github.com/puneetindersingh/open-seo-crawler

### Flagged as unverifiable
- "60–80% of migrations lose significant traffic", "only 10% of migrations improve SEO", "50% traffic loss is common" — no primary source found; appear across multiple mutually-citing 2025–2026 SEO blogs, several apparently AI-generated. **Do not use.**
- Semrush "2025 Website Health Benchmark Report" 72%/76% figures — **[VENDOR]**, self-selected audit-tool user base; not a launch-incident rate.
- Cloudflare Radar monthly AI-crawler share figures for 2026 (ClaudeBot 19.77%, GPTBot 9.40%, Googlebot 25.18%, "bots = 57.5% of requests") — sourced only from aggregator blogs; **not verified against a Cloudflare primary page.**
- Akamai DataStream "$0.001–$0.003 per 10K log lines" — **[BLOG-ONLY]**
- Lumar "$400–$2,000+/month" / "~$2,667/month" — **[BLOG-ONLY]**; Lumar does not publish pricing.
- "Enterprise SEO recommendations take 6–9 months to implement" — **[BLOG-ONLY]**, no dataset.
- Netlify plan gating for password protection and log drains — from secondary sources; **verify against Netlify's own docs before relying on it.**
