# 15 — Risk & Compliance: Google Policy, AI-Content Risk, and Safe-by-Default Automation

**Research date / access date for all sources: 2026-09-01**
**Scope:** the policy, legal and reputational envelope for an open-source, self-hostable autonomous SEO agent that *writes to* customer websites (content, schema, internal links, redirects, meta) and *reads from* Google Search Console, GA4, and the open web.

**Staleness convention used throughout:**
- 🟢 = verified against a 2025–2026 primary source
- 🟡 = verified 2025–2026 but only from secondary/marketing blog
- 🔴 = **possibly stale** — only verifiable from 2024 or earlier

---

## 0. Executive summary — the six things that actually constrain the product

1. **Google does not penalize AI content. Google penalizes *scale without value*.** The operative policy is **scaled content abuse**, and its trigger is "many pages… without adding value for users." Our autonomy limits must therefore be expressed as *rate limits on page creation* and *value gates per page*, not as "don't use AI." 🟢
2. **The riskiest thing our tool can do is bulk page generation (programmatic/pSEO).** Every documented 2026 spam-update casualty pattern is scaled programmatic generation, not "a blog post written with AI." 🟡
3. **Rank tracking by scraping Google is a real exposure — but it is *contractual and operational*, not a computer-crime or search-penalty exposure.** Google's spam policy does explicitly and verbatim name "scraping results for rank-checking purposes … conducted **without express permission**" as violating *both* the spam policies and the Google ToS, and Google is actively litigating (`Google v. SerpApi`, N.D. Cal., filed 2025-12-19). 🟢 But three corrections to the naive reading: (a) the ToS hook is not a blanket anti-scraping clause — it runs through **robots.txt** (`https://www.google.com/robots.txt` has `Disallow: /search` under `User-agent: *`), so it is a **breach-of-contract** theory, not a CFAA one (`Van Buren` 2021, `hiQ`); (b) the violating party is **whoever emits the queries — us or our SERP-API vendor — not our end users**, whose sites are not the ones sending automated queries; (c) the documented enforcement for automated traffic is a **reCAPTCHA interstitial and IP blocking** (support.google.com/websearch/answer/86640), **not** a ranking demotion or manual action — there is no documented case of a website being demoted for using a rank tracker. The correct framing is: ToS breach + IP/CAPTCHA blocking + vendor-account termination + a permanent JS-rendering arms race. See §7.
4. **EU AI Act Article 50 applies to us from 2026-08-02 and the free-and-open-source exemption does NOT save us** — Art. 2(12) explicitly carves Article 50 back in. We are a **provider** of a generative AI system; our users are **deployers**. 🟢
5. **The Art. 50(4) "human review / editorial control" exemption is our product's escape hatch** — and it maps exactly onto an approval-gated workflow. Building approval gates is not just SEO-safe, it is the *literal statutory condition* for exemption from labeling public-interest text. 🟢
6. **Self-hosted vs hosted changes our legal role completely.** Self-hosted: user brings their own OAuth client, we are not a processor, we never touch their data. Hosted ($8/mo): we are a GDPR Art. 28 processor, we need a DPA, a sub-processor list, and Google OAuth app verification. Design so that the self-hosted path is the default and the hosted path is a thin, clearly-scoped delta.

---

## 1. Google Search Essentials & the Spam Policies as they stand in 2026

**Primary source:** https://developers.google.com/search/docs/essentials/spam-policies — page footer reads **"Last updated 2026-08-28 UTC"** 🟢

Search Essentials has three pillars: **Technical Requirements**, **Spam Policies**, **Key Best Practices**. Search Essentials are *eligibility rules*, not ranking factors. 🟢

### 1.1 The definition of "spam" was rewritten in 2026 to cover AI surfaces

Current verbatim opening (fetched 2026-09-01):

> "In the context of Google Search, spam refers to techniques used to deceive users or manipulate our Search systems into featuring content prominently, such as attempting to manipulate Search systems into ranking content highly or **attempting to manipulate generative AI responses in Google Search**."

This is a material 2026 change. Secondary reporting dates the rewrite to **2026-05-15** 🟡. The previous language was scoped to "web search results" only. **Implication: "GEO/AEO" tactics aimed at AI Overviews and AI Mode are now inside the spam policy's blast radius.** Anything our tool does to try to get cited in AI Overviews is judged by the same standard as ranking manipulation.

### 1.2 Scaled content abuse — verbatim

Definition (verbatim from the policy page):

> "many pages are generated for the primary purpose of manipulating search rankings and not helping users"

Complete example list (verbatim bullets):

> - "Using generative AI tools or other similar tools to generate many pages without adding value for users"
> - "Scraping feeds, search results, or other content to generate many pages (including through automated transformations like synonymizing, translating, or other obfuscation techniques), where little value is provided to users"
> - "Stitching or combining content from different web pages without adding value"
> - "Creating multiple sites with the intent of hiding the scaled nature of the content"
> - "Creating many pages where the content makes little or no sense to a reader but contains search keywords"

**Critical reading for our build:**
- The policy is **method-agnostic**. AI, human, scraping, automation, or any combination — the test is *scale × (absence of) value*.
- "**without adding value**" is the operative clause, not "generated."
- Bullet 4 ("multiple sites with the intent of hiding the scaled nature") is a direct warning against a feature we might otherwise build: a multi-site fleet manager that generates the same content patterns across many customer domains. **Do not ship cross-site content templating that reuses generated bodies.**
- Bullet 2 catches "translate an English article into 12 languages and publish" — a very tempting automation. **Auto-translation at scale must be approval-gated.**

Policy lineage: scaled content abuse was introduced in the **March 2024 spam update**, replacing the narrower "spammy auto-generated content" policy 🟡 (Google's own March 2024 blog is the primary source; I was unable to fetch its body — the developers.google.com blog URL returns an archive index shell to WebFetch. The "45% reduction in low-quality, unoriginal content" figure associated with that announcement is 🔴 **treat as 2024-vintage and possibly stale**).

### 1.3 Site reputation abuse ("parasite SEO") — verbatim, plus the 2026 EEA carve-out

Definition (verbatim):

> "third-party content is published on a host site mainly because of that host's already-established ranking signals, which it has earned primarily from its first-party content"

Google now publishes **four factors** it uses to identify it (verbatim):

1. **Presentation** — "are the graphic design, formatting, typography and UX features of the content consistent with the host domain?"
2. **Content quality** — "are there quality issues present on the page that don't appear on the main domain and otherwise suggest a departure from the standard of quality of the main domain?"
3. **Authorship** — "is there an explicit acknowledgement of ownership or responsibility for the content? Are there indications that contest the stated authorship of the content?"
4. **Content duplication** — "does the content appear on multiple other sites in identical or near-identical form"

**🟢 EEA carve-out (effective 2026-08-30):** Google's own docs now state that within the European Economic Area, pages "may be categorized as separate from the main domain but **won't be subject to the impact of manual action**." Outside the EEA, manual actions still apply. Secondary reporting attributes this to a European Commission mandate, with an EU Commission communication of 2025-11-13 investigating whether Google's application of the policy breaches the **Digital Markets Act** (focus: whether Google disadvantages news publishers hosting commercial-partner content). 🟡

**Implication for us:** factors 1, 3, and 4 are *directly machine-checkable* and should become automated pre-publish gates (see §12.4). Factor 4 in particular means our tool must never publish near-identical bodies across customers.

### 1.4 Expired domain abuse — verbatim

> "expired domain name is purchased and repurposed primarily to manipulate search rankings by hosting content that provides little to no value to users"

Examples given: affiliate content on former government agency domains; medical products on former nonprofit sites; casino content on former school sites.

**Implication:** if our tool ever ingests a newly-connected domain, we should check domain age / prior-use signals and **refuse aggressive content scaling on a domain whose registration or content history changed within the last ~12 months**. This is a cheap, high-value guardrail.

### 1.5 Cloaking — verbatim

> "presenting different content to users and search engines with the intent to manipulate search rankings and mislead users"

Examples: showing different pages to engines vs users; inserting keywords only for search-engine user agents.

**Implication — this is our highest-severity refusal class.** An autonomous SEO agent has obvious technical means to cloak (UA-sniffing middleware, prerender-only injection, edge worker rules). **The tool must never emit code or config that branches on user-agent/IP for content.** See §12.2 for the exact refusal list. Note the nuance: dynamic rendering / prerendering that serves *equivalent* content is not cloaking; serving *different* content is. Our safety check must be a rendered-DOM equivalence diff, not a "did you prerender" check.

### 1.6 Doorway abuse — verbatim

> "sites or pages are created to rank for specific, similar search queries. They lead users to intermediate pages"

Examples: multiple domain variations targeting specific queries; **region-targeted pages that funnel users to one destination**; pages "closer to results than a clear hierarchy."

**Implication — this is the #1 policy trap for a local-SEO / pSEO feature.** "Generate a page for every {service} × {city}" is the canonical doorway pattern. Our location-page generator must enforce: genuinely distinct content per location, a real destination per page (not a funnel to one contact form), and a hard cap. See §12.5.

### 1.7 Sneaky redirects — verbatim

> "sending a visitor to a different URL than the one they initially requested" [maliciously, to show] "different content to users versus engines"

Examples: one content type to engines, different spam to users; normal desktop pages but spam domains for mobile users.

**Implication:** our tool *will* legitimately write redirects (301s for URL changes, consolidating duplicates). Guardrail: only ever emit **server-side 301/308** redirects; never JS/meta-refresh redirects; never device- or UA-conditional redirects; always log and make reversible.

### 1.8 Hidden text and link abuse — verbatim

> "placing content on a page in a way solely to manipulate search engines and not to be easily viewable by human visitors"

Examples: white text on white background; text behind an image; CSS positioning off-screen; **zero font size**; **zero opacity**; **single-character links** (e.g. a hyphen).

**Implication:** these are all statically detectable. Our pre-publish linter must reject generated markup containing `font-size:0`, `opacity:0`, `display:none` wrapping keyword-bearing text, `text-indent:-9999px`, off-viewport absolute positioning, and links with <2 visible characters of anchor text.

### 1.9 Keyword stuffing — verbatim

> "filling a web page with keywords or numbers in an attempt to manipulate rankings"

Signal described: keywords appearing "in a list or group, unnaturally, or out of context" — including phone number lists and **blocks of city/region names**.

**Implication:** the city-block pattern is exactly what naive local-SEO automation produces. Add a detector: reject any generated block containing >N proper-noun place names in a list, and cap keyword density / exact-match repetition.

### 1.10 Link spam — verbatim

> "creating links to or from a site primarily for the purpose of manipulating search rankings"

Named tactics: buying/selling links for ranking; **excessive link exchanges**; **automated link programs**; requiring links in ToS without a nofollow option; advertorials with optimized anchor text; forum/comment links with optimized anchors; low-quality directory links.

**Implication — hard product boundary.** "Automated link programs" is named verbatim. **The tool must refuse to build any outbound link acquisition automation**: no auto-outreach-and-place, no directory blasting, no comment posting, no exchange marketplace, no PBN management. Internal linking on the customer's own site is fine and is a first-class feature. External link *analysis* (disavow candidate detection, backlink monitoring) is fine. External link *placement* is out of scope forever.

### 1.11 Thin affiliate pages — verbatim

> "publishing content with product affiliate links where the product descriptions and reviews are copied directly from the original merchant without any original content or added value"

Described as "cookie-cutter templates with replicated content across domains or languages."

### 1.12 Machine-generated traffic — verbatim (**this one is about us**)

Full verbatim text of the section, confirmed word-for-word against the policy page:

> "Machine-generated traffic (also called automated traffic) refers to the practice of sending automated queries to Google. This includes **scraping results for rank-checking purposes** or other types of automated access to Google Search conducted **without express permission**. Machine-generated traffic consumes resources and interferes with our ability to best serve users. Such activities violate our spam policies and the Google Terms of Service."

**Read the qualifiers carefully — three things this does NOT say:**
- It is **not** a flat ban on automation. The prohibition is on automated access *without express permission*. This is not a usable loophole (Google grants no such permission for rank tracking) but it is the accurate scope.
- The **ToS breach runs through robots.txt**, not through a general anti-scraping clause. See §7.2.
- The **enforcement regime for this behaviour is not the one described at the bottom of the spam-policies page.** The spam-policies remedy ("sites that violate our policies may rank lower in results or not appear in results at all") is aimed at *sites in the index*. Automated querying is actually governed by the dedicated automated-traffic page, https://support.google.com/websearch/answer/86640, whose documented enforcement is a **reCAPTCHA interstitial** ("Our systems have detected unusual traffic from your computer network") plus advice to network admins to locate and block the source. It describes **no site penalty, no manual action, and no ranking demotion**. 🟢

**This is a load-bearing constraint on any rank-tracking feature — but the risk it creates is blocking and contract breach, not a demotion of our customers' sites.** See §7.

### 1.13 Other policies to encode

- **Misleading functionality:** "intentionally creating sites that trick users into thinking they would be able to access some content or services but in reality can't."
- **Scraped content:** "taking content from other sites, often through automated means, and hosting it with the purpose of manipulating search rankings" — explicitly includes "slight modifications (synonymizing, translating)" and "reproducing feeds."
- **User-generated spam:** "spammy content added to a site by users through a channel intended for user content." Relevant if our tool manages a site that accepts UGC — we should offer a UGC-spam audit, and never auto-approve UGC.

### 1.14 Enforcement model (verbatim)

Google detects violations through "automated systems and, as needed, human review." Consequences: sites may "rank lower in results or not appear in results at all." Human review can trigger **manual actions**.

---

## 2. The "created primarily for search engines rather than people" standard

**Primary source:** https://developers.google.com/search/docs/fundamentals/creating-helpful-content — **"Last updated 2025-12-10 UTC"** 🟢

Core principle (verbatim): Google's systems prioritize "helpful, reliable information that's created to benefit people, and not content that's created to manipulate search engine rankings."

The "avoid creating search-engine-first content" self-assessment questions include (verbatim):

> - "Is the content primarily made to attract visits from search engines?"
> - "**Are you using extensive automation to produce content on many topics?**"
> - "Are you mainly summarizing what others have to say without adding much value?"

And the page states that using AI/automation "to produce content for the primary purpose of manipulating search rankings" violates the spam policies.

The **"Who, How, and Why"** framework, still current as of the 2025-12-10 revision:
- **Who** — clear authorship, bylines, author background.
- **How** — "**Disclose automation/AI use when relevant**; explain your process and methodology."
- **Why** — content created primarily to help people, not for traffic manipulation.

**This is the single most important sentence in the whole dossier for our product design:** Google's *own* helpful-content guidance says to disclose AI/automation use "when relevant." That means an AI-disclosure feature is (a) aligned with Google, (b) aligned with EU AI Act Art. 50, and (c) aligned with E-E-A-T signalling. It is not a tax — it is a convergent requirement across three regimes. Ship it on by default.

---

## 3. Google's official stance on AI-generated content

There are now **two** relevant official documents. The old 2023 blog post is superseded in practice by a formal docs page:

**Primary source (current):** https://developers.google.com/search/docs/fundamentals/using-gen-ai-content — "Google Search's guidance on using generative AI content on your website" — **"Last updated 2025-12-10 UTC"** 🟢

Key verbatim statements:

> "using generative AI tools or other similar tools to generate many pages without adding value for users may violate Google's spam policy on scaled content abuse"

> "Sharing information about how a piece of content was created can help give your readers more context."

> "Focus on accuracy, quality, and relevance, especially when automatically generating the content."

The page cross-references **Search Quality Rater Guidelines §4.6.5 and §4.6.6**.

**E-commerce specifics from that page (concrete and implementable):** 🟢
- AI-generated **images** should carry **IPTC metadata** with `DigitalSourceType` = **`TrainedAlgorithmicMedia`**.
- AI-generated **product data** must be "specified separately and labeled as AI-generated."

**Older stance (2023 blog, still the canonical quote):** "rewarding high-quality content, however it is produced"; SpamBrain "analyze[s] patterns and signals to help us identify spam content, however it is produced." 🔴 **The 2023 blog itself is stale-dated**, but its substance is restated in the 2025-12-10 docs page, so treat the *substance* as current and the *2023 URL* as archival.

**Search Quality Rater Guidelines** (secondary reporting, 🟡):
- **§4.6.5 Scaled Content Abuse** — "Using automated tools (generative AI or otherwise) as a low-effort way to produce many pages that add little-to-no value for website visitors as compared to other pages on the web on the same topic."
- **§4.6.6** — "MC Created with Little to No Effort, Little to No Originality, and Little to No Added Value for Website Visitors." A catch-all for low-quality paraphrase, explicitly naming generative AI.
- Raters are instructed to assign **Lowest** when a site misuses AI to scale low-effort content.

**Does AI-content disclosure matter for ranking?** No official Google statement makes disclosure a ranking factor. Google's position, restated through 2026 by Search Liaison, is that *how* content is produced is not the question; quality is. 🟡 Disclosure is recommended for reader context and E-E-A-T ("How"), and is legally required in specific jurisdictions/contexts (§5). **Do not market disclosure as an SEO benefit — market it as a trust + compliance feature.**

---

## 4. Update timeline: March 2024 → 2026, and what each targeted

**Primary source:** Google Search Status Dashboard ranking-updates history — https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history (the old `developers.google.com/search/updates/ranking` 301s here). Fetched 2026-09-01. 🟢

| Update | Start | Duration | What it targeted |
|---|---|---|---|
| March 2024 core update | 2024-03-05 | **45 days** | Multi-system core change; announced alongside 3 new spam policies. 🔴 associated "45% less low-quality unoriginal content" claim is 2024-vintage |
| March 2024 spam update | 2024-03-05 | 14d 21h | Launched **scaled content abuse**, **site reputation abuse**, **expired domain abuse** |
| June 2024 spam update | 2024-06-20 | 7d 1h | General SpamBrain refresh |
| August 2024 core update | 2024-08-15 | 19d 4h | Partial recovery for small/independent sites hit in March |
| November 2024 core update | 2024-11-11 | 23d 13h | Broad core |
| December 2024 core update | 2024-12-12 | 6d 4h | Broad core (unusually fast) |
| December 2024 spam update | 2024-12-19 | 7d 2h | Spam refresh |
| **March 2025 core update** | 2025-03-13 | 13d 21h | Broad core |
| **June 2025 core update** | 2025-06-30 | 16d 18h | Broad core |
| **August 2025 spam update** | 2025-08-26 | **26d 15h** | Longest spam update on record; widely associated with **algorithmic** site-reputation-abuse enforcement 🟡 |
| **December 2025 core update** | 2025-12-11 | 18d 2h | Broad core |
| **February 2026 Discover update** | 2026-02-05 | 21d 17h | **First-ever Discover-only core update** 🟢 |
| **March 2026 spam update** | 2026-03-24 | 19h 30m | Shortest on record |
| **March 2026 core update** | 2026-03-27 | 12d 4h | Broad core |
| **May 2026 core update** | 2026-05-21 | 11d 21h | Broad core |
| **June 2026 spam update** | 2026-06-24 | 2d 1h | Spam refresh |
| **August 2026 spam update** | 2026-08-18 | 2d 16h | Third spam update of 2026; global, all languages |

**Cadence facts for product design:**
- 2026 core-update cadence tightened to **~6–8 weeks** (Mar 27, May 21). As of 2026-09-01 no confirmed core update since May 2026 — one is plausibly imminent.
- Spam updates in 2026 are **short** (19h–2.7d) but frequent (Mar, Jun, Aug).
- **Design consequence:** our tool must poll the Search Status Dashboard and enter a **"volatility freeze"** during any announced update. Do not attribute traffic changes to our own actions during a rollout window, and do not make aggressive autonomous changes mid-rollout. This is a genuinely differentiating feature.

---

## 5. Documented AI-content penalties and 2025–2026 performance data

### 5.1 Documented cases

**August 2026 spam update case studies (Glenn Gabe / GSQI)** — https://www.gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/ 🟡 (expert practitioner blog, anonymized sites, not primary):
- 4 anonymized cases, **all algorithmic** (spam update), **no manual actions**.
- Case 1: ultra-YMYL niche, lost rankings for **>200,000 queries**.
- Case 2: Amazon affiliate, lost **>14,000 queries** entirely; "programmatically-driven" pages with product info sourced from Amazon → **thin affiliate**.
- Case 3: **1.5M indexed URLs**, scaled content abuse across multiple site sections.
- Case 4: ~**25,000 queries** lost; also **misleading functionality** (redirected users to more aggressive third-party sites).
- **Cases 1, 2, 3 contained AI-generated text at 97%+ detector probability.**
- **Common denominator across all four: scaled programmatic page generation without human curation.**

**HouseFresh** — independent review site, lost ~90% of search traffic after the March 2024 spam/core update, partial recovery in August 2024. 🔴 2024-vintage; still the most-cited named case, but it is a *collateral damage* story (small independent publisher outranked by large-brand parasite content), not an AI-content story.

**Honest assessment:** I could not find a *primary, named, Google-confirmed* case of a site being deindexed specifically for AI content in 2025–2026. Every well-documented case is (a) anonymized, (b) attributed to scale/thinness rather than AI per se, and (c) reported by SEO practitioners rather than Google. **Anyone claiming "Google deindexed site X for AI content" in 2026 is almost certainly extrapolating.**

### 5.2 Quantitative studies

**Originality.ai ongoing study** — https://originality.ai/ai-content-in-google-search-results 🟡 (vendor study; the vendor sells an AI detector, so there is an obvious incentive bias — but methodology is disclosed):
- Method: top-20 results for **500 informational keywords**, sampled every 2 months since Jan 2019, Originality.ai detector, **confidence threshold ≥ 0.5**.
- Mar 2024: **7.43%** → Jul 2024: **12.59%** → Jan 2025: **19.10%** → Jul 2025: **19.56%** (all-time peak) → **Sep 2025: 17.31%**.
- **No 2026 data points published as of 2026-09-01** — 🔴 flag the headline number as ~1 year stale.

**Ahrefs, ~900,000 pages, published April 2025** 🟡 (reported secondhand; I did not fetch the Ahrefs primary):
- **74.2% of newly created web pages contain some AI-generated content.**
- **Near-zero correlation (r = 0.011)** between AI content and ranking penalties across ~600,000 pages.

**Other circulating 2026 figures — treat with heavy skepticism** 🟡:
- "83–86.5% of top-ranking pages contain some AI content" (two mutually contradictory framings of the same detector runs).
- "Human-written content holds #1 80% of the time vs 9% for purely AI pages"; "unedited AI content is <0.5% of top results."
- "50–100 human-edited AI articles → +30–80% traffic; 1,000+ unedited → −40–90% traffic." **This is a marketing-blog claim with no disclosed methodology. Do not put it in product marketing.**

### 5.3 AI detectors are not a reliable gate

🟡/🟢 mixed, but the direction is unambiguous:
- Best detectors achieve **≤1% false-positive rate on academic English**; open-source baselines flagged **30–69%** of human text.
- Aggregate detector accuracy ~**88%** → ~12% of AI text passes undetected.
- **Documented bias:** one widely-cited study found detectors misclassified **>61% of essays by non-native English speakers** as AI-generated.
- Peer-reviewed evaluation (Int. J. Educational Integrity, 2026): inconsistent accuracy, high false positives, documented bias.
- 2023 study of 14 detectors: none exceeded 80% on plain AI text; most below 50% on machine-paraphrased text. 🔴

**Product implication:** **never** use a third-party AI detector as a publish gate, and never surface a detector score as a quality verdict. Build *deterministic* value gates instead (originality vs. corpus, citation presence, unique data, entity coverage) — see §12.3.

---

## 6. Manual actions: detection and recovery

**Primary:** Search Console Help — https://support.google.com/webmasters/answer/9044175 🟢 (page exists; I was unable to fully enumerate its table via WebFetch — the `developers.google.com/search/docs/monitor-debug/security/manual-actions` path returns 404, so the Search Console Help page is the canonical location).

**Manual action types relevant to us** (composite; the ones our tool can plausibly cause or detect):
- Site abused with spam / **Pure spam** (auto-generated content, cloaking, scraping)
- **Scaled content abuse**
- **Site reputation abuse** (note: **not enforced via manual action in the EEA as of 2026-08-30** 🟢)
- **Expired domain abuse**
- Unnatural links **to** your site / Unnatural links **from** your site
- Thin content with little or no added value
- Cloaking and/or sneaky redirects
- Hidden text and/or keyword stuffing
- User-generated spam
- Structured data issues / Spammy structured markup
- Sneaky mobile redirects
- Cloaked images
- AMP content mismatch
- News and Discover policy violations
- Hacked site / Malware

**Detection — the API path (this is a real product feature we should build):**
- Search Console API resource: `urlTestingTools` / `sites` — but the **manual actions report has no public API** as of 2026-09-01. Confirm before building; my searches found no `manualActions` endpoint. **This is an open question (§14).**
- Fallback detection signals our tool CAN compute: sudden Search Console `search_analytics` impression collapse (>X% w/w) not explained by seasonality; index coverage drop via URL Inspection API; disappearance of `site:` presence.
- **Practical answer: prompt the user to check Security & Manual Actions in GSC, and send an alert when our anomaly detector fires.**

**Recovery process:** fix every listed issue across every affected page → **Request Review** in the Manual Actions report → write a reconsideration request that (1) explains the exact quality issue, (2) describes the fixes, (3) documents the outcome. Reviews are human and can take days to weeks; there is no SLA. 🟢

**Product feature: "Reconsideration Request Builder."** Because our tool has a complete, timestamped, append-only audit log of every change it made, it can auto-generate the evidence section of a reconsideration request — a genuinely strong differentiator, and a direct argument for building the audit log properly from day one.

---

## 7. SERP scraping: legality, and what this means for rank tracking

### 7.1 The three independent legal layers

| Layer | Status for scraping public SERPs | Confidence |
|---|---|---|
| **US CFAA** | Scraping publicly-accessible data is generally **not** "access without authorization." `hiQ v. LinkedIn` (9th Cir. 2022), reaffirmed post-`Van Buren v. United States` (S. Ct. 2021) | 🔴 2021–22 caselaw, still good law but old |
| **Contract / ToS** | **Still fully live exposure.** hiQ *lost* on breach of LinkedIn's User Agreement (Nov 2022) and the case ended in consent judgment. The 9th Cir. expressly limited its holding to the CFAA, leaving trespass to chattels, copyright, misappropriation, unjust enrichment, conversion, and breach of contract intact | 🔴 2022 |
| **EU sui generis database right** (Dir. 96/9/EC) | Protects "substantial investment" databases against unauthorised extraction/re-use. Still applicable to SERPs, though the **EU Data Act (Art. 43)** narrows it for product/service-generated data | 🟡 |

### 7.2 Google's own position is unambiguous — but it is a *contractual* prohibition, and the enforcement is blocking, not penalties

Two independent Google documents prohibit this:

1. **Spam policies → Machine-generated traffic** (🟢, page updated 2026-08-28): "sending automated queries to Google. This includes **scraping results for rank-checking purposes** or other types of automated access to Google Search conducted **without express permission**." Stated to violate "our spam policies and the Google Terms of Service." Note the qualifier: the ban is on *unpermissioned* automated access, not on automation as such.
2. **Google Terms of Service** — https://policies.google.com/terms, **effective 2026-07-30** 🟢. ⚠️ **The "Don't abuse our services" section contains NO blanket anti-scraping clause.** What it actually prohibits is "using automated means to access content from any of our services **in violation of the machine-readable instructions on our web pages** (for example, robots.txt files that disallow crawling, training, or other activities)" and "spamming, hacking, or bypassing our systems or protective measures." (Also newly prohibits "using AI-generated content from our services to develop machine learning models or related AI technology" — relevant if we ever thought about training on AI Overview text.)
   **The operative hook is therefore robots.txt.** https://www.google.com/robots.txt does contain, under `User-agent: *`, the line `Disallow: /search`, with only `Allow: /search/about` and `Allow: /search/howsearchworks` as exceptions. 🟢 So the ToS breach is real — but it is a **breach-of-contract theory, not a computer-crime one**. Scraping public, non-authenticated pages is not a CFAA violation under `Van Buren v. United States` (2021) and `hiQ v. LinkedIn`. Describing this as "legal liability" overstates it; **contractual exposure and account/service termination is the accurate framing.**

**Who is actually in violation?** The violating actor is **whoever emits the queries — i.e. us, or our proxy / SERP-API vendor — not the end user whose keywords are being checked.** Any claim that bundling a scraper "puts our users in violation of Google's terms" misassigns the party. What it does put at risk is *our* (or our vendor's) access, and our credibility.

**Two different enforcement regimes, commonly conflated:**

| Document | Governs | Documented remedy |
|---|---|---|
| Spam policies page | *Sites in the index* | "sites that violate our policies may rank lower in results or not appear in results at all" |
| Automated traffic page (support.google.com/websearch/answer/86640) | *The behaviour of sending automated queries* | **reCAPTCHA interstitial** + advice to network admins to find and block the source. **No site penalty, no manual action, no demotion documented.** |

**There is no documented case of a website being demoted for using a rank tracker.** The realistic risk is IP/CAPTCHA blocking, vendor-account termination, and recurring engineering cost. 🟢
3. **Google APIs ToS** — https://developers.google.com/terms, effective 2021-11-09 🔴: §5(e) "Scrape, build databases, or otherwise create permanent copies of such content, or keep cached copies longer than permitted by the cache header"; §2(c) "You will only access (or attempt to access) an API by the means described in the documentation of that API."

### 7.3 Google is actively litigating this — `Google LLC v. SerpApi`

🟡 (well-reported across Search Engine Land, SEJ, Search Engine Roundtable, and Google's own blog post "Why we're taking legal action against SerpApi's unlawful scraping"):
- **Filed 2025-12-19**, N.D. Cal.
- Claims: **DMCA §1201 anti-circumvention** — SerpApi allegedly circumvented **"SearchGuard,"** Google's anti-scraping system launched January 2025, to scrape and resell copyrighted Search results at scale. Google called the model "parasitic."
- **Outcome so far (~July 2026):** the court **granted SerpApi's motion to dismiss Google's two DMCA claims**, holding Google had not alleged facts showing SearchGuard was implemented and functioned "with the authority of the copyright owner." Google was given leave to amend.
- SerpApi's defense: public search data should be accessible; First Amendment framing.

**Two structural facts we must internalize:**
1. Google shipped **"SearchGuard"** in **January 2025** — a dedicated anti-scraping system. Scraping Google is now an active arms race with a well-resourced adversary. Any rank tracker we build by scraping will break, repeatedly, and burn engineering time. **Concretely: around 2025-01-15 Google began requiring JavaScript rendering to return search results at all, which broke IP-rotation-based scrapers and caused multi-day data blackouts across Semrush, SE Ranking and other major tools.** 🟢 (Search Engine Land, Search Engine Journal.) This is the strongest practical argument against a bundled scraper, entirely independent of policy: it raises per-query cost from a plain HTTP request to a **headless browser**, and it makes breakage **recurring rather than one-time**.
2. Even if SerpApi ultimately wins on DMCA, **Google can still terminate service, block IPs, and sue on contract**. A win on one theory is not a safe harbour.

### 7.4 How commercial rank trackers actually do it

🟡: Semrush Position Tracking "sends automated search queries to Google from the target location you specify." Ahrefs, SE Ranking, DataForSEO, SerpApi all either scrape or buy scraped SERPs. **Every commercial ranking dataset is collected by someone sending automated queries to Google.** They absorb the ToS risk as a cost of doing business, at a scale and legal budget we will not have.

### 7.4a The other first-party Google option — and why it is dead 🟢

⚠️ **Correction to a common claim: Search Console API was *not* historically the only sanctioned first-party option.** The **Custom Search JSON API** (https://developers.google.com/custom-search/v1/overview) is a sanctioned Google API returning web results: **100 queries/day free, $5 per 1,000 additional queries, capped at 10,000 queries/day.**

**But do not architect around it. Two independent reasons:**
1. **It is closed.** Its documentation now carries the notice **"The Custom Search JSON API is closed to new customers,"** with existing customers required to **transition by 2027-01-01**; Google directs new users to **Vertex AI Search** (up to 50 domains) instead. **As of 2026-09-01 we cannot onboard to it at all.**
2. **It was never a valid rank-tracking source anyway.** It queries a **Programmable Search Engine**, not google.com — no localization, no personalization, no SERP features. Its result order is *not* the ranking we would be reporting.

**Net:** "GSC is the only sanctioned ranking source" is directionally right for 2026, but **not because the spam policy forecloses alternatives** — it is because Google's only general-purpose search API is being retired.

### 7.5 Our position (opinionated)

- **The Search Console API is, as of 2026-09-01, the only usable official, first-party, sanctioned source of ranking data** (see §7.4a for why the Custom Search JSON API does not count) — **and it only covers sites the user has verified.** For our product this is nearly ideal: our users *are* the site owner. GSC gives us `position`, `clicks`, `impressions`, `ctr` by query/page/country/device.
- ⚠️ **But GSC does not cover the same feature surface as a rank tracker, and the gap must be sized honestly — it genuinely reshapes the feature set:** 🟢
  - **Own verified properties only → competitor rank comparison cannot be built on any sanctioned first-party Google source today. That feature is dead, not degraded.**
  - `position` is an **impression-weighted *average* position**, not a discrete daily rank. It is **not directly comparable to rank-tracker output** and must never be labelled "your rank" in the UI.
  - Caps: **50,000 rows/day/site/search type**. The API defaults to **1,000 rows per request**, raisable to **25,000** via `rowLimit` and paginated to the 50,000 ceiling via `startRow`.
  - **Long-tail and low-volume queries are dropped/anonymized**, and data lags roughly **2–3 days**.
  - Quotas are **not** the constraint: Search Analytics is 1,200 QPM per site and per user, 30,000,000 QPD and 40,000 QPM per project (§8.1). URL Inspection at 2,000 QPD/site is the tight one.
- **Ship first-party GSC data as the default and only bundled rank source.** Market it accurately: "we use your own verified Search Console data, not scraped SERPs — no ToS breach, no CAPTCHA blackouts, no proxy bills." (Do **not** market it as removing a *penalty* risk to the customer's site — that risk was never documented; see §7.2.)
- **Never ship a SERP scraper in the open-source repo**, and never ship one in the hosted tier. The reason is not that it puts *users* in violation — it doesn't; the violating party is whoever emits the queries. The reasons are: (a) it is an explicit, documented breach of Google's ToS **by us**, via robots.txt; (b) the JS-rendering arms race (§7.3) makes it a permanent maintenance sink with recurring multi-day outages; (c) shipping it under our name creates contributory exposure for a benefit we can't keep working.
- **Do offer a BYO-key adapter** (`DataForSEO`, `SerpApi`, `SE Ranking`, `Semrush`, `Ahrefs`) so users who already accept that risk can plug in their own credentials. The risk allocation is then explicitly theirs, disclosed in the UI. This is the same posture n8n takes toward risky nodes.
- **Competitor SERP analysis** (which we will want for content gap analysis) should likewise be BYO-key only.

---

## 8. Google Search Console & GA4: automated access, quotas, storage

### 8.1 Search Console API quotas 🟢

**Primary:** https://developers.google.com/webmaster-tools/limits (fetched 2026-09-01)

| Resource | Per-site | Per-user | Per-project |
|---|---|---|---|
| **Search Analytics** | **1,200 QPM** | **1,200 QPM** | **40,000 QPM**, **30,000,000 QPD** |
| **URL Inspection (Index Inspection)** | **2,000 QPD**, **600 QPM** | — | **15,000 QPM**, **10,000,000 QPD** |
| **All other resources** (Sitemaps, Sites) | — | **20 QPS**, **200 QPM** | **100,000,000 QPD** |

Search Analytics load quota is additionally throttled in **10-minute** (short-term) and **1-day** (long-term) chunks.

**Design consequence:** the **URL Inspection per-site 2,000 QPD** is the binding constraint for large sites. A 100k-URL site takes 50 days to fully inspect. Our crawler must prioritise inspection (new/changed/high-value URLs only) rather than sweeping. Search Analytics at 1,200 QPM per site is effectively unlimited for our use.

### 8.2 Indexing API — a policy trap 🟢

**Primary:** https://developers.google.com/search/apis/indexing-api/v3/quickstart

> "The Indexing API can only be used to crawl pages with either `JobPosting` or `BroadcastEvent` embedded in a `VideoObject`."

> "Any attempts to abuse the Indexing API, including the use of multiple accounts or other means to exceed usage quotas, may result in access being revoked."

Default onboarding quota mentioned: **200**.

**This is a real trap.** Many "AI SEO tools" ping the Indexing API for ordinary blog posts. It is explicitly out of policy and risks revocation of the Cloud project's access — which, in a hosted multi-tenant setup, would break **every** customer at once. **Refuse to submit non-JobPosting/non-BroadcastEvent URLs to the Indexing API.** Use sitemap ping / `sitemaps.submit` and normal crawling instead.

### 8.3 Google APIs Terms of Service 🔴 (effective 2021-11-09 — old but still the operative document)

- §2(c): "You will only access (or attempt to access) an API by the means described in the documentation of that API."
- §5(e): "Scrape, build databases, or otherwise create permanent copies of such content, or keep cached copies longer than permitted by the cache header."
- §5(c): "You may not expose that content to other users or to third parties without explicit opt-in consent from that user."
- §3(d): must comply with the **Google API Services User Data Policy**.
- §4(a) prohibits sublicensing the APIs, reverse engineering, and removing Google's notices.

**Note the tension:** §5(e) restricts "permanent copies." Our whole value proposition is a longitudinal time-series of the customer's *own* GSC data (GSC itself only retains 16 months). The defensible reading: GSC Search Analytics data about the user's own property, retrieved with that user's OAuth consent, stored on that user's behalf, in a system they control, for a user-facing feature, is squarely within the Limited Use rules. **But get this reviewed by counsel before the hosted tier launches, and make retention configurable + user-deletable.**

### 8.4 Google API Services User Data Policy 🔴 (last updated 2024-02-15 — flag as possibly stale)

**Primary:** https://developers.google.com/terms/api-services-user-data-policy

- **Limited Use:** "Limit your use of data to providing or improving user-facing features that are prominent in the requesting application's user interface."
- **Prohibited:** "Transferring or selling user data to third parties like advertising platforms, data brokers, or any information resellers"; "using user data for serving ads, including retargeting, personalized or interest-based advertising."
- **Human access restriction:** "Don't allow humans to read the data, unless: You first obtained the user's affirmative agreement to view specific messages, files, or other data" — or for security/legal purposes.
- **Security assessment:** "Applications accessing the product specified scopes must demonstrate that they adhere to certain security practices. Depending on the API being accessed and number of user grants or users, applications must pass an annual security assessment."

**Two hard implications for the hosted tier:**
1. **"Don't allow humans to read the data"** — our support team cannot casually look at a customer's GSC data to debug. We need explicit, logged, per-incident consent flows. Build a "grant support access for 24h" toggle.
2. **Sending the user's GSC/GA4 data to a third-party LLM API** is a *transfer*. It is defensible as "providing a user-facing feature," but it must be disclosed, and the LLM provider must be listed as a sub-processor. **Do not let LLM providers train on it** — use zero-retention / no-training API tiers.

### 8.5 OAuth scopes and verification 🟡/🔴

Relevant scopes:
- `https://www.googleapis.com/auth/webmasters` (read/write) and `.../webmasters.readonly`
- `https://www.googleapis.com/auth/analytics.readonly` — "See and download your Google Analytics data"
- `https://www.googleapis.com/auth/analytics.edit` — "Edit Google Analytics management entities"

**Classification:** I could **not** confirm from Google's own scope table whether webmasters/analytics scopes are classed **Sensitive** or **Restricted** — the scopes page I fetched did not render the sensitivity column. 🔴 **This is an open question (§14) and it is expensive to get wrong.** Best current understanding:
- These are almost certainly **Sensitive** (require Google app verification, typically ~10 days once a complete submission is received), **not Restricted** (which is the Gmail/Drive tier that triggers a mandatory annual **CASA** third-party security assessment, commonly **$3,000+** for Tier 2). 🟡
- **Design so this doesn't matter:** in the **self-hosted** path, the user creates their **own** Google Cloud project and OAuth client. Their app is in "Testing"/internal mode with themselves as the only user → **no verification required at all**. This is the single biggest architectural argument for self-hosted-first, and it should be the documented default.
- The **hosted tier** needs one verified OAuth client. Budget: verification submission, a privacy policy URL, a demo video, a verified domain, and possibly an annual security assessment. **Plan 4–8 weeks of lead time before hosted launch.**

### 8.6 GA4 specifics 🟡

- GA4 user/event-level **data retention** is configurable to **2 months or 14 months** only. Our tool should warn users whose retention is set to 2 months that longitudinal analysis will be crippled, and offer to store the aggregates ourselves.
- "Data restrictions are enforced in both the Analytics interface and analogous Analytics API calls" — i.e., our API access inherits whatever the connected user's role permits. Ask for the minimum: `analytics.readonly`.
- Lawful GA4 use in the EU in 2025–26 requires consent before non-essential measurement, **Consent Mode v2**, a **DPA with Google**, and retention/transfer controls. That is the *customer's* obligation, not ours — but we should surface a warning if we detect GA4 without Consent Mode on an EU-serving site.
- GSC Performance data retention is **16 months** 🔴 (widely documented, long-standing; I could not re-verify from the Search Console Help page in this pass).

---

## 9. EU AI Act — Article 50 and us

### 9.1 The dates 🟢

| Date | Event |
|---|---|
| **2026-07-20** | European Commission adopted **final Guidelines on Transparency Obligations** |
| **2026-08-02** | **Article 50 becomes applicable** |
| **2026-12-02** | Grace period ends for the Art. 50(2) machine-readable marking obligation, for genAI systems already on the market before 2026-08-02 (per the **AI Omnibus** provisional agreement of May 2026) 🟡 |

A **Code of Practice on AI-generated content** covering marking and labelling is in development. 🟢

**We are already past 2026-08-02.** These obligations are live *today*. If we ship into the EU, we ship compliant on day one — the grace period only helps systems already on the market before August 2.

### 9.2 The open-source exemption does NOT apply 🟢

**Art. 2(12)** exempts AI systems released under free and open-source licences — **unless** the system falls under Art. 5 (prohibited), is high-risk under Art. 6, **or falls under Art. 50**. Transparency obligations extend to providers and deployers of open-source AI systems.

**Being open source buys us nothing here. Plan accordingly.**

### 9.3 The obligations, verbatim

**Primary:** https://artificialintelligenceact.eu/article/50/ and the Commission FAQ https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act 🟢

**Art. 50(1) — AI interaction disclosure (provider duty):** users must be informed they are interacting with an AI system, unless "obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect."

**Art. 50(2) — machine-readable marking (provider duty):** providers must ensure outputs "are marked in a machine-readable format and detectable as artificially generated or manipulated."

> **Assistive-function exception (verbatim):** the obligation "shall not apply to the extent the AI systems perform an assistive function for standard editing or do not substantially alter the input data … provided by the deployer."

**Art. 50(4) — public-interest text (deployer duty):** deployers "shall disclose that the text has been artificially generated or manipulated" when published to inform the public on matters of public interest.

> **Human-review exception (verbatim):** does not apply "where the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility."

**Art. 50(5) — timing:** information must be provided "in a clear and distinguishable manner **at the latest at the time of the first interaction or exposure**."

### 9.4 Definitions that decide our role 🟢

- **Provider:** natural/legal persons that "develop AI systems, or have them developed, and place them on the EU market or put them into service under their own name or trademark." → **That is us**, for both the OSS distribution and the hosted tier.
- **Deployer:** natural/legal persons "using AI systems under their authority, excluding use for personal, non-professional activities." → **That is our user** (the site owner). A hobbyist blogger running it personally and non-professionally may fall outside; a SaaS company or agency does not.

**Public-interest topics enumerated by the Commission FAQ:** politics, public administration, justice, fundamental rights, public security, **health**, environment, consumer safety, and economic/scientific/cultural developments. 🟢

**Note how wide this is.** A SaaS blog post about a security vulnerability, a local business page about a health service, an e-commerce page about product safety, a fintech blog about consumer credit — all plausibly "public interest." **Do not assume our users' content is out of scope.**

**"Human review" has a definition and a floor** 🟢: "deliberate examination of the substance of the content by one or more natural persons possessing relevant knowledge." Editorial control requires "a responsible editorial entity … with the authority to approve, alter or reject the substance." **"Superficial checks (spell-checking, grammar) don't qualify as human review."**

**This is the design spec for our approval UI.** A one-click "Approve" button on a diff the user never opened is arguably *not* deliberate examination of the substance. Our approval flow should:
- require the reviewer to have actually scrolled/opened the content,
- capture reviewer identity and timestamp,
- record an explicit editorial-responsibility attestation per site (who is the responsible person),
- and default to *not* auto-approving.

### 9.5 Penalties 🟢

Up to **€15,000,000 or 3% of total worldwide turnover** for the preceding financial year, whichever applicable, with proportionality for SMEs. (Art. 99 tier for transparency-obligation breaches.)

### 9.6 What we must actually build for Art. 50

| Obligation | Who | Our implementation |
|---|---|---|
| 50(1) AI interaction disclosure | Provider (us) | Persistent "You are working with an AI agent" banner in the dashboard; first-run modal; obvious agent framing in every autonomous-action notification |
| 50(2) machine-readable marking | Provider (us) | Emit **C2PA-style provenance** where possible; for text: embed a machine-readable marker in published HTML (see §12.6). For images: **IPTC `DigitalSourceType: TrainedAlgorithmicMedia`** — which also satisfies Google's e-commerce image guidance 🟢 |
| 50(2) assistive-function exception | — | Do **not** rely on this for full-article generation. It plausibly covers our meta-description rewrites, alt-text generation, and schema generation — but not net-new articles |
| 50(4) public-interest text | Deployer (user) | Per-site config: "Is this site publishing public-interest content?" + a topic classifier that flags health/finance/legal/politics/safety. If flagged AND autonomy is full-auto → **force approval gate** (which then triggers the human-review exemption) |
| 50(5) timing | Both | Disclosure rendered at first exposure — i.e., **in the published page**, not in a footer legal page |

---

## 10. US and state law

🟡 throughout (law-firm client alerts, not statutes fetched directly).

| Law | Status as of 2026-09-01 | Applies to us? |
|---|---|---|
| **California AI Transparency Act (SB 942, amended by AB 853)** | AB 853 signed **2025-10-13**, pushed operative date to **2026-08-02** to align with the EU AI Act. Applies to genAI providers with **>1,000,000 monthly users/visitors**. Requires: a **free public AI-detection tool**, an **optional visible disclosure** users can add, and an **embedded latent/machine-readable provenance watermark** for images/video/audio | **Not yet** — we are far under 1M MAU. **But the >1M threshold is a real ceiling.** Build the provenance plumbing now so crossing it is not a rewrite. Note: the widely-cited "Jan 1, 2026" date is **wrong** |
| **Texas TRAIGA** (Responsible AI Governance Act) | Effective **2026-01-01**. Transparency around AI systems; biometric limits; healthcare-provider AI disclosure | Marginal — matters if a healthcare customer uses us |
| **Colorado AI Act** | Original SB 24-205 **repealed and reenacted** by **SB 26-189** (signed May 2026); effective date pushed from 2026-06-30 to **2027-01-01**; narrowed to an automated-decision-making regime | Likely out of scope (content generation isn't consequential decision-making), but re-check before 2027 |
| **Utah AI Policy Act (SB 149)** | Effective **2024-05-01** 🔴. Generative AI disclosure **on request**, and in regulated/high-risk occupations | Low. Our "on request" answer is our disclosure feature |
| **FTC** | General deception/endorsement authority; the "Operation AI Comply" posture | **Real.** Marketing claims like "guaranteed rankings" or "Google-approved" are the exposure, not the tech |

**Practical US takeaway:** none of these currently bind us directly at our size. **The binding US risks are ordinary ones**: false advertising in our marketing, defamation in generated content (§13), and copyright (§11).

---

## 11. Copyright, plagiarism, and originality

### 11.1 Output copyrightability 🟢

**US Copyright Office, "Copyright and Artificial Intelligence, Part 2: Copyrightability," released 2025-01-29** — https://www.copyright.gov/ai/

- Human authorship is a bedrock requirement; **works entirely generated by AI are not copyrightable.**
- "The mere selection of prompts, even if those prompts are detailed and are the product of some human effort, does not itself yield a copyrightable work."
- Where a work mixes human and AI content, **only the human contributions are protectable**.
- Using AI as a tool to *assist* human creativity (ideation, editing) does not destroy copyrightability of the whole.
- **No new legislation recommended.**
- Part 3 (training data / fair use) pre-publication version released **2025-05-09**.

**Implication we must disclose to users:** *content our tool generates unedited is likely in the public domain in the US.* Competitors can copy it verbatim. **This is a genuine commercial reason to require human editing**, and it's a much better argument to our users than "Google might penalize you." Surface it: "Pages you approve without edits may not be copyrightable — anyone can legally republish them."

### 11.2 Plagiarism / infringement risk in outputs

- LLMs can regurgitate training text. **Mitigation: run every generated body through an n-gram overlap check against (a) the top-N SERP competitor pages we already fetched for the brief, and (b) the customer's own existing corpus.** Reject on any exact match ≥ ~8–10 consecutive words outside of explicitly-marked quotations.
- **Do not** rely on commercial plagiarism APIs as a gate (cost, latency, false positives); use them as an optional BYO-key enhancement.
- **Images:** never generate or insert images that imitate an identifiable artist's style or contain third-party trademarks/logos. Prefer the customer's own asset library; require explicit opt-in for genAI images; always write IPTC `TrainedAlgorithmicMedia`.
- **Quoting/citing:** our content pipeline should prefer *linked citation* over *paraphrase-in-bulk*, which simultaneously reduces the "scraped content" and "little to no originality" spam exposure.

---

## 12. Safe-by-default product policy — the actual spec

This is the deliverable. Everything above feeds this.

### 12.1 Autonomy tiers (the core UX + safety primitive)

Four levels, per **action class**, not per site. Default = **L1** for everything except the always-safe class.

| Level | Meaning |
|---|---|
| **L0 — Observe** | Detect and report only. No writes. |
| **L1 — Propose** | Generate a full diff/preview; requires explicit human approval per item. **DEFAULT.** |
| **L2 — Auto with undo** | Executes automatically; every change reversible with one click; digest notification; 24h "cooling window" before it counts as accepted. |
| **L3 — Full auto** | Executes automatically, no per-item notification. **Must be explicitly enabled per action class, with a typed confirmation.** Never available for the refused classes. |

**Rule: the maximum autonomy level available is capped by action class, and can never be raised above the cap by the user.**

### 12.2 REFUSE — the tool never does these, at any autonomy level, with no override flag

Hard-coded refusals. Ship them as a policy module that cannot be disabled via config:

1. **Cloaking** — any content that branches on user-agent, IP, referrer, or bot-detection. Includes "SEO-only" prerender content that differs from the user-visible DOM.
2. **Sneaky redirects** — device-conditional, UA-conditional, JS-only, or meta-refresh redirects. (Server-side 301/308 for genuine URL changes is allowed, at L1.)
3. **Hidden text/links** — any emitted markup with `font-size:0`, `opacity:0`, `visibility:hidden`, `text-indent:-9999px`, off-viewport absolute positioning, or color matching background, wrapping keyword content. Any link with <2 characters of visible anchor text.
4. **Link schemes** — no automated outreach-and-placement, no directory submission, no comment/forum posting, no link exchange, no PBN management, no anchor-text-optimized guest post placement, no paid link brokering. **External link *acquisition* is permanently out of scope.**
5. **Expired-domain repurposing** — refuse to run a content-scaling campaign on a domain whose ownership/registration changed within 12 months, or whose historical topical footprint is unrelated to current content, without an explicit human override + a warning modal.
6. **Site reputation abuse** — refuse to publish content on a third-party host domain the user does not own; refuse to publish near-identical bodies across multiple customer sites (content fingerprint check against our own corpus, in the hosted tier).
7. **SERP scraping** — no bundled scraper. Ever. BYO-key third-party SERP APIs only, with an explicit risk disclosure. **The disclosure must be accurate:** the risk to the user is CAPTCHA/IP blocking, data blackouts and *vendor* account termination — **not** a ranking penalty on their site (no such enforcement is documented; §7.2). The ToS breach attaches to whoever emits the queries.
8. **Indexing API misuse** — refuse to submit any URL to the Indexing API whose page does not contain `JobPosting` or `BroadcastEvent`-in-`VideoObject`.
9. **Fake entities** — no invented author personas, no fabricated credentials, no fake reviews, no fake testimonials, no fake business addresses, no fake E-E-A-T signals (e.g. `author` schema for a person who does not exist).
10. **Structured data that misrepresents the page** — no `Review`/`AggregateRating` schema where no reviews exist; no `FAQPage` for content not visibly on the page; no `Product` price/availability that contradicts the page. (Google's "Spammy structured markup" manual action.)
11. **Scraping competitor content into published pages** — competitor pages may inform a brief; their prose must never reach the customer's site.
12. **robots.txt / noindex circumvention** — never crawl a source that disallows us; never fetch behind a paywall or login the user doesn't own.
13. **Deleting content without a backup** — no destructive CMS operation without a stored, restorable snapshot.

### 12.3 The value gate — what every generated page must pass before it can be published at ANY level

This is our answer to "scaled content abuse." Deterministic, auditable, per-page:

```
PublishGate(page) := ALL of:
  1. ORIGINALITY   : max n-gram overlap (n=8) vs {SERP top-10 corpus, customer corpus,
                     our global published corpus} < threshold; no verbatim block >40 words
  2. SUBSTANCE     : contains >= 1 of {original data, first-party example, customer-specific
                     detail, cited primary source with outbound link}
  3. NON-DUPLICATION: cosine similarity vs every other page on this site < 0.85;
                     title/H1/meta uniqueness enforced site-wide
  4. INTENT MATCH  : page answers the target query; not a stub, not a funnel-only page
  5. LENGTH SANITY : not padded (repetition ratio), not thin (below-corpus-median for the SERP)
  6. NO SPAM MARKERS: keyword density < cap; no >N place-name list; no hidden-text CSS;
                     no exact-match anchor over-optimization internally
  7. FACT CHECK    : every factual claim with a number/date/name is either (a) sourced to a
                     fetched citation, or (b) flagged for human verification
  8. YMYL CHECK    : if topic classifier says health/finance/legal/safety -> force L1 + reviewer
                     attestation + disclaimer block (see §13)
  9. ACCESSIBILITY : see §12.7
 10. PROVENANCE    : disclosure + machine-readable marking applied (see §12.6)
```

Any failure → the item drops to **L1** and surfaces the specific failed check to the user. **Never silently degrade quality to meet a quota.**

### 12.4 Rate limits — the real defense against scaled content abuse

Scaled content abuse is defined by *scale*. So the primary guardrail is a **rate limiter**, not a classifier.

Defaults (all user-adjustable **upward only with a warning + typed confirmation**, and hard-capped):

| Metric | Default | Hard cap (cannot exceed) |
|---|---|---|
| New pages published / day / site | **2** | 20 |
| New pages published / week / site | **8** | 100 |
| New pages as % of existing indexed pages / month | **5%** | 25% |
| Pages published before first quality feedback loop | **10**, then require the user to review performance | — |
| Programmatic/templated pages (city/service matrices) | **0 — L1 only, never automatable** | — |
| Auto-translations published / week | **0 — L1 only** | — |
| Existing pages edited / day / site | **10** | 100 |
| Internal links added / page | **5** | 15 |
| Redirects created / day | **5** | 50 |

**Ramp-up rule:** a newly connected site starts in **L0 (observe) for 7 days** while we baseline it. No writes in week one. This is both a safety measure and a great product story ("we learn your site before we touch it").

**Cross-site anti-pattern detection (hosted tier):** if the same customer connects >3 sites and requests similar content, warn about spam bullet 4 ("creating multiple sites with the intent of hiding the scaled nature of the content").

### 12.5 Action classes → maximum autonomy

| Action class | Max level | Default | Rationale |
|---|---|---|---|
| Crawl, audit, report, alert | L3 | L3 | Read-only |
| **robots.txt / sitemap.xml edits** | L1 | L1 | Catastrophic blast radius (`Disallow: /`) |
| **noindex / canonical changes** | L1 | L1 | Catastrophic blast radius |
| Title tags & meta descriptions | L2 | L1 | Reversible, low risk, high value; strong candidate for the first L2 users enable |
| Image `alt` text | L2 | **L2** | Accessibility win, near-zero risk (see §12.7) |
| Structured data / schema markup | L2 | L1 | Must pass the "reflects visible page content" check |
| Internal links (existing pages) | L2 | L1 | Reversible; cap per page |
| Heading structure fixes | L2 | L1 | |
| Broken link fixes | L2 | L2 | Clear win |
| Image compression / format / lazy-load | L2 | L2 | |
| **Editing existing published content** | L2 | L1 | Real editorial risk |
| **Publishing NEW content** | **L2 (never L3)** | **L1** | Scaled content abuse exposure |
| **YMYL new content** | **L1 only** | L1 | §13 |
| **Programmatic / templated page sets** | **L1 only** | L1 | Doorway exposure |
| **Redirects (301/308)** | L2 | L1 | |
| **Deleting/unpublishing pages** | **L1 only** | L1 | Irreversible-ish |
| **Anything touching a third-party domain** | **Refused** | — | §12.2 |
| **External link acquisition** | **Refused** | — | §12.2 |

### 12.6 Disclosure and marking — exact implementation

Three layers, all on by default, each independently disableable **only** with an explicit acknowledgment of the legal consequence.

**Layer 1 — Human-visible disclosure (satisfies AI Act 50(4)/50(5), Google "How", reader trust).**
Configurable per site; default template inserted at the top or bottom of generated pages:

> *"Parts of this article were drafted with AI assistance and reviewed by {reviewer_name} on {date}."*

Or, if unreviewed (L2/L3 auto-publish):

> *"This article was generated by an automated system. It has not been reviewed by a human editor."*

**That second string is deliberately unattractive.** It creates the right incentive: users who don't want it will turn on approval gates, which is exactly the behavior both Google and Art. 50 want. **This is the most important single design decision in this document.**

**Layer 2 — Machine-readable marking (satisfies AI Act 50(2)).**

In the published HTML `<head>`:
```html
<meta name="ai-generated" content="true">
<meta name="ai-generated-tool" content="{tool_name}/{version}">
<meta name="ai-generated-date" content="2026-09-01T12:00:00Z">
<meta name="ai-human-reviewed" content="true|false">
```

In JSON-LD, on the `Article`/`WebPage` node — the cleanest standards-aligned option:
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "creativeWorkStatus": "Published",
  "author": { "@type": "Person", "name": "…" },
  "contributor": {
    "@type": "SoftwareApplication",
    "name": "{tool_name}",
    "applicationCategory": "AI writing assistant"
  },
  "publisherImprint": null,
  "isBasedOn": [ "https://cited-source-1", "https://cited-source-2" ]
}
```
⚠️ **Caution:** schema.org has no stable, Google-recognized "AI generated" property as of 2026-09-01. Do **not** invent schema properties that could be read as spammy structured markup. Prefer `<meta>` tags + C2PA for the machine-readable layer, and keep JSON-LD strictly to properties Google documents. **(Open question §14.)**

For **images**: write **IPTC Photo Metadata** `DigitalSourceType` = `TrainedAlgorithmicMedia` (also composited: `CompositeWithTrainedAlgorithmicMedia`). This is explicitly what Google's gen-AI content docs ask for. 🟢 Where the pipeline supports it, also attach a **C2PA Content Credentials** manifest.

**Layer 3 — Internal provenance record (our audit log).**
Every published artifact stores: model + version, prompt hash, all source URLs fetched, all gate results, reviewer identity + timestamp + attestation, the exact diff, and a restore point. **Append-only. Exportable.** This is what powers the reconsideration-request builder (§6) and any AI Act documentation request.

### 12.7 Accessibility overlap — free compliance wins

The alt-text feature sits at the intersection of SEO and accessibility law, which makes it unusually valuable.

- **European Accessibility Act (EAA):** enforceable since **2025-06-28**. New products/services must comply from June 2025; existing services have until **June 2030**. References **EN 301 549**, which incorporates **WCAG 2.1 Level AA**. **EN 301 549 v4.1.1**, expected to publish in 2026 and to incorporate **WCAG 2.2**, will likely become the operative standard once cited in the Official Journal. 🟡
- **ADA Title II:** WCAG 2.1 AA mandatory for larger US public entities from **April 2026**. 🟡
- Missing alt text reportedly appears on ~95% of top homepages. 🟡

**Implementation rules for our alt-text generator:**
- **Decorative images get `alt=""`, not a description.** Getting this wrong is the most common automated-alt-text failure and actively harms screen-reader users.
- Describe *function* for images inside links/buttons, *content* for informative images.
- **Never keyword-stuff alt text** — that is simultaneously a WCAG failure and Google's "hidden text / keyword stuffing" policy.
- Length target ~125 characters; no "image of"/"picture of" prefix.
- Flag complex images (charts, infographics) for human long-description rather than guessing.
- Ship an **accessibility report** alongside the SEO report: alt coverage, heading order, contrast, link-text quality, `lang` attribute, form labels. Cheap to compute from the crawl we're already doing, and it makes the tool defensible to enterprise buyers.

**Do not ship an "accessibility overlay."** Overlays are widely reported to lose in court and have a terrible reputation in the accessibility community. Fix source markup or propose fixes; never inject a remediation widget. 🟡

---

## 13. YMYL, defamation, and the topics we treat as radioactive

### 13.1 Why this is the highest-severity content risk

- LLMs hallucinate. Reported figures: unsupported medical claims ~50% of the time; hallucinated court holdings ~75% of the time. 🟡 (secondary, methodology undisclosed — but directionally uncontroversial.)
- August 2026 spam update **Case 1 was an "ultra-YMYL" site that lost >200,000 queries.** 🟡
- Quality raters assign **Lowest** to low-effort scaled content, and YMYL pages are held to the strictest E-E-A-T standard.
- **AI Act Art. 50(4) explicitly names health, consumer safety, fundamental rights, justice, and public security** as public-interest categories triggering the deployer disclosure duty. YMYL and AI-Act public interest overlap almost exactly.

### 13.2 Defamation exposure 🟡

- **Section 230** shields operators for content "provided by another information content provider." Whether it covers a platform's *own* generative output is **unsettled**. Our safest posture: we are a **tool**; the *user* is the publisher and holds editorial responsibility. Make that explicit in the ToS, in the approval attestation, and in the UI.
- **May 2025, Georgia state court:** summary judgment for OpenAI on a claim based on indisputably false ChatGPT output — reasoning that the user knew ChatGPT might fabricate, so a reasonable reader in that user's position would not understand it as a statement of fact. 🟡 **Note: that reasoning does not transfer to *published* content on a business website**, where readers absolutely do treat statements as fact. **Do not rely on it.**
- Publishing an unverified AI statement about a private individual could be negligence.

### 13.3 Concrete rules

**Topic classifier runs on every content brief.** Categories → treatment:

| Category | Treatment |
|---|---|
| **Medical/health, drugs, dosages, diagnoses, mental health** | L1 only. Mandatory reviewer attestation. Mandatory disclaimer block. **Refuse** to generate dosages, diagnoses, or treatment recommendations. |
| **Finance, investing, tax, insurance, credit, crypto** | L1 only. Reviewer attestation. Disclaimer. **Refuse** specific investment advice, projected returns, or tax positions. |
| **Legal advice** | L1 only. **Refuse** jurisdiction-specific legal advice; produce general/educational framing only. |
| **Named real people** | **Refuse** to generate evaluative or factual claims about identifiable private individuals. For public figures, require a fetched citation for every factual claim; refuse anything characterizing conduct negatively. |
| **Named competitor companies** | Comparative claims only when sourced to a fetched, cited page. Refuse unsourced superlatives ("X is a scam," "X is worse"). |
| **Elections/politics, public safety, civic info** | L1 only + Art. 50(4) disclosure regardless of review status. |
| **Adult, gambling, weapons, pharma** | Refuse to generate; offer audit/technical SEO only. |
| **Claims about efficacy/results ("guaranteed," "cures," "100%")** | Blocked by a phrase-level linter regardless of topic. |

**Citation requirement in YMYL mode:** every factual claim must carry an inline citation to a fetched source; uncited claims are stripped or flagged, not published.

**Our own marketing:** no "guaranteed rankings," no "Google-approved," no "penalty-proof." That is FTC exposure and it is the easiest kind to avoid.

---

## 14. Open questions / things to verify before shipping

1. **Is there a Search Console API endpoint for manual actions?** I found none. If not, our penalty detection must be anomaly-based + user-prompted. **Verify against the current Search Console API reference.**
2. **Exact sensitivity classification of `.../auth/webmasters` and `.../auth/analytics.readonly`** (Sensitive vs Restricted). Determines whether the hosted tier needs an annual **CASA** assessment (~$3,000+/yr) or just standard verification (~10 days). Google's scope table did not render this in my fetch. **This is a budget-and-timeline decision — verify first.**
3. **Is storing >16 months of a user's GSC data compatible with Google APIs ToS §5(e)?** Needs counsel. The Limited Use reading is defensible but not certain.
4. **Is there a Google-recognized schema.org or `<meta>` convention for AI-generated text as of 2026?** I found the IPTC image convention (confirmed) but nothing authoritative for text. Watch the **EU Code of Practice on AI-generated content** (in development, per the Commission).
5. **Does the AI Omnibus grace period to 2026-12-02 apply to a system first placed on the market *after* 2026-08-02?** Almost certainly not (it's for systems already on the market). Confirm before relying on it.
6. **Does the EEA site-reputation-abuse non-enforcement extend to algorithmic demotion, or only manual actions?** Google's wording says manual actions only, and that "pages may be categorized as separate from the main domain" regardless. Assume algorithmic effects persist.
7. **`Google v. SerpApi` outcome on the amended complaint** — could shift the whole third-party SERP API market. Monitor.
8. **March 2024 core update blog primary text** — I could not fetch the body (developers.google.com blog URLs return an archive shell to WebFetch). The "45% reduction" figure remains unverified from primary source and is 2024-vintage.
9. **GSC Performance 16-month retention** — not re-verified from Google's own Help page in this pass; long-standing but confirm.
10. **Do we need an EU representative (AI Act Art. 22 / GDPR Art. 27)** if we sell the hosted tier into the EU from outside it? Likely yes for GDPR. Verify.

---

## 15. Direct implications for our tool — the opinionated build list

**Architecture**
1. **Self-hosted is the default and the legal centre of gravity.** User's own Google Cloud project + own OAuth client + own LLM API key + own database. In that configuration we are not a GDPR processor, we need no Google app verification, and we hold none of their data. Document this loudly — it is a genuine competitive advantage over every hosted SEO SaaS.
2. **The hosted $8/mo tier is a legally distinct product.** It needs: a verified OAuth client, a DPA, a published sub-processor list (LLM provider, hosting, error tracking), EU data residency option, an Art. 27 EU representative, and support-access consent gating. Budget 4–8 weeks of compliance lead time.
3. **Ship the policy engine as a separate, testable module** (`policy/`), with the refusal list in §12.2 as code, unit-tested, and **not overridable by config**. This is the thing that makes the project trustworthy enough for people to give it write access to their site.
4. **Append-only audit log is a P0, not a nice-to-have.** It powers undo, reconsideration requests, AI Act documentation, and user trust simultaneously.
5. **Every write must be reversible.** Snapshot before mutate. One-click restore. If a CMS adapter can't support restore, that adapter is read-only.

**Positioning**
6. **Lead with "safe-by-default," not "fully autonomous."** The market is full of "AI writes 100 articles/day" tools and they are exactly what the August 2026 spam update killed. Our differentiator is the opposite: **rate-limited, gated, auditable, reversible.**
7. **The rate limits ARE the product.** "2 pages/day by default, with a 7-day observation period before we touch anything" is a *feature*, and it is defensible against every policy in §1.
8. **Ship the volatility freeze.** Poll the Google Search Status Dashboard; pause aggressive autonomous actions during announced core/spam rollouts; annotate all charts with update windows. Nobody else does this well.
9. **Ship the rank tracker on Search Console API data only, for own-site positions.** Two corrections to how this was previously framed:
   - **Market it on reliability and honesty, not on penalty avoidance.** "No CAPTCHA blackouts, no proxy bills, no ToS breach" is true. "Protects your site from a Google penalty" is **not** — no such enforcement against tracked sites is documented (§7.2). Making a claim we can't support is itself FTC exposure (§10).
   - **Label the metric honestly:** GSC gives an *impression-weighted average position* with a 2–3 day lag and anonymized long-tail queries. Do not display it as "your rank."
   - **Competitor rank comparison must be cut from the sanctioned-data roadmap entirely** — it cannot be built on any first-party Google source today, only on BYO-key third-party SERP APIs where the user has accepted the risk explicitly.
   - **Do not architect around the Custom Search JSON API.** It is closed to new signups and dies **2027-01-01**, and it queries a Programmable Search Engine rather than google.com, so its ordering is not a ranking anyway (§7.4a).
10. **Ship the accessibility report.** It's nearly free given the crawl we already run, it's a legal requirement in the EU since 2025-06-28, and it makes the alt-text feature dual-purpose.

**Content pipeline**
11. **The PublishGate (§12.3) runs before every publish at every autonomy level.** No exceptions, no bypass flag.
12. **Never use an AI detector as a gate** — the false-positive and non-native-speaker bias data makes it indefensible.
13. **Default disclosure strings must make unreviewed auto-publishing look unattractive** (§12.6, Layer 1). This aligns user incentive with Google policy and AI Act Art. 50(4) simultaneously.
14. **Programmatic/templated page generation is L1-only, forever.** It is the single highest-risk feature and the single most requested one. Offer it, gate it, cap it, and show a doorway-policy warning in the UI.
15. **Tell users their unedited AI content is probably not copyrightable** (USCO, 2025-01-29). It is the most persuasive argument for human editing we have, and it's a primary-source fact.

**Governance**
16. **Per-site "editorial responsibility" record.** Name a responsible natural person. Capture it at setup. This is the Art. 50(4) exemption condition and the defamation-liability allocation, in one field.
17. **YMYL topic classifier gates autonomy automatically** — the user should not have to remember to turn it on.
18. **Warn on newly-acquired domains** (expired domain abuse) and on multi-site content similarity (scaled content abuse bullet 4).
19. **Refuse the Indexing API for non-JobPosting/BroadcastEvent URLs.** In a hosted multi-tenant setup, one abusive customer could get the shared Cloud project's access revoked and break every customer.
20. **Publish our own policy document.** An open-source tool with write access to people's websites needs a public, versioned "what this agent will and will not do" page. It is both a trust artifact and, under AI Act Art. 50(1), part of how we disclose that users are working with an AI system.

---

## Sources

All URLs accessed **2026-09-01**.

**Google — primary**
- Spam policies (footer: "Last updated 2026-08-28 UTC") — https://developers.google.com/search/docs/essentials/spam-policies
- Creating helpful, reliable, people-first content ("Last updated 2025-12-10 UTC") — https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Guidance on using generative AI content on your website ("Last updated 2025-12-10 UTC") — https://developers.google.com/search/docs/fundamentals/using-gen-ai-content
- Google Search Status Dashboard, ranking updates history — https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history
- Search Console API usage limits — https://developers.google.com/webmaster-tools/limits
- Indexing API quickstart (JobPosting/BroadcastEvent restriction) — https://developers.google.com/search/apis/indexing-api/v3/quickstart
- Google APIs Terms of Service (effective 2021-11-09) — https://developers.google.com/terms
- Google API Services User Data Policy (last updated 2024-02-15) — https://developers.google.com/terms/api-services-user-data-policy
- Google Terms of Service (effective 2026-07-30) — https://policies.google.com/terms
- Google robots.txt (`Disallow: /search` under `User-agent: *`) — https://www.google.com/robots.txt
- "Unusual traffic from your computer network" — the operative automated-traffic enforcement page — https://support.google.com/websearch/answer/86640
- Custom Search JSON API overview (closed to new customers; transition by 2027-01-01) — https://developers.google.com/custom-search/v1/overview
- OAuth 2.0 scopes — https://developers.google.com/identity/protocols/oauth2/scopes
- Manual actions report (Search Console Help) — https://support.google.com/webmasters/answer/9044175
- Google Ads: Updates to AI labeling requirements (July 2026) — https://support.google.com/adspolicy/answer/17257106
- Updating our site reputation abuse policy (Nov 2024) — https://developers.google.com/search/blog/2024/11/site-reputation-abuse
- March 2024 core update & new spam policies (body not retrievable via WebFetch) — https://developers.google.com/search/blog/2024/03/core-update-spam-policies
- Google Search's guidance about AI-generated content (Feb 2023, archival) — https://developers.google.com/search/blog/2023/02/google-search-and-ai-content
- Google blog: legal action against SerpApi — https://blog.google/innovation-and-ai/technology/safety-security/serpapi-lawsuit/

**EU AI Act — primary / semi-primary**
- Article 50 full text — https://artificialintelligenceact.eu/article/50/
- Article 2 (Scope), incl. 2(12) FOSS carve-out — https://artificialintelligenceact.eu/article/2/
- European Commission FAQ: Transparency obligations under Article 50 — https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act
- European Commission: Guidelines on transparency obligations for providers and deployers — https://digital-strategy.ec.europa.eu/en/policies/guidelines-transparency-ai-generated-content
- EC AI Act Service Desk, Article 50 — https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50
- Bird & Bird, reading the Commission's draft Art. 50 guidelines (2026) — https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-reading-the-commissions-draft-article-50-guidelines
- Linux Foundation Europe: What Open Source Developers Need to Know about the EU AI Act — https://linuxfoundation.eu/newsroom/ai-act-explainer

**US law**
- US Copyright Office, Copyright and Artificial Intelligence (Part 2 released 2025-01-29; Part 3 pre-pub 2025-05-09) — https://www.copyright.gov/ai/
- Skadden on the USCO copyrightability report (Feb 2025) — https://www.skadden.com/insights/publications/2025/02/copyright-office-publishes-report
- California SB 942 (AI Transparency Act) — https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240SB942
- Troutman: California AI Transparency Act amendments (AB 853, signed 2025-10-13) — https://www.troutmanprivacy.com/2025/10/california-ai-transparency-act-amendments-signed-into-law/
- Hunton: Colorado AI Act amended, effective date delayed to 2027-01-01 — https://www.hunton.com/privacy-and-cybersecurity-law-blog/colorado-ai-act-amended-and-effective-date-delayed
- Miller Nash: From Colorado to Texas — how states are rewriting AI laws — https://www.millernash.com/industry-news/from-colorado-to-texas-how-states-are-rewriting-ai-laws

**Scraping law**
- White & Case: hiQ preliminary injunction affirmed under Van Buren — https://www.whitecase.com/insight-our-thinking/web-scraping-website-terms-and-cfaa-hiqs-preliminary-injunction-affirmed-again
- Farella Braun + Martel: what recent rulings say about scraping legality — https://www.fbm.com/publications/what-recent-rulings-in-hiq-v-linkedin-and-other-cases-say-about-the-legality-of-data-scraping/
- Search Engine Land: Google loses key DMCA claims against SerpApi — https://searchengineland.com/google-loses-key-dmca-claims-against-serpapi-in-scraping-lawsuit-483185
- Search Engine Land: Google sues SerpApi (Dec 2025) — https://searchengineland.com/google-sues-serpapi-466541
- Search Engine Land: Google's JS requirement disrupts SEO tools (Jan 2025) — https://searchengineland.com/google-disrupts-seo-tools-450872
- Search Engine Journal: Google causes global SEO tool outages — https://www.searchenginejournal.com/google-causes-global-seo-tool-outages/537604/
- Directive 96/9/EC (database right) — https://eur-lex.europa.eu/LexUriServ/LexUriServ.do?uri=CELEX%3A31996L0009%3Aen%3AHTML
- EU Data Act Art. 43 (databases containing certain data) — https://www.eu-data-act.com/Data_Act_Article_43.html

**AI content data & cases (secondary — flagged in text)**
- Originality.ai, AI content in Google search results (latest data point Sep 2025) — https://originality.ai/ai-content-in-google-search-results
- GSQI / Glenn Gabe, August 2026 Google spam update case studies — https://www.gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/
- Search Engine Roundtable: Google won't enforce site reputation policy in the EEA — https://www.seroundtable.com/google-site-reputation-policy-eea-41968.html
- Search Engine Land: Google quality raters now assess whether content is AI-generated — https://searchengineland.com/google-quality-raters-content-ai-generated-454161
- PPC Land: Google updates quality rater guidelines with AI content evaluation criteria — https://ppc.land/google-updates-quality-rater-guidelines-with-ai-content-evaluation-criteria/
- PPC Land: Google's third spam update of 2026 — https://ppc.land/googles-third-spam-update-of-2026-hits-every-language-and-region/
- Springer, Int. J. Educational Integrity (2026): Evaluating the accuracy and reliability of AI content detectors — https://link.springer.com/article/10.1007/s40979-026-00213-1
- arXiv: Why AI-Generated Text Detection Fails — https://arxiv.org/pdf/2603.23146

**Accessibility**
- W3C WCAG 2 Overview — https://www.w3.org/WAI/standards-guidelines/wcag/
- Level Access: European Accessibility Act compliance overview — https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/

**GDPR**
- GDPR Art. 28 processor obligations (secondary explainers) — https://sprinto.com/gdpr/article-28/ ; https://transcend.io/glossary/article-28-gdpr

**YMYL / defamation**
- Quinn Emanuel: Defamation in the AI Era — https://www.quinnemanuel.com/the-firm/publications/client-alert-defamation-in-the-ai-era/
- Bloomberg Law: Courts navigating AI defamation — https://news.bloomberglaw.com/legal-exchange-insights-and-commentary/courts-navigating-ai-defamation-opens-legal-risks-for-companies
- Search Engine Journal: Can you use AI to write for YMYL sites? — https://www.searchenginejournal.com/can-you-use-ai-to-write-for-ymyl/558945/

---

## Fact-check log

External fact-check pass completed **2026-09-01**. Six claims were submitted; **five returned CONFIRMED with no corrections required** and one returned **PARTIALLY_TRUE**. All corrections below have been applied **inline** at every point in this document where the claim appeared — this log is a record, not the fix. **No claim came back UNVERIFIABLE**; items still marked 🔴 or listed in §14 remain open questions to confirm during implementation, not fact-check failures.

### Claim 1 — SERP scraping / rank-tracking policy — **PARTIALLY_TRUE** ⚠️ corrected

> *Claim as originally written:* Google's spam policy on "machine-generated traffic" explicitly names "scraping results for rank-checking purposes" as a violation of both the spam policies and the Google ToS — meaning any bundled SERP-scraping rank tracker puts **our users** in violation of Google's terms. Corollary: the **only** sanctioned ranking data source is the Search Console API.

**Upheld:** the quote is exact and confirmed verbatim; rank-checking is named explicitly; both the spam policies and the ToS are invoked.

| # | Correction | Applied at |
|---|---|---|
| 1 | The policy says "conducted **without express permission**" — it is not a flat ban on automation. Not a usable loophole, but the prohibition is on *unpermissioned* access. | §0.3, §1.12, §7.2 |
| 2 | The current Google ToS "Don't abuse our services" section has **no blanket anti-scraping clause**. The operative hook is **robots.txt** (`Disallow: /search` under `User-agent: *`). So the breach is real but is **breach of contract, not computer crime** — scraping public non-authenticated pages is not a CFAA violation (`Van Buren` 2021, `hiQ v. LinkedIn`). "Legal liability" was overstated. | §0.3, §7.2 |
| 3 | **Wrong party and wrong enforcement model.** The violator is whoever emits the queries — us or our SERP-API vendor — **not the end user**. And the claim conflated two regimes: the spam-policies remedy (ranking demotion) targets *sites in the index*, whereas automated querying is governed by support.google.com/websearch/answer/86640, whose documented enforcement is a **reCAPTCHA interstitial** and admin-side blocking — no penalty, no manual action, no demotion. **No documented case exists of a site being demoted for using a rank tracker.** | §0.3, §1.12, §7.2, §12.2 (7), §15.9 |
| 4 | **The corollary was false as stated but is becoming true for a different reason.** The **Custom Search JSON API** was also sanctioned (100 queries/day free, $5/1,000 after, 10,000/day cap) — but it is now **closed to new customers**, with existing customers transitioned out by **2027-01-01** and new users pointed to Vertex AI Search. It was also never a valid rank source (queries a Programmable Search Engine, not google.com; no localization/personalization/SERP features). | new §7.4a, §7.5, §15.9 |
| 5 | The "reshapes the feature set" concern is **correct and was under-sized**. GSC covers own verified properties only (**kills competitor rank comparison outright**); `position` is an **impression-weighted average**, not a discrete rank; **50,000 rows/day/site/search type**, API default 1,000 rows/request → 25,000 via `rowLimit` → 50,000 via `startRow` pagination; long-tail queries anonymized; **2–3 day lag**. Quotas are not the constraint. | §7.5, §15.9 |
| 6 | The **arms-race maintenance concern is CONFIRMED** and is the strongest practical argument, independent of policy: around **2025-01-15** Google began requiring **JavaScript rendering** to return results, breaking IP-rotation scrapers and causing multi-day blackouts across Semrush, SE Ranking and others. Raises per-query cost to headless-browser level; breakage is recurring. | §7.3 |

**Revised bottom line (now reflected in §15.9):** ship the rank tracker on **Search Console API data only** for own-site positions; treat any bundled SERP scraping as an explicit, documented **ToS breach with operational** (blocking, vendor churn, JS-rendering cost) rather than legal-penalty risk; **do not architect around the Custom Search JSON API**; and accept that **competitor rank comparison cannot be built on any sanctioned first-party Google source today.**

**Sources:** https://developers.google.com/search/docs/essentials/spam-policies · https://policies.google.com/terms · https://www.google.com/robots.txt · https://support.google.com/websearch/answer/86640 · https://developers.google.com/custom-search/v1/overview · https://developers.google.com/webmaster-tools/limits · https://searchengineland.com/google-disrupts-seo-tools-450872 · https://www.searchenginejournal.com/google-causes-global-seo-tool-outages/537604/

### Claims 2–6 — **CONFIRMED**, no correction required

| Claim | Verdict | Where it appears |
|---|---|---|
| EU AI Act Art. 50 applicable from **2026-08-02**; the Art. 2(12) FOSS exemption does **not** apply to Art. 50 systems; penalties up to **€15,000,000 or 3%** of worldwide turnover | CONFIRMED | §0.4, §9.1, §9.2, §9.5 |
| Art. 50(4) labeling duty does not apply "where the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility"; Commission: "superficial checks (spell-checking, grammar) don't qualify as human review" | CONFIRMED | §0.5, §9.3, §9.4 |
| Search Console API quotas: Search Analytics **1,200 QPM** per-site and per-user (**40,000 QPM / 30,000,000 QPD** per-project); URL Inspection **2,000 QPD / 600 QPM** per-site (**15,000 QPM / 10,000,000 QPD** per-project); all other resources **20 QPS / 200 QPM** per-user | CONFIRMED | §8.1 |
| Indexing API "can only be used to crawl pages with either `JobPosting` or `BroadcastEvent` embedded in a `VideoObject`"; abuse "may result in access being revoked" | CONFIRMED | §8.2, §12.2 (8), §15.19 |
| As of 2026-08-30 Google does not enforce site reputation abuse **manual actions** in the EEA — affected pages "won't be subject to the impact of manual action" though they "may be categorized as separate from the main domain"; manual actions still apply outside the EEA | CONFIRMED | §1.3, §6, §14.6 |
