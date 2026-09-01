# 02 — On-Page & Content SEO: Methods, Scoring, and Content Ops

**Research dossier for an autonomous, self-hostable SEO engineer agent**
Compiled: 2026-09-01 · Analyst: research subagent
Source recency policy: 2025–2026 preferred. Anything verifiable only from 2024 or earlier is explicitly flagged **[STALE-RISK]**. Anything sourced only from vendor/agency marketing content is flagged **[MARKETING]**.

---

## 0. Executive orientation

Three structural facts define on-page/content SEO as of mid-2026 and should shape the product:

1. **Google no longer exposes a "content quality" lever you can pull directly.** The Helpful Content *system* is officially **retired as a standalone system** and folded into core ranking (March 2024). It now lives in the *"Retired systems"* section of Google's ranking-systems guide. There is no HCU-style periodic hammer to recover from; quality is evaluated continuously and re-scored at core updates (March 2026 and May 2026 were the two 2026 core updates through August).
2. **Google rewrites most of what you write in `<title>`.** A Q1 2025 study of ~30,000 keywords found Google changed title tags **76%** of the time — up from ~61% in 2023. So the tool must optimize for *rewrite resistance* and for the **superset of sources** Google draws from (title, H1, og:title, prominent text, anchor text, `WebSite` structured data), not just the `<title>` string.
3. **The click economics changed and the measurement substrate changed with it.** AI Overviews suppress top-position CTR materially, *and* Search Console's impression series contains **at least four separate structural breaks between June 2025 and April 2026** — the `&num=100` removal (from ~2025-09-10) is only one of them, and it is the one Google has *never* acknowledged. The officially documented break is a **logging error that inflated impressions from 2025-05-13 until 2026-04-27**, fixed going forward only and **never backfilled**. Any content-decay detector that naively compares impressions across these dates will produce a wave of false "decay" (and false "growth") alerts. **Clicks are the only metric unaffected by both the `num=100` change and the logging bug — make click-based signals the default for any cross-window comparison.** See §9.2 for the full break register.

Everything below is written so it can be turned into code.

---

## 1. Primary-source ground truth (Google, 2025–2026)

### 1.1 Title links — `developers.google.com/search/docs/appearance/title-link`

**Sources Google uses to generate the title link** (implement all of these as controllable surfaces):
- `<title>` element
- Main visual title / headline on the page
- `<h1>` and other heading elements
- `og:title` meta tag
- Large, prominently styled text
- General page content
- Anchor text on the page
- Text within links pointing to the page
- `WebSite` structured data

**Documented rewrite triggers** (turn each into a lint rule):
| Trigger | Detection rule |
|---|---|
| Half-empty titles (e.g. `| Site Name`) | `title` minus brand delimiters yields < 3 tokens |
| Obsolete dates | Year token in title ≠ year token in visible H1/body/`dateModified` |
| Inaccurate / misrepresenting title | Low semantic similarity between title embedding and page-body embedding (see §6.5) |
| Micro-boilerplate | ≥2 URLs share the same normalized title, or n-gram overlap > 0.8 across a template family |
| No clear main title | Multiple `h1`s with equal computed font-size/prominence, or no `h1` |
| Language/script mismatch | Detected script/lang of title ≠ detected lang of MC |
| Redundant site-name duplication | Brand token appears in title AND is already domain-level branding |

**Google's explicit "do":** every page has a `<title>`; descriptive and concise; avoid vague ("Home"); no keyword repetition ("Foobar, foo bar, foobars" is called out by name as unhelpful); distinct per page; brand at beginning or end separated by hyphen/colon/pipe; same language/writing system as the primary content; avoid flight price info in `<title>`.

**Google states no character limit.** Google says only: *"The title link is truncated in Google Search results as needed, typically to fit the device width."* Any "50–60 characters" rule is a community heuristic, not Google policy. Changes take *"a few days to a few weeks"* to reflect.

### 1.2 Snippets / meta descriptions — `developers.google.com/search/docs/appearance/snippet`

- *"Snippets are primarily created from the page content itself. However, Google sometimes uses the meta description HTML element if it might give users a more accurate description of the page."*
- *"Google Search might show different snippets for different searches."* → snippet is query-dependent; do not A/B a meta description expecting a stable rendered string.
- Controls: `nosnippet` (robots meta), `max-snippet:[number]` (robots meta), `data-nosnippet` (HTML attribute on element).
- Best practice wording: description should be *"like a pitch that convinces the user that the page is exactly what they're looking for"*; must be unique per page; keyword strings are explicitly discouraged.
- **Critical for our tool:** Google *explicitly endorses* programmatic meta descriptions — *"programmatic generation of the descriptions can be appropriate and are encouraged"* — provided they are *"human-readable and diverse."* This is the strongest official green light for an autonomous agent writing metadata at scale.

### 1.3 Headings & the "don't bother" list — SEO Starter Guide (last updated **2025-12-10 UTC**)

- *"Having your headings in semantic order is fantastic for screen readers, but from Google Search perspective, it doesn't matter if you're using them out of order."*
- *"There's also no magical, ideal amount of headings a given page should have."*
- Google's own **"things we believe you shouldn't focus on"** list includes: keywords meta tag, keyword stuffing, keywords in domain names/URLs, **minimum or maximum content length**, subdomain vs subdirectory, **heading order/quantity**, and **E-E-A-T as a ranking factor**.

**Product implication:** ship heading-order and word-count checks as **accessibility / editorial** advisories, never as "SEO fixes," and never let the autonomy engine auto-apply them as ranking work. Doing otherwise contradicts Google's own docs and will erode user trust.

John Mueller's positioning (secondary, via SEJ/agency write-ups, consistent across 2019→2025): headings are *"a really strong signal telling us this part of the page is about this topic"*, but the specific level (h1 vs h2 vs h5) matters much less than the semantic signal. Keywords-in-headings is not a standalone ranking factor. **[MARKETING/secondary]** — no equivalent statement exists in the official docs beyond the starter-guide text above.

### 1.4 Helpful content system status in 2026 — **retired as a separate system**

`developers.google.com/search/docs/appearance/ranking-systems-guide` lists **helpful content system under "Retired systems"**, with the note that it was announced in 2022 and *"became part of our core ranking systems"* in March 2024. Also retired: Hummingbird, Panda (into core 2015), Penguin (into core 2016).

**Currently active named systems** (useful as a taxonomy for the agent's explanations): BERT, crisis information systems, deduplication systems, exact match domain system, freshness systems, link analysis systems and PageRank, local news systems, MUM, neural matching, original content systems, passage ranking system, RankBrain, reliable information systems, reviews system, removal-based demotion systems, site diversity system, spam detection systems.

**"Creating helpful, reliable, people-first content"** (last updated **2025-12-10 UTC**) is the live replacement guidance. Framework = **Who / How / Why**:
- **Who** — *"Is it self-evident to your visitors who authored your content?"* Bylines linking to author background.
- **How** — *"Is the use of automation, including AI-generation, self-evident to visitors through disclosures or in other ways?"*
- **Why** — *"perhaps the most important question"*; content should serve people first, not *"primarily to attract search engine visits."*

Named red flags: producing *"lots of content on many different topics"* hoping something ranks; *"using extensive automation to produce content on many topics."*

### 1.5 Core updates doc (last updated 2025-12-10 UTC) — recovery semantics

- Core updates are *"broad in nature, and don't target specific sites or individual web pages."*
- Restaurant analogy: pages that drop *"aren't necessarily 'bad'."*
- **Deletion guidance (load-bearing for our pruning module):** *"Deleting content is a last resort, and only to be considered if you think the content can't be salvaged."* Google warns that wanting to delete whole sections is itself a sign those sections were built for search engines.
- Drop triage heuristic given by Google: position 2→4 = *"no need to take drastic action"*; position 4→29 = deeper assessment.
- Recovery timing: *"some changes can take effect in a few days, but it could take several months"*; *"you don't necessarily have to wait for a major core update."*

### 1.6 Spam policies (last updated **2026-08-28 UTC**) — the hard constraints on autonomous content

| Policy | Exact/near-exact definition | Agent constraint |
|---|---|---|
| **Scaled content abuse** | *"Many pages generated for the primary purpose of manipulating search rankings and not helping users."* Explicitly includes *"using generative AI to create pages without user value"*, scraping+transforming, and stitching sources. | Hard rate/quality gate on any bulk generation. Method-agnostic — "we used a good LLM" is not a defence. |
| **Doorway pages** | *"Sites or pages created to rank for specific, similar search queries"* that lead to intermediate pages less useful than the destination; includes region-targeted page farms and *"substantially similar pages"*. | Blocks naive `{service} in {city}` pSEO templates. |
| **Site reputation abuse** | Third-party content on an established host primarily to leverage host ranking signals. Regional split: **outside the EEA**, manual actions may demote; **inside the EEA**, content is categorized and ranked independently without manual penalties. | Relevant if we ever ship a "guest content" module. |
| **Expired domain abuse** | Buying expired domains to host content *"that provides little to no value to users."* | Flag in onboarding if domain history mismatches current topic. |
| **Thin affiliate pages** | Affiliate content where descriptions/reviews are *"copied directly from the original merchant without any original content or added value."* | Affiliate sites need an original-content quota gate. |
| **Keyword stuffing** | *"Filling a web page with keywords or numbers in an attempt to manipulate rankings."* Explicitly names *city/region lists*. | Cap on term-frequency targets from any BM25/TF-IDF optimizer (see §6.6). |
| **Machine-generated traffic** | *"Sending automated queries to Google"*, including *"scraping results for rank-checking without permission"*, violating Google ToS. | **Direct product risk.** SERP scraping for intent detection / brief building is against Google ToS. Use licensed SERP APIs, or make scraping opt-in with a clear warning. |

### 1.7 Search Quality Rater Guidelines — **General Guidelines, September 11, 2025** (current version)

Verified by downloading and text-extracting the live PDF at `static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf` (8.6 MB, cover date **September 11, 2025**, "Copyright 2025").

**§3.4 E-E-A-T — exact framing:**
> *"Experience, Expertise, Authoritativeness and Trust (E-E-A-T) are all important considerations in PQ rating. **The most important member at the center of the E-E-A-T family is Trust.**"*
> *"**Trust**: Consider the extent to which the page is accurate, honest, safe, and reliable."*
> *"**Experience**: Consider the extent to which the content creator has the necessary first-hand or life experience for the topic."*
> *"**Expertise**: Consider the extent to which the content creator has the necessary knowledge or skill for the topic."*
> *"**Authoritativeness**: Consider the extent to which the content creator or the website is known as a go-to source for the topic."*

Trust requirements are **page-type dependent**, per the guidelines' own examples: online stores need secure payment + reliable customer service; product reviews should be honest and *"written to help others make informed purchasing decisions (rather than solely to sell the product)"*; informational pages on clear YMYL topics *"must be accurate to prevent harm"*; social posts on non-YMYL topics *"may not need a high level of Trust."*

**§2.3 YMYL — the four buckets (note the 2025 expansion):**
- **YMYL Health or Safety**
- **YMYL Financial Security**
- **YMYL Government, Civics & Society** — *"issues of public interest, trust in public institutions, election and voting information"* (this is the notable 2025 addition)
- **YMYL Other**

YMYL is explicitly *"a spectrum"* — *"clear YMYL, definitely not YMYL or something in between."*

**§4.6.5 Scaled Content Abuse (rater-side) — the single most important paragraph for an autonomous content agent:**
> *"Pages and websites made up of content created at scale with no original content or added value for users, should be rated Lowest, no matter how they are created. Even if you are unsure of the method of creation, e.g. whether or not the page is created using generative AI tools, you should still use the Lowest rating when you strongly suspect scaled content abuse after looking at several pages on the website."*

Listed examples include *"automated transformations like synonymizing, translating, or other obfuscation techniques"* — i.e. **bulk machine translation with no added value is named as scaled content abuse.**

**§4.6.6:**
> *"The Lowest rating applies if all or almost all of the MC on the page … is copied, paraphrased, embedded, auto or AI generated, or reposted from other sources with little to no effort, little to no originality, and little to no added value."*

And crucially, the balancing statement:
> *"the use of Generative AI tools alone does not determine the level of effort or Page Quality rating. Generative AI tools may be used for high quality and low quality content creation."*

Raters are also told to look for tells such as *"words like 'As an AI…'"* — so **stripping LLM boilerplate is a hard requirement in our publishing pipeline.**

**Also present:** licensed/syndicated content is explicitly **not** "copied."

---

## 2. Title tag & meta description: implementation spec

### 2.1 What the 2025 data actually says

**Q1 2025 title-rewrite study** (John McAlpin, published on Search Engine Land; ~30,000 keywords, top-20 results only, tracked with Advanced Web Ranking + crawled with Screaming Frog):
- **76% of title tags were changed** by Google (vs ~61% in the 2023 baseline).
- Rewrite reasons distribution: **brand-name removal 63%**, clarity improvements 30%, length adjustments 8%, plus intent-matching and specificity additions.
- Commercial-intent queries: 31.91% of original titles contained the target keyword; Google retained the keyword 31.31% of the time; only 1.44% of rewrites *added* a keyword.
- Informational queries: only 6% of originals had the target keyword; 93.81% of modified titles had no keyword in either version.
- YMYL: 21% of originals had keywords, **77.68% of changes removed them entirely**. Non-YMYL: 28% had keywords, 71.64% removed.
- Author's recommendation: 30–60 characters; keyword focus for commercial, clarity focus for informational, accuracy over keywords for YMYL.

**Zyppy title-rewrite study — 80,959 titles across 2,370 sites** (data collected **Q1 2022** → **[STALE-RISK]**, but still the only length-vs-rewrite dataset with published granularity):
- Overall rewrite rate 61.6%.
- By length: 1–5 chars → 96.6% rewritten; ≤20 chars → >50%; **51–60 chars → 39–42% (lowest)**; 60+ → >76%; 70+ → **99.9%**.
- Brackets `[]` → 77.6% rewrite, 32.9% fully removed. Parentheses `()` → 61.9% rewrite, 19.7% removed.
- Pipe `|` separator → 41.0% removal/replacement. Dash `-` → 19.7% removal.
- Numbers in title **and** matching H1 → 97.3% retention. Numbers in title with mismatched H1 → 25.8% removal.

### 2.2 Rewrite-resistance score (ship this)

```
RewriteRisk(page) =                                  # 0..1, lower is better
    0.28 * f_length(px)          # pixel width; min risk at 480–580px (~51–60 chars)
  + 0.18 * f_h1_divergence       # 1 - token_jaccard(title_core, h1)
  + 0.14 * f_body_divergence     # 1 - cos(emb(title), emb(first_1500_chars))
  + 0.10 * f_boilerplate         # max n-gram overlap with sibling-template titles
  + 0.08 * f_brackets            # 1.0 if [], 0.6 if (), 0 otherwise
  + 0.08 * f_separator           # 1.0 if '|', 0.4 if '-'/'–'/':' , 0 if none
  + 0.06 * f_stale_date          # year in title not present in H1/body/dateModified
  + 0.05 * f_kw_repetition       # repeated stem count > 1
  + 0.03 * f_lang_mismatch       # langdetect(title) != langdetect(MC)
```
Measure length in **pixels**, not characters. Render with the Google SERP desktop font stack (Arial/Roboto ~20px for desktop title links) and cap at **~600px desktop / ~920px mobile**; character counts mis-handle "iiiii" vs "WWWWW". This is a well-established practitioner technique, not Google policy.

### 2.3 Fix actions the agent should be allowed to take

| Action | Autonomy tier | Rollback |
|---|---|---|
| Rewrite `<title>` on a page with RewriteRisk > 0.5 AND no manual override | Auto (tier 2) | Store prior value; revert on 21-day CTR regression at 90% confidence |
| Align `og:title` to `<title>` | Auto (tier 1) | trivial |
| Generate missing meta description | Auto (tier 1) — explicitly encouraged by Google | trivial |
| Rewrite an existing, human-written meta description | Suggest-only (tier 3) | — |
| De-duplicate templated titles across a page family | Auto (tier 2) with a diff preview | batch revert |
| Add/remove `max-snippet` / `data-nosnippet` | Suggest-only | — |

**Never** claim a meta description change will move rankings. It moves CTR only, and only when Google chooses to use it.

---

## 3. Heading structure

Implement as three separate checks with different severities:

1. **Accessibility/semantics (advisory):** exactly one `h1`; no level skips; heading text non-empty; headings not used purely for styling. Google explicitly says order doesn't matter *for Search*, so severity = "info".
2. **Passage-extractability (real 2026 value):** for AI Mode / AI Overview passage retrieval, the working practice is one question-shaped `h2` per sub-intent with a **direct 40–60 word answer immediately below it**, then evidence. Community/agency research reports peak citation rates for passages around **134–167 words**, and states a 40–60 word direct answer outperforms a 3,000-word unsegmented article. **[MARKETING]** — iPullRank/agency research derived from Google patents and the DOJ trial exhibits; treat the exact word ranges as directional, not measured ground truth.
3. **Coverage (the actionable one):** compare the page's heading set against the union of headings on the top-10 ranking URLs plus the People-Also-Ask set; surface *missing subtopics*, not missing keywords. This is what Clearscope/Surfer/MarketMuse actually sell (§6).

---

## 4. Search intent classification

### 4.1 Taxonomy

Standard four: **informational / navigational / commercial (investigation) / transactional**. Reality in 2026 is mixed-intent. Semrush's own 10M-keyword AI Overviews study shows the intent mix of *AIO-triggering* queries shifted hard between Oct 2024 and Oct 2025:

| Intent | Oct 2024 | Oct 2025 |
|---|---|---|
| Informational | 91.3% (Jan) | 57.1% |
| Commercial | 8.15% | 18.57% |
| Transactional | 1.98% | 13.94% |
| Navigational | 0.84% | 10.33% |

A claim that "~73% of queries are mixed-intent (10M keywords, 14 industries, 2025)" circulates widely but I could only find it in vendor blogs — **[MARKETING], unverified**.

### 4.2 SERP-feature-based classifier (deterministic, no LLM needed for tier 1)

Build a feature vector from a SERP snapshot and score each intent. Weights below are a defensible starting prior; calibrate on a hand-labelled set of ~500 queries per vertical.

```python
FEATURE_WEIGHTS = {
  # feature                    (info, nav, comm, txn)
  "shopping_ads_top":          (-0.3, -0.2,  0.5,  0.9),
  "product_carousel":          (-0.3, -0.1,  0.6,  0.8),
  "popular_products":          (-0.3, -0.1,  0.6,  0.8),
  "local_pack":                (-0.1,  0.2,  0.5,  0.7),
  "text_ads_count>=3":         (-0.2,  0.0,  0.6,  0.8),
  "featured_snippet":          ( 0.7, -0.1, -0.1, -0.3),
  "people_also_ask":           ( 0.6,  0.0,  0.1, -0.2),
  "video_carousel":            ( 0.5, -0.1,  0.1, -0.1),
  "knowledge_panel_entity":    ( 0.2,  0.7,  0.0, -0.1),
  "sitelinks_on_result_1":     (-0.1,  0.9, -0.1,  0.0),
  "ai_overview_present":       ( 0.4,  0.0,  0.1, -0.1),
  "top10_ecom_domain_share":   (-0.4, -0.1,  0.5,  0.9),  # amazon/etsy/ebay/shopify-hosted
  "top10_url_has_/blog|/guide":( 0.6,  0.0,  0.1, -0.2),
  "top10_title_has_best|top|vs|review": (-0.1, 0.0, 0.9, 0.1),
  "top10_title_has_buy|price|deal|coupon": (-0.2, 0.0, 0.3, 0.9),
  "query_is_brand_term":       (-0.2,  1.0, -0.1,  0.0),
  "query_starts_how|what|why|when": (0.9, -0.3, -0.2, -0.4),
}
```
Score = softmax over Σ(weight × feature). Emit `primary_intent`, `secondary_intent`, and `intent_entropy`. If entropy > 0.85 → mark **mixed intent** and require a hybrid page template (e.g., a comparison table + an explainer section).

**Legal/ToS note:** obtaining these SERP snapshots by scraping Google directly violates the *machine-generated traffic* spam policy (§1.6). Architect the SERP provider as a pluggable interface with adapters for licensed APIs and an explicitly opt-in, user-supplied-credentials scraping adapter that ships disabled.

### 4.3 Content-type mapping (drive the generator)

| Detected intent | Required page archetype | Required elements |
|---|---|---|
| Informational — definitional | Explainer / glossary | 40–60 word direct answer under an `h2` question; definition list; `Article` schema |
| Informational — how-to | Step guide | ordered steps, materials, time, `HowTo`-style structure (note: `HowTo` rich results deprecated for desktop/mobile — validate before emitting) |
| Commercial investigation | Comparison / "best X" | comparison table, criteria section, first-hand testing evidence (E-E-A-T "Experience"), pros/cons, `ItemList` |
| Transactional | Product / pricing / service | price, availability, `Product`/`Offer` schema, trust signals (returns, payment security — QRG §3.4 explicitly names these) |
| Navigational | Brand/entity hub | `Organization` schema, sitelinks-friendly IA |

---

## 5. Content-brief construction: what commercial tools actually compute

### 5.1 Clearscope (verified from `clearscope.io/pricing`, accessed 2026-09-01)

- Plans: **Essentials $129/mo**, **Business $399/mo**, **Enterprise custom**. *All tiers: unlimited users and unlimited projects.*
- Essentials: 50 Tracked Prompts, 50 Pages, 20 monthly Topic Explorations, 20 monthly Drafts.
- Business: 300 Tracked Prompts, 300 Pages, 50 monthly Topic Explorations, 20 monthly Drafts.
- **No API access documented on the pricing page.** Note the product has clearly pivoted toward AI-search prompt tracking (the "Tracked Prompts" unit is new relative to the old "reports" unit).
- Outputs (per third-party reviews, **[MARKETING]**): content grade A+→F, recommended term list with observed usage counts from top-ranking pages, word-count target, Flesch-Kincaid readability, Google Docs add-on.

### 5.2 Surfer SEO (verified from `surferseo.com/pricing`, accessed 2026-09-01)

| Plan | Price (billed yearly) | Documents | Seats | AI prompt tracking |
|---|---|---|---|---|
| Discovery | **$49/mo** | 120 create/optimize | 1 | ChatGPT only |
| Standard | **$99/mo** | 360 | 3 | 25 prompts, weekly |
| Pro | **$182/mo** | 360 | 5 | 50 prompts, daily, across ChatGPT/Perplexity/AI Mode/AIO/Gemini |
| Peace of Mind | **$299/mo** | Unlimited | 10 | 100 prompts, daily |
| Enterprise | **$999/mo** | tailored | — | — |
| AI Search Analytics (standalone) | **$158/mo** | — | — | — |

**API access is gated to "Peace of Mind" ($299/mo) and Enterprise only.**
Surfer's Content Score is a 0–100 score computed against the average of top performers, with per-term target frequency *ranges*, plus targets for word count, H2–H4 counts, paragraph distribution, and image count. **[MARKETING]** for the algorithmic detail (BERT/transformer NER + salience) — Surfer does not publish the algorithm.

### 5.3 MarketMuse (acquired by **Siteimprove, October 2024**)

The one genuinely published formula in this category, from MarketMuse's own help center:
> *"One point is awarded for every mention of a topic, up to a maximum of two points per topic (50 topics in the list × 2 points per topic = 100)."*

So **Content Score = min(2, mention_count(t)) summed over the top 50 model topics**, range 0–100. Their docs also state *"A higher score indicates better coverage, but there is no perfect score"* and define **Target Content Score** as *"the recommended minimum score for which you should aim."* "Personalized Difficulty" (difficulty relative to *your* site's existing topical authority) and "Topic Authority" are marketed but **not defined in the public help article** — treat any formula for them as unverified.

**Key takeaway for us: this whole category is a thin wrapper over (a) a term/entity model derived from the top-N SERP results and (b) a capped-frequency coverage score.** It is entirely reproducible open-source. The moat is data acquisition (SERPs) and UX, not math.

---

## 6. The actual algorithms — implementable spec

### 6.1 Corpus construction
For target query *q*: fetch top **N = 10–20** organic URLs (excluding the user's own), strip boilerplate (readability/trafilatura-style main-content extraction — this matters enormously; nav/footer terms poison TF-IDF), keep `title`, `h1..h6`, body text, schema `@type`, word count, publish/modified dates.

### 6.2 TF-IDF baseline
`tfidf(t, d) = tf(t,d) × log(N / df(t))`, with sublinear TF (`1 + log tf`) and L2 normalization. Compute over the SERP corpus only (N = 10–20), **not** a global corpus — this is what makes the terms query-specific. Extract unigrams + bigrams + trigrams, filtered by POS pattern (`NOUN`, `ADJ NOUN`, `NOUN NOUN`, `NOUN ADP NOUN`) to avoid junk n-grams.

### 6.3 BM25 (better for scoring the user's draft against the corpus)
```
score(D, Q) = Σ_{qi ∈ Q}  IDF(qi) · ( f(qi,D) · (k1 + 1) )
                          / ( f(qi,D) + k1 · (1 − b + b · |D| / avgdl) )

IDF(qi) = ln( (N − n(qi) + 0.5) / (n(qi) + 0.5) + 1 )
k1 ∈ [1.2, 2.0]  (use 1.2)      b = 0.75
```
Why BM25 over TF-IDF for briefs: **term-frequency saturation** (k1) means the tool stops recommending "use this word 14 times" past the point of diminishing return, and **length normalization** (b, using SERP `avgdl` as the word-count target) makes the word-count recommendation fall out of the model instead of being a separate hand-wave. This is a genuine product differentiator vs. tools that just report "top pages average 2,150 words."

**Word-count target** = `avgdl` of the SERP corpus, reported as an interquartile range, not a single number. Google explicitly lists "minimum or maximum content length" as something not to focus on, so present it as *"pages that rank here typically run 1,400–2,600 words"* — descriptive, not prescriptive.

### 6.4 Entity coverage
Two viable stacks:

**(a) Self-hosted (recommended default for an open-source tool):**
- NER: spaCy `en_core_web_trf`, or **GLiNER** for zero-shot arbitrary entity types (no retraining per vertical).
- Entity linking: candidate generation against a local **Wikidata** dump (or `wikimapper`), disambiguation by embedding similarity of the mention context vs. the entity description. Emit QIDs.
- Cost: $0 marginal, ~2–4 GB RAM for the models, Wikidata subset ~5–20 GB depending on filtering.

**(b) Managed:** Google Cloud Natural Language API `analyzeEntities` returns entities with `salience` (0–1) and `metadata.wikipedia_url` / `mid` — which is close to what Google itself sees. Pricing commonly reported as **first 5,000 units free per month, then $1.00 per 1,000 units**, where a "unit" = a document or a 1,000-character chunk. **I could not load the official `cloud.google.com/natural-language/pricing` page (content truncated); this figure is from secondary aggregators and may be [STALE-RISK]. Verify before building cost models on it.**

**Entity coverage score:**
```
EntityCoverage(page) = Σ_{e ∈ E_serp}  w(e) · 1[e ∈ E_page]   /   Σ_{e ∈ E_serp} w(e)
w(e) = doc_frequency(e in SERP corpus)/N  ×  mean_salience(e)
```
Report entities the user is missing, ranked by `w(e)`, grouped by entity type. This is far more defensible than "add the phrase 'best running shoes' 6 more times."

### 6.5 Embeddings-based topical coverage (the modern layer)
1. Chunk each corpus doc into ~200–400 token passages on heading boundaries.
2. Embed all passages. Cluster corpus passages (HDBSCAN or agglomerative, cosine) → these clusters *are* the subtopics.
3. Label each cluster with its medoid heading + top TF-IDF terms.
4. For the user's draft, embed its passages and compute, per cluster: `max cosine(draft_passage, cluster_centroid)`.
5. **Coverage gap** = clusters with max-similarity < τ (start τ = 0.62 for `text-embedding-3-small`; **retune per model — thresholds are not portable**).
6. Output = ordered outline of missing sections, each with the source URLs that cover it.

**Embedding cost (verified 2026-09-01):**
| Model | $/1M tokens | Notes |
|---|---|---|
| OpenAI `text-embedding-3-small` | **$0.02** | 1536 dims, Matryoshka-truncatable |
| OpenAI `text-embedding-3-large` | **$0.13** | 3072 dims |
| OpenAI `text-embedding-ada-002` | $0.10 | legacy |
| Google `gemini-embedding-001` | **$0.15** (batch $0.075) | free tier available |
| Google `gemini-embedding-2` | **$0.20** (batch $0.10) | free tier available |
| Self-hosted (Qwen3-Embedding-0.6B / EmbeddingGemma / Arctic-embed-l 334M) | $0 marginal | Arctic-embed-l reports MTEB retrieval nDCG@10 ≈ 0.5598 |

Practical note repeatedly made in 2026 benchmark write-ups: **MTEB rank does not predict domain performance** — one benchmark found the best real-world model ranked 11th on MTEB. Ship an eval harness, not a hardcoded model. **[MARKETING/blog]** for the specific benchmark anecdote.

At $0.02/1M tokens, embedding a 5,000-page site at ~1,200 tokens/page ≈ **$0.12 one-off**. Embeddings are effectively free; there is no economic reason to skip a full-site vector index even on the $8/mo hosted tier.

### 6.6 Information gain (differentiation, not just coverage)
Google holds **US 11,354,342 B2 — "Contextual estimation of link information gain"** (filed 2018, granted June 2024, inventors Victor Carbune & Pedro Gonnet Anders, expiry 2039-06-14). It scores a document by *additional information beyond what the user has already seen*. A patent is not proof of deployment, but it justifies an "information gain" metric:

```
InfoGain(draft) = |unique_claims(draft) \ ∪ unique_claims(serp_corpus)| / |unique_claims(draft)|
```
Implementation: extract atomic claims per document with an LLM or an open IE model; dedupe by embedding similarity (> 0.88 = same claim). Target: **≥ 25–30% novel claims**. Sources of legitimate novelty the agent can actually generate for a site: original data from GA4/GSC/product DB, customer-facing FAQs, first-party screenshots, pricing tables, and internal benchmarks. This is the correct answer to §1.7's "little to no added value" test.

### 6.7 Readability
Compute Flesch Reading Ease and Flesch-Kincaid grade, but label it **editorial, not SEO**. Ahrefs' and Portent's analyses both found **no correlation between readability scores and organic position**. Ahrefs also reports engagement (time on page) benefits at grade ≤8 — **[MARKETING/blog]**, and the underlying studies are 2023–2025.

### 6.8 Term-frequency guardrail (anti-keyword-stuffing)
Google's spam policy names keyword stuffing and specifically calls out *"city/region lists."* Hard cap any generated recommendation at:
```
max_recommended_freq(t) = min( p75_freq_in_serp(t),  ceil(0.008 * target_word_count) )
```
and refuse to emit a recommendation if the resulting keyword density for any single term would exceed ~1.2%.

---

## 7. Topical authority & pillar-cluster models

### 7.1 What's actually established
- Google's ranking-systems guide names **link analysis systems and PageRank** as an active system; internal links participate in it.
- Ahrefs' large-scale finding: *"the average top-ranking page also ranks in the top 10 for nearly 1,000 other relevant keywords"* (3M-search study) — this is the strongest empirical argument for breadth-of-coverage over single-keyword targeting. **[STALE-RISK]** — the study predates 2025.
- Ahrefs also reports that URLs with **more internal anchor-text variations** correlate with more organic traffic. **[STALE-RISK]**, same caveat.

### 7.2 What is NOT established
Widely-circulated 2026 figures — "sites with topical authority gained 23% visibility in the Dec 2025 core update", "clusters drive 30% more traffic and hold rankings 2.5× longer", "bidirectional cluster linking increases citation probability 2.7×" — all trace to agency blogs with no published methodology. **[MARKETING] — do not surface these numbers in-product.**

Contrary evidence worth respecting: Seer Interactive's May 2026 AI Overviews study (below) found **long comprehensive guides underperform** for AIO first-citation slots, and 5,000+ word guides took only **4.4%** of definitional citation slots.

### 7.3 Computable topical-authority model (site-level)
```
For the site's content graph G(V=urls, E=internal links):
1. Embed every URL's main content -> v_u
2. Cluster V (HDBSCAN, cosine) -> topics T
3. For each topic t:
     size(t)        = |urls in t|
     depth(t)       = mean( unique_entities(u) ) for u in t
     internal_cohesion(t) = |E within t| / (|t| * (|t|-1))          # 0..1
     external_signal(t)   = Σ referring domains to urls in t
     serp_share(t)  = Σ GSC clicks(t) / Σ GSC clicks(all t)
     TopicalAuthority(t) = z(size) + 2*z(depth) + 1.5*z(internal_cohesion)
                           + 2*z(external_signal) + 3*z(serp_share)
4. Gap = topics where competitors' SERP presence is high and TopicalAuthority(t) is low
```
Use topic clusters as the **unit of planning** (what to write next, what to consolidate, where to link), and be honest in the UI that cluster structure is an organizing discipline with strong practitioner support but weak public causal evidence.

**Pillar/cluster mechanics that are safe to automate:** pillar links down to every cluster member; every cluster member links back up to the pillar with a consistent-but-varied anchor; sibling links only where embedding similarity ≥ threshold. Avoid the "every page links to every other page" pattern — it flattens PageRank distribution and reads as templated.

---

## 8. E-E-A-T: operationalizing an un-scored concept

Google's starter guide lists **E-E-A-T among things not to focus on as a ranking factor**, and the QRG is a rater manual. So E-E-A-T is **not** something to score-and-optimize. What *is* automatable is the set of concrete artifacts the QRG tells raters to look for (§2.5.2, §2.5.3, §3.3, §3.4):

**Auditable checklist (each maps to a QRG section):**
- [ ] Page has a visible byline; byline links to an author page (QRG §2.5.2 "Finding Who is Responsible")
- [ ] Author page states credentials/experience relevant to the page's topic; has `Person` schema with `sameAs` to external profiles
- [ ] Site has an About Us page, Contact page, and — for commerce — Customer Service information (QRG §2.5.3, named explicitly)
- [ ] Publisher `Organization` schema with `sameAs`, `address`, `contactPoint`
- [ ] `datePublished` + `dateModified` present and honest (QRG penalizes obsolete dates in titles)
- [ ] External citations to primary sources present on YMYL pages; claims sourced
- [ ] For product reviews: evidence of first-hand use (original photos, measurements, "we tested") — QRG's Experience example is literally *"a product review from someone who has personally used the product"*
- [ ] For e-commerce: HTTPS checkout, returns/refunds policy page, payment security statement (QRG §3.4 names *"secure online payment systems and reliable customer service"*)
- [ ] AI-use disclosure present if automation was used (Google's "How" question)
- [ ] No "As an AI…" / model boilerplate anywhere in the corpus (QRG §4.6.5 tells raters to look for this)

**YMYL classifier** — route pages to a stricter policy when detected. Classify against the four QRG buckets (Health/Safety, Financial Security, **Government/Civics/Society**, Other). For YMYL pages: disable autonomous publishing entirely; require human review; require author credentials; require citations. This is the single most important safety valve in the product.

---

## 9. Content decay detection from GSC

### 9.1 The data substrate — exact API facts

**Search Analytics API** (`POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`):
- Request fields: `startDate`, `endDate` (required, YYYY-MM-DD, **PT timezone**), `dimensions[]`, `type`, `dimensionFilterGroups[]`, `aggregationType`, `rowLimit`, `startRow`, `dataState`.
- **`rowLimit`: valid range 1–25,000; default 1,000.** Paginate with `startRow`.
- Dimensions: `date`, `hour`, `country` (ISO-3166-1 **alpha-3**), `device` (DESKTOP/MOBILE/TABLET), `page`, `query`, `searchAppearance`.
- `type`: `web` (default), `image`, `video`, `news`, `googleNews`, `discover`.
- Google's own caveat: *"The API is bounded by internal limitations of Search Console and does not guarantee to return all data rows but rather top ones."*
- **Hourly data**: `HOUR` dimension with `dataState: HOURLY_ALL`, up to ~10 days of hourly data.

**Quotas** (`developers.google.com/webmaster-tools/limits`):
| Resource | Per-site | Per-user | Per-project |
|---|---|---|---|
| Search Analytics | **1,200 QPM** | **1,200 QPM** | 40,000 QPM / 30,000,000 QPD |
| URL Inspection | **600 QPM, 2,000 QPD** | — | 15,000 QPM / 10,000,000 QPD |
| All other resources | — | 20 QPS / 200 QPM | 100,000,000 QPD |

Search Analytics quota is described as having both **load limits** (measured over 10-minute and 1-day windows) and QPS limits. **The widely-cited "50,000 rows per search type per site per day" ceiling comes from third-party guides, not the official limits page — treat as unverified.**

Data retention: **16 months**, hard. Nothing older is retrievable. → **The tool must snapshot GSC into its own local store from day one.** This is a genuine feature, not a chore.

**BigQuery bulk export** (`support.google.com/webmasters/answer/12917675`): dataset name always starts with `searchconsole`; tables `searchdata_site_impression`, `searchdata_url_impression`, `ExportLog`. Columns include `data_date`, `site_url`, `url` (url table), `query`, `is_anonymized_query`, `is_anonymized_discover`, `country` (alpha-3), `search_type`, `device`, `impressions`, `clicks`, `sum_top_position` / `sum_position`, plus `is_[search_appearance_type]` booleans (e.g. `is_amp_top_stories`, `is_job_listing`). **`sum_top_position` = the sum of the topmost position of the site in results, where zero is the top position** — so `avg_position = sum_top_position/impressions + 1`. Costs are standard GCP storage+query with a free tier; Google recommends partition expiration ≥14 days.

### 9.2 GSC structural breaks — **the whole register must be hard-coded into the analytics layer**

There is **more than one** impressions discontinuity, they **overlap**, and the most-discussed one (`num=100`) is the *only* one Google has never documented. Treating September 2025 as "the" break is the single biggest analytical error available here.

#### 9.2.1 The `&num=100` removal (community-inferred; **no Google confirmation**)

Google **silently stopped honoring** the `&num=100` search parameter starting **~2025-09-10**; the SEO community noticed 2025-09-12 and effects were fully visible 2025-09-13/14. Use **2025-09-10 as the leading edge** of the break window. A large volume of bot/rank-tracker-driven impressions (which had been landing on results 11–100) disappeared from Search Console. Confirmed direction of effects: **impressions fell, clicks were largely unaffected, average position improved** (numerically lower) because impressions at positions 21–100 vanished. Search Engine Land: *"Fewer queries now show on page 3+, while more surface in the top 3 and on page 1."* Sites also lost unique query rows — **77.6% lost unique ranking terms**, concentrated in short/mid-tail. Still in force: as of Aug/Sep 2026 `num=100` remains ignored; Google returns 10 results regardless of the value, with no error or redirect. No reversal.

Three corrections to the version of this claim that circulates (including an earlier draft of this dossier):

- **This is NOT a break in every GSC property.** The best dataset (Tyler Gargula / LOCOMOTIVE, n=319 properties) found **87.7% declined** — i.e. **~12.3% (~39 properties) showed no impression decline at all**. Other datasets: **median ~15% impression loss** (Paul Grillet / ThotSEO, n=1,334); **~25% aggregate weekly drop** (Serge Bezborodov / JetOctopus, n≈1,000). Magnitude was strongly **size-dependent** — big sites took the biggest hits; small sites with little long-tail footprint often saw nothing. **The engine must DETECT the break per-property, not assume it.**
- **Google never confirmed or documented it.** The only on-record Google statement is a spokesperson saying *"The use of this URL parameter is not something we formally support."* There is **no `num=100` entry, and no September 2025 impressions entry, on the official Data anomalies in Search Console page** — which still carries an April 3, 2026 entry reaching back to May 13, 2025, so a Sept 2025 entry would still fall inside its stated 3–16 month retention window if it had ever existed. Treat this as a **community-inferred break with no primary confirmation** and label it as such in the UI.
- **The desktop skew has no published magnitude.** Directionally confirmed (scrapers issued desktop-UA requests), but **nobody has published a desktop-vs-mobile percentage split**. ⚠️ unverified — must be confirmed during implementation. **Do not hard-code any device-level magnitude**; there is no source for one.

#### 9.2.2 The officially documented impressions logging error (2025-05-13 → 2026-04-27)

This is the break Google *does* document, and it **swallows the entire `num=100` window**. Verbatim from the Data anomalies page:

> *"A logging error prevented Search Console from accurately reporting impressions from May 13, 2025 until April 27, 2026. This issue has been resolved."*

- Google announced the fix **2026-04-03**; impressions were **INFLATED (over-reported) for ~50 weeks**.
- **Only impressions and the derived metrics — CTR and average position — were affected. Clicks were NOT affected.**
- **Historical data was NOT backfilled.** John Mueller confirmed the fix applies going forward only; the inflated 2025-05-13 → 2026-04-27 figures remain **permanently** in GSC history. So every property has a **second step-down** in impressions (and a shift in CTR and average position) across the 2026-04-03 → 2026-04-27 rollout, with permanently non-comparable data in between.
- **Consequence: the Sept 2025 `num=100` drop occurred INSIDE the inflation window. The two effects are confounded — you cannot cleanly attribute the September 2025 magnitude to `num=100` alone.** Any per-property effect size for `num=100` is therefore an estimate, not a measurement.

#### 9.2.3 AI Mode folded into Performance totals (2025-06-17) — a step **UP**

On **2025-06-17** Google confirmed that AI Mode clicks, impressions and position are folded into the general Search Console performance totals **with no separate segmentation** (some observers saw it from ~2025-06-12). This is an impressions **step-up**, in the opposite direction from the other two. Separately, from **2026-06-03** Google shipped Generative AI performance reports — a new *view*, not a new data silo (see §17-L).

#### 9.2.4 Implementation requirement — the break register

Hard-code at minimum these four entries and suppress/annotate any window that straddles them:

| Date / window | Event | Metrics affected | Direction | Google-documented? |
|---|---|---|---|---|
| **2025-06-17** | AI Mode folded into Performance totals | impressions, clicks, position | impressions **up** | Yes (announcement) |
| **2025-09-10** (visible through 09-14) | `&num=100` stops working | impressions ↓, position improves, clicks flat | impressions **down** | **No** — community-inferred only |
| **2025-05-13 → 2026-04-27** | Impressions logging error (inflated) | impressions, CTR, avg position (**not clicks**) | impressions **inflated**, never backfilled | **Yes** — Data anomalies page |
| **2026-04-03 → 2026-04-27** | Correction rollout for the above | impressions, CTR, avg position | impressions **down** | Yes |

The decay engine must:
- **Guard on impressions / average position / CTR only.** **Clicks are unaffected by both the `num=100` change and the logging bug — click-based decay signals are the safe default for cross-window comparison.**
- Refuse YoY or long-window impression/CTR/position comparisons that straddle any register entry; degrade to a clicks-only comparison instead of firing an alert.
- **Detect the Sept 2025 break per-property** (changepoint test on the daily impression series around 2025-09-10) rather than assuming it — **~12% of properties show none**.
- Never present a `num=100` effect size as measured; it is confounded with the logging inflation for the whole of its window.
- Display a banner explaining which discontinuity a window touches, rather than firing decay alerts.

### 9.3 Decay signatures (classify, don't just alert)

Compare trailing 28d vs prior 28d, and trailing 90d vs same 90d prior year (post-break-aware):

| Signature | Clicks | Impressions | Avg position | Diagnosis | Action |
|---|---|---|---|---|---|
| A. Ranking decay | ↓ | ↓ | ↓ (worse) | Lost to competitors | Refresh + expand + internal links |
| B. CTR decay | ↓ | → or ↑ | → | SERP feature (AIO/FS) or stale title/snippet | Rewrite title/meta; add schema; target the AIO |
| C. Demand decay | ↓ | ↓ | → | Seasonality / topic dying | Do nothing, or repurpose |
| D. Intent drift | ↓ | → | ↓ | SERP composition changed; page archetype no longer matches | Re-template the page (see §4.3) |
| E. Cannibal decay | ↓ on URL A | ↑ on URL B | swapping | Internal competition | §10 |

Formally:
```
decay_score(url) =
    0.45 * max(0, -Δclicks_pct_28d)
  + 0.20 * max(0, -Δclicks_pct_90d)
  + 0.20 * max(0,  Δposition_abs)          # positive = got worse
  + 0.15 * max(0, -Δctr_pct)
priority(url) = decay_score(url) * log1p(baseline_clicks_90d) * business_value(url)
```
Require **≥ 100 impressions** in both windows before scoring (small-sample noise), and use a Mann-Kendall trend test or a Bayesian changepoint (e.g. `ruptures` PELT) on the daily click series rather than two-point deltas — two-point deltas over-fire on weekly seasonality.

**Refresh recency effect:** community/agency data claims AI systems cite content ~25.7% "fresher" than classic search. **[MARKETING], unverified.** Google's *freshness systems* are a real named active system, though, so a `dateModified` + substantive-change refresh loop is justified on documentation grounds alone. Only bump `dateModified` when the diff is substantive — faking freshness is exactly the "obsolete dates" pattern Google punishes in title rewriting.

---

## 10. Keyword cannibalization detection

### 10.1 Detection algorithm (GSC-native, no third-party data needed)

For each query *q* over a 90-day window with ≥ `MIN_IMPR` (default 200) impressions:
```
rows = GSC.query(dimensions=['query','page'], filter=query==q)
share_i = impressions_i / Σ impressions
```
Flag as cannibalization when **all** hold:
1. ≥ 2 URLs with `share_i ≥ 0.15` (some practitioners use ≥0.30 for the second URL — tune)
2. Normalized entropy of the share distribution `H/ln(k) ≥ 0.55` (i.e. genuinely split, not 95/5)
3. `min(avg_position)` across the competing URLs ≤ 20 (there's actually something to win)
4. **Position instability**: the top URL for *q* changes across ≥ 2 of the last 6 fortnightly buckets
5. **Semantic near-duplication**: `cos(emb(url_A), emb(url_B)) ≥ 0.86` OR title/H1 token Jaccard ≥ 0.6

Condition 5 is what separates *real* cannibalization from *legitimate* multi-page coverage (a category page and a review page both ranking for "running shoes" is normal and fine). Tools that skip it generate mostly false positives — and the practitioner consensus in 2025–26 has explicitly shifted toward "measure impact and intent alignment before consolidating."

### 10.2 Severity & resolution
```
cannibal_severity = (1 - top_share) * log1p(total_impressions) * (1 if min_pos<=10 else 0.5)
```
Resolutions, in order of preference:
1. **Differentiate** — re-target one page to a distinct sub-intent (rewrite title/H1/intro, adjust internal anchors). Reversible, lowest risk. Default autonomous action.
2. **Consolidate** — merge the weaker page into the stronger, **301** the weaker URL, update all internal links to point at the survivor, keep the merged content's unique claims. Requires human approval by default.
3. **Canonicalize** — `rel=canonical` from weak → strong when both must remain live (e.g. two legitimate landing pages).
4. **De-optimize** — leave both live; remove the competing keyword from the weaker page's title/H1 and re-point internal anchors.
5. **noindex** — only for genuinely valueless pages that must stay live for users.

**Never** auto-delete. Google: *"Deleting content is a last resort."*

---

## 11. Internal linking automation

### 11.1 The candidate-generation pipeline

```
1. Crawl → page graph G(V, E) with anchor text on each edge.
2. Embed each page (title + h1 + first 1500 chars + headings) → v_u.
   Also embed each *paragraph* → p_{u,i}  (paragraph-level is what makes anchors natural)
3. Candidate pairs: for each target t, ANN search top-K source paragraphs by cos(p_{s,i}, v_t)
   Keep 0.72 <= cos <= 0.92
     - below ~0.72: irrelevant link
     - above ~0.92: the pages are near-duplicates → this is a cannibalization signal, not a link
   (One practitioner implementation reports an optimal band of 0.78–0.85 with
    text-embedding-3-small; thresholds are model-specific and MUST be recalibrated. [MARKETING])
4. Filter: not already linked; not same page; source is indexable & canonical;
   source outbound internal link count < cap (see 11.3).
5. Score, rank, inject.
```

### 11.2 Opportunity scoring — combine semantics with PageRank flow
```
LinkValue(s → t) =
      w1 * cos_sim(paragraph_s, page_t)                 # relevance
    + w2 * PR_delta(t | add edge s→t)                   # equity gain
    + w3 * anchor_novelty(t)                            # new anchor text variant for t
    + w4 * business_value(t)                            # conversion/revenue weight
    + w5 * striking_distance_bonus(t)                   # t has queries at pos 4–20
    - w6 * link_dilution_cost(s)                        # 1/outdegree(s) penalty
    - w7 * depth_penalty(s)                             # weak sources pass little
defaults: w1=0.30, w2=0.20, w3=0.10, w4=0.15, w5=0.15, w6=0.05, w7=0.05
```

**Internal PageRank:** run damped PageRank (d = 0.85) on the internal graph. Two refinements worth implementing:
- **Reasonable-surfer weighting**: weight edges by position (in-body contextual > sidebar > footer > nav) and by whether the anchor is descriptive. Practitioner consensus and Google's own guidance both say in-content contextual links carry more weight than boilerplate.
- **Seeded/personalized PageRank**: seed the restart vector with pages that have external referring domains, so the model estimates *actual* equity flow rather than uniform.
- **`PR_delta` computation**: don't rerun full PageRank per candidate. Use a single power-iteration perturbation or compute PageRank once with the full candidate edge set at fractional weight and take the derivative approximation.

**Orphan / near-orphan detection:**
```
orphan(u)      = indegree_internal(u) == 0 AND u in sitemap AND status==200 AND indexable
near_orphan(u) = indegree_internal(u) <= 2 OR click_depth(u) >= 4
```
Roughly a quarter of the web's pages are estimated to have zero internal inlinks **[MARKETING]**, and the "keep valuable pages within 3 clicks" rule is a practitioner heuristic, not Google policy — but click depth is a defensible proxy for crawl priority given Google's documented crawl-demand model.

### 11.3 Guardrails (these prevent the module from becoming a spam generator)
- Max **3–5 new automated internal links per 1,000 words**, and max **8 total added per page per month**.
- **Anchor diversity constraint per target:** no single anchor phrase may exceed **35%** of that target's internal anchors; require ≥3 distinct anchor variants once a target has ≥6 inlinks. (Ahrefs' correlation between anchor-variation count and traffic supports this, **[STALE-RISK]**.)
- Anchor must be an existing natural phrase in the source paragraph, or an LLM-generated phrase that is then **verified to read naturally in context** — never a stitched-in exact-match keyword.
- Never link inside quotes, code blocks, headings, or existing links.
- Reciprocal-link cap: don't create A→B and B→A for more than ~20% of a cluster's pairs.
- Every injected link is recorded with `{source, target, anchor, paragraph_hash, model, timestamp, confidence}` so it can be reverted atomically.

---

## 12. Content pruning & consolidation

Google's position is unambiguous: **deletion is a last resort**, and wanting to delete whole sections is a symptom that they were built for search engines. But the same doc also says deleting genuinely unhelpful content *"can help the good content on your site perform better."*

### 12.1 Decision tree (implement as a state machine with human gates)
```
for each URL:
  if clicks_365 == 0 and impressions_365 < 50 and inlinks == 0 and referring_domains == 0:
        -> CANDIDATE: PRUNE
  elif near_duplicate_of(other_url, cos >= 0.90) :
        -> CANDIDATE: CONSOLIDATE (301 weaker -> stronger)
  elif clicks declining >30% AND still has impressions AND intent still exists:
        -> CANDIDATE: REFRESH   (default; preferred over both above)
  elif page serves a real user/business function (contact, legal, product) but no search demand:
        -> KEEP, exclude from SEO scoring   (do NOT prune)
  elif page is seasonal / evergreen-with-cycles:
        -> KEEP, schedule refresh at cycle start
```

**Pruning execution semantics:**
- Consolidation → **301** to the survivor, merge unique claims into the survivor, rewrite all internal links to the survivor, keep the old URL out of the sitemap. Do *not* 301 into an unrelated page (Google treats irrelevant redirects as soft-404s).
- True deletion → **410 Gone** (faster de-indexing than 404), remove from sitemap, remove internal links.
- **`noindex`** where the page must stay for users but shouldn't be in the index.
- Never prune more than **~5% of indexable URLs in a 30-day window** without explicit confirmation; large batches make attribution impossible and are the classic way to nuke a site.
- Always snapshot content + GSC baseline before removal, and hold a 90-day reversal window.

Reported outcomes ("30–60% ranking improvement in 45–60 days", "847 posts pruned → recovery") are all agency case studies with no controls — **[MARKETING], do not surface as expectations.**

---

## 13. Programmatic SEO, done safely

The line Google draws is: **scaled content abuse** = "many pages generated for the primary purpose of manipulating search rankings and not helping users"; **doorway pages** = "substantially similar pages" targeting query variants. Programmatic generation itself is not prohibited — Google *encourages* programmatic meta descriptions, and template-driven pages backed by real data are how every large marketplace works.

### 13.1 A per-page gate that must pass before any pSEO URL is published
```
publish_allowed(page) = ALL of:
  1. unique_data_fields(page) >= 5           # real, differing values, not synonym-swaps
  2. unique_text_ratio >= 0.30               # shingle-based; ≥30% of 8-grams unique vs siblings
  3. max_sibling_cosine < 0.88               # embedding near-duplicate check
  4. has_real_demand: search volume > 0 OR GSC impressions > 0 for the target entity
  5. renders content without JS-blocking; word_count >= template_floor
  6. NOT a pure {keyword} x {city} cross-product with no location-specific data
  7. passes the "would a human bookmark this?" LLM rubric at >= 3/5
```
Rule 6 is the doorway-page killer. If you cannot say something *true and specific* about "plumbers in Akron" that differs from "plumbers in Toledo", the page is a doorway page by Google's own definition.

### 13.2 Rollout discipline
- Publish in **tranches** (e.g. 50 → 250 → 1,000 → rest), gated on indexation rate and GSC impressions per tranche.
- Track `indexed / submitted` per tranche. If <60% get indexed, **stop** — Google is telling you the pages are thin.
- Keep a separate sitemap per tranche so indexation is measurable.
- Maintain a browsable hub/IA so the pages aren't reachable only from search (doorway definition explicitly cites pages *"positioned closer to search results than a clear site hierarchy."*)

---

## 14. Multilingual content

**hreflang** (`developers.google.com/search/docs/specialty/international/localized-versions`):
- Three equivalent methods: `<link rel="alternate" hreflang>` in a **well-formed `<head>`**; `Link:` HTTP header; XML sitemap `xhtml:link`.
- HTTP header syntax: `Link: <url1>; rel="alternate"; hreflang="lang1", <url2>; rel="alternate"; hreflang="lang2"` — URLs in angle brackets, fully qualified.
- **Bidirectional requirement (exact wording):** *"If page X links to page Y, page Y must link back to page X. If this is not the case for all pages that use hreflang annotations, those annotations may be ignored or not interpreted correctly."*
- Each version must list **all** alternates **including itself**.
- Codes: language = **ISO 639-1**; region = **ISO 3166-1 Alpha-2**; script = ISO 15924 (`zh-Hant`, `zh-Hans`). *"You can't specify the country code by itself."* Reserved/invalid codes (`EU`, `UN`, `UK`) are ignored — note **`UK` is invalid; use `GB`**.
- `x-default` for the no-match fallback (typically a country/language selector).
- Sitemap `xhtml:link` children *"don't count towards the URL limit for sitemaps."*
- **No documented hard limit** on the number of alternates.

**Validator to ship** (hreflang errors are the highest-frequency, highest-impact international bug):
1. return-link reciprocity across the full cluster (build the graph, find non-mutual edges)
2. self-reference present
3. code validity against ISO 639-1 / 3166-1 alpha-2 / 15924, plus the `UK`/`EU`/`UN` blocklist
4. target URL returns 200 and is canonical to itself (hreflang + cross-canonical = conflict)
5. exactly one `x-default` per cluster (or zero)
6. no hreflang on noindexed pages
7. conflicting declarations across the three methods

A "75% of hreflang implementations contain errors" figure circulates in vendor content — **[MARKETING], unverified**.

**Translation quality:** QRG §4.6.5 names *"automated transformations like synonymizing, translating, or other obfuscation techniques"* as scaled content abuse when little value is provided. Google reportedly removed old robots.txt-blocking advice for auto-translated pages in a June 2025 doc update to align with the March 2024 spam policy **[secondary]**. Practical rule for our tool: **machine translation must be (a) reviewed, (b) locally keyword-researched per market — not translated keywords, and (c) accompanied by locale-specific facts** (currency, units, regulations, contact). Otherwise do not publish.

---

## 15. What actually moves rankings — 2025/2026 evidence

### 15.1 SEO A/B tests (SearchPilot — genuine split tests with confidence intervals; the best causal evidence publicly available)

**2025 round-up:**
| Change | Effect | Confidence | Vertical |
|---|---|---|---|
| Moved location/clinic name to the **start** of the title tag | **+8.5%** organic (≈ +0.7pp CTR) | 95% | Healthcare |
| Enriched thin nutrition pages with spec tables + related products | **≈ +20%** organic | significant | Ecommerce |
| Removed embedded YouTube video carousel from PLPs | **+4.1%** (brand PLPs); inconclusive on class PLPs | significant | Ecommerce |
| Removed embedded map from location pages | **−7%** organic | significant (negative) | Local |
| ALL-CAPS title tags | no change desktop, **+14% mobile** | mobile only | Travel |

**Title-tag test series (published 2026):**
| Change | Effect | Confidence |
|---|---|---|
| Question-based phrasing ("How Much Do Dental Implants Cost?" vs "Dental Implants Options and Pricing") | **+5%** organic sessions | — |
| Age-range qualifiers added | **+4%** organic sessions | 90% |
| **Dynamic** price in title | **+10%** | — |
| **Static** (stale) price in title | **−7%** | — |
| Destination airport codes (LHR/JFK) in title | **−16%** | 95% |
| "with Video" format label in title | negative | — |
| Extra/near-duplicate keywords in title | inconclusive | 95% |

**Read this carefully — it is the strongest available answer to "what moves rankings":**
- Title tags still produce **±5–17%** organic traffic swings. They are the highest-leverage, lowest-risk on-page lever and should be the agent's first action on any site.
- **Adding substantive content to thin pages** produced the largest positive (+20%).
- **Removing** elements can be strongly negative (−7% for a map). The agent must never strip page components as an "optimization" without a test.
- Effects are **site- and vertical-specific and sometimes device-specific.** Anything the agent believes globally is probably wrong for a given site → build SEO A/B testing in.

### 15.2 AI Overview citation study (Seer Interactive, published 2026)
Methodology: 214,056 candidate keywords across 30 industries × 9 intent shapes → 18,260 with ≥50 monthly searches → stratified sample of 8,500 → AI Overviews captured via **SerpAPI, May 7–13 2026** → 7,225 AIO winners, 6,354 pages crawled; two in-house validation rounds (105 PASS / 0 FAIL) + 6-day drift check.

Findings that contradict conventional on-page advice:
- **Reddit took 20.4% of all first-citation slots.** 14 traditional publishers combined: 1.94%. Eight major news outlets combined: 0.6%.
- Definitional winners are **bimodal**: ~25% under 250 words, ~25% at 1k–2k words. **5,000+ word guides took only 4.4%** of definitional slots.
- **Inverse** relationship between author-bio presence and AIO share (the cohort with 76% author-bio coverage had the *lowest* AIO share at 1.94%).
- FAQ/HowTo schema users underperformed Reddit (0% schema) by ~10×.
- Definitional winners had more internal links and cited ~2× more .gov/.edu sources.
- Mean sources per AIO = **11.4** (median 11, p90 16, max 32).
- AIOs trigger **~30× less** on high-volume head terms; volume-weighted trigger rate **16.24%** vs unweighted **85%** on their sample.

**Interpretation for the product:** don't let an "AI visibility" feature default to "add FAQ schema and an author bio and write 3,000 words." The measured correlations point the other way. Optimize for *quotable, self-contained, medium-length passages* and *citation of primary sources*.

### 15.3 AI Overview prevalence — the numbers disagree wildly, so report a range
| Source | Figure | Window |
|---|---|---|
| Semrush (10M+ keywords) | 6.49% (Jan 2025) → **24.61% peak (Jul 2025)** → **15.69% (Nov 2025)** | 2025 |
| Conductor (21.9M queries) | **25.11%** | Q1 2026 |
| BrightEdge | **~48%** of tracked queries | 2026 |
| Advanced Web Ranking (commercial keyword set) | up to **48%** | 2026 |
| Xponent21 (US) | **60.32%** | Apr 2026 |
| Seer (volume-weighted) | **16.24%** weighted / 85% unweighted | May 2026 |

All except Semrush and Seer reach us via aggregator blogs — **[MARKETING]**. The spread is explained by keyword-set composition (commercial trackers oversample head/commercial terms). **Never quote a single AIO prevalence number in-product; compute it from the user's own GSC/SERP data.**

### 15.4 Where correlation data is weak
- No credible 2025–2026 large-scale *on-page* correlation study exists from a first-party publisher. The "2.4 million search results, Q1 2026" and "information gain correlates 3.2× more than word count" figures circulate only in content-marketing posts with no methodology → **[MARKETING], unverified, do not ship.**
- Readability: no correlation with position (Ahrefs, Portent) **[STALE-RISK — pre-2025]**.
- Ahrefs' title-rewrite stat ("57% more likely to rewrite titles that are too long") is widely quoted but is from an older Ahrefs study **[STALE-RISK]**.

---

## 16. Prioritization: striking distance & CTR curves

### 16.1 Current CTR-by-position data

**First Page Sage** (published as the "2026" report; page states **Last Updated: May 28, 2025**; methodology described only as a "meta-analysis" — **no sample size or date range published**, so treat as a soft prior):

| Position | CTR |
|---|---|
| 1 | 39.8% |
| 2 | 18.7% |
| 3 | 10.2% |
| 4 | 7.2% |
| 5 | 5.1% |
| 6 | 4.4% |
| 7 | 3.0% |
| 8 | 2.1% |
| 9 | 1.9% |
| 10 | 1.6% |

Same source, SERP-feature split: **featured snippet present** → pos1 42.9%, pos2 27.4%; **AI Overview present** → pos1 38.9%, pos2 29.5%.

**Advanced Web Ranking** (`advancedwebranking.com/ctrstudy/`) — **the better source for a product**: built from **Google Search Console data across thousands of sites and millions of keywords**, recomputed **monthly**, top 20 positions, with **desktop/mobile/tablet segmentation** and country/category filters. Page states *"Last updated on July 2026."* The actual percentages live behind the interactive tool.

**AI Overview CTR impact — the figures in circulation (all [MARKETING] via aggregators, methodology varies):**
- Ahrefs (300k keywords, Mar 2024 vs Dec 2025): AIOs reduce clicks **−34.5%** on affected queries.
- Semrush: top organic result CTR drops **−34.5%** when an AIO appears.
- GrowthSRC (200k+ keywords): pos 1 CTR 28% → 19% (**−32%**); pos 2 20.83% → 12.60% (**−39%**).
- Semrush (17.8B queries, as reported): position 1 loses **−54.9%** of expected clicks.
- Seer: brands **cited** in an AIO see **+35%** organic CTR vs non-cited on the same query; non-cited sites see **−15% to −35%**.
- Semrush's own study reports zero-click rates for AIO keywords *falling* from 33.75% to 31.53% over 2025 — i.e. the picture is not monotonic.

**Product rule: do not hardcode any of these.** Compute the user's own CTR-by-position curve from their GSC data (that is exactly what AWR does), fall back to a bundled prior curve only when the site has <500 query-position observations, and split the prior by device.

### 16.2 Striking distance & opportunity scoring

Working filter: **average position 4–20** (some practitioners use 5–15 or 8–20). It's a filter, not a rule.

```
expected_ctr(p, device, has_aio) -> from site's own fitted curve, else prior
opportunity(page, query) =
      impressions_90d
    * ( expected_ctr(target_pos) - actual_ctr )       # CTR gap at achievable position
    * conversion_value(page)                          # from GA4, else 1.0
    * feasibility(page, query)                        # 0..1

target_pos = max(3, floor(current_pos) - improvement_headroom)
improvement_headroom = f(competitor_authority_gap, content_gap_score, internal_link_headroom)

feasibility = 0.5*content_gap_closable + 0.3*(1 - authority_gap_norm) + 0.2*link_headroom
```

Two distinct opportunity types the agent should separate in the UI:
- **Position opportunity** (position 4–20, CTR at/near expected) → *content + internal links work.*
- **CTR opportunity** (position 1–8 but CTR well **below** the fitted curve at that position) → *title/meta/schema work.* Cheap, fast, low risk. This is where an autonomous agent earns its keep on day 1.

Detect CTR anomalies with a residual test against the fitted curve, not a fixed threshold:
```
residual = actual_ctr - expected_ctr(position, device, aio_present)
flag if residual < -1.5 * sigma(residual | position bucket)  AND impressions_90d >= 300
```

---

## 17. Direct implications for our tool

**A. Build the GSC warehouse first, before any content feature — and ship the break register with it.**
16-month retention is a hard wall, and the historical record is poisoned by **four overlapping structural breaks**, not one: AI Mode folded into totals (2025-06-17, impressions up), the `&num=100` removal (from ~2025-09-10, impressions down — community-inferred, never confirmed by Google, and **absent in ~12% of properties**), the officially documented **impressions logging error inflating 2025-05-13 → 2026-04-27** (never backfilled), and its **correction rollout 2026-04-03 → 2026-04-27** (impressions down). Because the `num=100` drop sits *inside* the inflation window, its magnitude is confounded and must never be reported as measured. Ship the §9.2.4 break register as data, detect the Sept 2025 break **per-property** via changepoint test rather than assuming it, guard impressions/CTR/average-position comparisons across every register entry, and **default all cross-window decay signals to clicks — the one metric neither the `num=100` change nor the logging bug touched.** Snapshot `query × page × device × country × date` daily into local Postgres/DuckDB from install. Offer BigQuery bulk export as the large-site path (`searchdata_url_impression`), and the Search Analytics API (rowLimit 25,000, paginate with `startRow`, 1,200 QPM per site) as the default. Store `sum_top_position` semantics correctly: `avg_position = sum_top_position/impressions + 1`.

**B. Ship "CTR opportunity" as the flagship day-1 autonomous action.**
It is the only content lever with strong 2025–2026 causal evidence (SearchPilot: ±5–17% on title changes), it is fully reversible, it requires no SERP scraping, and it needs only GSC data the user already has. Rank pages by `impressions × (expected_ctr(pos) − actual_ctr)`, rewrite title + meta, hold a 21-day measurement window, auto-revert on regression.
*Caveat introduced by §9.2:* this scoring uses impressions, CTR **and** average position — all three are corrupted inside 2025-05-13 → 2026-04-27 and shifted again at the `num=100` and correction-rollout boundaries. **Fit CTR-by-position curves only on data after 2026-04-27**, and require both the baseline and measurement windows of any A/B or auto-revert test to sit entirely on one side of every register entry. Clicks-only regression tests are the fallback when a window cannot be kept clean.

**C. Treat SERP acquisition as a licensed, pluggable dependency — never scrape Google by default.**
Google's spam policy explicitly names *"scraping results for rank-checking without permission"* as machine-generated traffic and a ToS violation. Ship `SerpProvider` adapters (SerpAPI, DataForSEO, Oxylabs, Bright Data, ValueSERP) with user-supplied keys, plus a disabled-by-default self-scrape adapter carrying an explicit warning. For the $8/mo hosted tier this is the dominant marginal cost — budget it explicitly (SERP calls, not LLM tokens, will be the cost driver).

**D. Reimplement the Clearscope/Surfer/MarketMuse core, because it is cheap and the moat is elsewhere.**
The published math is trivial (MarketMuse: `Σ min(2, mentions(t))` over 50 topics = 0–100). Our version should be strictly better by using **BM25 with saturation** (so word-count and term-frequency targets fall out of one model), **entity coverage against Wikidata**, **embedding-cluster subtopic gaps**, and an **information-gain** score. Undercutting $129–$399/mo tools at $8/mo with a better model is a real wedge. Embedding cost is negligible: ~$0.12 to embed a 5,000-page site with `text-embedding-3-small` at $0.02/1M tokens; ship a self-hosted default (Qwen3-Embedding-0.6B / EmbeddingGemma / Arctic-embed) so the OSS tier has zero API dependency.

**E. Encode the QRG and spam policies as *hard gates*, not scores.**
Specifically:
- YMYL classifier (4 buckets incl. the 2025 **Government/Civics & Society** bucket) → autonomous publishing **disabled**; human review required.
- Pre-publish scan for LLM boilerplate ("As an AI…"), because the QRG tells raters to look for exactly that.
- Scaled-content circuit breaker: cap autonomous new-page publishing per site per week; require `unique_text_ratio ≥ 0.30` and `max_sibling_cosine < 0.88`; require ≥5 genuinely-varying data fields for template pages.
- Refuse `{service} × {city}` cross-products with no location-specific data — that is Google's own doorway-page definition.

**F. Prefer refresh > differentiate > consolidate > prune, and gate destructive actions.**
Google: *"Deleting content is a last resort."* Cap prune/consolidate at ~5% of indexable URLs per 30 days; snapshot content + GSC baseline; 90-day reversal window; 301 for consolidation, 410 for true deletion, never a 301 into an unrelated page.

**G. Internal linking is the highest-ROI *structural* automation — but only with guardrails.**
Paragraph-level embeddings + cosine band (recalibrated per model, ~0.72–0.92) + PageRank delta + anchor-diversity cap (no anchor >35% for a target) + max 3–5 new links per 1,000 words + atomic revert log. Orphan/near-orphan fixing is the single cleanest "obviously correct" autonomous action available.

**H. Build SEO A/B testing into the core, not as a v3 feature.**
SearchPilot's results show the *same* change (all-caps titles, embedded maps, video carousels) produces opposite outcomes across sites and devices. An autonomous agent that can't measure its own causal effect will drift. Minimum viable: bucket a page family by hash into control/variant, apply the change to variant only, compare click trajectories with a difference-in-differences model over 21–28 days. This is also the honest answer to "how do I know your AI didn't tank my site."

**I. Do not ship the industry's unverified statistics.**
"Topical clusters hold rankings 2.5× longer", "23% visibility gain from topical authority", "73% of queries are mixed intent", "75% of hreflang implementations are broken" — all agency blog claims. Compute the user's own numbers instead; it's both more honest and a better product.

**J. Model E-E-A-T as an artifact checklist, never as a score.**
Google's own starter guide lists "E-E-A-T as a ranking factor" under things not to focus on. Ship a QRG-mapped checklist (byline → author page → `Person` schema → About/Contact/Customer Service → citations → first-hand evidence → AI disclosure) with each item citing its QRG section. That's defensible; an "E-E-A-T score out of 100" is not.

**K. Design headings/word-count features as editorial advisories.**
Google explicitly says heading order and content length don't matter for Search. Present these as accessibility/UX/readability, and put the *real* structural value into **passage extractability** for AI Mode fan-out: one question-shaped `h2` per sub-intent, a self-contained 40–60 word answer under it, evidence below.

**L. Instrument the AI-surface reporting gap.**
GSC's generative-AI performance reports launched **June 3, 2026** (staged rollout to a subset of properties) covering AI Overviews, AI Mode, and Discover, with **impressions, pages, countries, devices, and date granularity — but no click data reported at launch**, and no confirmed API/BigQuery exposure. Build the reporting layer so AI-surface impressions are a separate series that degrades gracefully when absent, and warn users that AI-surface impressions already flow into the *overall* Performance report totals (so "impressions up, clicks flat" may be an AI-surface artifact, not decay).

---

## 18. Open questions / things to verify before building

1. **Are the June 2026 GSC generative-AI reports exposed via the Search Analytics API or BigQuery export?** The launch coverage says impressions/pages/countries/devices in the UI only. If API-exposed, what is the dimension or `searchAppearance` value? *(Blocking for the AI-visibility module.)*
2. **Official Google Cloud Natural Language API pricing 2026.** The pricing page did not render; the "$1.00 / 1,000 units, 5,000 free" figure is from secondary aggregators and may be stale. Also verify whether `analyzeEntities` is being sunset in favour of Vertex/Gemini.
3. **Is there a documented daily row ceiling for Search Analytics** beyond the 25,000-per-request `rowLimit` and 1,200 QPM? The commonly cited "50,000 rows/search type/site/day" is not on the official limits page.
4. **Exact list of `is_[search_appearance_type]` boolean columns** in `searchdata_url_impression` — the docs only give examples (`is_amp_top_stories`, `is_job_listing`). Need to know whether an AI-Overview flag exists.
5. **Pixel-width thresholds for title truncation in 2026 SERPs** (desktop and mobile), post-AI-Mode layout changes. All current numbers are community measurements.
6. **Does Clearscope or MarketMuse/Siteimprove expose a public API?** Neither pricing/help page documents one. Relevant only for a migration-import feature.
7. **Whether `HowTo` / `FAQ` rich results are still eligible** in 2026 — Seer's data shows FAQ/HowTo schema users underperforming, which is consistent with deprecation. Confirm against the current structured-data docs before the agent emits them.
8. **Calibration data for the intent classifier weights in §4.2** — these are priors, not fitted. Need a labelled set.
9. **`&num=100` remains officially unacknowledged.** Confirmed as of Sep 2026: no entry on the Data anomalies page, no normalization, no backfill, and the parameter is still ignored. The only Google statement is *"The use of this URL parameter is not something we formally support."* The open item is now narrower: **what is the desktop-vs-mobile split of the impression loss?** No published figure exists — ⚠️ unverified — must be confirmed during implementation (derive it per-property from the user's own `device`-dimension GSC data; do not hard-code).
10. **Whether "AI Mode" traffic is separable in GA4** (referrer/landing-page patterns) so the tool can attribute AI-surface clicks.
11. **Can the `num=100` effect ever be de-confounded from the 2025-05-13 → 2026-04-27 impressions logging inflation?** Since Google did not backfill, probably not from GSC alone. If a per-property effect size is needed, it must come from an external control series (e.g. rank-tracker or server-log impression proxies) — ⚠️ unverified — must be confirmed during implementation.
12. **Exact per-property detection parameters for the 2025-09-10 break** (changepoint algorithm, minimum impression volume, effect-size floor below which a property is classed as "unaffected"). ~12% of properties show no break at all, so the detector needs a calibrated null case — ⚠️ unverified — must be confirmed during implementation.

---

## 19. Sources

All accessed **2026-09-01** unless otherwise noted.

**Google primary documentation**
- Title links best practices — https://developers.google.com/search/docs/appearance/title-link
- Snippets / meta descriptions — https://developers.google.com/search/docs/appearance/snippet
- SEO Starter Guide (last updated 2025-12-10 UTC) — https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Creating helpful, reliable, people-first content (last updated 2025-12-10 UTC) — https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- A Guide to Google Search Ranking Systems (helpful content system listed under Retired) — https://developers.google.com/search/docs/appearance/ranking-systems-guide
- Google Search's Core Updates (last updated 2025-12-10 UTC) — https://developers.google.com/search/docs/appearance/core-updates
- Spam Policies for Google Web Search (last updated 2026-08-28 UTC) — https://developers.google.com/search/docs/essentials/spam-policies
- Localized versions / hreflang — https://developers.google.com/search/docs/specialty/international/localized-versions
- Search Analytics API `query` reference — https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Console API usage limits — https://developers.google.com/webmaster-tools/limits
- Search Console BigQuery bulk data export — https://support.google.com/webmasters/answer/12917675
- BigQuery export table reference — https://support.google.com/webmasters/answer/12917991
- Google Search ranking updates status history (official update dates) — https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history
- Introducing Search Generative AI performance reports in Search Console (June 2026) — https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports *(page body did not render; details corroborated via ppc.land below)*
- **Search Quality Rater General Guidelines, September 11, 2025** — https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf *(downloaded and text-extracted; quotes in §1.7 are verbatim from §2.3, §3.4, §4.6.5, §4.6.6)*
- Google Patents US11354342B2 "Contextual estimation of link information gain" — https://patents.google.com/patent/US11354342B2/en
- **Data anomalies in Search Console** (the *only* official record of a Search Console impressions break; carries the May 13 2025 → April 27 2026 logging-error entry, and carries **no** `num=100` entry) — https://support.google.com/webmasters/answer/6211453 · mirror: https://developers.google.com/search/docs/monitor-debug/search-console-data-anomalies
- AI Mode data in Search Console performance reports (folded into totals, 2025-06-17) — https://support.google.com/webmasters/answer/9679690

**Vendor primary (pricing/algorithm pages)**
- Clearscope pricing — https://www.clearscope.io/pricing
- Surfer SEO pricing — https://surferseo.com/pricing/
- MarketMuse: What is Content Score? — https://help.marketmuse.com/support/solutions/articles/80001167786-what-is-content-score-
- OpenAI API pricing (embeddings) — https://developers.openai.com/api/docs/pricing
- Gemini Developer API pricing (embeddings) — https://ai.google.dev/gemini-api/docs/pricing

**Studies & tests (semi-primary — publisher of their own data)**
- SearchPilot, "A Look Back at the Most Surprising Tests of 2025" — https://www.searchpilot.com/resources/case-studies/a-look-back-at-the-most-surprising-tests-of-2025
- SearchPilot, "Expanding Your Title Tag Testing Strategy — Why Title Tags Still Matter in 2026" — https://www.searchpilot.com/resources/case-studies/expanding-your-title-tag-testing-strategy
- Seer Interactive, "What It Takes To Rank In Google's AI Overviews in 2026 Isn't What You Think" (8,500-keyword sample, SerpAPI May 7–13 2026) — https://www.seerinteractive.com/insights/what-it-takes-to-rank-in-googles-ai-overviews-in-2026-is-not-what-you-think
- Semrush AI Overviews Study (10M+ keywords, Jan–Nov 2025) — https://www.semrush.com/blog/semrush-ai-overviews-study/
- Search Engine Land / John McAlpin, "Google changed 76% of title tags in Q1 2025" (~30,000 keywords) — https://searchengineland.com/google-changed-76-of-title-tags-in-q1-2025-heres-what-that-means-454847
- Zyppy, Google Title Rewrites (80,959 titles / 2,370 sites, **Q1 2022 — STALE-RISK**) — https://zyppy.com/seo/google-title-rewrites/
- First Page Sage, Google CTR by ranking position (page states Last Updated May 28, 2025; no methodology published) — https://firstpagesage.com/reports/google-click-through-rates-ctrs-by-ranking-position/
- Advanced Web Ranking CTR study (GSC-derived, monthly, top 20, device split; "Last updated on July 2026") — https://www.advancedwebranking.com/ctrstudy/
- ppc.land, "Google finally gives Search Console its own generative AI visibility reports" (June 3, 2026 launch details) — https://ppc.land/google-finally-gives-search-console-its-own-generative-ai-visibility-reports/

**Secondary / marketing (flagged in text)**
- LOCOMOTIVE Agency / Tyler Gargula on the `&num=100` removal (n=319 properties; **87.7% declined → ~12.3% showed no decline**; 77.6% lost unique ranking terms) — https://locomotive.agency/blog/google-removes-num100-parameter-what-this-means-for-your-website/
- Brodie Clark, "The Great Decoupling / num=100" (dates the GSC impression drop to 2025-09-10) — https://brodieclark.com/the-great-decoupling-num100/
- Search Engine Land, `num=100` impact data (*"Fewer queries now show on page 3+…"*) — https://searchengineland.com/google-num100-impact-data-462231
- Search Engine Land, Search Console bug inflated impression counts (May 13 2025 → April 27 2026) — https://searchengineland.com/google-search-console-bug-inflated-impression-counts-473530
- Search Engine Roundtable, Google fixes Search Console data-logging issue (no backfill; Mueller confirmation) — https://www.seroundtable.com/google-search-console-fix-data-logging-issue-41260.html
- Search Engine Land content-decay guide — https://searchengineland.com/guide/content-decay
- Niko Alho, "Automate internal linking with embeddings, not keywords" (implementation detail, cosine band 0.78–0.85) — https://nikoalho.fi/writing/automating-internal-linking/
- Ahrefs SEO statistics compilation — https://ahrefs.com/blog/seo-statistics/
- Ahrefs "also rank for" study (top page ranks for ~1,000 other keywords) — https://ahrefs.com/blog/also-rank-for-study/
- iPullRank, "How AI Mode Works" (query fan-out, passage retrieval) — https://ipullrank.com/how-ai-mode-works
- Modal, "Top embedding models on the MTEB leaderboard" — https://modal.com/blog/mteb-leaderboard-article

---

## 20. Fact-check log

External fact-check pass completed **2026-09-01**. Six load-bearing claims were submitted for verification; five returned CONFIRMED and one returned PARTIALLY_TRUE. All corrections have been applied **inline** at every point of use (§0.3, §9.2, §17-A, §17-B, §18.9, §19), not merely recorded here.

| # | Claim as originally written | Verdict | Action taken |
|---|---|---|---|
| 1 | Helpful Content system is retired as a standalone system; listed under "Retired systems"; became part of core ranking March 2024; no separate HCU to detect or recover from in 2026. | **CONFIRMED** | No change (§0.1, §1.4). |
| 2 | Google's spam policies classify "machine-generated traffic" — incl. *"scraping results for rank-checking without permission"* — as a ToS violation, so direct SERP scraping is a policy violation, not just a technical challenge. | **CONFIRMED** | No change (§1.6, §4.2, §17-C). |
| 3 | GSC retains 16 months; Search Analytics API `rowLimit` max 25,000 (default 1,000, paginate via `startRow`); quota 1,200 QPM per site and per user (40,000 QPM / 30,000,000 QPD per project); URL Inspection 600 QPM / 2,000 QPD per site. | **CONFIRMED** | No change (§9.1). |
| 4 | *"Google removed the `&num=100` parameter around September 10–14, 2025, stripping bot-inflated impressions from GSC: impressions fell sharply (especially desktop), clicks stayed flat, average position improved. **This is a structural break in every GSC property's history.**"* | **PARTIALLY_TRUE** | See detailed correction below. §9.2 rewritten and expanded into a four-entry break register; §0.3, §17-A, §17-B and §18.9 rewritten. |
| 5 | The SEO Starter Guide lists heading order/quantity, min/max content length, keyword stuffing, keywords in URLs and "E-E-A-T as a ranking factor" among things not to focus on, and says heading semantic order *"doesn't matter"* for Search. | **CONFIRMED** | No change (§1.3, §8, §17-J, §17-K). |
| 6 | Current QRG is the *General Guidelines, September 11, 2025* edition; §4.6.5 = Lowest for scaled content *"no matter how they are created"* and *"when you strongly suspect scaled content abuse"*; §4.6.6 = *"the use of Generative AI tools alone does not determine the level of effort or Page Quality rating."* | **CONFIRMED** | No change (§1.7). |

### Detail on claim #4 (PARTIALLY_TRUE)

**What held up:** the mechanism, the direction of effects (impressions ↓, clicks flat, average position improves), the rough timing window, the directional desktop skew, and the fact that `num=100` is still ignored in 2026 with no reversal.

**What was wrong and is now corrected inline:**
1. **"Structural break in *every* GSC property" — REFUTED.** LOCOMOTIVE/Tyler Gargula (n=319) found 87.7% declined, so **~12.3% of properties show no decline**. Magnitude is strongly size-dependent. Corrected to a **per-property detection** requirement (§9.2.1, §9.2.4, §17-A).
2. **The "official" framing was wrong.** Google **never confirmed or documented** this. No entry exists on the Data anomalies page, and one would still be inside its retention window if it had existed. Reframed as **community-inferred, no primary confirmation** (§9.2.1, §18.9).
3. **Leading edge is 2025-09-10**, not 09-12 (Brodie Clark). Corrected.
4. **Device-level magnitude removed.** No published desktop-vs-mobile split exists; marked ⚠️ unverified and the hard-coded "desktop especially" magnitude claim was struck (§9.2.1, §18.9).
5. **It is not the only break, and not the one Google documents.** Added the officially documented **impressions logging error, 2025-05-13 → 2026-04-27** (inflated impressions/CTR/avg position, **clicks unaffected**), fixed **going forward only** with **no backfill**, plus its **2026-04-03 → 2026-04-27 correction rollout**, plus the **2025-06-17 AI Mode fold-in** (impressions step-**up**) (§9.2.2, §9.2.3, §9.2.4).
6. **Confounding acknowledged.** The Sept 2025 drop sits *inside* the inflation window, so the `num=100` magnitude cannot be cleanly attributed. Added as an explicit prohibition on reporting it as measured (§9.2.2, §18.11).
7. **Metric guidance changed.** Guard on impressions/position/CTR; **default to clicks** for cross-window comparison, since clicks are unaffected by both events. Applied to §0.3, §9.2.4, §17-A, and as a new caveat on the flagship CTR-opportunity recommendation in §17-B (CTR curves must be fitted post-2026-04-27).

**Sources for claim #4:**
- https://support.google.com/webmasters/answer/6211453?hl=en
- https://developers.google.com/search/docs/monitor-debug/search-console-data-anomalies
- https://support.google.com/webmasters/answer/9679690
- https://locomotive.agency/blog/google-removes-num100-parameter-what-this-means-for-your-website/
- https://brodieclark.com/the-great-decoupling-num100/
- https://searchengineland.com/google-num100-impact-data-462231
- https://searchengineland.com/google-search-console-bug-inflated-impression-counts-473530
- https://www.seroundtable.com/google-search-console-fix-data-logging-issue-41260.html
