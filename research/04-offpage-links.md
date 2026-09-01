# 04 — Off-Page SEO, Link Building & Digital PR: What an Autonomous Agent Can Safely Automate

**Research date:** 2026-08-31
**External fact-check pass:** 2026-09-01 — 6 load-bearing claims verified; 2 confirmed, 3 partially true, 1 refuted. All corrections applied inline; audit trail in **§14 Fact-check log**.
**Scope:** backlink data sources & APIs (with 2026 pricing), toxic-link/disavow reality, unlinked mentions, broken-link building, competitor gap analysis, digital PR / HARO-successor platforms, outreach automation & its legal constraints, link-scheme risk under Google policy, authority metrics, and an explicit autonomy model for our agent.

---

## 0. TL;DR — The opinionated conclusion

1. **Off-page is the single most dangerous surface for an autonomous SEO agent.** Everything on-page (schema, internal links, titles, sitemaps) is reversible and affects only the user's own property. Off-page actions touch *third parties* (their inboxes, their sites) and are governed by **statute** (CAN-SPAM, GDPR/ePrivacy, PECR) and by **Google's spam policies**, where the penalty is a manual action on the user's domain. A bug in our internal-linking module costs a rollback. A bug in our outreach module costs the user a €900,000 CNIL-scale exposure, a burned sending domain, or an "Unnatural links to your site" manual action.
2. **Therefore: our tool should ship with link *acquisition* execution OFF by default and gated behind human approval, permanently — not as a "raise the autonomy slider" feature.** We should automate 100% of *research, discovery, drafting, monitoring, and reporting*, and 0% of *sending and publishing to third parties* without an explicit per-item human click.
3. **There must be a hard-coded refusal list** (buying links, PBN construction, mass unsolicited outreach above a rate cap, auto-generating guest posts at scale, link-exchange brokering, comment/forum link injection). These are named verbatim in Google's spam policies, last updated **2026-08-28**.
4. **Disavow is now a niche, manual-action-only tool.** Google's own doc: *"In most cases, Google can assess which links to trust without additional guidance, so most sites will not need to use this tool."* There is **no disavow API**. Our tool must never auto-generate-and-upload a disavow file; at most it produces a candidate file for a human who has an actual manual action.
5. **A free own-profile backlink path exists and should ship first.** The Search Console API has no links endpoint and no disavow endpoint (confirmed against the live discovery doc, revision 20260830) — but the **GSC Links report exports up to 100,000 rows for free via the UI**. Accepting a user-uploaded CSV is a real, zero-COGS ingest path. A paid index is required only for *automated* refresh, *competitor* backlinks, or data beyond the verified property.
6. **The HARO-successor ecosystem is NOT API-less.** Connectively (ex-Featured, owner of HARO) documents a partner-gated press-opportunity API. Build the native adapter; apply for access on day one. Email-digest parsing is the fallback for HARO, SOS, Qwoted, SourceBottle, and Help a B2B Writer.
7. **DataForSEO is the correct backlink data backend for a $8/month product.** ~$0.30/site/month for a solid monthly refresh; $0.024/request + $0.000036/row, no seat fees, $50 minimum top-up. Ahrefs ($129/mo floor + units), Semrush (SEO Business tier ≈ $499.95/mo + units, 40 units/line for every backlink row), Moz and Majestic ($399.99/mo for the API tier) are all BYO-key integrations, not bundleable.
8. **The strategic shift is real and measurable:** Ahrefs' Dec-2025 study of 75,000 brands found branded web mentions correlate **0.664–0.709** with AI-assistant visibility vs **0.266–0.326** for Domain Rating and ~0.19–0.30 for raw backlinks. Our product should reframe "link building" as **entity/mention building**, which is both more effective *and* far safer to automate (monitoring + drafting, no link solicitation).

---

## 1. Google's current policy text (primary, verbatim)

### 1.1 Link spam — `developers.google.com/search/docs/essentials/spam-policies`
**Page last updated: 2026-08-28 UTC.** (Freshest possible.)

> "Link spam is the practice of creating links to or from a site primarily for the purpose of manipulating search rankings."

Enumerated violations (verbatim/near-verbatim):

| # | Prohibited practice | Direct implication for our agent |
|---|---|---|
| 1 | "Buying or selling links for ranking purposes. This includes: Exchanging money for links, or posts that contain links; Exchanging goods or services for links; Sending someone a product in exchange for them writing about it and including a link" | **Hard refuse.** No marketplace integrations, no "buy this link" button, no budget field for link spend. |
| 2 | "Excessive link exchanges ('Link to me and I'll link to you') or partner pages exclusively for the sake of cross-linking" | **Hard refuse.** No cross-user link-exchange network — this would be the single most tempting and most fatal feature for a multi-tenant hosted tier. |
| 3 | "Using automated programs or services to create links to your site" | **This clause names us.** It is the reason the agent must never *create* a link on a third-party property. Discovery/drafting is not "creating links"; auto-posting is. |
| 4 | "Requiring a link as part of a Terms of Service, contract, or similar arrangement without allowing a third-party content owner the choice of qualifying the outbound link" | Relevant if we ever add a "powered by" backlink to the self-hosted dashboard — it must be `nofollow`/optional. |
| 5 | "Text advertisements or text links that don't block ranking credit" | Any sponsorship the agent suggests must carry `rel="sponsored"`. |
| 6 | "Advertorials or native advertising where payment is received for articles that include links that pass ranking credit" | Guest-post-for-pay is out. |
| 7 | Low-quality directory links; keyword-rich hidden links in widgets; footer links; forum comments with optimized links; low-value content created primarily for link manipulation | Kills "auto-submit to 500 directories," "auto-comment," "widget link" features. |

**The carve-outs (verbatim) — note there is more than one, and the paid-links one is narrowly scoped:**

1. **Advertising/sponsorship only:**
   > "Google does understand that buying and selling links is a normal part of the economy of the web for advertising and sponsorship purposes. It's not a violation of our policies to have such links as long as they are qualified with a `rel="nofollow"` or `rel="sponsored"` attribute value to the `<a>` tag."

   ⚠️ **Read this narrowly.** It is scoped to *advertising and sponsorship* links. It does **not** extend to the automated-link-creation bullet (#3) or the link-exchange bullet (#2). Qualifying an exchanged link with `nofollow` does **not** bring a link-exchange network inside the carve-out.
2. **The ToS bullet has its own built-in exception:** requiring a link is only spam "*without* allowing a third-party content owner the choice of qualifying the outbound link" — i.e. requiring a link **is** permitted if the publisher is free to `nofollow`/`sponsored` it.
3. **The whole section is scoped by intent:** link spam is defined as links created "primarily for the purpose of manipulating search rankings," and the exchange bullet is further qualified by "**Excessive**" and "**exclusively** for the sake of cross-linking." Not every reciprocal link is per se a violation.

**Qualifying attribute values are three, not two:** `rel="sponsored"`, `rel="ugc"`, and `rel="nofollow"` (see §1.3). The spam-policies page names only `nofollow`/`sponsored` in the paid-links sentence, but its ToS bullet points generically at "qualifying the outbound link," which resolves to the three-value doc.

**Open ambiguity — document it, don't rely on it:** Google has never explicitly stated that a *fully* `rel="nofollow"`/`"sponsored"`-qualified reciprocal-link exchange is compliant. The "primarily for the purpose of manipulating search rankings" definition arguably would not catch it, but there is no primary-source statement to that effect. ⚠️ unverified — must be confirmed during implementation; until then, **treat qualified link exchange as prohibited.**

**Do not confuse the "Link spam" section with the separate "Machine-generated traffic" section** — the latter covers "sending automated queries to Google… scraping results for rank-checking purposes" and violates both the spam policies *and* the Google Terms of Service. That section governs our **rank-tracking crawler**, not our link features.

**2026 freshness note:** the 2026-08-28 edit did not alter the link-spam bullets. The August 2026 spam update was an algorithmic ranking update, not a policy rewrite — it added no new spam-policy categories and did not target link spam (secondary: seroundtable). The notable 2026 *policy* edit was **2026-05-15**, which rewrote the opening line to extend all spam policies to generative-AI responses (AI Overviews / AI Mode), not just blue links.

### 1.2 Adjacent policies our agent must respect
- **Site reputation abuse** ("parasite SEO"): *"Third-party content is content that's created by an entity that's separate from the established host site."* Exempt: wire services, UGC platforms, clearly-attributed freelancer work. → Our agent must not recommend "rent a subfolder on a news site."
- **Scaled content abuse**: *"Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings."* Explicitly includes "using generative AI tools… to generate many pages." → Directly constrains any "auto-publish 200 guest posts" idea.
- **Expired domain abuse**: *"where an expired domain name is purchased and repurposed primarily to manipulate search rankings."* → This is the PBN clause. Any feature that surfaces "expiring domains with good DR" is a PBN-enablement feature. **Refuse.**

### 1.3 Link qualification attributes — `qualify-outbound-links` (last updated **2025-12-10 UTC**)
- `rel="sponsored"` — "Mark links that are advertisements or paid placements (commonly called *paid link*)."
- `rel="ugc"` — "We recommend marking user-generated content (UGC) links, such as comments and forum posts."
- `rel="nofollow"` — "Use the `nofollow` value when other values don't apply, and you'd rather Google not associate your site with, or crawl the linked page from, your site."
- Values may be combined (`rel="nofollow sponsored"`). Google treats them as hints for crawling/indexing purposes but "Links marked with these `rel` attributes will generally not be followed."

### 1.4 Link best practices — `links-crawlable` (last updated **2025-12-10 UTC**)
- *"Google can only crawl your link if it's an `<a>` HTML element with an `href` attribute."* (No `span`+onclick, no `routerLink`.)
- *"Every page you care about should have a link from at least one other page on your site."*
- Warns against generic anchors ("click here", "read more") and against keyword-stuffed anchors ("this violates spam policies").
- Encourages outbound citation links; `nofollow` should be reserved for untrusted sources, not applied universally.

### 1.5 Manual actions — `support.google.com/webmasters/answer/9044175`
16 manual action types exist. The two link ones:
- **"Unnatural links to your site":** *"Google has detected a pattern of unnatural, artificial, deceptive, or manipulative links pointing to your site. Buying links or participating in link schemes in order to manipulate ranking in Google Search results is a violation of our spam policies."*
- **"Unnatural links from your site":** same wording for outbound links.
- Remediation wording that matters for us: *"If you can get a backlink removed, make a good-faith effort to remove the link first. **Blindly adding all backlinks to the disavow file is not considered a good-faith effort.**"*

> **This sentence is the single strongest argument against an "auto-disavow" feature.** An LLM bulk-generating a disavow file *is literally* "blindly adding all backlinks."

### 1.6 Spam update history (primary: Google Search Status Dashboard)
| Update | Start | Duration |
|---|---|---|
| August 2026 spam update | 2026-08-18 | 2d 16h |
| June 2026 spam update | 2026-06-24 | 2d 1h |
| May 2026 core update | 2026-05-21 | 11d 21h |
| March 2026 core update | 2026-03-27 | 12d 4h |
| March 2026 spam update | 2026-03-24 | 19h 30m |
| December 2025 core update | 2025-12-11 | 18d 2h |
| August 2025 spam update | 2025-08-26 | 26d 15h |
| June 2025 core update | 2025-06-30 | 16d 18h |
| March 2025 core update | 2025-03-13 | 13d 21h |
| December 2024 spam update | 2024-12-19 | 7d 2h |

**Key structural finding: the dashboard lists NO named "link spam update" in 2024, 2025, or 2026.** The last explicitly-named link spam update was **December 2022** (SpamBrain-powered). Google now folds link-spam neutralisation into SpamBrain + core, running continuously. Practical read: **spammy links are increasingly *ignored* rather than *punished algorithmically*; the punitive path is the manual action.** This is exactly why disavow matters less and why "toxic link cleanup" is largely a paid-tool upsell rather than a real ranking lever.

Google's own description of what a link spam update does: *"when our systems remove the effects spammy links may have, any ranking benefit the links may have previously generated for your site is lost."* → i.e. neutralisation, not penalty.

---

## 2. Disavow in 2026 — current position, exact file spec

### 2.1 Google's stated position (primary: `support.google.com/webmasters/answer/2648487`)
Use it only if **both** are true:
1. "You have a considerable number of spammy, artificial, or low-quality links pointing to your site", **and**
2. "The links have caused a manual action, or likely will cause a manual action, on your site."

> "In most cases, Google can assess which links to trust without additional guidance, so most sites will not need to use this tool."

### 2.2 Exact file format constraints (code these as validators if we ever build the feature)
| Constraint | Value |
|---|---|
| Encoding | UTF-8 or 7-bit ASCII |
| Extension | must end `.txt` |
| Max lines | **100,000** (including blank + comment lines) |
| Max file size | **2 MB** |
| Max URL length | **2,048 characters** |
| Domain syntax | `domain:example.com` |
| Comment syntax | lines beginning `#` are ignored |
| Scope | one file per property; **uploading replaces the previous file entirely** |
| Processing time | "it can take a few weeks for Google to incorporate your list into the index" |
| Format | plain text, one URL or domain per line |
| **API** | **None. There is no disavow API.** Submission is exclusively via the disavow links tool page (`https://search.google.com/search-console/disavow-links`) with a **manual file upload**. Confirmed against Google's help page as of 2026-09-01. |

### 2.3 Practitioner consensus (secondary, flag as non-primary)
Gary Illyes has said publicly (PubCon and elsewhere) that he would remove the disavow tool if it were his decision, because it "hurts more than it helps." Separately, **John Mueller said in May 2024 that Google will remove the disavow tool "at some point."** Both are secondary-reported conference/social remarks — **treat as secondary/anecdotal.** The Google-owned doc language above is sufficient to justify our design.

**End-of-life risk (new):** there is **no official timeline**, and the tool remains live and functional in 2026 (Mueller confirmed the `domain:` directive's behaviour as recently as March 2026). ⚠️ unverified — must be confirmed during implementation. **Treat the disavow module as carrying medium-term retirement risk and avoid deep coupling** — keep it a leaf feature with no shared schema or shared UI surface, so it can be deleted in one commit.

**Our position:** the agent may *compute and display* a disavow candidate list and *export* a spec-valid `.txt`, but must (a) require a detected/declared manual action or an explicit user override, (b) require a per-domain human review pass, (c) never upload it (there's no API anyway), and (d) show a prominent warning quoting the "blindly adding all backlinks is not considered a good-faith effort" line.

---

## 3. Do links still matter? (2026 evidence)

### 3.1 Google's own signalling
- March 2024: Google removed the word "important" from its documentation describing links as a ranking factor (widely reported; secondary).
- Gary Illyes, PubCon Austin 2023: *"We need very few links to rank pages… over the years we've made links less important."* — **This is a 2023 quote. Flag as possibly stale**, though nothing since contradicts it and the 2025-12-10 docs de-emphasise links further.
- John Mueller: *"I'd forget everything you read about 'link juice.' It's very likely all obsolete, wrong, and/or misleading."* (secondary/forum-sourced).
- Current `links-crawlable` doc (2025-12-10) devotes far more space to **internal** linking and anchor descriptiveness than to external link acquisition.

### 3.2 The measurable shift: mentions > links for AI visibility
**Ahrefs, 2025-12-12, n = 75,000 brands, Spearman correlations** against visibility in ChatGPT / Google AI Mode / AI Overviews:

| Factor | ChatGPT | AI Mode | AI Overviews |
|---|---|---|---|
| YouTube mentions | ~0.737 | ~0.737 | ~0.737 |
| YouTube mention impressions | ~0.717 | ~0.717 | ~0.717 |
| **Branded web mentions** | **0.664** | **0.709** | **0.656** |
| Branded anchors | 0.511 | 0.628 | 0.527 |
| Branded search volume | 0.352 | 0.466 | 0.392 |
| **Domain Rating (DR)** | **0.266** | **0.285** | **0.326** |
| Backlinks | ~0.19–0.25 | ~0.25–0.30 | ~0.20–0.25 |
| Ad traffic | 0.286 | 0.254 | 0.216 |

Filtering: DR > 40, keyword volume ≥ 800. Ahrefs' own caveat: *"Correlation isn't causation."* Also note this is a **vendor study** — Ahrefs sells DR — yet it *undersells* its own metric, which makes it more credible, not less.

**Implication:** branded, *unlinked* mentions are ~2.5–3× more correlated with AI visibility than DR. Our tool's off-page module should be **mention-first, link-second**. That is a happy accident: mention monitoring is 100% safe to automate; link acquisition is not.

### 3.3 Internal vs external link value
- Internal links are fully under the user's control, require zero third-party contact, carry **zero policy risk** (as long as anchors aren't stuffed), and Google's own doc says every page you care about needs at least one internal link.
- **Verdict: our agent should spend 90% of its "link" budget on internal linking and 10% on off-page discovery/reporting.** Internal linking is the highest ROI-per-unit-of-risk action available to an autonomous agent. (Covered in depth in the internal-linking dossier; noted here as the deliberate trade.)

---

## 4. Backlink data sources & APIs — exact 2026 economics

### 4.1 Comparison table

| Provider | Entry cost for API | Billing model | Index scale | Rate limits | Bundleable into a $8/mo product? |
|---|---|---|---|---|---|
| **DataForSEO Backlinks** | **$50 minimum top-up** (pay-as-you-go, no subscription, no seats) | **$0.024 / request + $0.000036 / row** → **$0.06 per 1,000-row pull** | **1.9T+ live backlinks**, 8.6B crawled/24h, history to 2019 | **2,000 API calls/min**, 30 concurrent | ✅ **Yes — this is the answer** |
| **Ahrefs API v3** | Lite **$129/mo** (Starter $29 has no API); Enterprise **$1,499/mo** = "uncapped API access" | API **units**: base **50 units per request** + per-row cost = sum of costs of each unique field in `select`/`where`/`order_by`; default field = 1 unit, expensive metrics (e.g. `traffic`) = 5 or 10 units | Very large, high quality | Per-plan row caps per request | ❌ BYO-key only |
| **Semrush API (v3 Analytics)** | Requires **"SEO Business"** subscription (**$499.95/mo monthly / $416.66/mo annual**) **plus** separately-purchased API units (Business ships with **0** units by default) | **40 API units per line** for `backlinks`, `backlinks_refdomains`, `backlinks_anchors`, `backlinks_pages`, `backlinks_competitors`, `backlinks_refips`, `backlinks_tld`, `backlinks_geo`, `backlinks_matrix`, `backlinks_comparison`; **40 units per request** for `backlinks_overview` | Large | — | ❌ BYO-key only |
| **Moz Links API** | Free tier **50 rows/month, 1 req/10s**; paid from ~$20/mo → 3,000 rows; scaling to Enterprise | **Pure rows/month**, no field multipliers, no per-request minimum — most predictable model | Smaller than Ahrefs/DFS | 1 req/10s on free | ⚠️ Free tier too small to be useful; paid tiers verifiable only via secondary sources (**moz.com blocked our fetch — flag as unverified**) |
| **Majestic** | **API plan only: $399.99/mo** or **$3,999.90/yr**. Lite ($49.99/mo) and Pro ($99.99/mo) have **API access: No** | Analysis Units (API plan: 100M/mo), Retrieval Units 20M, Index Item Units 500,000, Site Explorer rows 50,000, 5 users | Fresh Index + Historic Index; Trust Flow / Citation Flow | — | ❌ BYO-key only, expensive |
| **Open PageRank** (now Keywords Everywhere) | **Free: 30,000 domain lookups/month, no card** | Free / bundled with paid Keywords Everywhere plans | Derived from **Common Crawl** open web graph; monthly since 2018 | **100 domains per request** | ✅ **Yes — use as the free-tier authority metric** |
| **Common Crawl web graph** | **$0** (raw files, self-hosted compute) | Free download; you pay storage/compute | Apr–May–Jun 2026 release: host graph **247.3M nodes / 6.3B edges**; domain graph **121.1M nodes / 3.9B edges** | n/a | ✅ For a self-hosted power-user mode only |

### 4.2 DataForSEO — the concrete integration spec

**Endpoints (all Live, single POST, no task queue):**
```
POST https://api.dataforseo.com/v3/backlinks/summary/live
POST https://api.dataforseo.com/v3/backlinks/history/live
POST https://api.dataforseo.com/v3/backlinks/backlinks/live
POST https://api.dataforseo.com/v3/backlinks/anchors/live
POST https://api.dataforseo.com/v3/backlinks/domain_pages/live
POST https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live
POST https://api.dataforseo.com/v3/backlinks/referring_domains/live
POST https://api.dataforseo.com/v3/backlinks/referring_networks/live
POST https://api.dataforseo.com/v3/backlinks/competitors/live
POST https://api.dataforseo.com/v3/backlinks/domain_intersection/live
POST https://api.dataforseo.com/v3/backlinks/page_intersection/live
POST https://api.dataforseo.com/v3/backlinks/timeseries_summary/live
POST https://api.dataforseo.com/v3/backlinks/timeseries_new_lost_summary/live
POST https://api.dataforseo.com/v3/backlinks/bulk_ranks/live
POST https://api.dataforseo.com/v3/backlinks/bulk_backlinks/live
POST https://api.dataforseo.com/v3/backlinks/bulk_spam_score/live
POST https://api.dataforseo.com/v3/backlinks/bulk_referring_domains/live
POST https://api.dataforseo.com/v3/backlinks/bulk_new_lost_backlinks/live
POST https://api.dataforseo.com/v3/backlinks/bulk_new_lost_referring_domains/live
```

**Key response fields on `/summary/live`:**
`backlinks`, `referring_domains`, `referring_pages`, `referring_domains_nofollow`, `broken_backlinks`, `backlinks_spam_score`, `rank`, `crawled_pages`, plus `cost` (float, USD, per task) on the wrapper.

**`bulk_spam_score/live`:** up to **1,000 targets per request**; returns `{target, spam_score}` with `spam_score` on a 0–100 scale. Example doc response: **$0.0203 for 10 targets**.

**Limits:** 2,000 API calls/min; **max 30 simultaneous requests**; max 1,000 rows per non-bulk request (paginate with `offset`); `targets[]` accepts bare domains (`forbes.com`) or full URLs.

**Realistic monthly cost per monitored site (our hosted tier):**
| Job | Calls | Rows | Cost |
|---|---|---|---|
| `summary` (weekly ×4) | 4 | 4 | $0.096 |
| `referring_domains` top 1,000 (monthly) | 1 | 1,000 | $0.060 |
| `timeseries_new_lost_summary` (weekly ×4) | 4 | ~120 | $0.100 |
| `bulk_spam_score` on 1,000 refdomains (monthly) | 1 | 1,000 | $0.060 |
| `competitors` (monthly) | 1 | 100 | $0.028 |
| `domain_intersection` vs 3 competitors (monthly) | 1 | 1,000 | $0.060 |
| `anchors` (monthly) | 1 | 500 | $0.042 |
| **Total** | | | **≈ $0.45 / site / month** |

At $8/month with a ~$0.45 data COGS this leaves healthy margin even with LLM inference costs. **This is the load-bearing economic fact for the hosted tier.**

### 4.3 Ahrefs unit model (for the BYO-key path)
```
request_cost = max(base_cost, per_row_cost × rows)
base_cost    = 50 units
per_row_cost = Σ cost(field) for each unique field in select ∪ where ∪ order_by
cost(field)  = 1 by default; 5 or 10 for expensive metrics (e.g. traffic)
```
**Design consequence:** our Ahrefs adapter must build a *minimal* `select` list per query and must never blindly `SELECT *`. Requesting `traffic` on a 1,000-row backlinks pull costs ≥10,000 units; requesting only `url_from, domain_rating_source, anchor, first_seen` costs ~4,000. Ship a field-cost table and a pre-flight unit estimator in the UI.

Ahrefs also ships an **official hosted remote MCP server** (OAuth) included with paid plans, covering keywords, rankings, backlinks and site audits — worth supporting as an alternative transport for users who already pay for Ahrefs. *(MCP availability is from secondary comparison sites; docs.ahrefs.com consistently returned 404/blank to our fetcher — **flag as unverified from primary**.)*

### 4.4 Semrush unit model
- API access requires **SEO Business** tier; API units are purchased separately and Business ships with **0** by default.
- **Every backlinks report line costs 40 units.** A single 1,000-row `backlinks_refdomains` pull = **40,000 units**.
- `backlinks_overview` is a flat **40 units per request** — this is the cheap health-check endpoint; use it for dashboards and reserve per-line reports for explicit user actions.
- Other Semrush APIs have different access rules: **Map Rank Tracker API is free to all users**; **Listing Management API** needs Semrush Local Pro/Business but no units; **Trends API** is a separate SKU including 10,000 monthly requests.

### 4.5 Free / open link graphs

**Common Crawl web graph** — genuinely free, genuinely large, genuinely awkward.
- Release `cc-main-2026-apr-may-jun` (from CC-MAIN-2026-17, -21, -25):
  - Host graph: **247.3M nodes, 6.3B edges**; 184.2M dangling nodes (74.48%); largest SCC 36.3M (14.66%).
  - Domain graph: **121.1M nodes, 3.9B edges**; 77.5M dangling (64.0%); largest SCC 30.0M (24.73%).
- Files: `*-host.graph` (9.2 GiB, BVGraph), `*-host-edges.paths.gz` (27.2 GiB), `*-host-vertices.paths.gz` (1.8 GiB), `*-host-ranks.txt.gz` (**4.6 GiB — this is the one you want**), plus transposes and `.properties`. Domain equivalents: 6.3 GiB / 13.6 GiB / 858.6 MiB / **2.2 GiB ranks**.
- Ranks include **harmonic centrality** (primary ordering) and **PageRank**.
- Release index: `graphinfo.json`; tooling: `github.com/commoncrawl/cc-webgraph` and `cc-pyspark`.
- Earlier release (Dec 2025 / Jan–Feb 2026, from CC-MAIN-2025-51, -2026-04, -2026-08): host graph **288.6M nodes / 12.4B edges**.
- **Licence caution:** Common Crawl's ToU grants a "limited, non-assignable, non-transferable, non-sublicensable, non-exclusive, limited license"; "CC reserves all other rights not otherwise expressly granted." Crawled content remains subject to origin-site terms. **Section 9 requires indemnification for use of Crawled Content "in connection with artificial intelligence, machine learning… large language models."** → If we ship Common Crawl derivatives in our *hosted* tier, get legal review. Safer: make CC-graph ingestion a **self-hosted, opt-in module** the user runs on their own infra, and ship only the derived `ranks` join.

**Open PageRank** (moved to Keywords Everywhere; `openpagerank.keywordseverywhere.com`)
- 0–10 domain authority score computed from the Common Crawl open web graph; monthly snapshots since 2018.
- Bulk endpoint: `/v1/domains/bulk`, **up to 100 domains per call**, bearer-token auth, returns current score **plus full monthly history**.
- **Free tier: 30,000 domain lookups/month, no credit card.** Also exposes an MCP server.
- **Legacy endpoint** `https://openpagerank.com/api/v1.0/getPageRank` with an `API-OPR` header and ~1,000 requests/day — **this is the pre-migration API; flag as possibly stale and treat the keywordseverywhere host as canonical.**

**What does NOT exist (important negative findings):**
- **Google Search Console API has no links endpoint and no disavow endpoint.** Verified against both `developers.google.com/webmaster-tools/v1/api_reference_index` and the live machine-readable discovery document (`https://searchconsole.googleapis.com/$discovery/rest?version=v1`, **revision 20260830**), which contains zero occurrences of `disavow`, `backlink`, `linkCount`, `inboundLink`, or `externalLink`, and no `links` resource. There is no v2/v3 successor API and no deprecation notice on the API overview page (last updated 2025-08-28). **The "Links" report (top linking sites, top linked pages, top anchor text) has no API surface.**
  - **Method count is 11, not 10.** In addition to `searchanalytics.query`, `sitemaps.{delete,get,list,submit}`, `sites.{add,delete,get,list}`, and `urlInspection.index.inspect`, the discovery document still exposes **`urlTestingTools.mobileFriendlyTest.run`** (`POST v1/urlTestingTools/mobileFriendlyTest:run`). This is a **zombie entry**: Google retired the Mobile Usability report, the Mobile-Friendly Test tool, and the Mobile-Friendly Test API on **2023-12-01**, and the HTML reference index no longer lists it. It returns no useful results. **Do not build on it** — but be aware auto-generated clients will surface it.
  - **Implementation detail:** despite the `searchconsole/v1` service name, `sites.*`, `sitemaps.*`, and `searchanalytics.query` still route to **legacy `webmasters/v3` HTTP paths** (e.g. `POST webmasters/v3/sites/{siteUrl}/searchAnalytics/query`); only `urlInspection` and `urlTestingTools` use `v1/` paths. Hardcode accordingly if you hand-roll the client.
  - **Bulk export does not help.** Search Console's bulk data export to BigQuery ships only three tables — `searchdata_site_impression`, `searchdata_url_impression`, and `ExportLog`. **No links/backlinks table.** It is not an alternative programmatic path to link data.
  → **Architectural consequence (corrected): there is no free *programmatic* path to Google's link data — but there IS a free path.** GSC's Links report exposes backlink data for free via **UI export**: up to **100,000 rows** for the landing-page-level exports ("Latest links" = most recently discovered; "More sample links" = a sample from the full set), and up to **1,000 rows** for the summary tables (Top linked pages, Top linking sites, Top linking text). On-screen tables are capped at 1,000 rows and are truncated for larger sites. **Accepting a user-uploaded GSC links CSV export is a valid free ingest path and must be costed as such before assuming a paid index is mandatory.** A paid third-party index is required only for (a) automated/continuous ingestion, (b) competitor backlinks, or (c) link data beyond the owner's verified property.
- **Bing Search APIs were retired 2025-08-11.** Microsoft: "Any existing instances of Bing Search APIs will be decommissioned completely, and the product will no longer be available to be used or new customer signup." Affected: Web, Image, News, Video, Autosuggest, Spell Check, Entity, Visual Search. Official migration path is *Grounding with Bing Search* inside Azure AI Agents — **not a drop-in REST replacement**. → Any mention-discovery design that assumed Bing Web Search is dead. Use DataForSEO SERP, Brave, Serper, SerpApi, Exa, or Google Custom Search JSON API instead. (Brave's free tier was reportedly discontinued in Feb 2026 in favour of prepaid metered credits — **secondary source, verify before depending on it**.)

---

## 5. Toxic / spammy link detection — what's real

### 5.1 Available signals
| Source | Field / metric | Access |
|---|---|---|
| DataForSEO | `backlinks_spam_score` (aggregate, on `/summary/live`); `spam_score` 0–100 per target on `/bulk_spam_score/live` (1,000 targets/call) | API, cheap |
| Moz | Spam Score (0–100, % of similar sites Moz observed penalised/banned) | Links API |
| Semrush | Toxicity Score 0–100 built from **45+ toxic markers**, weighted, ML + user feedback | Backlink Audit is a **UI tool**; toxicity is not cleanly exposed in the v3 Analytics API |
| Majestic | Trust Flow vs Citation Flow ratio (a low TF/CF ratio ≈ many links, little trust) | API plan ($399.99/mo) |
| Own crawl | HTTP status, `rel` attributes, indexation, anchor distribution, sitewide-ness, IP/ASN clustering, WHOIS/GA-ID/AdSense-ID co-occurrence | Free, self-computed |

### 5.2 Semrush's 45+ toxic markers (useful as a spec for our own open-source scorer)
- **Link networks (8):** mirror pages; link network by URL path; same page-title domains; link network by GA ID; link network by WHOIS info; link network by AdSense ID; multiple same-root subdomains; link network by IP.
- **Spam in communities (3):** blog-post signature spam; forum link; page comment spam.
- **Harmful environment (11):** de-indexed domain; malicious page; community error; community warning; non-indexed domain; spam TLD; poor backlink profile; HTTP status error; weak domain; frame used; suspicious follow/nofollow ratio.
- **Manipulative links (15):** money anchor text; link directory; high link density from page; high link density from paragraph; sitewide link; guest post link; empty anchor; frequent anchor; symbol anchor; author's link; link in footer; potentially ads link; potentially sponsored content.
- **Irrelevant source domain (2):** irrelevant geo; irrelevant domain theme.
- **Complementary (8):** no CSS & JS; poor layout; poor navigation; long domain name; numerals in domain name; suspicious external links; suspicious follow links.
- Aggregate thresholds Semrush uses: overall toxicity **High** if >10% of backlinks are toxic, **Medium** 3–9%, **Low** <3%.

**Roughly 20 of these 45 markers are computable by us for free** with a polite crawler + DNS/WHOIS + Common Crawl: IP/ASN clustering, sitewide-ness, footer/comment placement (DOM position), anchor money-ness, link density, HTTP status, indexation proxy, spam TLD list, follow/nofollow ratio, domain-name heuristics. **Ship an open-source `LinkRiskScore` with transparent, auditable sub-scores rather than a black-box number.** That is a genuine differentiator against Semrush/Moz.

### 5.3 The honest framing our UI must use
Toxic-link scores are **vendor heuristics, not Google signals.** Google has no "toxicity" concept and no public API for it. Given (a) no named link spam update since Dec 2022, (b) Google's "we can assess which links to trust without additional guidance," and (c) "blindly adding all backlinks to the disavow file is not considered a good-faith effort" — our product should present toxic-link data as **diagnostic/informational**, explicitly *not* as an action queue, unless a manual action exists in GSC.

**Product rule:** the "Disavow" surface stays locked until `urlInspection`/user-declared state indicates a manual action, or the user checks an "I understand the risk" override with the Google quote displayed.

---

## 6. Discovery workflows an agent CAN fully automate (zero third-party contact)

These are all read-only. All are safe at full autonomy.

### 6.1 Competitor backlink gap
```
1. Identify competitors:  /v3/backlinks/competitors/live  (target = user domain)
   ∪ user-declared competitors ∪ SERP-overlap competitors from rank data
2. Gap:  /v3/backlinks/domain_intersection/live
         { targets: {1: comp_a, 2: comp_b, 3: comp_c}, exclude_targets: [user_domain] }
   → referring domains linking to ≥2 competitors but not to the user
3. Score each prospect: rank/OPR, spam_score (bulk_spam_score, 1000/call),
   topical relevance (embed the linking page vs user's topic vector),
   link type (editorial vs directory vs UGC), traffic proxy
4. Rank + persist to `link_prospects` with status='discovered'
```
Cost for 3 competitors ≈ $0.12/run. Run monthly.

### 6.2 Broken-link building
```
1. /v3/backlinks/backlinks/live on a competitor with filter is_broken = true
   → their broken pages that still attract links
2. Verify live: HEAD the target URL yourself (respect robots.txt, 1 req/s/host)
3. Recover the dead page's content:
   Wayback CDX:  http://web.archive.org/cdx/search/cdx?url=<url>&output=json&limit=…
                 (community-observed ~60 req/min ceiling; 429s on excess.
                  Use collapse=digest, exponential backoff from 3s, cache aggressively.
                  Internet Archive publishes NO official rate limit — treat 1 req/s as the budget.)
   Also usable: Common Crawl index API for the same URL
4. Agent drafts a replacement page on the USER's site that genuinely covers the topic
5. Agent DRAFTS (does not send) an outreach note per linking page
```
Note: steps 1–4 are 100% safe. Step 5 stops at draft.

**Also run this inward:** `/v3/backlinks/backlinks/live` on the *user's own* domain filtered to `is_broken` / 404 targets → **this is the highest-value, zero-risk off-page action available**: fix a 404 that already has links, or 301 it. **The agent should do this at full autonomy** — it's an on-site redirect, not third-party contact. Recovering 20 links to dead URLs beats a quarter of outreach.

### 6.3 Unlinked brand mention discovery
No official API exists for this; you assemble it:
```
Query sources (pick per budget):
  - DataForSEO SERP API:  "brand" -site:userdomain.com   (paginate, dedupe by host)
  - Google Custom Search JSON API (100 queries/day free)
  - Brave / Serper / Exa / Tavily
  - Commercial listening: Brand24, BrandMentions, Ahrefs Content Explorer,
    Semrush Brand Monitoring (all UI-first; API access varies — BYO-key)
  - Common Crawl full-text index (self-hosted, free, high latency)
  ⚠️ Bing Web Search API is NOT an option — retired 2025-08-11.
For each candidate page:
  1. Fetch (honour robots.txt), extract text
  2. Confirm the brand string / entity appears (fuzzy + entity disambiguation via LLM)
  3. Check for an <a href> pointing to any URL on the user's registrable domain
  4. If mention && !link → unlinked mention
  5. Classify: news / review / forum / directory / competitor / negative sentiment
  6. Score reclaim-worthiness: page authority, traffic proxy, recency, sentiment,
     whether the outlet links out at all (does the page have external <a> at all?)
```
**Then stop.** Surface as a queue. The pitch email is drafted; the human sends.

Given the Ahrefs correlation data (§3.2), also track **linked and unlinked mention volume as a first-class KPI** — this is likely more predictive of AI-assistant visibility than DR.

### 6.4 Link-reclamation / lost-link monitoring
`/v3/backlinks/timeseries_new_lost_summary/live` weekly → alert on lost links from high-value domains, check whether the loss is (a) page removed, (b) link removed, (c) page 404 on our side (→ auto-fixable), (d) `rel` changed to nofollow. Case (c) is auto-remediable at full autonomy.

---

## 7. Digital PR & HARO-successor platforms (2026 landscape)

### 7.1 What happened to HARO
- HARO was rebranded **Connectively** by Cision and **shut down 2024-12-09**.
- **2025-04-15: Cision announced the sale of Help A Reporter Out (HARO) to Featured.com** (primary: cision.com press release). Featured relaunched helpareporter.com; emails resumed **2025-04-22**, back to the original free 3×-daily digest format, with Cision's paid tiers removed. HARO remains **free and email-only, no API**, and continues as a standalone product.
- **2026-06-02 (announced 2026-05-26): Featured relaunched the "Connectively" brand as its own separate product — and this is a much bigger restructuring than a rename.** Per the press release, **all** media opportunities, journalist profiles, subscriptions, workflows, and customer data **moved to Connectively (`connectively.us`)**; only "the name, logo, and URL" changed. `featured.com` is now a **different product**: an "AI co-pilot for PR" with a chat interface covering journalist requests, podcasts, bylined articles, speaking engagements, awards, and GEO. Featured reports 100,000+ users and ~2,500 publishers.
  - **URL consequence for our fetchers/adapters:** old `featured.com` URLs now **301 to `connectively.us`** (e.g. `blog.featured.com` → `blog.connectively.us`); `featured.com/api-integration` **404s** while `www.connectively.us/api-integration` resolves. Any hardcoded `featured.com` path in our integration code is wrong.
- **Source of Sources (SOS)** — launched by HARO's original founder Peter Shankman (April 2024), free, email-only, up to 3 digests/day, reply direct to journalist. ~40,000 members (secondary). No platform, no API, no approval queue. ⚠️ unverified — must be confirmed during implementation: `sourceofsources.com` returned HTTP 403 to direct fetch; the "free / no API / email-only" characterisation rests on secondary sources only.

### 7.2 Platform / API matrix

| Platform | 2026 pricing (primary where noted) | Public API? | Machine-readable ingress |
|---|---|---|---|
| **Connectively** (`connectively.us`) — the journalist-query platform, ex-Featured, owns HARO | Journalist-query-platform pricing now lives on `connectively.us/pricing`. ⚠️ unverified — must be confirmed during implementation: that page returned **HTTP 429** on repeated attempts and could not be fetched. | ✅ **YES — a documented "Featured API" exists**, at `connectively.us/api-integration` (announced 2024-11-01). Exposes **real-time press opportunities** for embedding in "Slack channels, newsletters, portals, or forums"; ~1K publishers and ~**1K opportunities/week**; includes categories/tags plus deadlines and time zones; auth via an **`x-access-token` header**. **Partner-gated, not self-serve** — sign-up page is a request form (Name, Email, "Tell us about how you plan to use the API"). No public endpoint reference, rate limits, or API pricing published. | **Native API (primary path)**, with email digest → IMAP/parse as fallback |
| **Featured.com** (post-2026-06-02: a *separate* product — "AI co-pilot for PR") | Free **$0** "Free forever"; **Lite $29/mo** (billed annually $348, marked "Most popular"); **Pro $79/mo** ($948/yr); **Pro+** (20× usage, price not published). ⚠️ **These tiers meter AI credits, not journalist-query access.** Verbatim: "Every plan includes every feature. Upgrade when you need more daily credits." Lite = "5× more AI usage than Free"; Pro = "5× more usage than Lite". *(featured.com/pricing)* | Not the journalist-query platform — see Connectively row. | n/a |
| **Qwoted** | Basic **free** (2 pitches/mo, **2-hour delivery delay**, "Individual use only"); **Pro $99/mo** — explicitly reduced from $149 — **$1,188/yr** (in-app plans page shows "~~$1,788.00~~ $1,188.00/yr"), 35 pitches/mo with instant delivery; **Teams** = "Enterprise Pricing", unlimited pitches, white-labeling, admin dashboard. Also: **Managed Account** (dedicated account manager, weekly reporting, interview coordination) and **Qwoted Amplify** — both contact-for-pricing. *(qwoted.com/pricing-toggle + app.qwoted.com/pricing_plans; note `qwoted.com/pricing-2` is a **stale page still showing $149** — do not cite it)* | **No public API.** No API/developer/integrations/Zapier link anywhere in nav or footer. | Email alerts |
| **Source of Sources (SOS)** | **Free** (donations to animal charities requested) | **No** | Email digest only — 3×/day |
| **SourceBottle** | Free tier | **No** | Email |
| **Help a B2B Writer** | Free | **No** | Email |
| **Muck Rack** | Enterprise, quote-only | API exists per third-party API directories but **no public developer docs**; effectively partner-only | — |
| **Prowly** | Subscription (press-release distribution + newsroom hosting) | Not publicly documented | — |

### 7.3 The blunt conclusion for our architecture
**Corrected:** email is **not** the only machine-readable ingress. **Connectively (ex-Featured, owner of HARO) documents a real API** — so the native-API epic is buildable and should not be abandoned.

**Two-path architecture:**
- **Path 1 (primary): a Connectively API adapter.** Real-time press opportunities, categories/tags, deadlines, time zones; `x-access-token` auth. **Apply for partner access immediately — the approval gate, not the architecture, is the schedule risk.** Endpoint shapes, rate limits, and API pricing are ⚠️ unverified — must be confirmed during implementation (nothing is published pre-approval).
- **Path 2 (fallback, and the only path for the rest): IMAP/digest parsing**, scoped to **HARO, Source of Sources, Qwoted, SourceBottle, Help a B2B Writer** — none of which have a public API.

```
User forwards / IMAP-connects a dedicated inbox (e.g. haro@theirdomain.com)
   ↓
Agent parses digests (SOS, HARO, Qwoted, SourceBottle, Help a B2B Writer)
   [+ Connectively opportunities arrive via API, not email]
   ↓
Agent matches queries against the user's expertise profile
   (topics, past content embeddings, declared credentials)
   ↓
Agent DRAFTS a pitch grounded in the user's real published work + real credentials
   ↓
HUMAN reviews, edits, and sends — from their own mailbox
```
This is safe, high-value, and cheap. It is also honest: the platforms are drowning in AI slop ("users complain of AI-generated responses flooding the platform" — secondary), so **our differentiator must be grounding + human sign-off, not volume.** We should explicitly rate-limit pitch drafting (e.g. ≤5/day default) and refuse to auto-send. Auto-sending fabricated expert quotes to journalists is a reputational and potentially defamatory disaster.

---

## 8. Outreach email automation — the legal and deliverability wall

### 8.1 United States — CAN-SPAM (15 U.S.C. §7701 et seq.; FTC rule 16 CFR Part 316)
Seven requirements (FTC compliance guide; our fetch of ftc.gov returned 403 — the requirements below are the long-standing statutory list, **verify wording against ftc.gov before shipping legal copy**):
1. Don't use false or misleading header information (From/To/Reply-To/routing must identify the sender).
2. Don't use deceptive subject lines.
3. Identify the message as an ad (if commercial).
4. Tell recipients where you're located — **a valid physical postal address** is mandatory.
5. Tell recipients how to opt out.
6. **Honor opt-out requests promptly — within 10 business days**; opt-out mechanism must work for at least 30 days after sending; you may not charge, require info beyond email address, or require a login.
7. Monitor what others do on your behalf — *"both the company whose product is promoted and the company that actually sends the message may be legally responsible."*

**Penalty:** the FTC's inflation-adjusted maximum for FTC Act §5(m)(1)(A) violations rose from $51,744 to **$53,088**, effective **2025-01-17** (Federal Register 2025-01361). Each separate email is a separate violation. Reporting that there was **no further adjustment for calendar 2026** comes from secondary sources and our fetches of ftc.gov were 403-blocked — **flag as unverified; re-check ftc.gov/legal-library before quoting a number in-product.**

> **Note: CAN-SPAM is opt-out, not opt-in.** Cold B2B link-outreach is *legal in the US* if properly identified, with a working unsubscribe and a physical address. **This is precisely why an automation tool is tempting and why it needs guardrails: legal ≠ safe.**

### 8.2 EU/UK — GDPR + ePrivacy Directive Art. 13 / PECR
- Art. 13 ePrivacy requires **prior consent** for unsolicited direct marketing by electronic mail to **natural persons**; the "soft opt-in" exception applies to existing customers for similar products.
- **B2B treatment is fragmented by member state.** Reported: Germany, Italy, Spain require B2B opt-in; France, the Netherlands, Ireland permit role-based B2B outreach without prior consent. **This is from marketing-blog sources — treat as directional, not legal advice. Our product must not assert per-country legality.**
- GDPR Art. 6(1)(f) legitimate interest can be a lawful basis for processing the *personal data*, but **it does not override ePrivacy's prior-consent requirement** where that applies.
- Art. 14 transparency obligations apply when you scrape a contact's email from a website rather than collecting it from them.
- Data-subject rights (access, erasure, objection to direct marketing under Art. 21(2) — **absolute right, no balancing test**) must be honoured. Our tool must therefore maintain a **global, permanent suppression list** keyed on email + domain, honoured across all campaigns and all tenants.
- **Enforcement is live and expensive.** CNIL fined **SOLOCAL MARKETING SERVICES €900,000**, decision dated **2025-05-15** (published 2025-05-21), public/named. Grounds: **Art. L.34-5 CPCE** (no valid consent for electronic prospecting — data bought from data brokers whose forms used oversized accept buttons vs. obscured opt-outs, defeating free and unambiguous consent), plus **GDPR Art. 7** (failure to demonstrate consent) and **Art. 6** (no valid legal basis for onward transfer to partners). Scale: ~**4.7M SMS** and ~**500K email** contacts in 2022. Includes an injunction to cease non-consented electronic prospecting under a **€10,000/day** penalty after a 9-month cure period (primary: cnil.fr). GDPR Art. 83 ceiling: **€20M or 4% of global annual turnover.**
  → **Design consequence:** the "oversized accept button vs. obscured opt-out" finding means a consent record is not sufficient evidence of consent. Any user-supplied contact list must carry provenance, and our `contact_source` enum must never accept broker-sourced data (§11.4).
- UK PECR: our ICO fetch was 403-blocked — **verify soft-opt-in and corporate-subscriber rules against ico.org.uk before shipping UK guidance.**

### 8.3 Deliverability — the mailbox providers now enforce their own law
**Gmail / Google Workspace sender guidelines** (`support.google.com/a/answer/81126`, enforced since **2024-02-01**):

The bulk threshold is **~5,000 messages in a 24-hour period to *personal* Gmail accounts** (`@gmail.com` / `@googlemail.com`). Google narrowed this: **Google Workspace-hosted accounts do NOT count toward the threshold.**

| Requirement | All senders | ≥5,000 msgs/day to personal Gmail |
|---|---|---|
| SPF **or** DKIM | required | — |
| SPF **and** DKIM | — | **both required** |
| DMARC on the sending domain | — | **required** (`p=none` explicitly sufficient: "Your DMARC enforcement policy can be set to none") |
| **DMARC alignment** | — | **required** — the SPF and/or DKIM domain must align with the `5322.From` domain. **Passing SPF/DKIM alone is insufficient.** |
| Valid forward + reverse DNS (PTR) | required | required |
| TLS for transmission | required | required |
| DKIM key | 1024-bit min, 2048-bit recommended | same |
| RFC 5322 compliance | required | required |
| **One-click unsubscribe** (RFC 8058): `List-Unsubscribe-Post: List-Unsubscribe=One-Click` + `List-Unsubscribe: <https://…>` | — | **required — but scoped to "marketing messages and subscribed messages" only.** Transactional mail is *not* subject to the unsubscribe requirement (it *is* subject to auth and spam-rate rules). |
| Spam rate in Postmaster Tools | — | **REQUIREMENT: below 0.30%.** ⚠️ Correction: the "below 0.10%, and never reach 0.30% or higher" formulation appears in Google's **Recommendations** section, **not** its Requirements. **0.30% is the enforceable ceiling; 0.10% is advisory headroom.** Do **not** cite 0.10% as a Google *requirement* in customer-facing or compliance copy. |

**Postmaster Tools v2 migration (2026):** Google is migrating to Postmaster Tools v2, which adds a **Compliance dashboard and compliance-status API** and **retires the Domain and IP Reputation dashboards**. → **Do not build reputation scores into our monitoring**; build against compliance status instead. Adversarial note: numerous SEO/deliverability blogs assert the legacy interface was "retired in October 2025" — **Google's own deprecation page contradicts this**, stating the deprecation was **postponed with no date announced**. Also: widely circulated blog claims that Google raised the *hard* spam-rate requirement to 0.10% in 2026 are **not supported** by Google's live guidelines page, which still states 0.30%.

**Microsoft Outlook.com / Hotmail / Live / MSN** (techcommunity announcement; **effective 2025-05-05**), for senders of **5,000+ messages/day** to Microsoft consumer domains **from the same `5322.From` domain**: SPF must pass, DKIM must pass, DMARC record with at least `p=none`, and DMARC alignment via SPF or DKIM.

- **Non-compliant mail is rejected at SMTP with `550 5.7.515`** — verbatim: `550 5.7.515 Access denied, sending domain [SendingDomain] does not meet the required authentication level`.
  ⚠️ **Correction: the code is `5.7.515`, not `5.7.15`.** These are distinct, real codes (`5.7.15` exists in Exchange for unrelated access-denied/SCL conditions). **Hardcoding `5.7.15` in bounce-classification logic would silently fail to catch the actual authentication rejections.**
- **Rollout history is subtler than "rejection from day one":** Microsoft's original announcement said non-compliant high-volume mail would be **routed to Junk** starting 2025-05-05, with rejection "in the future." An **2025-04-29 update reversed this**, stating Microsoft would reject outright "taking effect on May 5th as originally stated." So SMTP rejection did begin 2025-05-05 — via a late revision.
- **The requirement is permanent once tripped:** per Microsoft's own docs, once a domain has **ever** crossed the 5,000/day threshold, the requirement **persists even if volume later drops below 5,000**.

### 8.4 The reputation-risk argument (the one that actually should decide this)
Even where cold outreach is legal:
- Link-building outreach has famously low reply rates; the complaint rate on unsolicited SEO outreach is high.
- A 0.30% Gmail spam rate (Google's stated *requirement* ceiling) on the user's **primary business domain** is a business-ending event for a small SaaS or local business — it breaks invoices, password resets, and customer support, not just marketing.
- An SEO tool that silently burns a customer's root domain reputation is a product that gets one bad thread on HN and dies.

> **Our position: the tool must never send outreach from the user's primary domain, must never send without per-message human approval by default, and should not ship an integrated bulk sender at all in v1.** Instead: generate drafts, push them into the user's own tool of choice (Gmail draft via API, Instantly/Smartlead/Lemlist export, or plain `.eml`/CSV), and let a purpose-built sender with its own warm-up and domain isolation handle transmission.

---

## 9. Measuring authority in 2026

| Metric | Owner | Scale | Notes |
|---|---|---|---|
| **DR** (Domain Rating) / **UR** (URL Rating) | Ahrefs | 0–100, log | Correlation with AI visibility only 0.266–0.326 (§3.2) |
| **DA** (Domain Authority) / **PA** | Moz | 0–100 | ML model predicting ranking ability; free tier 50 rows/mo |
| **AS** (Authority Score) | Semrush | 0–100 | Blends link power, organic traffic, spam signals |
| **Trust Flow / Citation Flow** | Majestic | 0–100 each | TF/CF ratio is the classic spam tell; API tier $399.99/mo |
| **`rank`** | DataForSEO | 0–1000, PageRank-derived | Cheap, in every `summary`/`bulk_ranks` response |
| **Open PageRank** | Keywords Everywhere (ex-DomCop) | 0–10 | **Free 30k lookups/mo**, from Common Crawl, monthly history since 2018, 100 domains/call |
| **Harmonic centrality / PageRank** | Common Crawl | rank position | Free raw files (`*-ranks.txt.gz`, 2.2–4.6 GiB), fully auditable |

**Recommendation:** ship **Open PageRank as the default authority metric** (free, open methodology, generous quota) + **DataForSEO `rank`** as the paid default + adapters for DR/DA/AS/TF for users who bring keys. Never present a vendor score as "how Google sees you." Show **direction and delta over time**, not the absolute number — absolute DR is the metric most gamed by link sellers, and treating it as a target is what pushes users toward link buying.

---

## 10. The autonomy model — explicit tiers

### Tier A — FULL AUTONOMY (agent acts without asking)
All read-only, or write-only-to-the-user's-own-site.

| Action | Why safe |
|---|---|
| Pull backlink profile, refdomains, anchors, new/lost, competitors, intersections | Read-only third-party API |
| Compute LinkRiskScore / spam heuristics | Local computation |
| Competitor backlink gap analysis + prospect scoring | Read-only |
| Discover unlinked brand mentions via SERP APIs + polite crawl | Read-only, robots.txt-respecting |
| Detect broken **inbound** links to the user's own 404s | Read-only detection |
| **301-redirect or restore the user's own 404 pages that have inbound links** | Change on user's own site, reversible, no third party |
| Fix `rel` attributes on the user's own outbound links (add `sponsored`/`ugc`/`nofollow` per policy) | User's own site; brings them *into* compliance |
| Internal link graph optimisation | User's own site |
| Monitor anchor-text distribution and alert on sudden money-anchor spikes (negative-SEO early warning) | Read-only |
| Track mention volume, sentiment, share-of-voice as KPIs | Read-only |
| Parse HARO/SOS/Qwoted/SourceBottle digests from a connected inbox and match to expertise | Read-only |
| Pull press opportunities from the **Connectively API** and match to expertise | Read-only third-party API |
| Ingest a user-uploaded GSC Links CSV export | Read-only, user-supplied |
| Generate all reports, dashboards, changelogs | Local |

### Tier B — HUMAN APPROVAL REQUIRED (agent drafts, human clicks)
Default = require approval. **No autonomy setting may remove approval for these.**

| Action | Guardrails to enforce in code |
|---|---|
| Send any outreach email to a third party | Per-message approval; hard daily cap (default 10, absolute max 50); mandatory physical address + working unsubscribe + `List-Unsubscribe`/`List-Unsubscribe-Post` headers; suppression-list check; sender must be a subdomain, never the root MX domain; jurisdiction warning if recipient TLD/geo is EU/UK |
| Send a HARO/SOS/Qwoted pitch | Per-pitch approval; must cite user's real published work; refuse if the agent cannot ground a claim; cap 5/day |
| Publish/submit anything to a third-party property (directory, profile, forum, PR wire) | Per-item approval; explicit "is this a legitimate business listing?" check |
| Request link removal from a webmaster | Per-message approval (it's still outreach) |
| Generate a disavow file | Requires manual action present OR explicit risk-acknowledgement; per-domain review; export only, never upload (no API exists anyway) |
| Contact a journalist directly | Always human |
| Anything that spends the user's money | Always human |

### Tier C — HARD REFUSE (no config flag, no override, refusal message cites policy)
| Refused action | Google policy text cited |
|---|---|
| Buy links / integrate a link marketplace / pay for a placement that passes ranking credit | *"Buying or selling links for ranking purposes… Exchanging money for links, or posts that contain links"* |
| Broker or operate a link exchange between our own users | *"Excessive link exchanges ('Link to me and I'll link to you') or partner pages exclusively for the sake of cross-linking"* |
| Build, register, manage, or recommend a PBN; surface expiring domains by authority | *"Expired domain abuse is where an expired domain name is purchased and repurposed primarily to manipulate search rankings."* |
| Auto-post links to blog comments, forums, guestbooks, profiles, Web 2.0 properties | *"Using automated programs or services to create links to your site"*; *"forum comments with optimized links"* |
| Mass-generate guest posts / advertorials at scale for links | *"Scaled content abuse… using generative AI tools… to generate many pages"*; *"Advertorials or native advertising where payment is received for articles that include links that pass ranking credit"* |
| Rent a subfolder / arrange parasite placements on a high-authority host | Site reputation abuse policy |
| Send unsolicited email above the rate cap, or without unsubscribe/physical address, or to a suppressed address | CAN-SPAM; ePrivacy Art. 13; GDPR Art. 21(2) |
| Scrape and email a purchased/leaked contact list | GDPR Art. 14 + CNIL SOLOCAL precedent (€900,000, 2025-05-15) |
| Impersonate a person, fabricate credentials, or invent an expert quote in a pitch | Not a Google-policy issue — a fraud/defamation issue |
| Send from the user's root/transactional sending domain | Gmail 0.30% spam-rate cliff (requirement; 0.10% is the *recommendation*); Microsoft `550 5.7.515` rejection — and Microsoft's requirement **persists permanently** once the domain has ever crossed 5,000/day |

**Implementation note:** Tier C must be enforced at the **tool-definition layer**, not in the prompt. Do not give the agent a `post_comment`, `submit_to_directory`, or `purchase_link` tool at all. An agent cannot misuse a capability it does not have. Prompt-level refusals are jailbreakable; missing tools are not.

---

## 11. Direct implications for our tool

### 11.1 Product framing
- **Rename the module.** Not "Link Building." Call it **"Off-Page & Brand Authority."** The deliverables are: link-profile health, lost-link recovery, unlinked-mention reclamation queue, competitor gap intelligence, PR opportunity matching, and mention-volume KPIs. This framing is honest, matches the 2026 evidence, and structurally avoids promising something we won't do.
- **Publish the refusal list in the README and in the UI.** "Things this tool will never do" is a trust asset for an open-source SEO agent, and it pre-empts the "isn't this a spam bot?" objection that will be the top HN comment.

### 11.2 Data backend decision
- **Default (hosted $8/mo tier): DataForSEO Backlinks API.** ~$0.45/site/month at a weekly-summary + monthly-deep cadence (§4.2). Pay-as-you-go, $50 min top-up, 2,000 calls/min, 30 concurrent, no seats.
- **Free path (stronger than originally assessed):** **user-uploaded GSC Links CSV export** (up to 100,000 rows of the user's own real backlinks, $0, Google's own data) + Open PageRank (30k domain lookups/month free) + Common Crawl host/domain rank files + our own crawler. This gives a genuine own-profile backlink view, authority scores, and a coarse link graph at **$0**. Its limits are that it is manual (no scheduled refresh), own-property-only (no competitor data), and sampled rather than complete.
- **BYO-key adapters:** Ahrefs (unit estimator required — minimal `select` lists, never `SELECT *`), Semrush (warn: 40 units/line, SEO Business tier required, 0 units bundled), Moz, Majestic.
- **Abstraction:** define one internal `BacklinkProvider` interface — `summary(target)`, `referring_domains(target, limit, offset)`, `backlinks(target, filters)`, `new_lost(target, since)`, `intersection(targets[], exclude[])`, `bulk_authority(targets[])`, `bulk_spam(targets[])` — and normalise all provider metrics into a single `authority_0_100` plus a `provider_native` blob. Never let provider-specific metrics leak into the UI.

### 11.3 Hard architectural facts to design around
1. **No GSC links API — but there IS a free (non-programmatic) link data path.** Search Console v1 exposes only `searchanalytics`, `sitemaps`, `sites`, `urlInspection` (+ the dead `urlTestingTools.mobileFriendlyTest`). BigQuery bulk export has no links table. **Ship the GSC Links CSV drop-zone as a first-class free-tier ingest path, not a supplementary afterthought** — it delivers up to 100,000 rows of the user's own backlinks at $0. **Revised backend decision: a paid index is required only for automated/continuous refresh, competitor backlinks, and data beyond the verified property — not for a basic own-profile view.** That means the free/self-hosted tier is materially better than §4.5 originally implied, and the DataForSEO spend can be deferred until a user needs competitor gap analysis or scheduled refresh. Do not build any feature that assumes *programmatic* access to Google's link data.
2. **No disavow API.** The disavow flow is: generate → review → download `.txt` → user uploads manually at `search.google.com/search-console/disavow-links`. Validate against the 2 MB / 100,000-line / 2,048-char / UTF-8-or-7-bit-ASCII / `.txt` spec before download. **Keep the module architecturally isolated** — Google has publicly signalled (Mueller, May 2024) that the tool will be removed "at some point," with no timeline. No shared schema, no shared UI surface; it must be deletable in one commit.
3. **One HARO-successor API exists — build it.** **Corrected:** Connectively (ex-Featured, owner of HARO) documents a real press-opportunity API (`connectively.us/api-integration`, `x-access-token` auth, partner-gated). **Do not abandon the native-API epic.** Build a Connectively adapter as the primary ingress and **apply for access on day one — approval, not architecture, is the schedule risk.** Scope IMAP/email-digest parsing to the platforms that genuinely have no API: **HARO, Source of Sources, Qwoted, SourceBottle, Help a B2B Writer.** Expect digest formats to change. Note that `featured.com` is now a *different* product (AI PR co-pilot) and old `featured.com` URLs 301 to `connectively.us` — do not hardcode `featured.com`.
4. **Bing Web Search API is gone (2025-08-11).** Mention discovery must use DataForSEO SERP / Google CSE / Brave / Serper / Exa. Make the SERP provider pluggable and rate-budgeted.
5. **Wayback CDX has no published rate limit** — budget 1 req/s per host, use `collapse=digest`, exponential backoff from 3s, and cache aggressively. Design broken-link jobs as resumable.

### 11.4 Concrete data model sketch
```sql
link_prospects(
  id, site_id, source_domain, source_url,
  discovery_method,          -- 'competitor_gap'|'broken_link'|'unlinked_mention'|'lost_link'|'haro'
  authority_score,           -- normalised 0-100
  risk_score, risk_reasons,  -- jsonb: which of our ~20 open markers fired
  topical_relevance,         -- cosine vs site topic vector
  contact_email, contact_source,   -- 'public_page' | 'user_supplied'  (NEVER 'purchased_list')
  status,                    -- discovered|shortlisted|drafted|approved|sent|replied|won|rejected|suppressed
  approved_by, approved_at,  -- NOT NULL required before status can reach 'sent'
  jurisdiction_flag,         -- 'us'|'eu'|'uk'|'unknown' → drives consent warning
  created_at, updated_at
)

outreach_messages(
  id, prospect_id, subject, body, template_id,
  human_edited BOOL, approved_at, sent_at,
  sending_domain,            -- CHECK: must differ from site's primary MX domain
  unsubscribe_token
)

suppression_list(email_hash, domain, reason, created_at)  -- global, cross-tenant, permanent
brand_mentions(id, site_id, url, snippet, has_link, sentiment, authority, first_seen, status)
```
Enforce `approved_by IS NOT NULL` as a **database constraint** on the send path, not application logic.

### 11.5 Default config we should ship
```yaml
offpage:
  data_provider: dataforseo          # dataforseo | ahrefs | semrush | moz | majestic | openpagerank_only
  refresh:
    summary: weekly
    deep_profile: monthly
  autonomy:
    research: auto                   # Tier A
    fix_own_404s_with_inbound_links: auto      # Tier A — highest ROI, zero risk
    internal_links: auto
    draft_outreach: auto             # drafting only
    send_outreach: never             # 'never' | 'approve_each'  — NO 'auto' value exists
    haro_pitch: approve_each
    disavow: locked                  # unlocks only on detected manual action
  outreach:
    enabled: false                   # off by default
    max_sends_per_day: 10            # absolute ceiling 50
    sending_domain_must_differ_from_primary: true
    require_physical_address: true
    require_one_click_unsubscribe: true   # RFC 8058
    eu_uk_recipients: warn_and_block_by_default
  refuse:                            # not user-editable; enforced by absent tools
    - buy_links
    - link_exchange
    - pbn
    - expired_domain_acquisition
    - comment_forum_posting
    - scaled_guest_posts
    - parasite_placements
    - purchased_contact_lists
```

### 11.6 What to build first (ranked by value ÷ risk)
1. **Inbound-404 link recovery** — auto-detect `is_broken` backlinks to the user's domain, auto-301 or restore. Full autonomy, immediate measurable win, zero third-party contact. *Ship this in v1.*
2. **Lost-link & anchor-spike monitoring** — weekly `timeseries_new_lost_summary` + anchor distribution; alerts. Includes negative-SEO early warning. Cheap ($0.10/site/mo).
3. **Unlinked mention queue + mention-volume KPI** — directly targets the 0.66 correlation factor; safe; differentiating.
4. **Competitor backlink gap report** — classic, expected, read-only.
5. **Open-source `LinkRiskScore`** with ~20 transparent, auditable markers — differentiator vs black-box Toxicity/Spam Score.
6. **GSC Links CSV import** — free, $0 COGS, Google's own data, up to 100k rows; makes the free tier genuinely useful and de-risks the paid-index dependency. *Promote this — it was previously under-scoped as a fallback.*
7. **Connectively API adapter + HARO/SOS digest parser + grounded pitch drafting** (human sends) — high perceived value, contained risk. **Apply for Connectively partner API access immediately; approval latency is the critical path.**
8. **Outreach draft export** (Gmail drafts / `.eml` / CSV to Instantly/Smartlead) — *not* an integrated sender.
9. Disavow candidate generator (locked behind manual action, architecturally isolated for easy deletion) — build last, or never.

---

## 12. Staleness & confidence flags

| Claim | Confidence | Note |
|---|---|---|
| Google spam policy text & link-spam bullets | **High — primary**, page last updated **2026-08-28** | |
| `qualify-outbound-links`, `links-crawlable` guidance | **High — primary**, last updated **2025-12-10** | |
| Disavow file spec & "most sites will not need this tool" | **High — primary** (`support.google.com/webmasters/answer/2648487`) | |
| Manual action list & "blindly adding all backlinks" wording | **High — primary** (`answer/9044175`) | |
| No named link spam update since Dec 2022 | **High — primary** (Search Status Dashboard history) | Absence-of-evidence; dashboard may not list every internal change |
| GSC API has no links/disavow endpoint | **High — primary** (live discovery doc `searchconsole:v1` rev **20260830** + `webmaster-tools/v1/api_reference_index`) | Method count is **11**, not 10 — the retired `urlTestingTools.mobileFriendlyTest.run` is still in the discovery doc |
| GSC Links report free UI export: 100,000 rows (landing-page level) / 1,000 rows (summary tables) | **High — primary** (`support.google.com/webmasters/answer/9049606`) | This is the free ingest path; supersedes the earlier "any backlink feature requires a paid index" claim |
| GSC BigQuery bulk export has no links table | **High — primary** (`support.google.com/webmasters/answer/12917991`) | Only `searchdata_site_impression`, `searchdata_url_impression`, `ExportLog` |
| Connectively (ex-Featured) documents a press-opportunity API | **High — primary** (`connectively.us/api-integration` + `blog.connectively.us` launch post 2024-11-01) | **Partner-gated**; endpoints/rate limits/pricing ⚠️ unverified until access granted |
| Featured→Connectively restructuring 2026-06-02 | **High — primary** (globenewswire release 2026-05-26) | `featured.com` is now a separate AI-PR product; old URLs 301 |
| Qwoted Pro = **$99/mo** ($1,188/yr) | **High — primary** (`qwoted.com/pricing-toggle`, `app.qwoted.com/pricing_plans`) | `qwoted.com/pricing-2` is **stale** and still shows $149 — do not cite |
| Connectively journalist-platform pricing | ⚠️ **unverified — must be confirmed during implementation** (`connectively.us/pricing` returned HTTP 429) | |
| Source of Sources free/email-only/no API | **Low — secondary only** (`sourceofsources.com` returned 403) | ⚠️ unverified — must be confirmed during implementation |
| DataForSEO pricing ($0.024/req + $0.000036/row), endpoints, 2,000/min, 30 concurrent, 1.9T index | **High — primary** (dataforseo.com + docs.dataforseo.com) | |
| Majestic plan prices & unit allowances | **High — primary** (majestic.com/plans-pricing) | |
| Semrush: SEO Business required, 0 units bundled, 40 units/line backlinks | **High — primary** (developer.semrush.com) | Business plan *price* ($499.95/mo) is secondary |
| Featured.com pricing ($0/$29/$79/Pro+) | **High — primary** (featured.com/pricing) | ⚠️ These meter **AI credits on the new AI-PR co-pilot**, not journalist-query access. Pro+ price not published. |
| Qwoted has no public API | **High — primary** (nav/footer enumerated; corroborated by third-party trackers) | |
| Cision sold HARO to Featured.com, 2025-04-15 | **High — primary** (cision.com press release) | |
| Common Crawl graph sizes & file list (Apr–Jun 2026) | **High — primary** (data.commoncrawl.org) | |
| Common Crawl ToU incl. AI/ML indemnification clause | **High — primary** (commoncrawl.org/terms-of-use) | Get counsel before hosted-tier use |
| Bing Search API retired 2025-08-11 | **High — primary** (learn.microsoft.com lifecycle) | |
| Gmail sender guidelines (5,000/day to **personal** Gmail, **0.30% requirement**, DMARC alignment, RFC 8058 scoped to marketing/subscribed mail) | **High — primary** (support.google.com/a/answer/81126, live as of 2026-09-01) | 0.10% is a **recommendation**, not a requirement — corrected |
| Postmaster Tools v2: adds compliance API, **retires Domain/IP Reputation dashboards**; legacy deprecation **postponed, no date** | **High — primary** (Google deprecation page) | Contradicts widespread blog claims of an "October 2025 retirement" — do not build on reputation scores |
| CNIL SOLOCAL €900,000, 2025-05-15 | **High — primary** (cnil.fr) | |
| FTC penalty $53,088 effective 2025-01-17 | **Medium** — Federal Register 2025-01361 cited via search; **ftc.gov 403'd our fetches** | **Re-verify; the "no 2026 adjustment" claim is secondary only** |
| **Ahrefs API pricing/units (50-unit base, plan tiers, row caps)** | **LOW — docs.ahrefs.com returned 404/blank to every fetch attempt.** Numbers are from search-engine snippets of Ahrefs docs + third-party sites, several of which are AI-generated SEO spam | **Must be re-verified by a human with an Ahrefs login before we quote it anywhere** |
| **Moz Links API tier pricing** | **LOW — moz.com blocked our fetch entirely.** Free-tier "50 rows/month, 1 req/10s" is consistent across sources but unverified from primary | Re-verify |
| Microsoft Outlook enforcement: **`550 5.7.515`**, SMTP rejection effective 2025-05-05, requirement persists permanently once tripped | **High — primary** (support.microsoft.com NDR page + learn.microsoft.com + techcommunity post incl. its 2025-04-29 update) | **Corrected from `5.7.15`** — the two codes are distinct and real; the wrong one breaks bounce classification |
| Gary Illyes "we need very few links" / disavow removal remarks; Mueller (May 2024) "we'll remove it at some point" | **Low/dated — conference & social remarks, secondary reporting** | **Flag as possibly stale**; do not cite in-product. No official EOL timeline; tool still live in 2026. ⚠️ unverified — must be confirmed during implementation |
| Spam-policy carve-outs: three `rel` values, advertising/sponsorship scoping, ToS choice-to-qualify exception | **High — primary** (spam-policies + qualify-outbound-links, last updated 2025-12-10) | Corrected from "the only carve-out is nofollow/sponsored" |
| Compliance status of a fully `nofollow`/`sponsored`-qualified reciprocal link exchange | ⚠️ **unverified — must be confirmed during implementation.** No primary-source statement exists either way | **Treat as prohibited** |
| Per-country EU B2B cold-email legality | **Low — marketing-blog sources only** | Never assert per-country legality in-product |
| Brave Search free-tier removal Feb 2026 | **Low — secondary** | Verify before depending on it |
| Wayback CDX ~60 req/min | **Low — community consensus, no official published limit** | Budget conservatively |
| Ahrefs official MCP server | **Low — secondary comparison sites only** | |

---

## 13. Sources

All accessed **2026-08-31** unless noted.

**Google (primary):**
- Spam policies (link spam, site reputation abuse, scaled content abuse, expired domain abuse) — https://developers.google.com/search/docs/essentials/spam-policies — *page last updated 2026-08-28 UTC*
- Qualify outbound links (`nofollow`/`sponsored`/`ugc`) — https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links — *last updated 2025-12-10 UTC*
- Link best practices / crawlable links — https://developers.google.com/search/docs/crawling-indexing/links-crawlable — *last updated 2025-12-10 UTC*
- Google Search spam updates — https://developers.google.com/search/docs/appearance/spam-updates — *last updated 2025-12-10 UTC*
- Google Search Status Dashboard, ranking updates history — https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history
- Disavow links — https://support.google.com/webmasters/answer/2648487?hl=en
- Manual Actions report — https://support.google.com/webmasters/answer/9044175?hl=en
- Search Console API v1 reference — https://developers.google.com/webmaster-tools/v1/api_reference_index
- Search Console API **discovery document** (authoritative machine-readable method list) — https://searchconsole.googleapis.com/$discovery/rest?version=v1 — *revision 20260830*
- Search Console API overview — https://developers.google.com/webmaster-tools/about — *last updated 2025-08-28*
- Links report (export row limits) — https://support.google.com/webmasters/answer/9049606?hl=en
- BigQuery bulk export table guidelines — https://support.google.com/webmasters/answer/12917991?hl=en
- Email sender guidelines — https://support.google.com/a/answer/81126?hl=en
- Sender guidelines FAQ / bulk-sender scope — https://support.google.com/a/answer/14289100?hl=en
- Postmaster Tools v2 / deprecation notice — https://support.google.com/a/answer/16594218?hl=en
- Postmaster Tools help — https://support.google.com/mail/answer/9981691?hl=en

**Backlink data providers:**
- DataForSEO Backlinks API overview — https://dataforseo.com/backlinks-data-api
- DataForSEO Backlinks pricing — https://dataforseo.com/pricing/backlinks/backlinks
- DataForSEO docs, Backlinks overview — https://docs.dataforseo.com/v3/backlinks/overview/
- DataForSEO docs, Summary Live — https://docs.dataforseo.com/v3/backlinks/summary/live/
- DataForSEO docs, Bulk Spam Score Live — https://docs.dataforseo.com/v3/backlinks/bulk_spam_score/live/
- Semrush API — how to get API access — https://developer.semrush.com/api/basics/how-to-get-api/
- Semrush API — API unit balance — https://developer.semrush.com/api/basics/api-units-balance/
- Semrush API v3 — Backlinks reports (unit costs per report) — https://developer.semrush.com/api/v3/seo/backlinks/
- Semrush KB — Toxic markers description — https://www.semrush.com/kb/965-toxic-markers-description
- Majestic plans & pricing — https://majestic.com/plans-pricing
- Ahrefs pricing (web plans) — https://ahrefs.com/pricing
- Ahrefs API docs — https://docs.ahrefs.com/ (and `/api/docs/limits-consumption`, `/en/api/docs/introduction`) — **fetch failed (404/blank); content only via search snippets**
- Moz Links API pricing — https://moz.com/products/api/pricing — **fetch blocked; unverified**
- Open PageRank (Keywords Everywhere) — https://openpagerank.keywordseverywhere.com/ (redirect target of https://www.domcop.com/openpagerank/)
- Ahrefs AI brand visibility correlation study (n=75,000, 2025-12-12) — https://ahrefs.com/blog/ai-brand-visibility-correlations

**Open link graphs:**
- Common Crawl web graph release `cc-main-2026-apr-may-jun` — https://data.commoncrawl.org/projects/hyperlinkgraph/cc-main-2026-apr-may-jun/index.html
- Common Crawl blog, host/domain graphs Dec 2025 + Jan/Feb 2026 — https://commoncrawl.org/blog/host--and-domain-level-web-graphs-december-2025-and-january-february-2026
- Common Crawl web graph statistics — https://commoncrawl.github.io/cc-webgraph-statistics/
- cc-webgraph tooling — https://github.com/commoncrawl/cc-webgraph
- Common Crawl Terms of Use — https://commoncrawl.org/terms-of-use

**Digital PR / HARO successors:**
- Cision press release: sale of HARO to Featured.com (2025-04-15) — https://www.cision.com/about/press-releases/2025-press-releases/cision-announces-sale-of-help-a-reporter-out-haro-to-featuredcom-302427990/
- **Connectively API integration (the one real API in this ecosystem)** — https://www.connectively.us/api-integration
- Connectively API access request form — https://www.connectively.us/api-integration/sign-up
- Connectively blog: introducing the Featured API (2024-11-01) — https://blog.connectively.us/introducing-the-featured-api/
- Connectively pricing — https://www.connectively.us/pricing — **HTTP 429 on repeated fetches; ⚠️ unverified**
- GlobeNewswire: Featured.com revives Connectively, launches AI co-pilot for PR (2026-05-26) — https://www.globenewswire.com/news-release/2026/05/26/3301366/0/en/Featured-com-Revives-Connectively-Launches-AI-Co-Pilot-for-PR.html
- Yahoo Finance mirror of the same release — https://finance.yahoo.com/sectors/technology/articles/featured-com-revives-connectively-launches-173000574.html
- Featured.com pricing (AI-credit tiers for the new co-pilot product) — https://featured.com/pricing
- Featured.com — https://featured.com/
- Qwoted pricing (current) — https://www.qwoted.com/pricing-toggle/
- Qwoted in-app plans — https://app.qwoted.com/pricing_plans
- Qwoted — https://www.qwoted.com/
- Qwoted pricing (**stale page, still shows $149 — do not cite**) — https://www.qwoted.com/pricing-2/
- Source of Sources — https://www.sourceofsources.com/ — **HTTP 403 on fetch; ⚠️ unverified**
- Connectively blog: Featured acquires HARO — https://blog.connectively.us/featured-acquires-help-a-reporter-out-haro/

**Email law & deliverability:**
- CNIL: SOLOCAL MARKETING SERVICES fined €900,000 (2025-05-15) — https://www.cnil.fr/en/data-brokers-solocal-marketing-services-fined-eu900000
- CNIL (FR) — https://www.cnil.fr/fr/sanction-de-900-000-euros-societe-solocal-marketing-services
- FTC: Adjustments to Civil Penalty Amounts, Federal Register 2025-01361 (eff. 2025-01-17) — https://www.federalregister.gov/documents/2025/01/17/2025-01361/adjustments-to-civil-penalty-amounts
- FTC CAN-SPAM compliance guide — https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business — **403 on fetch; verify before quoting**
- ICO PECR electronic mail marketing guidance — https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/ — **403 on fetch; verify**
- Microsoft: Outlook's new requirements for high-volume senders (eff. 2025-05-05; note the 2025-04-29 update reversing Junk→reject) — https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730
- Microsoft: Fix NDR error **550 5.7.515** in Outlook.com — https://support.microsoft.com/en-us/outlook/fix-ndr-error-550-5-7-515-in-outlook-com
- Microsoft Q&A: NDR 550 5.7.515 Outlook/Hotmail limit — https://learn.microsoft.com/en-us/answers/questions/5877426/ndr-550-5-7-515-outlook-hotmail-limit
- dmarcian: Microsoft enforces SPF/DKIM/DMARC (secondary) — https://dmarcian.com/microsoft-enforces-spf-dkim-dmarc/

**Other:**
- Microsoft: Bing Search APIs retiring 2025-08-11 — https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- Wayback CDX Server API — https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md
- Internet Archive Wayback APIs — https://archive.org/help/wayback_api.php
- Search Engine Land: Google drops Mobile Usability report, Mobile-Friendly Test tool and API (retired 2023-12-01) — https://searchengineland.com/google-officially-drops-mobile-usability-report-mobile-friendly-test-tool-and-mobile-friendly-test-api-435377
- Search Engine Land: Google disavow link tool will go away "at some point" — https://searchengineland.com/google-disavow-link-tool-will-go-away-at-some-point-440205
- Search Engine Roundtable: August 2026 spam update — https://www.seroundtable.com/google-august-2026-spam-update-41895.html
- Search Engine Land: rel nofollow / ugc / sponsored — https://searchengineland.com/rel-nofollow-ugc-sponsored-links-seo-413534

---

## 14. Fact-check log

External fact-check pass completed **2026-09-01**. Six load-bearing claims were verified against primary sources; **two were CONFIRMED unchanged, three came back PARTIALLY_TRUE, one came back REFUTED.** All corrections have been applied inline above; this log is the audit trail, not the correction.

### FC-1 — GSC API has no links/disavow endpoint → **PARTIALLY_TRUE**
**Claim as written:** "GSC API v1 has NO links and NO disavow endpoint; the only resources are `searchanalytics.query`, `sitemaps.*`, `sites.*`, `urlInspection.index.inspect`. Any backlink feature therefore requires a paid third-party index; disavow is UI-upload only."

**Verdict:** Both negative facts CONFIRMED against the live discovery document (`searchconsole:v1`, revision **20260830**) — zero occurrences of `disavow`, `backlink`, `linkCount`, `inboundLink`, `externalLink`; no `links` resource; no v2/v3 successor; no deprecation notice. Disavow is confirmed UI-upload-only at `search.google.com/search-console/disavow-links`. **Three corrections:**
1. **Method count is 11, not 10** — `urlTestingTools.mobileFriendlyTest.run` is still in the discovery doc. It is a zombie: the Mobile-Friendly Test API was retired **2023-12-01** and returns no useful results. Auto-generated clients will surface it.
2. **"Any backlink feature requires a paid third-party index" is REFUTED.** GSC's Links report exports free via UI: **100,000 rows** (landing-page-level: "Latest links", "More sample links") and **1,000 rows** (summary tables). The accurate statement is: *no free **programmatic** path exists.* A paid index is needed only for automated refresh, competitor data, or data beyond the verified property. → **§4.5, §11.2 and §11.3.1 rewritten; GSC CSV import promoted in the §11.6 build order.**
3. Implementation detail: `sites.*`, `sitemaps.*`, `searchanalytics.query` still route to legacy **`webmasters/v3`** HTTP paths; only `urlInspection` and `urlTestingTools` use `v1/`.

**Caveats added:** BigQuery bulk export ships only `searchdata_site_impression`, `searchdata_url_impression`, `ExportLog` — no links table. Disavow tool has a stated (undated) end-of-life; Mueller, May 2024: it will be removed "at some point." → **§11.3.2 now requires architectural isolation of the disavow module.**

**Sources:** `https://searchconsole.googleapis.com/$discovery/rest?version=v1` (rev 20260830) · developers.google.com/webmaster-tools/v1/api_reference_index · developers.google.com/webmaster-tools/about · support.google.com/webmasters/answer/2648487 · .../answer/9049606 · .../answer/12917991 · searchengineland.com/google-officially-drops-mobile-usability-report-mobile-friendly-test-tool-and-mobile-friendly-test-api-435377 · searchengineland.com/google-disavow-link-tool-will-go-away-at-some-point-440205

### FC-2 — DataForSEO Backlinks pricing & limits → **CONFIRMED**
$0.024/request + $0.000036/row ($0.06 per 1,000-row pull), no subscription or seat fee, $50 minimum top-up, 1.9T+ index, 2,000 calls/min, 30 simultaneous requests, all endpoints Live via single POST. **No change made.**
**Sources:** dataforseo.com/pricing/backlinks/backlinks · docs.dataforseo.com/v3/backlinks/overview/

### FC-3 — Google link-spam policy text and carve-out → **PARTIALLY_TRUE**
**Claim as written:** the two quoted bullets + "Last updated 2026-08-28 UTC" + "the only carve-out is that paid/sponsorship links are acceptable if qualified with `rel="nofollow"` or `rel="sponsored"`."

**Verdict:** The two bullets and the date are CONFIRMED **verbatim** (page fetched twice, incl. `?hl=en`; both fetches agree on the 2026-08-28 footer). The full list is **11 bullets**. **"The only carve-out" is REFUTED on three counts:**
1. **`rel="ugc"` was omitted.** The qualifying-links doc (last updated 2025-12-10 UTC) supports **three** values — `sponsored`, `ugc`, `nofollow` — combinable space- or comma-separated (`rel="ugc nofollow"`). Google frames them as *hints*: qualified links "will generally not be followed," not guaranteed.
2. **The paid-links carve-out is narrower than stated** — it is scoped to *advertising and sponsorship* links only and does **not** extend to the automated-link-creation or link-exchange bullets.
3. **It is not the only carve-out.** The ToS bullet has a built-in exception (requiring a link is permitted if the publisher may qualify it), and the section is scoped by intent ("primarily for the purpose of manipulating search rankings"), plus "**Excessive**" and "**exclusively** for the sake of cross-linking."

**Freshness:** the 2026-08-28 edit did not touch these bullets; the August 2026 spam update was algorithmic, not a policy rewrite; the notable 2026 policy edit was **2026-05-15**, extending all spam policies to generative-AI responses. Also flagged: the separate **"Machine-generated traffic"** section governs our rank-tracking crawler, not our link features.

**Product bottom line unchanged:** cross-tenant link exchange and auto-posting remain prohibited — and now rest on the *correct* text, since the nofollow/sponsored carve-out does not rescue them. Whether a fully qualified reciprocal exchange is compliant is an **open ambiguity with no primary source either way** — marked ⚠️ unverified and treated as prohibited. → **§1.1 carve-out block rewritten; §12 rows added.**

**Sources:** developers.google.com/search/docs/essentials/spam-policies (+ `?hl=en`) · developers.google.com/search/docs/crawling-indexing/qualify-outbound-links · seroundtable.com/google-august-2026-spam-update-41895.html · searchengineland.com/rel-nofollow-ugc-sponsored-links-seo-413534

### FC-4 — Disavow guidance and file spec → **CONFIRMED**
"Considerable number of spammy links AND caused/likely to cause a manual action"; "In most cases, Google can assess which links to trust without additional guidance…"; "Blindly adding all backlinks to the disavow file is not considered a good-faith effort"; UTF-8/7-bit ASCII `.txt`, 100,000 lines, 2 MB, 2,048-char URLs, `domain:example.com`. **No change to the substance;** the format row and the exclusive-UI-upload path were made more explicit in §2.2.
**Sources:** support.google.com/webmasters/answer/2648487 · support.google.com/webmasters/answer/9044175

### FC-5 — HARO-successor ecosystem has no API; Featured/Qwoted pricing → **REFUTED**
**Claim as written:** "Neither Featured.com nor Qwoted documents a public API… Email digest parsing is the only machine-readable integration path."

**Verdict: the load-bearing conclusion is false.** Corrections:
1. **A documented API EXISTS.** The "Featured API" is published at `connectively.us/api-integration` (announced 2024-11-01): real-time press opportunities for embedding in Slack/newsletters/portals, ~1K publishers, ~1K opportunities/week, categories/tags, deadlines and time zones, `x-access-token` auth. **Partner-gated** — access is a request form; no public endpoint reference, rate limits, or API pricing. **The epic is buildable; approval, not architecture, is the schedule risk.** → **§7.2, §7.3, §11.3.3 and §11.6 rewritten.**
2. **Major 2026 restructuring missed.** Featured relaunched as **Connectively on 2026-06-02** (announced 2026-05-26); all opportunities, profiles, subscriptions, workflows and customer data moved there — "only the name, logo, and URL changed." `featured.com` is now a **separate** AI-PR co-pilot product. Old `featured.com` URLs 301 to `connectively.us`; `featured.com/api-integration` 404s.
3. **Featured tiers: numbers right, meaning wrong, one tier omitted.** $0 / $29 ($348/yr) / $79 ($948/yr) confirmed — but post-relaunch these meter **AI credits on the new co-pilot**, not journalist-query access ("Every plan includes every feature. Upgrade when you need more daily credits."). **Pro+** (20× usage, price unpublished) was omitted.
4. **Qwoted Pro is $99/mo, not $149.** The cited `qwoted.com/pricing-2` is a **stale page**. Current primary pages: `qwoted.com/pricing-toggle` shows **$99/mo** (explicitly reduced from $149) / **$1,188/yr**; `app.qwoted.com/pricing_plans` shows "~~$1,788.00~~ $1,188.00/yr". Basic free / 2 pitches / 2-hour delay / "Individual use only" and Pro 35 pitches with instant delivery are confirmed. **Managed Account** and **Qwoted Amplify** tiers were omitted.
5. **Qwoted has no public API — HOLDS.** No API/developer/integrations/Zapier link in nav or footer.
6. **SOS / HARO: broadly correct.** SOS free, email-only, no API — but `sourceofsources.com` returned **403**; secondary sources only → ⚠️ **unverified.** HARO relaunched free by Featured **2025-04-22**, 3×-daily digest restored, Cision's paid tiers removed; still free, email-only, no API.
7. **Acquisition date 2025-04-15: CONFIRMED.**

**Sources:** connectively.us/api-integration · connectively.us/api-integration/sign-up · blog.connectively.us/introducing-the-featured-api/ · globenewswire.com/…/Featured-com-Revives-Connectively-Launches-AI-Co-Pilot-for-PR.html · featured.com/pricing · qwoted.com/pricing-toggle/ · app.qwoted.com/pricing_plans · qwoted.com/pricing-2/ (stale) · cision.com/…/cision-announces-sale-of-help-a-reporter-out-haro-to-featuredcom-302427990/ · connectively.us/pricing (HTTP 429)

### FC-6 — Gmail/Microsoft sender requirements + CNIL fine → **PARTIALLY_TRUE**
**Two concrete errors, both fixed inline:**
1. **Spam rate: 0.10% is a RECOMMENDATION, not a requirement.** Google's live guidelines state the requirement as "Keep spam rates reported in Postmaster Tools **below 0.30%**." The "below 0.10% / never reach 0.30%" language sits in the Recommendations section. The claim elevated a recommendation to a requirement — conservative, so the product decision is unaffected, but **0.10% must not be cited as a Google requirement in customer-facing or compliance copy.** → **§8.3 table row rewritten; §8.4 and §10 Tier C wording corrected.**
2. **SMTP code is `550 5.7.515`, not `550 5.7.15`.** Both are real, distinct codes (`5.7.15` exists in Exchange for unrelated access-denied/SCL conditions). **Hardcoding `5.7.15` in bounce classification would silently miss the actual authentication rejections.** → **corrected in §8.3 and §10 Tier C.**

**Confirmed, with conditions the original omitted:** SPF+DKIM+DMARC all required, `p=none` explicitly sufficient, in force since 2024-02-01; **DMARC alignment is also required** (passing SPF/DKIM alone is insufficient); the threshold is 5,000 msgs/24h to **personal** Gmail accounts (Workspace-hosted accounts don't count); **RFC 8058 one-click unsubscribe is scoped to "marketing messages and subscribed messages"**, not all mail from a bulk sender. Microsoft: date 2025-05-05 confirmed, but via a **2025-04-29 revision** that reversed an earlier Junk-folder plan into outright rejection; threshold is 5,000+/day to Microsoft consumer domains from the same `5322.From` domain; **the requirement persists permanently once the domain has ever crossed the threshold.**

**CNIL: fully CONFIRMED** — SOLOCAL MARKETING SERVICES, €900,000, decision 2025-05-15 (published 2025-05-21). Grounds: Art. L.34-5 CPCE (broker-sourced data; oversized accept buttons vs. obscured opt-outs defeating free and unambiguous consent), GDPR Art. 7 and Art. 6. Scale ~4.7M SMS / ~500K email contacts in 2022; injunction with €10,000/day after 9 months.

**2026 updates added:** Postmaster Tools v2 adds a Compliance dashboard and compliance-status API and **retires the Domain and IP Reputation dashboards** → do not build reputation scores into monitoring. Blog claims that the legacy interface was "retired in October 2025" are **contradicted by Google's own deprecation page** (postponed, no date). Blog claims that Google raised the hard spam-rate requirement to 0.10% in 2026 are **not supported** by the live guidelines.

**Bottom line unchanged, and if anything understated:** both providers impose permanent-classification effects once thresholds are crossed, and Microsoft rejects at SMTP rather than junk-foldering — so a bulk-send misstep on a domain that also carries invoices and password resets produces hard bounces on transactional mail. Separate sending subdomain, hard caps, and human gating remain justified.

**Sources:** support.google.com/a/answer/81126 · .../answer/16594218 · .../answer/14289100 · support.google.com/mail/answer/9981691 · support.microsoft.com/en-us/outlook/fix-ndr-error-550-5-7-515-in-outlook-com · learn.microsoft.com/en-us/answers/questions/5877426/ndr-550-5-7-515-outlook-hotmail-limit · techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/…/4399730 · cnil.fr/en/data-brokers-solocal-marketing-services-fined-eu900000 · cnil.fr/fr/sanction-de-900-000-euros-societe-solocal-marketing-services · dmarcian.com/microsoft-enforces-spf-dkim-dmarc/
