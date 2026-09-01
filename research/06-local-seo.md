# 06 — Local SEO & Google Business Profile Automation

**Research date:** 2026-08-31
**Scope:** Local pack ranking factors, GBP API surface + quotas + access gating, citations/NAP, reviews & AI replies, local landing pages at scale, SABs, multi-location, local schema, Apple Business / Bing Places, local links, AI search impact on local discovery.
**Audience:** Engineers building an open-source, self-hostable autonomous SEO agent (local install + ~$8/mo hosted tier).

> **Staleness policy used here:** everything below is 2025–2026 unless explicitly marked `[PRE-2025 — VERIFY]`. Claims that only come from vendor/marketing blogs (not primary docs) are marked `[BLOG-ONLY]`.

---

## 0. TL;DR for the build team

1. **The GBP write APIs exist, are alive in 2026, but are hard-gated.** Every user needs (a) their own Google Cloud project, (b) a manual "Application for Basic API Access" approval from Google, (c) a GBP verified & active **60+ days**. Until approved, quota is literally **0 QPM** and the *Google My Business API v4.9* (the one containing **Reviews, LocalPosts, Media, FoodMenus**) is **not even visible in the Cloud Console API library**. This is the single biggest architectural constraint in this whole domain.
2. **Posts and Reviews are still only in the legacy v4.9 API.** Google never migrated them to the new v1 APIs. As of 2026-08-28 the official FAQ still lists v4.9 as containing FoodMenus/Media/Reviews/LocalPosts, and the official sunset table has **no sunset date for v4.9**. Q&A API *was* killed (support ended 2025-09-15, discontinued 2025-11-03).
3. **Quota is 300 QPM per API + a hard, non-negotiable 10 edits/min per profile** on Business Information. Plan for a per-profile write scheduler, not a burst queue.
4. **Design for "approval-optional" degradation.** Local mode should work read-only (crawl the site, Search Console, schema, landing pages, NAP audit by scraping public listings) and light up GBP writes only when the user's own approval lands. Never make GBP API approval a hard prerequisite to first value.
5. **Do not build review generation with gating or incentives.** Google's official policy explicitly bans incentives, selective solicitation, on-premise pressure, and requesting specific review content. Reply automation is fine; solicitation automation is where you get users banned.
6. **Google is not the only writable platform.** Apple's listings API (**Apple Business Partner API**, public REST docs, self-serve to *apply* for) and Bing's (**Bing Places API for Trusted Partners**, email-gated, client-cert auth, RPC-style) both support real location **writes**. They are approval-gated and slow — Apple is a 4-phase, multi-week qualification ending in a human-scheduled production launch — not absent. Plan them as later-phase connectors, and do **not** design an Apple CSV-only path: Apple is deprecating bulk-file ingestion for partners. See §13, §14.
7. **Local landing pages at scale is the highest-risk automation in this whole product.** Google's spam policy names both "doorway abuse" and "scaled content abuse". Gate city/service page generation behind uniqueness thresholds + human approval.

---

## 1. Local pack ranking factors — Whitespark 2026 Local Search Ranking Factors

**Primary source:** https://whitespark.ca/local-search-ranking-factors/ (report titled *2026*, published **2025-11-06**).

**Methodology:** 47 local search experts, **187 factors**, ~2h survey each. Each factor scored 0–5 across **four** axes — Local Pack/Maps impact, Local Organic impact, **Conversion impact**, and (new for 2026) **AI Search visibility impact**.

### Category weights — Local Pack / Maps
| Category | Weight |
|---|---|
| Google Business Profile signals | ~25% |
| Review signals | ~20% |
| Behavioral / engagement signals | ~18% |
| Citation signals | ~12% |
| Link signals | ~12% |
| On-page signals | ~10% |
| Other | ~3% |

### Category weights — Localized Organic
| Category | Weight |
|---|---|
| On-page signals | ~22% |
| Link signals | ~20% |
| Citation signals | ~15% |
| Review signals | ~13% |
| GBP signals | ~12% |
| Behavioral signals | ~10% |
| Other | ~8% |

> Note: a competing summary (soci.ai) reported "GBP signals = 32% of local pack" attributing it to a *2025* Whitespark/BrightLocal study. `[BLOG-ONLY]` and inconsistent with the 2026 report's ~25%. Use the ~25% figure and the 2026 report.

### Top 10 Local Pack / Maps factors (with survey scores)
1. Primary GBP category (227)
2. Proximity of address to point of search (225)
3. Keywords in GBP business title (223)
4. Physical address in city of search (213)
5. Business open at time of search (189)
6. High numerical Google ratings (181)
7. Address showing on GBP (176)
8. Additional GBP categories (173)
9. Quantity of native Google reviews (170)
10. Proper map pin placement (165)

### Top 10 Localized Organic factors
1. Dedicated page per service (210)
2. Geographic keyword relevance of domain content (190)
3. Quality/authority of inbound links to domain (187)
4. Keywords in landing page title (179)
5. Inbound links from locally/industry-relevant domains (175)
6. Internal linking across the site (174)
7. Topical keyword relevance of domain content (172)
8. Keywords in landing page H1/H2 (169)
9. Website niche focus / topical focus (169)
10. Keyword-relevant anchor text in inbound links (169)

### Automation-relevant reads
- **#1 and #8 are GBP category fields → directly writable via the Business Information API** (`categories.primaryCategory`, `categories.additionalCategories`). This is the highest-leverage automated write in local SEO.
- **#3 (keywords in title) is a trap.** Google's guidelines forbid adding descriptors to the business name. Never auto-write `title`. Surface it as an advisory only.
- **#5 "open at time of search"** → automate `regularHours` / `specialHours` / `moreHours` correctness and holiday hours. This is a genuinely safe, high-value, recurring automation.
- **#1 in local organic ("dedicated page per service")** is the core content automation opportunity — and the doorway-page risk (see §7).
- Whitespark's own 2025 blog argues **review recency** is the most underrated factor `[BLOG-ONLY]`, consistent with BrightLocal 2026 consumer data (74% want reviews from the last 3 months).

---

## 2. Google Business Profile API surface (as of 2026-08)

### 2.1 The eight APIs

Per the official FAQ (page last updated **2026-08-28**) and the Basic Setup page, the surface is:

| API | Cloud Console name | Service host | What it does |
|---|---|---|---|
| Account Management API | My Business Account Management API | `mybusinessaccountmanagement.googleapis.com/v1` | accounts, admins, invitations, location transfers |
| Business Information API | My Business Business Information API | `mybusinessbusinessinformation.googleapis.com/v1` | locations CRUD, categories, attributes, chains, Google-updated diffs |
| Verifications API | My Business Verifications API | `mybusinessverifications.googleapis.com/v1` | fetchVerificationOptions, verify, verifications.list/complete, getVoiceOfMerchantState |
| Business Profile Performance API | Business Profile Performance API | `businessprofileperformance.googleapis.com/v1` | daily metrics, multi-daily metrics, monthly search keywords |
| Notifications API | My Business Notifications API | `mybusinessnotifications.googleapis.com/v1` | Pub/Sub notification settings |
| Place Actions API | My Business Place Actions API | `mybusinessplaceactions.googleapis.com/v1` | booking/order/reserve action links |
| Lodging API | My Business Lodging API | `mybusinesslodging.googleapis.com/v1` | hotel attributes |
| **Google My Business API v4.9 (legacy)** | Google My Business API | `mybusiness.googleapis.com/v4` | **FoodMenus, Media, Reviews, LocalPosts** |

> **Critical:** the official FAQ explicitly says: *"Google My Business API 4.9, that includes the following important feature API calls: FoodMenus, Media, Reviews, LocalPosts"*. There is **no v1 replacement** for Reviews or LocalPosts. Anyone who tells you the "old API was retired in April 2022" is wrong about these four — the monolith was split but these four stayed on v4.

### 2.2 Sunset table (official, https://developers.google.com/my-business/content/sunset-dates)

| Deprecated | Type | Replacement | Support ended | Discontinued |
|---|---|---|---|---|
| **My Business Q&A API** | API | **none** | **2025-09-15** | **2025-11-03** |
| Performance `accounts.locations.reportInsights` | method | `locations.fetchMultiDailyMetricsTimeSeries` | 2022-11-21 | 2023-03-30 |
| My Business Business Calls API | API | none | 2023-02-21 | 2023-05-30 |
| `locations.associate`, `locations.clearLocationAssociation` | methods | none | 2023-02-21 | 2023-05-30 |
| `accounts.locations.InsuranceNetworks` | API | none | 2024-06-17 | 2024-07-01 |
| `getHealthProviderAttributes` / `updateHealthProviderAttributes` | methods | none | 2024-06-17 | 2024-07-01 |

**No entry for LocalPosts, Reviews, or Media.** They are not deprecated as of 2026-08-31.
Also deprecated: notification types `NEW_QUESTION`, `NEW_ANSWER`, `UPDATED_QUESTION`, `UPDATED_ANSWER` (Q&A). Do not subscribe to them.

### 2.3 Business Information API — Location resource fields (writable surface)

`Location` fields (v1 `businessinformation`):
`name` (`locations/{locationId}`), `languageCode` (immutable), `storeCode`, `title`, `phoneNumbers` (`primaryPhone`, `additionalPhones`), `categories` (`primaryCategory`, `additionalCategories`), `storefrontAddress` (PostalAddress, max 5 address lines), `websiteUri`, `regularHours`, `specialHours`, `serviceArea`, `labels` (1–255 chars each), `adWordsLocationExtensions`, `latlng`, `openInfo` (status + openingDate), `metadata` (read-only), `profile` (business description), `relationshipData` (parent/child), `moreHours`, `serviceItems`.

Methods:
- `accounts.locations.list` (GET), `accounts.locations.create` (POST) — both under `accounts/{accountId}/locations`
- `locations.get`, `locations.patch`, `locations.delete`
- `locations.getAttributes`, `locations.updateAttributes`
- `locations.getGoogleUpdated` — **use this**: returns Google's own version of the location so you can diff against yours and detect Google-applied edits / user-suggested edits. This is the backbone of an "auto-revert unwanted Google edits" feature.
- `attributes.list` (category+country scoped attribute vocabulary)
- `googleLocations.search` (SearchGoogleLocation) — dupe detection before create

`readMask` is required on reads (v1 style) and `updateMask` on `patch`. Both `list` and `patch` reject requests with no mask.

### 2.4 Reviews API (v4.9) — endpoints and limits

Base: `https://mybusiness.googleapis.com/v4`

- `GET /accounts/{accountId}/locations/{locationId}/reviews` → `reviews[]`, `averageRating`, `totalReviewCount`, `nextPageToken`. Supports `pageSize`, `pageToken`, `orderBy`.
- `GET /accounts/{a}/locations/{l}/reviews/{reviewId}`
- `PUT /accounts/{a}/locations/{l}/reviews/{reviewId}/reply` (`reviews.updateReply`) — creates **or** updates the reply
- `DELETE /accounts/{a}/locations/{l}/reviews/{reviewId}/reply` (`reviews.deleteReply`)
- `POST /accounts/{a}/locations:batchGetReviews` (on the parent `accounts.locations` resource) — multi-location review fetch

`Review` fields: `name`, `reviewId` (encrypted), `reviewer{displayName, profilePhotoUrl, isAnonymous}`, `starRating` (`ONE`…`FIVE`), `comment`, `createTime`, `updateTime`, `reviewReply{comment, updateTime}`, `reviewMediaItems[]`, `reviewReplyUrl`.

> **Hard limit to encode:** review reply `comment` max **4096 bytes** (bytes, not chars — matters for emoji/CJK). Truncate on byte length.

### 2.5 LocalPosts API (v4.9) — endpoints and fields

`accounts.locations.localPosts`: `create`, `get`, `list`, `patch`, `delete`, `reportInsights`.

`LocalPost` fields: `name`, `languageCode`, `summary`, `callToAction{actionType, url}`, `media[]` (`sourceUrl`), `topicType` ∈ `{STANDARD, EVENT, OFFER, ALERT}`, `event{title, schedule, ...}`, `offer{couponCode, redeemOnlineUrl, termsConditions}`, `alertType` (e.g. `COVID_19`), `createTime`, `updateTime`, `scheduledTime`, `state`, `searchUrl`.
Deprecated field: top-level `recurringInstanceTime` → use `event.recurring_instance_time`.

> Commonly cited content limits (summary ~1,500 chars, offer title ~58 chars, image ≥720×720, ≥10KB) are **not** in the reference page and are `[BLOG-ONLY]`. ⚠️ **unverified — must be confirmed during implementation**; validate empirically and store as configurable constants.

### 2.6 Performance API

- `GET https://businessprofileperformance.googleapis.com/v1/locations/{locationId}:getDailyMetricsTimeSeries?dailyMetric=…&dailyRange.start_date…&dailyRange.end_date…`
- `GET .../locations/{locationId}:fetchMultiDailyMetricsTimeSeries?dailyMetrics=…&dailyMetrics=…` (batch — replaced `reportInsights`)
- `GET https://businessprofileperformance.googleapis.com/v1/locations/{locationId}/searchkeywords/impressions/monthly?monthlyRange.start_month.year=…&…` — `pageSize` default **100**, **max 100**.

**Full `DailyMetric` enum (verbatim from the official reference):**
`DAILY_METRIC_UNKNOWN`, `BUSINESS_IMPRESSIONS_DESKTOP_MAPS`, `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`, `BUSINESS_IMPRESSIONS_MOBILE_MAPS`, `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`, `BUSINESS_CONVERSATIONS`, `BUSINESS_DIRECTION_REQUESTS`, `CALL_CLICKS`, `WEBSITE_CLICKS`, `BUSINESS_BOOKINGS`, `BUSINESS_FOOD_ORDERS`, `BUSINESS_FOOD_MENU_CLICKS`.

**Search-keyword gotcha:** `searchKeywordsCounts[].insightsValue` is a **union** — either `value` (int64, unique-user-deduped monthly count) or `threshold` (int64, meaning "actual value is below this"). Your ETL must handle `threshold` or you will silently under/over-count. Keywords are lower-cased.

Impressions are **unique-user-per-day deduped**, so they are NOT comparable to Search Console impressions. Do not sum them into a single "impressions" KPI with GSC.

### 2.7 Notifications API (Pub/Sub) — the right way to watch reviews

- Create a Cloud Pub/Sub topic in your project.
- Grant `pubsub.topics.publish` to `mybusiness-api-pubsub@system.gserviceaccount.com`.
- `PATCH https://mybusinessnotifications.googleapis.com/v1/accounts/{accountId}/notificationSetting?updateMask=pubsubTopic` with body `{"pubsubTopic": "projects/{p}/topics/{t}"}`. Sending an empty `pubsubTopic` deletes the setting.
- Event categories: new/updated reviews, media uploads, Google-initiated review updates, location state changes. (Q&A types deprecated — see §2.2.)

> For a **self-hosted** tool this is awkward (needs a public push endpoint or a pull worker + GCP creds). Recommended: **pull subscription** from the local agent, falling back to polling `reviews.list` on a cadence when Pub/Sub isn't configured.

### 2.8 Verifications API

- `locations.fetchVerificationOptions`
- `locations.verify`
- `locations.verifications.list` (ordered by create time)
- `locations.verifications.complete` (completes a `PENDING` verification)
- `locations.getVoiceOfMerchantState` — **use this as the health check.** "Voice of Merchant" = whether the profile is actually in good standing / owned. If VOM is false, all your other writes are theatre.

---

## 3. GBP API access gating — the exact process (this is the make-or-break)

### 3.1 Prerequisites (official, https://developers.google.com/my-business/content/prereqs)
1. Google Account.
2. Familiarity with Business Profile (Google literally lists this).
3. A Google Cloud project (need the **Project Number**, not the ID).
4. A GBP **organization account**.
5. **"Manage a Google Business Profile that is verified and active for 60+ days."**
6. A **website representing the business listed on the profile**.

### 3.2 The form
- URL: **https://support.google.com/business/contact/api_default**
- Dropdown options include **"Application for Basic API Access"** and **"Quota Increase Request"**.
- Submit from an email that is an **owner/manager on the profile**. Community/blog consensus: submit as **owner**, not manager, and the website domain should match the email domain — mismatches are the #1 rejection cause `[BLOG-ONLY]` ⚠️ **unverified — must be confirmed during implementation.**
- Fields for the quota-increase path (verbatim from the Limits page): **Company name, Contact email, Project number**.
- Official FAQ: **"Requests are reviewed within 14 days."** A follow-up email is sent after review. `[BLOG-ONLY]` sources say 7–10 business days in practice.

### 3.3 How to detect approval programmatically
Official prereqs page: **quota of 0 QPM = not approved; 300 QPM = approved.** So:
- Poll the Cloud Quotas / Service Usage API for the GBP services' QPM limit, **or**
- Simply attempt `accounts.list` on `mybusinessaccountmanagement.googleapis.com` and treat `429 RESOURCE_EXHAUSTED` / quota-0 as "not yet approved".
- A known community failure mode: **Business Profile API approved but Account Management API quota still 0**, which blocks `accounts.list` entirely. Handle this as a distinct, explainable error state in the UI (link the user to the form). Source: Google Business Profile Community thread 415931676.

### 3.4 The v4.9 visibility trap
Official Basic Setup page: *"The Google My Business API is only visible in the Google Cloud console to users who submit and receive approval for their Google Account through the access request form."*
→ **Your setup wizard cannot tell users to "just enable the Google My Business API".** It won't be in their API library until approval. Detect and message this explicitly.

### 3.5 APIs to enable in Cloud Console (official list, 7 items)
Google My Business API · My Business Account Management API · My Business Lodging API · My Business Place Actions API · My Business Notifications API · My Business Verifications API · My Business Business Information API.
(The Performance API is enabled separately as "Business Profile Performance API".)

---

## 4. Quotas — exact numbers

**Primary source:** https://developers.google.com/my-business/content/limits (verbatim table).

| API | Limits |
|---|---|
| **Business Information API** | **300 QPM**; `CreateLocation` **300 QPD**; `SearchGoogleLocation` **300 QPD**; `UpdateLocation` **10,000 QPD**; **Edits: 10 per minute per Google Business Profile (cannot be increased)** |
| Account Management API | 300 QPM |
| Performance API | 300 QPM |
| Verifications API | 300 QPM |
| Lodging API | 300 QPM |
| Place Actions API | 300 QPM |
| Notifications API | 300 QPM |

**Google My Business API v4.9 (Reviews/LocalPosts/Media) has no published row in this table.** Treat as 300 QPM and instrument for 429s. ⚠️ **unverified — must be confirmed during implementation.**

**Error semantics:** exceeding quota → HTTP **429 Too Many Requests** (REST) / `RESOURCE_EXHAUSTED` (gRPC).

**Quota-increase denial criteria (verbatim-ish from the docs):** denied if your app doesn't consistently reach current limits, if average usage is **"less than 50% of your current QPM limit"**, or if you exhibit **"a highly spiky request pattern rather than a smooth distribution."**
→ **Design implication:** implement a **token-bucket smoother** that spreads writes evenly across the day, not a nightly batch. Google explicitly penalises spiky patterns when you later ask for more quota.

**The 10-edits/min/profile cap is the real ceiling.** For a 500-location chain you can do 300 QPM globally but only 10 edits/min on any *single* profile. Queue per-`locationId`.

---

## 5. Auth architecture (self-hosted vs hosted) — decide this early

**Scope:** `https://www.googleapis.com/auth/business.manage` (single scope covers all Business Profile base URLs). Legacy alias `https://www.googleapis.com/auth/plus.business.manage` still accepted for backwards compatibility.
**API keys do not work** — OAuth 2.0 only (data is user-owned). Use `access_type=offline` to obtain a refresh token; store it encrypted at rest.

Two very different worlds:

**(A) Self-hosted / local install**
- The user creates *their own* GCP project, *their own* OAuth client, and gets *their own* GBP API approval.
- Their OAuth app has one user (themselves) → the app can stay in "Testing"/unverified. Unverified apps requesting sensitive/restricted scopes are capped at **100 new users for the lifetime of the project** (cannot be reset), which is irrelevant at n=1.
- Caveat: unverified apps in Testing mode issue **refresh tokens that expire (historically ~7 days)**. Your local agent must handle re-consent gracefully, or the user must publish their app to Production (unverified Production still shows the "Google hasn't verified this app" interstitial but doesn't expire tokens weekly). ⚠️ **unverified — must be confirmed during implementation.** (Token-expiry behaviour is documented in Google's OAuth docs, but the 7-day figure is widely reported rather than crisply restated in the pages fetched.)
- **This is the right default.** It pushes the approval burden, quota, and liability onto the user, and it's the only model that works for a self-hostable OSS tool.

**(B) Hosted $8/mo tier**
- You are a multi-tenant OAuth app → **OAuth app verification required** (brand verification + Search Console domain verification + privacy policy on the same domain + per-scope justification + an unlisted YouTube demo video of the consent flow and scope usage). Google states sensitive-scope verification **"typically takes 3-5 business days"**; the verification snapshot is valid **7 days** before needing re-verification.
- Separately you need **your own** GBP "Application for Basic API Access" for your project, with **your** quota shared across **all** tenants. 300 QPM shared across thousands of $8/mo customers is the binding constraint. You will need a quota increase, which requires proving smooth, high utilisation.
- **Recommendation:** for the hosted tier, either (i) require BYO-Google-Cloud-project even on hosted (unusual but honest), or (ii) build the hosted tier's GBP module last, after you have real usage data to justify a quota increase.

---

## 6. Reviews: generation, monitoring, and AI replies

### 6.1 Official Google policy — what you may and may not automate

From https://support.google.com/business/answer/2622994 (Google's own wording):
- **Allowed:** *"Solicit or encourage the posting of content that does represent a genuine experience, without offering incentives to do so or attempting to influence the rating or the contents of the review."*
- **Banned:** *"Offer incentives – such as payment, discounts, free goods and/or services - in exchange for posting any review or revision or removal of a negative review."*
- **Banned (review gating):** *"Discourage or prohibit negative reviews, or selectively solicit positive reviews from customers."*
- **Banned (kiosks/on-premise pressure & scripted content):** *"Merchants should not require or pressure users to leave ratings or write reviews while on the premises, nor should they request that specific content be included."*

From the Maps UGC policy (https://support.google.com/contributionpolicy/answer/7400114):
- **Fake engagement:** *"Contributions to Google Maps should reflect a genuine experience at a place or business. Fake engagement is not allowed and will be removed."* Covers paid reviews, multi-account posting, device tampering.
- Full prohibited/restricted taxonomy: Fake & Misleading Content, Fake Engagement, Rating Manipulation, Impersonation, Misinformation, Misrepresentation, Harassment, Hate Speech, Offensive Content, Personal Information, Obscenity & Profanity, Sexually Explicit, Adult-Themed, Violence & Gore, Restricted Content (alcohol/gambling/tobacco/guns/pharma), Dangerous Content, Child Safety, Terrorist Content, Off-Topic, Advertising & Solicitation, Unclear Content, Repetitive Content, Defacement & Mischief.

**April 2026 update `[BLOG-ONLY — multiple independent vendor blogs, no primary Google changelog located]`:** Google reportedly tightened Rating Manipulation clauses on 2026-04-16/17 — Gemini-powered pre-publication scam detection, explicit ban on **staff review quotas** ("get 10 reviews this month") and on **asking customers to name a specific employee**. The "specific content" ban *is* in the current official page text, which corroborates the direction. ⚠️ **unverified — must be confirmed during implementation** (dates especially); treat the rules as real.

**"Google prohibits AI-generated review content"** as of 2025 `[BLOG-ONLY]` — I could not find that phrase in the official Maps UGC policy page. It is plausibly an inference from Fake Engagement. ⚠️ **unverified — must be confirmed during implementation.** **Do not** build anything that writes *reviews*. Writing *replies* is a different, permitted act (the API has `updateReply`).

### 6.2 Consumer data — BrightLocal Local Consumer Review Survey 2026
Primary: https://www.brightlocal.com/research/local-consumer-review-survey/ — n = **1,002 US adults**, SurveyMonkey panel.
- 97% read reviews for local businesses; **41% "always"** read them (up from 29% in 2025).
- **74% want reviews written in the last 3 months** → recency is a product feature, not a nice-to-have.
- 47% won't use a business with **fewer than 20 reviews**; 31% require **4.5+ stars**.
- **80%** more likely to use a business that responds to **all** reviews; 42% unlikely to use one that ignores reviews.
- **19% expect a same-day response** (up from 6% in 2025).
- 82% read AI-generated review summaries; 23% decide on the AI summary alone.
- **AI tools for local discovery jumped 6% → 45% YoY**, making AI the #3 discovery channel. Google's share of review-reading dropped **83% → 71%**.
- 40% trust AI platform recommendations; 42% trust them as much as written reviews.
- "Half reject copy-paste replies" → **your AI replies must be individuated, referencing specifics from the review text.**

### 6.3 Concrete review automation design
- **Ingest:** Pub/Sub notification → `reviews.list` delta, or poll every 15–60 min. Persist `reviewId`, `updateTime`, `starRating`, `comment`, `reviewReply`.
- **Reply generation:** LLM with a template policy — must mention ≥1 specific detail from the review; ban promotional language and keyword stuffing; ban asking the reviewer to edit/remove the review; enforce **≤4096 bytes**; enforce a per-account tone/persona config.
- **Autonomy tiers:** auto-send 4–5★ replies; **always** human-in-the-loop for 1–2★ (legal/HIPAA/defamation exposure). 3★ configurable.
- **SLA target:** same-day (19% of consumers now expect it). Alert on any unreplied review > 24h.
- **Solicitation:** ship a *compliant* review request feature only — one link (`reviewReplyUrl`-adjacent "write a review" short link), sent to **all** customers, no incentive text, no pre-screening question. Put a hard compliance check in the UI: if the user's template contains an incentive keyword ("discount", "gift card", "free", "coupon", "$"), block it.
- **Fallback when GBP API is unapproved:** Places API (New) `Place Details` returns **`reviews`, `rating`, `userRatingCount`** — but reviews are **capped at 5** and non-paginated. **The fields sit in two different SKUs:** `reviews` is **Place Details Enterprise + Atmosphere** ($25.00/1K); `rating`, `userRatingCount` and `priceLevel` are **Place Details Enterprise** ($20.00/1K). A rating-and-count-only monitor is therefore the cheaper SKU *and* draws on a **separate** 1,000/month free allowance, because the free caps are per SKU (see §12). Note the billing rule: a field mask spanning multiple tiers is billed **once at the highest tier**, so asking for `rating` + `reviews` together is one $25/1K event, not $20 + $25. Good enough for a "reputation snapshot", useless for reply automation (no write path). Also: Google Maps Platform terms forbid caching most Place content beyond **30 days** (place IDs may be stored indefinitely), so you cannot legally amortise cost with a long-lived review cache.

---

## 7. Local landing pages at scale & doorway risk

**Primary:** https://developers.google.com/search/docs/essentials/spam-policies (page updated 2026-08-28).

- **Doorway abuse (verbatim):** *"Doorway abuse is when sites or pages are created to rank for specific, similar search queries. They lead users to intermediate pages that aren't as useful as the final destination."* Named examples include multiple domains/pages targeting specific regions or cities that funnel to one destination.
- **Scaled content abuse (verbatim):** *"Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings and not helping users."* Explicitly includes *"using AI tools to mass-produce pages lacking user value"* and *"combining disparate web pages without adding substance."*
- 2026 note on the page: a **site reputation abuse carve-out for the EEA** dated 2026-08-28 — third-party content on host sites in the EEA may be ranked independently on merit rather than receiving a site-wide manual action. Not directly local, but relevant if you ever build "publish on partner sites".

### Guardrails to implement (turn these into code)
A generated `/service/city` page may only be published if **all** of:
1. **Uniqueness ≥ 60% non-boilerplate tokens** vs. every sibling page (shingle/MinHash diff, not cosine on embeddings — embeddings are too forgiving).
2. Contains **≥3 location-specific facts** that cannot be produced by template substitution (named neighbourhoods served, a local case study/testimonial, local pricing/permit/regulation notes, real service radius, staff/branch name, local photo with geotagged EXIF-stripped alt text).
3. Has a **unique title, H1, meta description** and a unique intro paragraph (first 200 words must not be templated).
4. Maps to a **real service the business performs in that place** (validated against `serviceItems` / `serviceArea` from GBP, or explicit user config).
5. **Page count cap:** default max = `min(#services × #real service areas, 50)` before requiring explicit human approval to go further. Hard-stop the agent at scale without a human gate.
6. Internal-link the page from a real hub (services index + area index), never orphaned. Internal linking is #6 in Whitespark's local organic factors.
7. **No** near-duplicate city pages for cities where the business has no genuine presence or service coverage.

**Ship a "doorway risk score"** in the dashboard: pages/site ratio, template similarity, thin-content ratio, orphan ratio, city-page-to-real-location ratio. Refuse to publish above threshold.

---

## 8. Service-area businesses (SABs)

Official guidelines (https://support.google.com/business/answer/3038177):
- SABs without a storefront **must** designate a service area and **hide the physical address** if operating from a residence.
- **"The boundaries of your profile's overall service area shouldn't extend farther than about 2 hours of driving time"** from the base of operations.
- One profile per business location; P.O. boxes and virtual offices are ineligible; co-working addresses are ineligible *"unless that office maintains clear signage"* and is staffed during listed hours.
- Staff must be present during stated hours if you accept customer visits.
- **SABs cannot use bulk verification** (see §9).

API mapping: `Location.serviceArea` (`businessType` ∈ storefront/customer-location-only, `places.placeInfos[]` with `placeId`+`placeName`, or `regionCode`). Automate: validate that every listed service-area place is within ~2h drive of the base; flag violations. Distance can be computed offline from a places/geo dataset to avoid Routes API cost.

Content strategy for SABs: since the address is hidden, **proximity (#2 factor) is weakened**, and on-page geographic relevance + reviews mentioning locations matter more. This is exactly the segment where our local-landing-page automation is most valuable *and* most dangerous.

---

## 9. Multi-location management

- **Location groups** = "business accounts" in GBP; one master account controls many locations. API: `mybusinessaccountmanagement` `accounts.list` / `accounts.create` (type `LOCATION_GROUP`), `accounts.admins`, `locations.transfer`.
- **Bulk verification** (official https://support.google.com/business/answer/4490296):
  - **10 or more locations of the same business** required. Duplicate/suspended/disabled profiles **don't count** toward the threshold.
  - **Service-area businesses are excluded.**
  - **Agencies managing multiple different businesses in one account cannot bulk verify.**
  - No existing verified account for the same business; all managed profiles must be in the submission.
  - Submission happens in the **Verifications tab of Business Profile Manager** — *"uploading a spreadsheet doesn't send a verification request"*.
  - No published SLA: *"After you request verification, we'll review the account details. If we need more info, we'll contact you."*
  - `[BLOG-ONLY]` field expectations: authorised-representative attestation, full location list with consistent NAP, evidence of centralised control (franchise agreement / corporate ownership); video verification may still be requested; stagger submissions to avoid spam flags.
- **Scaling math for our scheduler:** 300 QPM global + 10 edits/min/profile. A 1,000-location chain doing a hours update = 1,000 patches ≈ 3.3 min at 300 QPM if perfectly smoothed, but you must also respect per-profile edit limits (trivially satisfied at 1 edit/profile). The killer is bulk attribute + serviceItems + photos in the same run — sequence them.
- Use `locations.getGoogleUpdated` on a nightly sweep across all locations to detect Google-applied edits; diff → propose reverts. At 300 QPM, 1,000 locations ≈ 3.3 min/night. Cheap.

---

## 10. Citations & NAP consistency

### 10.1 The aggregator layer (US), 2026 status
Three players still matter `[BLOG-ONLY for 2026 status — no primary vendor doc confirms current syndication reach]`:
- **Data Axle** — oldest/largest NA business data provider; feeds YP.com, Superpages, CitySearch and many niche directories.
- **TransUnion Digital Business Profile (formerly Neustar Localeze)** — historically feeds Bing, Yahoo and hundreds of smaller directories. Note the rebrand; old "Localeze" docs are stale.
- **Foursquare** (merged with Factual) — feeds mobile apps, navigation, location-based search; increasingly a POI-data play rather than a consumer directory.

Reality check for 2026: aggregator submission is a **one-time hygiene task**, not an ongoing subscription need for most SMBs. Citation signals are only ~12% of local pack weight and ~15% of local organic weight per Whitespark 2026.

### 10.2 Vendor APIs & pricing

**Yext** (primary docs: https://docs.yext.com/docs/managementapis/introduction/overview-policies-and-conventions)
- Base URLs: `https://api.yextapis.com` (prod), `https://sbx-api.yextapis.com` (sandbox), regional `api.us.yextapis.com` / `api.eu.yextapis.com`.
- Auth: API key via `?api_key=` or header `api-key:`.
- **Every request requires `v=YYYYMMDD`** (a pinned date, never dynamic).
- **Rate limits:** Management API **5,000 req/hour**; Analytics API 1,000/hr; Agreements API 1,000/hr; Content Delivery API 100,000/hr. Burst limiting via GCRA → `429`. Headers: `Rate-Limit-Limit`, `Rate-Limit-Remaining`, `Rate-Limit-Reset`, `Rate-Limit-Retry-At`.
- Errors in `meta.errors[]` with `code` / `type` ∈ {`FATAL_ERROR`,`NON_FATAL_ERROR`,`WARNING`} / `message`.
- **Pricing: not published.** As of 2026 Yext removed its public pricing page; everything goes through demo/sales. Third-party trackers cite ~**$199–$499 per location per year** for basic plans, Knowledge API on the "Starter" plan and up, listings sync to **200+ publishers**, and **extra fees for live API access**. `[BLOG-ONLY / VENDR-ONLY]`
- Structural risk: Yext listings are **rented** — cancel and the listings can revert.

**BrightLocal** (primary: https://www.brightlocal.com/pricing/)
- Plans: **Track / Manage / Grow**, 1 → 100+ locations, monthly or annual (**annual saves 25%**), 14-day free trial, no card.
  - Track: rank tracking, citation + GBP + local search audits
  - Manage: + Listings Management, **Active Sync**, GBP post scheduling, edit suppression
  - Grow: + review monitoring, review generation campaigns, review widgets
- **The pricing page itself now shows "Price on request"** for the three tiers. `[BLOG-ONLY]` third-party trackers quote **$39 / $49 / $59 per month** for one location, and $60 (Multi Business) / $90 (SEO Pro) for agency tiers with API access. ⚠️ **unverified — must be confirmed during implementation**; verify with sales before quoting to users.
- **Citation Builder: from $2/citation** (bulk) pay-as-you-go, no subscription required; ~$3.20 without bulk `[BLOG-ONLY on the $3.20]`.
- Managed SEO service: **$1,299/mo** (the only hard number on the page).
- **API: "custom pricing — get in touch."** No self-serve API. This kills BrightLocal as a default OSS integration.

**Whitespark** (primary: https://whitespark.ca/pricing/)
- Local Platform: **$1/month per location**
- Local Ranking Grids: from **$10/mo**
- Local Rank Tracker: **$14–$200/mo** (up to 225 geo grid points)
- Local Citation Finder: **$33–$149/mo**
- Reputation Builder: **$79/mo per location**
- SEO Services: **$499–$1,999/mo**
- Listings Service: **$20–$999 one-time**
- **"Yext Replacement Service": $399 per location, one-time** ← the strategic point: permanent, owned citations vs. rented Yext listings.
- **No public API / no API pricing on the page.**

### 10.3 Implication: build NAP auditing ourselves
None of the three offers a self-serve, documented, priced API suitable for an OSS tool. Build:
- A **NAP canonical record** (name, address parts, phone E.164, website, hours, categories) sourced from GBP via API.
- A **directory checker**: fetch ~30–60 known directory URLs per business (Yelp, Facebook, Apple, Bing, BBB, Nextdoor, YP, Foursquare, chamber, vertical directories), fuzzy-match N/A/P, report deltas. Respect robots.txt; rate-limit; cache 30 days.
- Emit a **fix worklist with deep links** to each directory's edit page (most cannot be written via API anyway).
- Optional paid connector: Yext (Management API) for users who already have a Yext contract. Treat as a plugin, not a dependency.

---

## 11. Local schema (LocalBusiness)

Primary: https://developers.google.com/search/docs/appearance/structured-data/local-business (page dated **2025-12-10**; no 2026 deprecations found).

- **Required:** `name`, `address` (`PostalAddress`: `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`).
- **Recommended:** `geo` (`GeoCoordinates`, **latitude/longitude to ≥5 decimal places**), `telephone` (with country + area code), `url` (fully-qualified, location-specific), `priceRange` (**must be < 100 characters**), `openingHoursSpecification`, `department` (naming convention `"{store name} {department name}"`), `menu` (food only), `servesCuisine` (restaurants), `aggregateRating` / `review` (**only for sites capturing reviews about *other* businesses** — self-serving review markup is not eligible).
- `openingHoursSpecification`: `dayOfWeek` (Monday–Sunday, with or without the schema.org URL prefix), `opens`/`closes` in **hh:mm:ss**, `validFrom`/`validThrough` in **YYYY-MM-DD** for seasonal hours.
- Not in Google's required set but useful for AI/LLM grounding: `areaServed`, `sameAs` (link to GBP/Yelp/Apple/Facebook), `hasMap`, `identifier`, `@id` stable URI.

### Automation rules
- **Single source of truth:** generate JSON-LD from the GBP record so schema can never drift from the profile. Re-emit on every GBP change (via Pub/Sub or the nightly `getGoogleUpdated` diff).
- Use the **most specific subtype** available (`Dentist`, `Plumber`, `Restaurant`, `AutoRepair`, …) mapped from `categories.primaryCategory`. Maintain a GBP-category → schema.org-type mapping table; fall back to `LocalBusiness`.
- One `LocalBusiness` node per physical location page; on multi-location sites use `@id` = the location page URL and link them from an `Organization` node with `subOrganization`/`department`.
- Emit `specialOpeningHoursSpecification` for holidays from GBP `specialHours` — this is a genuinely differentiated automation nobody does well.
- **Do not** emit `aggregateRating` for the business's own Google reviews on its own site. Google's docs restrict `review`/`aggregateRating` here to third-party review sites.

---

## 12. Google Maps Platform / Places API costs (fallback data source)

Primary: https://developers.google.com/maps/billing-and-pricing/pricing.
Effective **2025-03-01** Google "replaced the USD $200 monthly recurring credit with a free monthly usage threshold for each Core Services SKU." The flat **$200/month credit is gone**, replaced by **per-SKU free monthly caps**: **Essentials 10,000**, **Pro 5,000**, **Enterprise 1,000** events/month. Still in force on the current pricing page.

> Two properties of these caps that drive our architecture: the allowance is **per SKU** (so Enterprise and Enterprise+Atmosphere have *separate* 1,000-event pools), and it is **per billing account — not per end user**. See the corrected cost model below.

Price per 1,000 events (0–100K tier, then volume discounts):
| SKU | 0–100K | next tiers |
|---|---|---|
| Place Details **Essentials** | **$5.00** | $4.00 / $3.00 / $1.50 / $0.38 |
| Place Details **Pro** | **$17.00** | $13.60 / $10.20 / $5.10 / $1.28 |
| Place Details **Enterprise** | **$20.00** | $16.00 / $12.00 / $6.00 / $1.51 |
| Place Details **Enterprise + Atmosphere** | **$25.00** | $20.00 / $15.00 / $7.50 / $2.28 |
| Text Search Essentials/Pro | **$32.00** | $25.60 / $19.20 / $9.60 / $2.40 |
| Text Search Enterprise | **$35.00** | $28.00 / $21.00 / $10.50 / $2.63 |
| Text Search Ent+Atmosphere | **$40.00** | $32.00 / $24.00 / $12.00 / $3.40 |
| Nearby Search Pro | **$32.00** | … |
| Geocoding | **$5.00** | $4.00 / $3.00 / $1.50 / $0.38 |

**Field → SKU mapping (per https://developers.google.com/maps/documentation/places/web-service/data-fields):**

| Field | SKU | Price (0–100K) |
|---|---|---|
| `reviews` | Place Details **Enterprise + Atmosphere** | **$25.00 / 1,000** |
| `rating`, `userRatingCount`, `priceLevel` | Place Details **Enterprise** | **$20.00 / 1,000** |

> Earlier drafts of this dossier lumped all three fields into Enterprise + Atmosphere. That is wrong. A monitor that tracks only star rating and review **count** (not review text) costs **$20/1,000**, and it consumes a **separate** 1,000-event free allowance, because the free caps are **per SKU per month**. Rating-only and reviews-inclusive monitoring have independent 1,000/month allowances.

> **Billing rule:** a field mask spanning multiple tiers is billed **once at the highest tier**, not once per SKU. `rating` + `reviews` in the same request = one $25/1K event, not $20 + $25.

Reviews are capped at **5 per place** ("A maximum of 5 reviews can be returned", Places REST reference for the `Place` resource), non-paginated, non-sortable (no pagination or sort parameter exists; long-standing limitation, issuetracker 35825957).

**Caching restriction:** Google Maps Platform terms let you store **place IDs indefinitely**, but most other Place content (including review data) **may not be cached beyond 30 days**. You cannot legally amortise API cost with a long-lived review cache — this, not the per-call price, is what makes a shared-key design expensive.

**Corrected cost model for our $8/mo hosted tier.** The old claim here — "a modest nightly competitor refresh exceeds the subscription price" — was **false at small scale**: 20 competitors × 30 nights = **600 calls/month**, which sits *under* the 1,000/month free Enterprise+Atmosphere cap and costs **$0**. The real blocker is that **the free cap is per billing account, not per end user**. On a single shared platform key every tenant draws from one 1,000/month pool:

- 10 customers × 10 competitors × nightly = **3,000 calls/mo** → 2,000 billable → **$50/mo** at $25/1K.
- That already blows past a ~$8/mo tier at **only 10 subscribers**, and it scales linearly from there.

→ **Do not put Places-API-based competitor tracking in the base hosted tier.** Make geo-grid rank tracking and competitor review monitoring **BYO-API-key** features (the user's own Maps key, their own per-account free tier) — not because the per-call price is prohibitive, but because **the free tier does not scale per tenant**. This is also the natural fit for a self-hosted tool, where each install has its own billing account and its own 1,000 free events.

---

## 13. Apple Business (formerly Apple Business Connect) — MAJOR 2026 CHANGE

Primary: https://www.apple.com/newsroom/2026/03/introducing-apple-business-a-new-all-in-one-platform-for-businesses-of-all-sizes/

- **Announced 2026-03-24; launched 2026-04-14** in **200+ countries/regions**.
- **Apple Business Connect no longer exists as a separate product.** Apple merged Apple Business Manager + Apple Business Essentials + Apple Business Connect into **"Apple Business"**. Existing Business Connect data (claimed locations, place card info, photos) **migrated automatically**.
- Core service is **free**. Paid add-ons: iCloud storage from **$0.99/user/mo** (up to 2TB); AppleCare+ for Business from **$6.99/mo/device** or **$13.99/mo/user** (up to 3 devices).
- Listings-relevant features: brand profiles, **rich place cards**, **Showcases**, **custom actions**, location insights, branded communications, Tap to Pay branding.
- **Maps Ads launching summer 2026 in the US and Canada** — ads at the top of Maps search results, marked for transparency. This is a genuine new local channel to track.
- **API — two different APIs, do not confuse them.**
  - **Apple School Manager / Apple Business API** (device, user, MDM, Blueprints, audit). This one *does* use OAuth 2.0 `client_credentials` with an **ES256-signed JWT client assertion** (`aud=https://account.apple.com/auth/oauth2/v2/token`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `scope=business.api`, assertion `exp` ≤ 180 days, token `expires_in` 3600). It has **zero location/listings endpoints.** Earlier drafts of this dossier wrongly attributed this auth scheme to the listings API.
  - **Apple Business Partner API** — this *is* the listings API. Spec **v1.5.1** (last updated 2026-06-26; onboarding guide v1.5.0, 2026-06-23; initial release 2026-04-14). The docs are **fully public and readable without auth** at `business.apple.com/docs`.
- **Apple Business Partner API — actual shape (corrects the "no real write API" framing):**
  - **Auth:** a Service Account **`client_id` + `client_secret`** created in-portal (secret shown once) exchanged for a Bearer token. Delegated brand access uses **OAuth apps with `grant_type=authorization_code` + PKCE `code_verifier`**; `access_token` `expires_in` 3600 with a refresh token; the authorization code must be redeemed **within 5 minutes and once only**. **Not** ES256 JWT `client_credentials`.
  - **Write endpoints are real REST:** `POST {url}/api/v1/orgs/{orgId}/locations` (create), plus update / delete / undelete / get_by_id / get_by_partner_id, and full CRUD for `brand`, `brand_asset`, `location_asset`, `showcase`, `showcase_creative`, `caller_id`, `email_id`, `agg_rating`, `apple_override`, `media`, `notifications`, `webhooks`, `insights`. Concurrency control via **etag**.
  - **Environments:** AIE `https://aie.partner-api-business.apple.com` (open-ended rate limit, test data only) → DQE `https://dqe.partner-api-business.apple.com` (**15 QPS**) → Production `https://api-business.apple.com` (**15 QPS**).
  - **Access is mostly self-serve to apply for:** register as a third-party partner, then Organization → API → "Request API Access" + questionnaire; Apple reviews and emails you the AIE endpoint. **"Requires an Apple representative" is wrong at the front door.** A human *is* involved at the end: Step 4 production launch requires confirming availability with Apple Business partner support to schedule a launch date, a live WebEx/email on launch day, and a **mandatory pause after roughly the first 5,000 records** for verification.
  - **Onboarding is 4 gated steps** (AIE integration typically **2–3 weeks**, then Data Qualification, then Production), requires a **Box account** to receive Apple's daily pass/fail progress reports, and requires keeping **4xx errors under one per hour**. Auto-verified location data publishes within **~15 minutes**.
  - Apple has **deprecated legacy Box bulk-file ingestion** for partners once their API path goes live → **a CSV-generator-only design is a dead end for Apple at scale.**
- **Corrected verdict for us:** Apple's listings API is **real, public, REST and self-serve to apply for** — it is *approval-gated and slow*, not nonexistent. The cost driver is the **multi-week 4-phase qualification with a human-scheduled production launch** and the **15 QPS ceiling**, plus the requirement to be an approved **partner/agency** rather than an individual SMB tool. Near-term: ship an **Apple Business checklist + deep links** for the long tail of single-location SMBs, and treat the Partner API as a **deliberate, funded roadmap item** (start AIE onboarding early — it is a calendar-time cost, not a technical blocker). Do **not** plan on CSV/Box bulk upload as the long-term path.
- All Apple Business Connect docs/tutorials dated 2024–early 2026 are now **stale on naming**.

---

## 14. Bing Places for Business

- Microsoft **relaunched Bing Places in October 2025** at `bing.com/forbusiness` with improved Google import, bulk editing, real-time status, and a Recommendation Tool. `[BLOG-ONLY on the relaunch details]` ⚠️ **unverified — must be confirmed during implementation.**
- **There IS a public write API — it is email-gated, not nonexistent.** Earlier drafts of this dossier said "no public API"; that is **misleading**. The **Bing Places for Business API for Trusted Partners** is publicly documented (PDF **v2.07, last revised 2024-01-22**, still live at `cdn.bingplaces.com`). What is true is that it is **not self-serve**.
- **Getting access:** *"Contact partneronbp@microsoft.com for getting your account configured as a trusted partner."* Partners are onboarded to sandbox first, then request production. A Microsoft employee (IoTGirl, 2026-01-16) answered a partner-access question on Microsoft Q&A pointing to `placesfeedback@microsoft.com`, so the programme is still alive in 2026.
- **Auth:** **client certificate + a PUID issued by the Bing Places team**, sent in an `Identity` object `{Puid, AuthProvider, EmailId}`. **No OAuth.**
- **Roots:** sandbox `https://api-test.bingplaces.com/trustedPartnerApi/v1/`, production `https://api.bingplaces.com/trustedPartnerApi/v1/`.
- **Endpoints are RPC-style, NOT REST:** `CreateBusinesses`, `UpdateBusinesses`, `DeleteBusinesses`, `GetBusinesses`, `GetBusinessStatusInfo`, `GetAnalytics`, `GetDetailedAnalytics`, `CreateChain`, `UpdateBulkChainInfo`.
  > ⚠️ The `GET /locations/{locationId}` / `POST /locations` / `PUT /locations/{locationId}` endpoints previously listed here **do not exist** and were **fabricated**. They came from `learn.microsoft.com/answers/questions/5672165`, which is a **community + AI-generated answer** (posted 2025-12-19, carrying the disclaimer "AI-generated content may be incorrect") with **no Microsoft employee answer**. **Do not cite that page.**
- **Hard rate limit: 10 requests per 5-second window PER API** (429 beyond). The FAQ's "recommended" figure is 30 req/min; the docs advise **500 ms between calls of each type**.
- **Updates must send the COMPLETE business payload, not a delta.**
- **Read scope is limited to what you created.** FAQ Q6 verbatim: *"Can I fetch business not added by me? Ans. No. You can only fetch business added by you."* (This is the part of the original claim that was correct.)
- Microsoft steers general POI needs to **Azure Maps**. **Bing Maps Local Search API is deprecated for free accounts and retires for enterprise on 2028-06-30.**
- **Corrected verdict:** near-term, ship (a) a **Google→Bing import** prompt, (b) a **bulk CSV generator** matching Bing's spreadsheet format, (c) a NAP-consistency check by scraping the public Bing listing. But do **not** record "there is no API" as the reason. The real blockers are **non-self-serve credential issuance (email + client cert + Microsoft-issued PUID)**, the **10-req/5s** ceiling, **full-payload updates**, and the **read-only-what-you-created** constraint. If we ever qualify as a trusted partner, `CreateBusinesses`/`UpdateBusinesses` is a genuine write path.

---

## 15. Local link building

- Whitespark 2026: link signals ≈ **12%** of local pack, **~20%** of local organic. Citations ≈ 12% / 15%. So links > citations for local organic, roughly equal for the pack.
- Highest-value, automatable-to-a-point tactics: local news/PR, chamber of commerce, local sponsorships (sports teams, events, charities), local supplier/partner pages, .edu community pages, "best of"/listicle placements, unlinked brand mention reclamation, local resource pages.
- **2026 twist:** listicle/"best X in {city}" placements are now the dominant lever for **AI citation** because LLMs lean on them for category questions `[BLOG-ONLY]`. Worth building a dedicated "AI citation surface" report: which third-party listicles rank for the client's money queries, and whether the client appears on them.
- What we can automate safely: **prospecting + personalised outreach drafts + tracking**, never automatic outreach sending without approval, and never link buying.

---

## 16. AI search & AI Overviews — how local discovery changed

**Whitespark AI Overviews study** (https://whitespark.ca/blog/case-study-the-prevalence-of-ai-overviews-in-local-search/, dated **2025-05-12**; 540 manual queries; Houston/Phoenix/Denver × plumbers, PI lawyers, dentists, optometrists, medical clinics, real estate agents):
- AI Overviews appeared on an average **68%** of local business queries (range 57–80%).
- Local pack appeared on **39%** of searches.
- **By intent:**
  - Local intent: AIO **15%**, local pack **93%**
  - Informational intent: AIO **92%**, local pack **6%**
  - Hybrid intent: AIO **97%**, local pack **17%**
- In the plumbers/Houston sample, **60% of AI citations pointed to third-party publishers** (Indeed, Reddit, Quora, Yelp) and only **40%** to individual local businesses.
- ⚠️ **This study is from May 2025 — the AIO landscape shifted materially with AI Mode in 2025–2026. Treat the 68% headline as directionally stale.** A conflicting figure of ~7% AIO prevalence for local searches circulates `[BLOG-ONLY]`, almost certainly measuring pure local-intent queries only — which matches Whitespark's 15% bucket better than the 68% blended average. ⚠️ **unverified — must be confirmed during implementation.**

**Demand-side change (BrightLocal 2026, primary):** AI tools for local recommendations **6% → 45% YoY**; Google's share of review-reading **83% → 71%**; 42% trust AI recs as much as written reviews.

**CTR impact `[BLOG-ONLY, Seer Interactive]`:** organic CTR on AIO queries fell **~61%** (1.76% → 0.61%) (Sept 2025); brands *cited* in AIOs get ~**120%** more organic clicks per impression than uncited brands (2026 analysis). Both are vendor studies, not primary. ⚠️ **unverified — must be confirmed during implementation.**

**Google 2026 GBP-side AI changes `[BLOG-ONLY]`:** Q&A replaced by **"Ask Maps"** (AI answers), native **Chat retired** in favour of WhatsApp/SMS, native **post scheduling** added, **AI-drafted review reply suggestions** in testing, and phone/SMS/WhatsApp added as verification methods. ⚠️ **unverified — must be confirmed during implementation.** *If Google ships native AI reply drafting, our reply feature is commoditised — differentiate on multi-location scale, tone control, SLA enforcement, and cross-platform (Yelp/Facebook/Apple) coverage.*

### What this means for the agent
1. **Two distinct visibility surfaces**: local pack (GBP-driven) and AI answers (content/third-party-citation-driven). Track both.
2. Target **informational + hybrid** local queries with genuinely useful content — that's where AIOs dominate and where a business can actually earn a citation.
3. Because 60% of local AI citations go to third-party publishers, an "**AI citation gap**" report (are you on the listicles/Reddit threads/Yelp lists that AIOs cite?) is more valuable than another rank tracker.
4. Feed the machines structured facts: complete `LocalBusiness` JSON-LD, consistent NAP, `sameAs`, clear service/area pages, FAQ content answering the informational queries.

---

## 17. GBP optimization checklist (turn this into rule objects)

Each item below → `{id, category, autonomy: auto|propose|advise, api_write, detection, fix}`.

**Identity / NAP**
- [ ] `title` matches real-world signage exactly — **advise only, never auto-write** (guidelines ban descriptors, taglines, store codes, URLs, phone numbers, all-caps).
- [ ] `storefrontAddress` precise; no P.O. box / virtual office / unsigned coworking. `propose`
- [ ] `latlng` / map pin correct (factor #10). `propose`
- [ ] `phoneNumbers.primaryPhone` is a local, answerable number; matches site + citations. `auto` (when a canonical NAP is configured)
- [ ] `websiteUri` points at the **location-specific** page for multi-location, with no tracking params that break canonicalisation. `auto`
- [ ] `storeCode` set for every location (needed for reliable multi-location sync). `auto`

**Categories & services**
- [ ] `categories.primaryCategory` optimal (factor #1) — compare against top-3 local pack competitors' primary categories. `propose`
- [ ] `categories.additionalCategories` complete but not padded (factor #8). `propose`
- [ ] `serviceItems` fully populated (structured services + free-form services + prices). `propose`
- [ ] Category-specific `attributes` maxed via `locations.getAttributes` / `attributes.list` (country+category scoped). `auto`

**Hours**
- [ ] `regularHours` complete for all 7 days (factor #5). `auto`
- [ ] `specialHours` for every upcoming public holiday in the location's country. `auto` — high value, nobody does it.
- [ ] `moreHours` for departments/delivery/drive-through where the category supports it. `propose`

**Content**
- [ ] `profile.description` present, ≤750 chars, no URLs, no promotional claims. `propose`
- [ ] Photos: fresh uploads monthly via v4.9 Media API; cover + logo + interior + exterior + team + product. `propose`
- [ ] LocalPosts cadence: ≥1 `STANDARD` post/week; `OFFER` posts with `couponCode`/`redeemOnlineUrl` for promotions; `EVENT` posts with schedule. `auto` (with content review gate)
- [ ] `Place Actions` (booking/order/reserve links) configured where supported. `propose`

**Reviews**
- [ ] 100% reply coverage; median reply latency < 24h. `auto` for 4–5★, `propose` for ≤3★.
- [ ] Review velocity monitored; alert on sudden spikes (Google's ML flags them) and on drops.
- [ ] Review recency: ≥1 new review in the last 30 days (74% of consumers want <3-month reviews).
- [ ] Compliance scanner on any review-request template (no incentives, no gating, no staff-name asks, no "mention X in your review").

**Health**
- [ ] `getVoiceOfMerchantState` = good. Alert immediately on loss.
- [ ] Nightly `locations.getGoogleUpdated` diff → alert/revert on unauthorised Google or user-suggested edits.
- [ ] Duplicate detection via `googleLocations.search` before any create.
- [ ] Verification state monitored; surface `fetchVerificationOptions` when unverified.

**Website side**
- [ ] `LocalBusiness` JSON-LD generated from GBP, most specific subtype, `geo` at 5+ decimals.
- [ ] Location page per physical location; service page per service (local organic factor #1).
- [ ] NAP in HTML text (not an image) in the footer, identical to GBP.
- [ ] Embedded map + driving directions; internal links from services hub and area hub.

---

## 18. Direct implications for our tool

### 18.1 Architecture decisions (opinionated)

1. **Make the GBP module a plugin with graceful degradation, not a core dependency.** Three states: `NO_AUTH` (checklist + advisory only, data scraped from the public profile), `READ_ONLY` (Performance + Business Information reads), `FULL_WRITE` (v4.9 approved). Show the state prominently. Most users will sit in `NO_AUTH` for 1–3 weeks while Google reviews their form.
2. **Ship an "API access wizard"** that: creates/points at a GCP project, extracts the **project number**, pre-fills the **Application for Basic API Access** copy (use case description, website, profile URL), links to `support.google.com/business/contact/api_default`, then **polls quota** to detect approval and auto-advances. Nobody else does this well; it is a genuine wedge.
3. **BYO Google Cloud project by default, even on the hosted tier**, at least at launch. Sharing one 300 QPM quota across thousands of $8/mo tenants is a ticking bomb, and OAuth verification + a shared-quota increase request are both multi-week processes.
4. **Write scheduler:** global token bucket at ≤250 QPM per API (leave headroom) **plus** a per-`locationId` bucket at **≤8 edits/min** (below the hard 10). Spread writes uniformly across 24h — Google explicitly denies quota increases for "highly spiky request patterns". Persist the bucket state so restarts don't burst.
5. **429 handling:** exponential backoff with jitter, per-API circuit breaker, and a visible "throttled" state. Never retry a `PATCH` without idempotency bookkeeping (GBP patches are not idempotent-safe if `updateMask` changes).
6. **Model the legacy split explicitly in code.** Two clients: `gbp_v1` (businessinformation/accountmanagement/verifications/notifications/performance/placeactions) and `gmb_v4` (reviews/localposts/media/foodmenus). Different hosts, different resource-name shapes (`accounts/{a}/locations/{l}` in v4 vs `locations/{l}` in v1). This bites everyone; get the ID translation layer right on day one (`accounts.locations.list` in v1 gives you `locations/{id}`; v4 needs `accounts/{accountId}/locations/{locationId}`).
7. **Pub/Sub optional.** Default to polling `reviews.list` every 30 min; offer Pub/Sub pull-subscription as an advanced option. A self-hosted tool behind a home NAT cannot receive push.
8. **Never auto-write `title`.** Add a compile-time guard. This is the fastest way to get a user's profile suspended.
9. **Autonomy tiers per action.** Suggested defaults: `auto` = hours, special hours, attributes, JSON-LD, internal links, 4–5★ replies; `propose` = categories, description, services, photos, posts, ≤3★ replies; `advise` = business name, address, new location creation, any bulk generation of city pages.
10. **Suspension safety net.** Snapshot every location's full field set before any write; keep 90 days of versions; one-click revert. Surface `getVoiceOfMerchantState` as a top-level health indicator and hard-pause all writes if it degrades.

### 18.2 Features to build (ranked by value/effort)
1. **Holiday/special-hours autopilot** — country holiday calendar × `specialHours` writes. Trivially automatable, high real-world impact (factor #5), essentially zero risk.
2. **Review reply engine with SLA** — Pub/Sub or polling → LLM draft citing review specifics → autonomy-gated send via `reviews.updateReply` (≤4096 bytes). Track median latency vs. the 19%-expect-same-day benchmark.
3. **GBP change watchdog** — nightly `getGoogleUpdated` diff + revert proposals. Genuinely rare in the market.
4. **JSON-LD generator bound to GBP** — schema can never drift from the profile; regenerate on every change; includes `specialOpeningHoursSpecification`.
5. **Category & attribute optimiser** — compare primary/additional categories and attribute fill rate against the top-3 pack competitors for the target query.
6. **NAP audit engine** (self-built directory crawler, ~30–60 sources) with a deep-linked fix worklist. Avoid depending on BrightLocal/Whitespark/Yext APIs — none are self-serve.
7. **AI-citation gap report** — which third-party listicles/Reddit/Yelp lists AI answers cite for the client's money queries, and whether the client is on them. This is where local SEO is actually moving.
8. **Guarded local page generator** — with the §7 uniqueness/facts/cap guardrails and a mandatory human gate above N pages.
9. **Multi-location orchestration** — location groups, store codes, per-profile edit throttling, bulk-verification eligibility checker (10+ storefronts, not SAB, no agency mixing).
10. **Compliance linter for review solicitation** — block incentive language, gating flows, staff-name asks. Ship it as a safety feature and market it as one.

### 18.3 Things to explicitly NOT build
- Review writing/generation of any kind.
- Review gating / sentiment pre-screening funnels.
- Auto-writing the GBP business name with keywords.
- Unbounded city × service page generation.
- A **v1 hard dependency** on Apple or Bing write APIs. Both APIs **do exist and do support writes** (§13, §14) — but Apple's requires a multi-week 4-phase partner qualification with a human-scheduled production launch, and Bing's requires an email-issued client cert + PUID. Build them as **optional, later-phase connectors behind an interface**, not as launch-blocking dependencies. (Do not, however, record "there is no API" as the reason — that was wrong, and it would lead us to design a CSV-only path that Apple is actively deprecating.)
- Places-API-powered competitor review tracking on **our shared billing key** in the base $8/mo tier. The killer is not the per-call price — 600 calls/mo for one customer is free — it is that the **1,000/month free cap is per billing account, not per tenant**, so ~10 subscribers already costs ~$50/mo at $25/1,000. Ship it as **BYO-API-key** instead.

### 18.4 Open engineering risks
- Google shipping native AI review replies + native post scheduling erodes two of our headline features. Differentiate on cross-platform + multi-location + policy compliance + SLA.
- v4.9 has no sunset date but also no modernisation; a surprise deprecation of LocalPosts/Reviews would remove our two most visible write actions. Keep the v4 client isolated behind an interface.
- The 60-day-verified-profile prerequisite means brand-new businesses — arguably our best-fit users — cannot get API access at all for two months.

---

## 19. Sources

All accessed **2026-08-31** unless noted.

**Primary — Google Business Profile APIs**
- Limits/quotas: https://developers.google.com/my-business/content/limits
- Prerequisites & API access request: https://developers.google.com/my-business/content/prereqs
- Basic setup / APIs to enable: https://developers.google.com/my-business/content/basic-setup
- FAQ (page updated 2026-08-28; confirms v4.9 = FoodMenus/Media/Reviews/LocalPosts; "Requests are reviewed within 14 days"): https://developers.google.com/my-business/content/faq
- Sunset dates: https://developers.google.com/my-business/content/sunset-dates
- OAuth implementation & scopes: https://developers.google.com/my-business/content/implement-oauth
- Business Information `accounts.locations`: https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations
- Business Information `locations`: https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations
- Reviews (v4): https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
- LocalPosts (v4): https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
- Performance `DailyMetric` enum: https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric
- Performance `getDailyMetricsTimeSeries`: https://developers.google.com/my-business/reference/performance/rest/v1/locations/getDailyMetricsTimeSeries
- Performance monthly search keywords: https://developers.google.com/my-business/reference/performance/rest/v1/locations.searchkeywords.impressions.monthly/list
- Notifications setup (Pub/Sub): https://developers.google.com/my-business/content/notification-setup
- Verifications: https://developers.google.com/my-business/reference/verifications/rest/v1/locations.verifications
- API access / quota form: https://support.google.com/business/contact/api_default

**Primary — Google policy**
- GBP guidelines (name, categories, SAB 2-hour rule): https://support.google.com/business/answer/3038177
- Getting reviews — incentives/gating/on-premise wording: https://support.google.com/business/answer/2622994
- Maps UGC prohibited & restricted content: https://support.google.com/contributionpolicy/answer/7400114
- Bulk verification (10+ locations, SAB excluded): https://support.google.com/business/answer/4490296
- Search spam policies (doorway abuse, scaled content abuse; updated 2026-08-28): https://developers.google.com/search/docs/essentials/spam-policies
- LocalBusiness structured data (page dated 2025-12-10): https://developers.google.com/search/docs/appearance/structured-data/local-business
- OAuth sensitive scope verification (3–5 business days): https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Unverified apps / 100-user cap: https://support.google.com/cloud/answer/7454865

**Primary — Google Maps Platform**
- Core services pricing list: https://developers.google.com/maps/billing-and-pricing/pricing
- Places API usage & billing / SKUs: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Place Details: https://developers.google.com/maps/documentation/places/web-service/place-details
- **Place Data Fields — authoritative field→SKU mapping (`reviews` = Enterprise+Atmosphere; `rating`/`userRatingCount`/`priceLevel` = Enterprise):** https://developers.google.com/maps/documentation/places/web-service/data-fields
- **Places REST reference, `Place` resource ("A maximum of 5 reviews can be returned"):** https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places
- SKU details: https://developers.google.com/maps/billing-and-pricing/sku-details
- Billing & pricing overview (per-SKU free monthly thresholds): https://developers.google.com/maps/billing-and-pricing/overview
- March 2025 pricing change ($200 credit replaced by per-SKU caps): https://developers.google.com/maps/billing-and-pricing/march-2025
- Places reviews >5 feature request (open since 2015): https://issuetracker.google.com/issues/35825957

**Primary — Apple / Microsoft**
- Apple Newsroom, "Introducing Apple Business" (2026-03-24 announcement, 2026-04-14 launch): https://www.apple.com/newsroom/2026/03/introducing-apple-business-a-new-all-in-one-platform-for-businesses-of-all-sizes/
- Apple Business Connect is now Apple Business: https://support.apple.com/guide/apple-business-connect/apple-business-connect-is-now-apple-business-abcb205640e7/web
- Apple Business API account creation: https://support.apple.com/guide/business/create-an-api-account-axm33189f66a/web
- Apple Business brands API access: https://support.apple.com/guide/business/brands-api-access-abcb4226f877/web
- **Apple Business Partner API (the LISTINGS API) — introduction:** https://business.apple.com/docs/api/v1/introduction
- **Apple Business Partner API — `POST /api/v1/orgs/{orgId}/locations`:** https://business.apple.com/docs/api/v1/location/create
- **Apple Business Partner API — OAuth token request (authorization_code + PKCE):** https://business.apple.com/docs/api/v1/oauth_apps/request_oauth20_token
- Apple Business Partner API — doc sitemap: https://business.apple.com/docs/sitemap.xml
- Apple onboarding guide: https://business.apple.com/docs/onboarding-guide/api · registration https://business.apple.com/docs/onboarding-guide/getting-started/registration · API access https://business.apple.com/docs/onboarding-guide/getting-started/api-access · environments https://business.apple.com/docs/onboarding-guide/getting-started/environments · integration overview https://business.apple.com/docs/onboarding-guide/api-integration/overview · production launch https://business.apple.com/docs/onboarding-guide/production-launch/ · integration params https://business.apple.com/docs/onboarding-guide/core-concepts/integration-params · service accounts https://business.apple.com/docs/onboarding-guide/core-concepts/service-accounts · location eligibility https://business.apple.com/docs/onboarding-guide/core-concepts/location-eligibility · doc revision history https://business.apple.com/docs/onboarding-guide/doc-rev-history
- **Apple School Manager / Apple Business API (device & user management — NOT listings; this is where ES256 JWT client_credentials lives):** https://developer.apple.com/documentation/applebusinessapi · https://developer.apple.com/documentation/apple-school-and-business-manager-api/implementing-oauth-for-the-apple-school-manager-and-apple-business-api
- **Bing Places for Business API for Trusted Partners — PRIMARY spec (PDF v2.07, revised 2024-01-22):** https://cdn.bingplaces.com/tpshared/BingPlaces_API_Latest.pdf
- Microsoft Q&A — Bing Places partner access to API (Microsoft employee reply, 2026-01-16): https://learn.microsoft.com/en-us/answers/questions/5708537/bing-places-for-business-partner-access-to-api
- ⚠️ **DO NOT CITE** — https://learn.microsoft.com/en-us/answers/questions/5672165/bing-places-for-business-overview is a community/AI-generated answer (2025-12-19, "AI-generated content may be incorrect") with no Microsoft employee reply; its `POST /locations` / `PUT /locations/{locationId}` endpoints are fabricated.
- Microsoft Q&A — Bing Places multi-location API: https://learn.microsoft.com/en-us/answers/questions/5708229/bing-places-for-business-api-multi-location

**Primary — vendors**
- Yext Management API policies & conventions (base URLs, api-key header, `v=YYYYMMDD`, 5,000 req/hr): https://docs.yext.com/docs/managementapis/introduction/overview-policies-and-conventions
- Yext Knowledge Graph docs: https://docs.yext.com/docs/managementapis/knowledgegraph
- BrightLocal pricing (Track/Manage/Grow "price on request"; Citation Builder from $2; Managed SEO $1,299/mo; API custom): https://www.brightlocal.com/pricing/
- Whitespark pricing (Local Platform $1/location/mo; Rank Tracker $14–$200; Citation Finder $33–$149; Reputation Builder $79/location; Yext Replacement $399/location one-time): https://whitespark.ca/pricing/

**Research / studies**
- Whitespark 2026 Local Search Ranking Factors (published 2025-11-06; 47 experts, 187 factors): https://whitespark.ca/local-search-ranking-factors/
- Whitespark AI Overviews in local search case study (2025-05-12; 540 queries): https://whitespark.ca/blog/case-study-the-prevalence-of-ai-overviews-in-local-search/
- BrightLocal Local Consumer Review Survey 2026 (n=1,002 US adults): https://www.brightlocal.com/research/local-consumer-review-survey/
- Whitespark, "Review Recency is the Most Underrated Local Ranking Factor in 2025": https://whitespark.ca/blog/the-most-underrated-local-ranking-factor-in-2025/

**Secondary / blog-only (flagged in text)**
- Google Business Profile Community — approved but Account Management quota 0: https://support.google.com/business/thread/415931676
- April 2026 review policy update reporting: https://launchcodex.com/blog/seo-geo-ai/google-business-profile-review-policy-update/ , https://www.mainstreethost.com/blog/google-review-policy-update-april-2026/
- GBP 2026 feature changes (Ask Maps, Chat retirement, post scheduling, AI reply drafts): https://embedsocial.com/blog/google-my-business-features/ , https://www.digitalapplied.com/blog/google-business-profile-guide-every-feature-2026
- Data aggregator status 2026 (Data Axle / TransUnion-Localeze / Foursquare): https://whitelabelseoservice.com/data-aggregators-citations/
- BrightLocal third-party price quotes ($39/$49/$59): https://checkthat.ai/brands/brightlocal/pricing
- Yext pricing estimates ($199–$499/location/yr; no public pricing as of July 2026): https://www.vendr.com/marketplace/yext , https://getspike.ai/blog/yext-pricing/
- Seer Interactive AIO CTR data (via SEJ/summaries): https://www.searchenginejournal.com/ai-overviews-now-answer-most-local-searches-how-to-get-your-business-cited/580757/
- Maps Platform pricing structure changes (per-SKU caps replacing $200 credit): https://www.woosmap.com/blog/google-maps-api-pricing-breakdown

**Explicitly flagged as possibly stale (2024 or earlier)**
- Any "Google My Business API retired April 2022" framing — misleading; v4.9 still hosts Reviews/LocalPosts/Media/FoodMenus in 2026.
- All Apple Business Connect naming and UI documentation predating 2026-04-14.
- Bing Maps Local Search API guidance (deprecated for free tier; enterprise retirement 2028-06-30).
- ~~Places API 5-review limit — not restated in the current official page. `[VERIFY empirically]`~~ **Resolved: CONFIRMED as primary.** The Places REST reference for the `Place` resource states verbatim: *"List of reviews about this place, sorted by relevance. A maximum of 5 reviews can be returned."* No pagination or sort parameter exists. Unchanged for over a decade.
- All "Apple Business Connect has no listings API" / "Bing has no API" framing in pre-2026-09 drafts of this document — both are wrong; see §13, §14.

---

## Fact-check log

Adversarial fact-check run **2026-09-01** against primary sources. Four of six audited claims came back CONFIRMED with no change required; two were PARTIALLY_TRUE and have been corrected **inline** in §6.3, §12, §13, §14, §18.3 and §19.

### ✅ CONFIRMED — no change made

| # | Claim | Where |
|---|---|---|
| 1 | GBP quotas: 300 QPM per API; Business Information `CreateLocation` 300 QPD, `SearchGoogleLocation` 300 QPD, `UpdateLocation` 10,000 QPD, hard cap **10 edits/min per profile ("cannot be increased")**. | §4 |
| 2 | Reviews, LocalPosts, Media and FoodMenus exist **only** in legacy Google My Business API v4.9; **no sunset date** as of 2026-08-28; v4.9 is **not visible in the Cloud Console** until access is approved. | §2.1, §2.2, §3.4 |
| 3 | GBP API access requires manual approval: verified + active 60+ days, website representing the business, "Application for Basic API Access" form with Cloud **project number**, reviewed **within 14 days**; **0 QPM until approved, 300 QPM after**. | §3 |
| 4 | Google policy permits soliciting genuine reviews but bans incentives, bans review gating / selective solicitation, and bans on-premise pressure and requesting specific review content. Source: https://support.google.com/business/answer/2622994 | §6.1 |

### ⚠️ PARTIALLY_TRUE — corrected inline

**Claim 5 — "Places API charges $25/1,000 for the `reviews`/`rating`/`userRatingCount` fields; $200 credit replaced by per-tier caps (Essentials 10,000 / Pro 5,000 / Enterprise 1,000); max 5 reviews per place."**
Verdict: **PARTIALLY_TRUE.** Four of five sub-claims exact; the **field→SKU mapping is wrong** and the **cost conclusion was right for the wrong reason.**

- CONFIRMED: $25.00/1,000 for Place Details Enterprise + Atmosphere in the 0–100K band, then $20.00 / $15.00 / $7.50 / $2.28 by volume. (Volume banding was not in the original claim but is real and is now in the §12 table.)
- CONFIRMED: effective 2025-03-01 the $200 recurring credit was replaced by a free monthly usage threshold per Core Services SKU; caps are Essentials 10,000, Pro 5,000, Enterprise 1,000 **per SKU per month**; still in force.
- CONFIRMED: max 5 reviews per place, verbatim from the Places REST `Place` reference; no pagination or sort parameter; unchanged for 10+ years.
- **REFUTED — the field grouping.** `reviews` → **Enterprise + Atmosphere ($25.00/1K)**; `rating`, `userRatingCount`, `priceLevel` → **Enterprise ($20.00/1K)**. A rating-and-count-only monitor costs **$20/1K** and draws on a **separate** 1,000/month allowance. **Fixed in §6.3 and §12.**
- **OMITTED billing rule now added:** a field mask spanning multiple tiers is billed **once at the highest tier**, not once per SKU.
- **REFUTED — the economics narrative.** "A modest nightly competitor refresh exceeds the subscription price" is **false at small scale**: 20 competitors × 30 nights = 600 calls/mo, **under** the free cap, **$0**. The real blocker is that the free cap is **per billing account, not per end user**: 10 customers × 10 competitors nightly = 3,000 calls → 2,000 billable → **$50/mo**, which breaks a ~$8/mo tier at only 10 subscribers. BYO-API-key remains the right architecture, **but for a different reason**. **§12 cost model and §18.3 rewritten.**
- **ADDED caveat:** Maps Platform terms allow indefinite storage of place IDs but forbid caching most other Place content beyond **30 days** — you cannot legally amortise cost via long-lived caching.

Sources: https://developers.google.com/maps/billing-and-pricing/pricing · https://developers.google.com/maps/documentation/places/web-service/data-fields · https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places · https://developers.google.com/maps/billing-and-pricing/sku-details · https://developers.google.com/maps/billing-and-pricing/overview · https://developers.google.com/maps/billing-and-pricing/march-2025 · https://developers.google.com/maps/documentation/places/web-service/place-details

**Claim 6 — "No self-serve public write API for Bing Places; Apple Business Connect became 'Apple Business' on 2026-04-14 with a partner-gated listings API requiring an Apple representative and ES256-signed JWT `client_credentials` OAuth."**
Verdict: **PARTIALLY_TRUE.** Two sub-claims right, two wrong, and the roadmap conclusion drawn from them — *"only Google is programmatically writable"* — is **REFUTED**. Both Apple and Bing expose real, publicly documented location **write** APIs. They are **approval-gated, not nonexistent.**

- **BING — "not self-serve" CORRECT; "no public API" MISLEADING.** The Bing Places for Business API for Trusted Partners is publicly documented (PDF v2.07, revised 2024-01-22, live at cdn.bingplaces.com). Access via `partneronbp@microsoft.com` (sandbox → production). Auth = **client certificate + Microsoft-issued PUID** in an `Identity` object `{Puid, AuthProvider, EmailId}` — **no OAuth**. Roots `https://api-test.bingplaces.com/trustedPartnerApi/v1/` and `https://api.bingplaces.com/trustedPartnerApi/v1/`. Endpoints are **RPC-style, not REST**: `CreateBusinesses`, `UpdateBusinesses`, `DeleteBusinesses`, `GetBusinesses`, `GetBusinessStatusInfo`, `GetAnalytics`, `GetDetailedAnalytics`, `CreateChain`, `UpdateBulkChainInfo`. Rate limit **10 requests / 5-second window per API** (429 beyond); FAQ "recommends" 30 req/min; docs advise 500 ms between calls of each type. Updates require the **complete payload**, not a delta. FAQ Q6 verbatim: *"Can I fetch business not added by me? Ans. No. You can only fetch business added by you."* — the one part of the original claim that was correct. Programme still alive: Microsoft employee reply 2026-01-16.
- **BING — bad source removed.** The previously cited `learn.microsoft.com/answers/questions/5672165` is a **community + AI-generated answer** (2025-12-19, disclaimer "AI-generated content may be incorrect"), no Microsoft employee answer. Its `POST /locations` and `PUT /locations/{locationId}` endpoints are **fabricated** and do not exist in Bing's spec. Marked DO-NOT-CITE in §19.
- **APPLE — date CONFIRMED.** Announced 2026-03-24, launched *"Starting Tuesday, April 14, in more than 200 countries and regions"*, merging Apple Business Essentials + Apple Business Manager + Apple Business Connect, which "will no longer be available"; Business Connect data migrated automatically.
- **APPLE — auth REFUTED.** ES256-signed JWT `client_credentials` describes a **different product**: the Apple School Manager / Apple Business API (device, user, MDM, Blueprints, audit; `aud=https://account.apple.com/auth/oauth2/v2/token`, `scope=business.api`, assertion `exp` ≤ 180 days, token `expires_in` 3600). That API has **zero location/listings endpoints**. The listings API is the **Apple Business Partner API**, spec **v1.5.1** (updated 2026-06-26; onboarding guide v1.5.0, 2026-06-23; initial release 2026-04-14), **fully public and unauthenticated to read** at business.apple.com/docs. Its auth is a Service Account **`client_id` + `client_secret`** (secret shown once) exchanged for a Bearer token; delegated brand access uses **`grant_type=authorization_code` + PKCE**, `expires_in` 3600 + refresh token, code redeemable within **5 minutes, once only**.
- **APPLE — "requires an Apple representative" MOSTLY WRONG at the front door.** You self-serve: register as third-party partner → Organization → API → "Request API Access" + questionnaire → Apple reviews and emails the AIE endpoint. A human is involved only at **Step 4 production launch** (confirm availability with Apple Business partner support to schedule a launch date, live WebEx/email on launch day, mandatory pause after roughly the first **5,000 records**).
- **APPLE — write endpoints are real REST:** `POST {url}/api/v1/orgs/{orgId}/locations` plus update/delete/undelete/get_by_id/get_by_partner_id, and full CRUD for brand, brand_asset, location_asset, showcase, showcase_creative, caller_id, email_id, agg_rating, apple_override, media, notifications, webhooks, insights. Concurrency via **etag**. Environments: AIE `https://aie.partner-api-business.apple.com` (open-ended limit, test data only), DQE `https://dqe.partner-api-business.apple.com` (**15 QPS**), Production `https://api-business.apple.com` (**15 QPS**). Onboarding is **4 gated steps** (AIE integration typically **2–3 weeks**, then Data Qualification, then Production), requires a **Box account** for Apple's daily pass/fail reports, and requires keeping **4xx errors under one per hour**. Auto-verified location data publishes within **~15 minutes**.
- **RECOMMENDATION REWRITTEN.** §13's "ship a CSV export rather than a live integration" is now scoped and caveated: Apple has **deprecated legacy Box bulk-file ingestion** for partners once their API path goes live, so **a CSV-generator-only design is a dead end for Apple at scale**. §18.3 no longer says "neither is self-serve" as the reason to avoid Apple/Bing; the real cost drivers are (1) Apple's multi-week 4-phase qualification + human-scheduled launch + 15 QPS ceiling, (2) Bing's non-self-serve credential issuance, 10-req/5s limit, full-payload updates and read-only-what-you-created constraint, and (3) both requiring approved **partner/agency** status rather than individual-SMB-tool status. Checklists and deep links remain correct for the long tail of unverified single-location SMBs — but **not** as the ceiling of what is technically possible.

Sources: https://cdn.bingplaces.com/tpshared/BingPlaces_API_Latest.pdf · https://learn.microsoft.com/en-us/answers/questions/5708537/bing-places-for-business-partner-access-to-api · https://learn.microsoft.com/en-us/answers/questions/5672165/bing-places-for-business-overview *(flagged DO-NOT-CITE)* · https://www.apple.com/newsroom/2026/03/introducing-apple-business-a-new-all-in-one-platform-for-businesses-of-all-sizes/ · https://business.apple.com/docs/api/v1/introduction · https://business.apple.com/docs/api/v1/location/create · https://business.apple.com/docs/api/v1/oauth_apps/request_oauth20_token · https://business.apple.com/docs/sitemap.xml · https://business.apple.com/docs/onboarding-guide/api · https://business.apple.com/docs/onboarding-guide/getting-started/registration · https://business.apple.com/docs/onboarding-guide/getting-started/api-access · https://business.apple.com/docs/onboarding-guide/getting-started/environments · https://business.apple.com/docs/onboarding-guide/api-integration/overview · https://business.apple.com/docs/onboarding-guide/production-launch/ · https://business.apple.com/docs/onboarding-guide/core-concepts/integration-params · https://business.apple.com/docs/onboarding-guide/core-concepts/service-accounts · https://business.apple.com/docs/onboarding-guide/core-concepts/location-eligibility · https://business.apple.com/docs/onboarding-guide/doc-rev-history · https://developer.apple.com/documentation/applebusinessapi · https://developer.apple.com/documentation/apple-school-and-business-manager-api/implementing-oauth-for-the-apple-school-manager-and-apple-business-api · https://support.apple.com/guide/business/brands-api-access-abcb4226f877/web · https://support.apple.com/guide/business/create-an-api-account-axm33189f66a/web

### ⚠️ Unverified — must be confirmed during implementation

These were **not** covered by the fact-check pass and remain unconfirmed. Do not treat any of them as settled:

- Testing-mode OAuth **refresh-token ~7-day expiry** (§5A). ⚠️ **unverified — must be confirmed during implementation.**
- LocalPost content limits (summary ~1,500 chars, offer title ~58 chars, image ≥720×720 / ≥10KB) (§2.5). ⚠️ **unverified — must be confirmed during implementation** (validate empirically; store as configurable constants).
- **v4.9 quota** — no published row in the limits table; assumed 300 QPM (§4). ⚠️ **unverified — must be confirmed during implementation** (instrument for 429s).
- April 2026 Google review-policy tightening dates 2026-04-16/17, staff review quotas, employee-name asks (§6.1). ⚠️ **unverified — must be confirmed during implementation** (rules are directionally corroborated by current official page text; dates are not).
- "Google prohibits AI-generated review content" (§6.1). ⚠️ **unverified — must be confirmed during implementation**; phrase not found in the official Maps UGC policy.
- Bing Places October 2025 relaunch details (§14). ⚠️ **unverified — must be confirmed during implementation.**
- Yext (~$199–$499/location/yr) and BrightLocal ($39/$49/$59) pricing (§10.2) — both vendors now show "price on request". ⚠️ **unverified — must be confirmed during implementation** (confirm with sales before quoting to users).
- 2026 data-aggregator syndication reach for Data Axle / TransUnion / Foursquare (§10.1). ⚠️ **unverified — must be confirmed during implementation.**
- Whitespark 68% AIO prevalence figure (§16) — May 2025 study, directionally stale. ⚠️ **unverified — must be confirmed during implementation.**
- Seer Interactive CTR figures (~61% drop; ~120% uplift for cited brands) (§16). ⚠️ **unverified — must be confirmed during implementation.**
- Google 2026 GBP AI feature changes: Ask Maps, Chat retirement, native post scheduling, AI reply drafts (§16). ⚠️ **unverified — must be confirmed during implementation.**
- Form-submission folklore: submit as owner not manager, email domain must match website domain, 7–10 business day turnaround (§3.2). ⚠️ **unverified — must be confirmed during implementation.**
