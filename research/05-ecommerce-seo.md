# 05 — E-commerce SEO, End-to-End (Implementation Dossier)

**Research date:** 2026-08-31
**Purpose:** Everything needed to build an autonomous SEO agent that can *analyze and execute* e-commerce SEO work against Shopify / WooCommerce / Magento-Adobe Commerce / BigCommerce, plus Google's Search + Merchant Center surfaces.
**Source bias:** Google Search Central + Google Merchant Center Help + platform developer docs (primary). Marketing-blog claims are explicitly labelled `[BLOG-ONLY]`.
**Staleness flags:** anything I could only verify from 2024 or earlier is labelled `[≤2024 — POSSIBLY STALE]`.

---

## 0. Executive framing: the three data planes of e-commerce SEO

An e-commerce SEO agent must operate on **three separate planes**, which most tools conflate:

| Plane | Owner | Write mechanism | Feeds which surfaces |
|---|---|---|---|
| **A. HTML/On-page plane** | The CMS/theme | Platform API (Shopify Admin GraphQL, WP REST, Magento REST/GraphQL, BigCommerce v3) + theme file edits | Classic organic (blue links), rich results (product snippet), AI Overviews/AI Mode grounding |
| **B. Crawl-control plane** | robots.txt, meta robots, canonical, status codes, sitemaps | Theme templates (`robots.txt.liquid`), server config, sitemap generator | Crawl budget, index bloat, discovery |
| **C. Product-data plane** | Google Merchant Center | Merchant API v1 (`merchantapi.googleapis.com`), feed file, or **automated feeds / website crawl** | Shopping tab, Popular Products, Shopping Knowledge Panel, Google Images/Lens shopping, free listings, AI Mode shopping, UCP agentic checkout |

**Key architectural consequence:** Plane C is not optional for e-commerce, and Plane C can be driven *from* Plane A. Merchant Center's "automated feeds / website crawl" reads Product structured data off the site. So a single high-quality structured-data fix propagates to both organic rich results and the Shopping/free-listings surfaces. **This is the single highest-leverage automation in e-commerce SEO.**

---

## 1. Product structured data in 2026 — the authoritative spec

Google splits Product structured data into **two distinct "experiences"** with different requirements and different Search Console reports. Getting this wrong is the #1 cause of "we added schema and nothing happened."

### 1.1 Product snippet vs Merchant listing

Source: `developers.google.com/search/docs/appearance/structured-data/product` (last updated **2025-12-10**)

| | **Product snippet** | **Merchant listing** |
|---|---|---|
| Intended page type | Pages where the product **cannot** be purchased (editorial reviews, roundups, comparison pages) | Pages where a shopper **can purchase** the product |
| Google's wording | "more options for specifying review information, like pros and cons on an editorial product review page" | "more options for specifying detailed product information, like apparel sizing, shipping details, and return policy information" |
| Required props | `name` **+ at least one of** `review`, `aggregateRating`, `offers` | `name` + `image` + `offers` (with price + currency) |
| Price > 0 required? | No | **Yes** — price must be greater than zero |
| Exclusive features | `positiveNotes` / `negativeNotes` (pros & cons) | Apparel sizing, `shippingDetails`, `hasMerchantReturnPolicy`, loyalty pricing, strikethrough price, price drop |
| GSC search-appearance value | `PRODUCT_SNIPPETS` | `MERCHANT_LISTINGS` |
| Surfaces | Blue-link snippet enhancement (stars, price, availability) | Popular Products, Shopping Knowledge Panel, Google Images/Lens shopping experiences |

A page can be eligible for **both** simultaneously.

> **Agent rule:** classify every URL as `PDP-purchasable` / `editorial-review` / `category` / `other` *before* generating schema. Emitting merchant-listing markup on a non-purchasable page is a policy mismatch; emitting product-snippet-only markup on a PDP silently forfeits Popular Products eligibility.

### 1.2 Merchant listing — full property matrix

Source: `developers.google.com/search/docs/appearance/structured-data/merchant-listing`

**REQUIRED (Product):**
- `name` (Text)
- `image` (repeated URL or `ImageObject`) — **minimum 50,000 pixels** (width × height); recommended aspect ratios **16:9, 4:3, 1:1**; supply multiple images
- `offers` (`Offer` or `AggregateOffer`)

**REQUIRED (inside Offer) — one of:**
- `offers.price` (Number) **+** `offers.priceCurrency` (3-letter ISO 4217), **or**
- `offers.priceSpecification` → `UnitPriceSpecification` with `price` + `priceCurrency`

> Price must be a **plain number string**: `"19.99"`. Never `"$19.99"`, never `"1,350"` (comma is a decimal separator in some locales → Google may read 1.350).

**RECOMMENDED (Product):**
`aggregateRating`, `brand.name` (max one brand), `category`, `color`, `description` ("strongly recommended"), `gtin` / `gtin8` / `gtin12` / `gtin13` / `gtin14` / `isbn`, `mpn`, `sku`, `size` (Text or `SizeSpecification`), `material`, `pattern`, `audience` (`PeopleAudience`), `review`, `hasCertification` (up to **10** `Certification` objects), `subjectOf` (`3DModel` → glTF), `inProductGroupWithID`, `isVariantOf`.

**RECOMMENDED (Offer):**
- `availability` — enum, exact values: `BackOrder`, `Discontinued`, `InStock`, `InStoreOnly`, `LimitedAvailability`, `OnlineOnly`, `OutOfStock`, `PreOrder`, `PreSale`, `SoldOut`
- `itemCondition` — `NewCondition`, `RefurbishedCondition`, `UsedCondition`
- `priceValidUntil` (Date, ISO 8601) — ⚠️ "Your listing may not display if the `priceValidUntil` property indicates a past date." **This is a top-5 silent killer. Automate the rolling refresh.**
- `validFrom` / `validThrough` (sale window, ISO 8601)
- `url`, `shippingDetails`, `hasMerchantReturnPolicy`, `checkoutPageURLTemplate`

**`UnitPriceSpecification` sub-properties (this is where 2025's new pricing features live):**
- Required: `price`, `priceCurrency`
- `priceType: "https://schema.org/StrikethroughPrice"` → marks the **crossed-out / was-price**. Use *only* for the strikethrough, never for the active price.
- `validForMemberTier` (→ `MemberProgramTier`) → **member/loyalty price**
- `membershipPointsEarned` (Number) → loyalty points (documented as beta)
- `referenceQuantity` (`QuantitativeValue` with `value` + `unitCode`) → unit pricing (e.g. price per 100g)
- `validFrom` / `validThrough`

**Three legal pricing shapes** (do not mix incorrectly):
1. **Active price** — no `priceType`, no `validForMemberTier`
2. **Strikethrough/sale price** — `priceType = StrikethroughPrice`
3. **Member price** — `validForMemberTier` set; **cannot be combined with `priceType`**

**`OfferShippingDetails`:**
- `shippingRate` → `MonetaryAmount` (`value`, `currency`)
- `shippingDestination` → `DefinedRegion` (`addressCountry`, optional `addressRegion`, postal ranges)
- `deliveryTime` → `ShippingDeliveryTime` with `handlingTime` and `transitTime`, each a `QuantitativeValue` with `minValue`, `maxValue`, `unitCode: "DAY"`

**Eligibility constraints (quote-level):**
- "Only pages where a shopper can purchase a product are eligible"
- Page must "focus on a single product (or multiple variants of the same product)"
- **Distinct URL per currency** required for multi-currency offers
- Server-rendered markup is **strongly recommended** (not strictly required) for Merchant Center automatic item updates and for Shopping crawl reliability; client-rendered JSON-LD is officially supported for organic rich results (see §5.4 for the full, corrected picture)
- Content restrictions: no firearms, recreational drugs, tobacco/vaping, gambling products

### 1.3 Variants: `ProductGroup`

Source: `developers.google.com/search/docs/appearance/structured-data/product-variants` (last updated **2026-05-20**)

- `ProductGroup` required: `name`
- `ProductGroup` recommended: `productGroupID` (parent SKU), `variesBy`, `hasVariant`, `aggregateRating`, `brand`, `description`, `review`, `url`, `hasAdultConsideration`
- `variesBy` values must be **full schema.org URLs**, and only these are supported:
  `https://schema.org/color`, `/size`, `/suggestedAge`, `/suggestedGender`, `/material`, `/pattern`
- Each variant `Product` needs a **unique `sku` or `gtin`** and `inProductGroupWithID` (or `isVariantOf`)

**Two topologies:**

| Topology | Rule |
|---|---|
| **Single-page** (all variants on one URL, selected via `?size=small&color=green`) | "There must be only one distinct canonical URL for the overall `ProductGroup`." Either nest variants under `hasVariant`, or emit separate `Product` nodes with `isVariantOf` pointing at the group. |
| **Multi-page** (each variant its own URL) | "The `ProductGroup` definition needs to be repeated on each of the variant pages." Each page carries full markup for its own variant plus URL-only stubs for siblings. |

**Google's canonical guidance for variant URLs** (from the ecommerce URL-structure doc, updated **2025-12-10**):
- If variants are identified by **optional query parameters**, "use the URL with the query parameter omitted as the canonical URL."
- If variants have genuinely unique URLs, "include the canonical product URL on all variant pages using a `<link rel="canonical">` tag."

> ⚠️ **Conflict to encode in the agent:** Google simultaneously says (a) canonicalize variants to the parent, and (b) merchant listings need a *distinct URL per currency* and variants should each be reachable at a distinct URL. Resolution: **one canonical PDP per product**; variants selectable via query params on that canonical URL; separate indexable URLs only when the variant has independent search demand (e.g. "iPhone 17 Pro 256GB Titanium" gets searched, "Blue T-shirt size M" does not).

### 1.4 Loyalty program — `MemberProgram` (2025 feature)

Source: `developers.google.com/search/docs/appearance/structured-data/loyalty-program` (last updated **2025-12-10**)

- **Availability:** Australia, Brazil, Canada, France, Germany, Mexico, UK, US — desktop and mobile. **Not** flagged as beta.
- Must be nested under **`Organization`** structured data (typically on a sitewide/home/about page), *not* on the PDP.
- `MemberProgram` **required:** `name`, `description`, `hasTiers` (≥1 `MemberProgramTier`)
- `MemberProgram` recommended: `url` (enrollment page; defaults to the containing page's URL)
- `MemberProgramTier` **required:** `name`, `hasTierBenefit` — only two enum values supported:
  - `https://schema.org/TierBenefitLoyaltyPoints`
  - `https://schema.org/TierBenefitLoyaltyPrice`
- `MemberProgramTier` recommended: `@id` (stable identifier — **this is what the Offer references**), `url`, `hasTierRequirement` (`CreditCard` | `MonetaryAmount` | `UnitPriceSpecification` | Text), `membershipPointsEarned` (`QuantitativeValue`)
- **Wiring:** on the PDP's `Offer`, add a second `UnitPriceSpecification` with `validForMemberTier: {"@id": "<tier @id>"}`.

### 1.5 Return policy — `MerchantReturnPolicy`

Source: `developers.google.com/search/docs/appearance/structured-data/return-policy` (last updated **2025-12-10**)

Two placements: **Organization-level** (sitewide default, richest) and **Offer-level** (subset of properties, overrides per-product).

**Organization-level required — one of two options:**
- **Option A:** `applicableCountry` (ISO 3166-1 alpha-2, up to **50** countries) + `returnPolicyCategory` ∈ {`MerchantReturnFiniteReturnWindow`, `MerchantReturnNotPermitted`, `MerchantReturnUnlimitedWindow`}
- **Option B:** `merchantReturnLink` (URL of the return-policy page)

**Recommended when finite/unlimited window:**
`merchantReturnDays` (Integer — **required** when `MerchantReturnFiniteReturnWindow`), `returnFees` ∈ {`FreeReturn`, `ReturnFeesCustomerResponsibility`, `ReturnShippingFees`}, `returnMethod` ∈ {`ReturnAtKiosk`, `ReturnByMail`, `ReturnInStore`}, `returnShippingFeesAmount` (`MonetaryAmount`, required when `returnFees = ReturnShippingFees`), `returnLabelSource` ∈ {`ReturnLabelCustomerResponsibility`, `ReturnLabelDownloadAndPrint`, `ReturnLabelInBox`}, `returnPolicyCountry`, `itemCondition` ∈ {`DamagedCondition`, `NewCondition`, `RefurbishedCondition`, `UsedCondition`}, `refundType` ∈ {`ExchangeRefund`, `FullRefund`, `StoreCreditRefund`}, `restockingFee` (`MonetaryAmount` or Number-as-percent).

**Reason-specific overrides:** `customerRemorseReturnFees`, `customerRemorseReturnLabelSource`, `customerRemorseReturnShippingFeesAmount`, `itemDefectReturnFees`, `itemDefectReturnLabelSource`, `itemDefectReturnShippingFeesAmount`.

### 1.6 Reviews — schema + the policy trap

Source: `developers.google.com/search/docs/appearance/structured-data/review-snippet` (last updated **2026-07-24**)

**Supported types:** `Book`, `Course`, `Event`, `LocalBusiness`, `Movie`, **`Product`**, `Recipe`, `SoftwareApplication`, plus `CreativeWorkSeason`, `CreativeWorkSeries`, `Episode`, `Game`, `MediaObject`, `MusicPlaylist`, `MusicRecording`, `Organization`.

**`Review` required:** `author` (Person or Organization), `itemReviewed` (unless nested), `reviewRating.ratingValue`
**`AggregateRating` required:** `itemReviewed` (unless nested), `ratingValue`, **and at least one of** `ratingCount` or `reviewCount`
Recommended: `bestRating` (defaults 5), `worstRating` (defaults 1), `datePublished`, `reviewBody`.

**The self-serving-review rule — exact wording:**
> "If the entity that's being reviewed controls the reviews about itself, their pages that use `LocalBusiness` or any other type of `Organization` structured data are ineligible for star review feature."

🔑 **Critical nuance for e-commerce:** this restriction is scoped to **`LocalBusiness` and `Organization` only**. A merchant marking up **customer reviews of a Product they sell** with `Product` → `aggregateRating` is *permitted* and is the standard, sanctioned pattern. Many SEO tools get this backwards and suppress legitimate product review markup.

**Hard guidelines the agent must enforce:**
- "Make sure the review content you mark up are readily available to users from the marked-up page." → If reviews are loaded in a JS widget the crawler never renders, or paginated behind AJAX, the markup is invalid. **Detect and flag.**
- "Don't aggregate reviews or ratings from other websites."
- No fake or incentivized reviews without clear disclosure.
- Review count in markup must match visible count.

### 1.7 Product snippet extras — pros & cons

- `positiveNotes` / `negativeNotes` on the nested `Review`, each an `ItemList` of `ListItem` with `name` (the statement) + `position` (Integer).
- "You must provide at least two statements about the product in any combination of positive or negative statements."
- **Editorial review pages only** — not merchant PDPs.

---

## 2. Faceted navigation — Google's current guidance

Google reordered and sharpened its faceted-navigation advice, and a lot of legacy SEO advice mis-states it. But it is **not a flat method ranking** — it is a **two-branch decision tree**, and getting that wrong will misconfigure the whole facet-governance engine.

Source: `developers.google.com/crawling/docs/faceted-navigation` (**Google Crawling Infrastructure** docs).

> **Provenance correction (important):** this is **not new December-2025 guidance.** The substance was published **2024-12-17** as part of the "Crawling December" series, originally at `/search/docs/crawling-indexing/crawling-managing-faceted-navigation` (now 301s to `/crawling/docs/faceted-navigation`). The **2025-12-18 "Last updated" stamp is a documentation-site migration, not a policy change** — the crawling changelog entry for that date reads: "Migrated more documentation to the Google crawling documentation site… The functionality hasn't changed, only the location of the documentation and some minor wording changes." No 2026 changelog entry touches faceted navigation. The guidance is ~20 months old and still current as of 2026-09-01.

### 2.1 The actual structure: branch first, then choose a method

Google's framing, verbatim: *"we recommend dealing with these URLs one of the following ways: If you don't need the faceted navigation URLs potentially indexed, prevent crawling of these URLs. If you need the faceted navigation URLs potentially indexed, ensure that the URLs follow our best practices."* The crawl-prevention branch is explicitly gated on *"If you want to save server resources and you don't need your faceted navigation URLs to show up in Google Search or other Google products."*

**Branch A — facet should NOT be indexed → prevent crawling.** Google gives **two co-equal top-tier methods** ("one of the following ways"):

| Method | Google's position |
|---|---|
| **robots.txt `disallow`** on facet parameters | Listed first. Stops crawl at the source. |
| **URL fragments** (`https://example.com/items.shtm#products=fish&color=blue`) | Co-equal, not a fallback: "Google Search generally doesn't support URL fragments in crawling and indexing." |

Then, in a **single lower tier** (one sentence, both methods together — Google does **not** rank these two against each other):

> "Other ways to signal a preference of which faceted navigation URLs (not) to crawl is using `rel="canonical"` link element and the `rel="nofollow"` anchor attribute. However, these methods are generally less effective in the long term than the previously mentioned methods."

- `rel="canonical"` — "may, over time, decrease the crawl volume of non-canonical versions."
- `rel="nofollow"` — "may be beneficial, however … every anchor pointing to a specific URL must have the `rel="nofollow"` attribute in order for it to be effective" (brittle; one missed link defeats it).

Google's own robots.txt example — note it is **scoped to a single user-agent and carries an `allow` carve-out**:
```
user-agent: Googlebot
disallow: /*?*products=
disallow: /*?*color=
disallow: /*?*size=
allow: /*?products=all$
```

**Branch B — facet SHOULD be indexable → keep it crawlable and follow URL best practices** (see §2.2). Google's own example of a valuable facet is category + taste, e.g. "sour gummy candies."

**Rationale quote:** crawling faceted URLs "tends to cost sites large amounts of computing resources."

> 🔑 **The critical framing our engine must encode:** "less effective" is scoped **only to reducing crawl volume**. robots.txt and `rel=canonical` are **not substitutes for the same goal**. robots.txt prevents crawling and thereby forfeits indexing *and* signal consolidation; `rel=canonical` is the correct tool when you *do* want the facet crawlable but deduplicated. **Defaulting globally to robots.txt because it is "listed first" misapplies the doc to any facet the site wants ranking.** The correct default is to **branch on whether the facet has search demand / should be indexable**, not on a flat method ranking.
> ⚠️ **This is a change of emphasis, not a reversal, of the 2014 advice.** The 2014 "Faceted navigation best (and 5 of the worst) practices" post did **not** recommend crawl-and-canonicalize as *the* answer; it offered three co-equal options — (1) `rel="nofollow"` internal links paired with `rel=canonical` to a superset URL, (2) robots.txt disallow, (3) separate hosts — and already stated plainly that "`rel="nofollow"` doesn't prevent the unnecessary URLs from being crawled (only a robots.txt disallow prevents crawling)." So robots.txt was already on the 2014 menu. The 2024/2025 doc changes the **ordering** and adds an explicit efficacy verdict. The 2014 post now carries a deprecation banner ("Some of the information may be outdated… `rel=prev/next` is not supported anymore, and the crawl limiter and the URL parameter tools were deprecated"). **Search Console's URL Parameters tool was retired in 2022 — any legacy rule citing it is dead.**
> ⚠️ **`noindex` is explicitly the wrong tool for crawl budget** — the crawl-budget doc says to prefer robots.txt over `noindex` "which still wastes crawling resources."

### 2.2 Branch B: if facets *must* be indexable (search-demand facets)

These are **requirements** of the crawlable branch, per the faceted-nav doc and `designing-a-url-structure-for-ecommerce-sites` (updated **2025-12-10**):
- Use the **industry-standard `&` separator**. "Characters like comma (`,`), semicolon (`;`), and brackets (`[` and `]`) are hard for crawlers to detect as parameter separators."
- Use `?key=value`, not `?value`.
- "Avoid using the same parameters twice" → prefer `?type=candy,sweet` over `?type=candy&type=sweet`.
- If encoding filters in the **path** (`/products/fish/green/tiny`): "ensure that the logical order of the filters always stays the same and that no duplicate filters can exist."
- **"Return an HTTP 404 status code when a filter combination doesn't return results."** (Not a redirect, not a 200 with "no results".)

### 2.3 The facet governance matrix (implementable)

**The engine must branch on indexability first** (Branch A vs Branch B, §2.1), *then* pick a method. Every facet **parameter** gets one of five dispositions, and every facet **value** inherits or overrides:

| Disposition | Branch | When | Implementation |
|---|---|---|---|
| `INDEX` | B (crawlable) | Facet value has verified external search demand (GSC impressions ≥ threshold, or keyword volume ≥ threshold) AND ≥ N products AND stable inventory | Self-referencing canonical, unique `<title>`/`<h1>`/intro copy, in sitemap, `index,follow`, `&`-separated params, stable filter order, 404 on zero results |
| `CANONICALIZE` | B (crawlable) | Facet/variant should stay crawlable and consolidate signals into a parent, but not rank independently — same content, different ordering/presentation (sort, view, per-page). **This is the correct tool here, not robots.txt** — robots.txt would forfeit the signal consolidation. | `rel=canonical` → base URL, **not** in sitemap |
| `URL_FRAGMENT` | A (no crawl) | Site controls its own front-end and the facet never needs to be indexed — Google's **co-equal top-tier** alternative to robots.txt | Render facet state as `#color=blue`; Google doesn't crawl or index fragments |
| `ROBOTS_DISALLOW` | A (no crawl) | Combinatorial explosion facets (price sliders, multi-select colors, 3+ facet depth) with **no** search demand, where forfeiting indexing is acceptable | robots.txt pattern (scope to a user-agent, add `allow` carve-outs for superset URLs like `/*?products=all$`); **must not** also carry noindex (Google can't see it) |
| `404` | — | Zero-result combinations | Hard 404 — **not** a redirect to a generic error page, not a 200 "no results" |

> ⚠️ **Do not treat `ROBOTS_DISALLOW` as the global default just because Google lists it first.** It is only correct once the facet has been classified as "does not need to be indexed." Applying it to a demand-having facet (Google's own example: "sour gummy candies") destroys a ranking asset.

**Signals to compute the disposition automatically:**
1. GSC Search Analytics: `page` dimension, filter `contains ?` → impressions/clicks per parameterized URL (identifies demand-having facets)
2. Server log / GSC Crawl Stats: crawl requests to parameterized URLs as % of total (identifies waste)
3. Sitemap ∖ indexed-URL diff
4. Product-count-per-facet-value from the platform catalog API
5. Combinatorial cardinality: `Π(distinct values per facet)` — flag any category where this exceeds e.g. 10,000

---

## 3. Category / collection page optimization

### 3.1 What Google actually says

From `help-google-understand-your-ecommerce-site-structure` (updated **2025-12-10**):
- "add links from menus to category pages, from category pages to sub-category pages, and finally from sub-category pages to all product pages."
- "If category pages don't include direct links to all products in a category, Googlebot might not find all of your products by crawling alone."
- "If it's not possible to link to all pages, use a sitemap or a Google Merchant Center feed."
- "use `<a href>` tags when creating links to other content. Don't use JavaScript events on other HTML DOM elements for navigation."
- "the more links a page has to it within a site, the higher the relative importance of the page to other pages on your site."

### 3.2 Content placement (the practitioner layer)

Google has **no official guidance** on where category copy goes. Practitioner consensus (and the pattern that avoids pushing products below the fold):
- Short intro (≈40–80 words) above the grid, containing the head term naturally, then the product grid, then a longer expansion + FAQ **below** the grid.
- `ItemList` structured data listing the products on the page (with `position` + `url`) is the sanctioned way to describe a collection page.
- Breadcrumb structured data (`BreadcrumbList`) on category + product pages.

`[BLOG-ONLY]` Claims like "category pages with 150–300 words of unique content rank 2.7× higher" and "category pages generate 3–5× more organic revenue than product pages" appear only in vendor marketing blogs (digitalapplied.com, 1digitalagency.com, 2026). **Treat as directional, not as fact.** Our tool should A/B these itself rather than assert them.

### 3.3 Automatable category-page checks

```
- [ ] Unique <title> ≠ any other category title (n-gram dedupe across catalog)
- [ ] <h1> present, exactly one, ≠ <title> verbatim
- [ ] Intro copy present, >= 40 words, unique vs. all other categories (shingle similarity < 0.6)
- [ ] BreadcrumbList JSON-LD present and matches visible breadcrumb
- [ ] ItemList JSON-LD present with >= 1 item
- [ ] All products in category reachable via <a href> within <= 2 clicks (pagination depth check)
- [ ] Self-referencing canonical on page 1; per-page canonical on page N
- [ ] Facet/sort params either robots-disallowed or canonicalized (per §2.3 matrix)
- [ ] Empty category => 404 (not a 200 "no products found")
- [ ] Category appears in an XML sitemap
- [ ] >= 3 internal links pointing IN from other categories/content
```

---

## 4. Pagination for large catalogs

Source: `developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading` (updated **2025-12-10**)

- **`rel="next"` / `rel="prev"` are dead:** "Google no longer uses these tags, although these links may still be used by other search engines."
- **Give each page a unique URL:** "For example, include a `?page=n` query parameter."
- **Do NOT canonicalize page 2..N to page 1:** "Don't use the first page of a paginated sequence as the canonical page. Instead, give each page its own canonical URL."
- **No fragments for page numbers:** "Don't use URL fragment identifiers (the text after a `#` in a URL) for page numbers in a collection. Google ignores fragment identifiers."
- Link pages sequentially with `<a href>`; also link back to page 1.
- **Identical titles/descriptions across a paginated sequence are acceptable.**
- Infinite scroll / "Load more": "Google's crawlers don't 'click' buttons and generally don't trigger JavaScript functions that require user actions." → must be backed by real paginated URLs.
- Use `noindex` robots meta or robots.txt to block filter/sort variations of paginated URLs.
- Use sitemaps or a Merchant Center feed as a crawlability backstop.

> **Common bug our agent should auto-detect:** platform defaults that emit `<link rel="canonical" href="/collections/x">` on `/collections/x?page=7`. This is now explicitly against Google's guidance and orphans deep products. Shopify Dawn and many Magento themes do this.

---

## 5. Merchant Center, feeds, and how they interact with organic

### 5.1 Which surfaces need what

Source: `share-your-product-data-with-google` (updated **2025-12-10**)

| Surface | Structured data alone? | Merchant Center required? |
|---|---|---|
| Product rich results (blue-link snippet) | ✅ Yes | No |
| Popular Products / Shopping Knowledge Panel | Yes (merchant listing markup) | Helps |
| Google Images annotations | ✅ Yes | Also uses MC images |
| Google Lens shopping | Partially | **Effectively yes** |
| **Google Shopping tab** | ❌ **No** | ✅ **REQUIRED** |
| Free listings across Search/Shopping/Images/YouTube/Maps/Gemini | ❌ No | ✅ **REQUIRED** |

Exact quote: **"Participation in Google Merchant Center is mandatory for some Google surfaces, such as listings in the Google Shopping tab."**

Why feeds beat crawling (Google's own reasons): feeds enable "weekly, daily, or even hourly updates"; you can "share data that's not present on your website"; uploading ensures Google "knows all of your products" since "web crawling is not guaranteed." The API "enables immediate content updates, which is particularly useful for stock level updates."

### 5.2 ⚠️ Content API for Shopping is DEAD — Merchant API v1 is the only path

Source: `developers.google.com/merchant/api/guides/versioning`

- **Content API for Shopping v2.1 was sunset on 2026-08-18** — i.e. **13 days before this dossier's date.** Any integration still calling `shoppingcontent.googleapis.com/content/v2.1/*` is broken (reported as HTTP 410 Gone). Extended access can be applied for.
- **Merchant API v1beta was discontinued 2026-02-28.**
- **Current stable: Merchant API `v1`** across all sub-APIs (Accounts, Products, Inventories, Reports, DataSources, Quota, Conversions...). Host: `merchantapi.googleapis.com`.
- Google commits to a **12-month deprecation window for stable major versions**.

> **Build implication: do not write any Content API for Shopping code. Target Merchant API v1 only.** Key resources: `accounts.productInputs.insert`, `accounts.productInputs.delete`, `accounts.products.get/list`, `accounts.dataSources.*`, `accounts.reports.search` (for competitive/price-competitiveness/best-sellers reports), `accounts.quotas.list`.

**Quotas:** Merchant API models quota as `quotaLimit` (daily) and `quotaMinuteLimit` (per-minute), **per method** — `get` has its own quota separate from `update`. A `list` of 250 items counts as **one** call, not 250. Practitioner-reported rule of thumb: daily call quota ≈ **2× the account's offer quota**; updates limited to ~twice/day for products. Programmatic check: `accounts.quotas.list` and `accounts.limits.get/list`. **The quotas overview page (updated 2026-08-27) deliberately contains no fixed numbers — read them at runtime from the API, don't hardcode.**

### 5.3 Automated feeds / "website crawl" — the zero-config path

Source: `support.google.com/merchants/answer/7538732`

- Google crawls the merchant's site, reads **Product structured data + sitemap**, and builds a feed automatically.
- **Refresh cadence: "Google checks your website at least once every 24 hours for new products."**
- Requires the site to be **verified and claimed** in Merchant Center.
- Required structured-data attributes for the website-crawl feed input: **`title`, `price`, `availability`, `image_link`** equivalents.
- "If you don't have the option to select the Add products from [online store] card when creating a data source in your Merchant Center account, ensure your structured data markup is correctly implemented for all required attributes."
- Opt-in, not on by default. Products already present in another data source are not duplicated.
- Takes 4–8 hours to fully hide "Found by Google" products.

### 5.4 Automatic item updates (price/availability drift protection)

Source: `support.google.com/merchants/answer/7331077`, plus `answer/12157888`, `answer/6386198`, `answer/15623993`

- **What the doc literally says:** "Specifying the following schema.org values is required for automatic item updates: price, priceCurrency, availability and condition."
- ⚠️ **But `condition` is not a schema.org property.** schema.org has no `condition`; the property is **`itemCondition`** (`NewCondition` / `RefurbishedCondition` / `UsedCondition` / `DamagedCondition`), and Google's own JSON-LD example on that page uses `itemCondition`. "condition" is the **Merchant Center feed-attribute name**, not the markup key. **A schema-injection executor that literally emits `"condition": …` produces markup Google ignores.**
- ⚠️ **`price`/`priceCurrency` are not the only accepted encoding.** `answer/6386198` documents `priceSpecification.price` + `priceSpecification.priceCurrency` as an equally valid alternative. So "exactly these four values" is **false as a spec.**
- ⚠️ **Structured data is not actually a gate for automatic item updates.** `answer/12157888`: "It's recommended to set up structured data markup on your website," and "If your product landing pages don't contain any structured data, or the structured data markup is incomplete or incorrect, we rely on advanced data extractors to update your products automatically… independent of structured data markup." `answer/6386198` frames the four values as something to specify "to increase its accuracy." Caveat in Google's words: "we may not have advanced data extractor coverage for every domain and schema.org annotations may be disabled if they aren't accurate."
- Matching requires the landing page to contain **either a single offer, or multiple offers each with a `sku`/`gtin` that matches the feed.**
- **On the JavaScript prohibition — the doc overstates it, by Google's own admission.** The page still reads verbatim: *"Structured data markup must be present in the HTML returned from the web server. The structured data markup can't be generated with JavaScript after the page has loaded."* However, in **June 2024** Ryan Levering (Google, Merchant Center crawling) publicly said the GMC crawler *can* render JS, that the doc is "worded a bit more harshly than it should be," that "GMC currently says 'You can't do this'… it's just a recommendation," and that the real driver is that "there are more often quality problems with the rendering and discrepancies" (his example: strikethrough pricing that only appears post-render). Google said it was working on rewording. As of **2026-09-01 the harsh wording is still unchanged.** **Treat it as stale doc copy describing a strong preference, not a hard eligibility gate.**
- **Client-rendered JSON-LD IS supported for organic rich results.** Search Central: "Google Search can understand and process structured data that's available in the DOM when it renders the page," and it documents client-side JSON-LD injection and Google Tag Manager Custom HTML tags as supported methods. **The "fix once → rich results AND free listings" pitch does not collapse for React/Vue storefronts.**
- **The real, current Shopping-specific penalty is degradation, not disqualification.** Search Central: "dynamically-generated markup can make Shopping crawls less frequent and less reliable, which can be an issue for fast-changing content like product availability and price"; "If you're optimizing for all types of shopping results, we recommend putting Product structured data in the initial HTML for best results"; and if you do use JS, "make sure your server has enough computing resources to handle increased traffic from Google."
- **The two rules that ARE hard disqualifiers** (enforce these instead of the rendering method): the landing page "can't change based on information about the customer, such as if you adapt prices based on a customer's IP address or browser type," and **"Structured data must match the values that are shown to the customer."** Personalization/geo-pricing and raw-vs-rendered value drift are the real killers.
- **Requirement levels differ by surface — don't hard-code one list.** On Search Central's *merchant listing* doc, `offers.price` is Required, `offers.priceCurrency` is required only "if price is specified," while `offers.availability` and `itemCondition` are merely **Recommended**. The "four required" framing is Merchant-Center-specific.
- **Naming drift:** under Merchant Center Next this feature is surfaced as **"Automations"** (`answer/15623993`), with "automatic item updates" kept as an alternate phrasing. Scope: **price, availability, condition** (enabled by default), plus separate automatic shipping updates and automatic image improvements. It does **not** update titles, descriptions, GTINs, or custom labels.
- Local inventory extras: `availableAtOrFrom` + `branchCode`, `availableDeliveryMethod: OnSitePickup`, `potentialAction: BuyAction/ReserveAction`, `deliveryLeadTime`.

### 5.5 Feed spec — required vs conditionally required attributes

Source: `support.google.com/merchants/answer/7052112`

**Always required:** `id` (≤50 chars), `title` (≤150 chars), `description` (≤5,000 chars), `link` (≤2,000 chars), `image_link` (≤2,000 chars), `availability`, `price`.

**Conditionally required:**
| Attribute | Condition |
|---|---|
| `brand` | Required for new products (except movies, books, musical recordings) |
| `gtin` | Strongly recommended; required in specific contexts |
| `mpn` | Required only if no manufacturer GTIN exists |
| `condition` | Required for used/refurbished |
| `availability_date` | Required when `availability = preorder` |
| `age_group`, `gender` | Required for apparel in BR, FR, DE, JP, UK, US |
| `size` | Required for apparel/shoes in those regions |
| `color` | Required when product has color variants |
| `item_group_id` | Required for variants in specified countries |
| `is_bundle`, `multipack` | Required in specified countries |

Optional-but-high-value: `sale_price`, `product_type`, `google_product_category`, `additional_image_link` (up to **10**), `video_link`, `mobile_link`, `shipping`, `product_highlight`, `product_detail`.

### 5.6 Product image requirements — a 2027 deadline to plan for

Source: `support.google.com/merchants/answer/6324350` (`image_link`)

- **Minimum: 500 × 500 px for all product images. Enforcement begins 2027-01-31.**
  (Historic minimums were 250×250 apparel / 100×100 non-apparel — `[≤2024/2025 — now superseded]`.)
- **Recommended: 1500 × 1500 px or above** "to ensure best performance in all listing formats."
- **Max: 64 megapixels, 16 MB file size.**
- Formats: JPEG (.jpg/.jpeg), WebP, PNG, GIF, BMP, TIFF.
- Prohibited: watermarks, brand names/logos (unless inherent to the product), "calls to action, for example, buy", promotional adjectives ("best", "cheap"), price info, barcodes, warranty text, borders/overlays, placeholder/generic graphics (exceptions: Hardware, Vehicles & Parts, Computer Software), single-flat-color images (exception: Vehicle Paint).
- **AI-generated images must retain IPTC metadata indicating algorithmic creation** (e.g. `DigitalSourceType` / `TrainedAlgorithmicMedia`).

> **Automatable audit that pays for itself:** fetch every `image_link`, read dimensions + bytes + format + IPTC, and produce a "N products will be disapproved on 2027-01-31" report. Trivially computable, high perceived value, and no competitor tool ships it.

---

## 6. Out-of-stock, discontinued, and product lifecycle

There is **no single official Google page** with a 410-vs-301-vs-keep decision table. The guidance must be assembled from: the crawl-budget doc, the URL-structure doc, and Google spokesperson statements. Label accordingly.

### 6.1 What is officially documented

- Crawl budget doc (updated **2026-07-22**): "**Return `404` or `410` status codes for permanently removed pages.**" and "Eliminate soft 404 errors."
- URL structure doc (**2025-12-10**): when a category becomes empty and is removed, "consider returning a `404 (not found)` HTTP status code."
- Faceted nav doc: return 404 for zero-result filter combinations.
- Google does **not** distinguish 404 vs 410 in effect except in speed: 410 is processed slightly faster; both eventually drop from the index.

### 6.2 Practitioner decision tree (implementable)

```
IF product is TEMPORARILY out of stock (restock expected):
    → keep URL, HTTP 200
    → offers.availability = https://schema.org/OutOfStock  (or BackOrder / PreOrder)
    → keep full product content (do NOT strip copy — that creates a soft 404 signal)
    → surface: restock date, "notify me", 3-6 in-stock alternatives
    → DEMOTE from category grids / reduce internal links (lowers crawl priority)
    → keep in sitemap
    → feed: availability = out_of_stock (do NOT delete the offer)

ELSE IF product PERMANENTLY discontinued:
    IF a direct 1:1 successor product exists:
        → 301 to the successor PDP
    ELIF the product has meaningful equity (backlinks OR >0 organic clicks in last 90d OR
         >N impressions in GSC OR ranks top-20 for any query):
        → keep URL, HTTP 200, availability = https://schema.org/Discontinued
        → clearly label "discontinued", link to closest alternatives + parent category
        → (optional) noindex only if the page can no longer serve the query intent
    ELIF a tightly-relevant parent CATEGORY exists AND the product had traffic:
        → 301 to that category (NEVER to the homepage)
    ELSE:
        → HTTP 410 Gone, remove from sitemap, remove internal links, delete from feed
```

**Hard rules to encode:**
- **Never blanket-301 to the homepage.** Google treats deep-URL→homepage redirects as soft 404s.
- Blanket redirects to loosely-related pages also degrade into soft 404s over time.
- If an OOS page is stripped to a bare "This product is unavailable" shell, Google is likely to classify it a **soft 404** and drop it — the exact failure practitioners report from Mueller's guidance. `[Google-spokesperson-sourced, not a doc — treat as strong but not policy]`
- Redirect chains: keep ≤1 hop. The crawl-budget doc explicitly says "Avoid long redirect chains."

### 6.3 Data the agent needs for this decision

| Signal | Source |
|---|---|
| Current availability + restock date | Platform catalog API (Shopify `InventoryLevel`, Woo `stock_status`, Magento `quantity_and_stock_status`, BC `availability`/`inventory_level`) |
| 90-day clicks/impressions per URL | GSC Search Analytics API, `dimensions=[page]` |
| Backlinks | Optional 3rd-party; else GSC Links report (UI-only, no API) → fallback to internal-link count |
| Successor product mapping | Embedding similarity over title+description+attributes, gated by same `product_type`/category; human-approve above a confidence threshold |
| Existing redirects | Shopify `urlRedirects`, WP `wp_redirection`/plugin, Magento `url_rewrite`, BC `/v3/storefront/redirects` |

---

## 7. Duplicate content & the canonical strategy

### 7.1 The canonical decision table for e-commerce

| URL class | Canonical target | Robots | Sitemap |
|---|---|---|---|
| `/products/{handle}` (clean PDP) | self | index,follow | ✅ |
| `/collections/{c}/products/{h}` (Shopify collection-scoped PDP) | `/products/{handle}` | index,follow | ❌ |
| `?variant=123` / `?color=blue` (optional variant param) | base PDP URL | index,follow | ❌ |
| Variant with own path & real demand | self | index,follow | ✅ |
| `/collections/{c}` page 1 | self | index,follow | ✅ |
| `/collections/{c}?page=N` | **self** (per Google) | index,follow | optional |
| `?sort_by=`, `?view=`, `?per_page=` | base | `rel=canonical` if you want signals consolidated; robots.txt disallow only if you accept forfeiting indexing entirely | ❌ |
| Facet with demand | self | index,follow (**never** robots.txt-disallow) | ✅ |
| Facet without demand | base | **robots.txt disallow** *or* URL fragment (co-equal per §2.1) | ❌ |
| `/search?q=` internal search | n/a | robots.txt disallow (see §8) | ❌ |
| `?utm_*`, `?gclid`, `?fbclid` | base | leave crawlable, canonical handles it | ❌ |
| Currency/locale variants | self + `hreflang` cluster | index,follow | ✅ |

### 7.2 Duplicate PRODUCT detection (not just duplicate URLs)

Distinct problem: 40 near-identical SKUs (same product, different pack size / bundle / minor variant) each with the same manufacturer description.

Automatable approach:
1. Pull all PDP titles + descriptions + `gtin`/`mpn` from the catalog API.
2. Cluster by (a) exact `gtin`/`mpn` collision, (b) MinHash/shingle similarity ≥0.85 on description, (c) title Levenshtein/embedding similarity.
3. For each cluster: pick a **hub** (highest GSC clicks, else highest inventory/revenue), consolidate variants under a `ProductGroup`, canonical the rest to the hub or merge into variant options.
4. Detect **manufacturer-boilerplate descriptions** by comparing against a web sample of the same `gtin` → these are the #1 "thin content" risk on large catalogs and the highest-value rewrite target.

---

## 8. Internal site search pages

- Google's **Search Essentials no longer mandates** blocking internal search results. `[Verified as of 2025 doc structure]`
- Google's practical guidance (spokesperson-level): if a search page returns **no results**, there is no reason for it to be indexable; for other search pages, "either block them all, or only allow a hand-selected set to be indexed (e.g. known product-type queries, where the results are more like category pages)."
- Default rule for our agent: **robots.txt-disallow `/search`, `?q=`, `?s=`, `/pages/search`** unless the site has deliberately promoted search-driven landing pages.
- If certain search URLs have real demand, the correct move is to **promote them into real category pages** with their own URL, copy, and canonical — not to index the raw search results.

---

## 9. Crawl budget on huge catalogs

Source: `developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget` (updated **2026-07-22**)

**Who it applies to (Google's own thresholds — "rough estimates"):**
- Large sites: **1,000,000+ unique pages** with content changing ~weekly
- Medium/large sites: **10,000+ unique pages** with content changing daily
- Any site with a large share of URLs in **"Discovered — currently not indexed"**

**Two governing quantities:**
- **Crawl capacity limit** — how much Google *can* crawl without hurting the server; adjusts with response times and error rates.
- **Crawl demand** — driven by perceived inventory, popularity, and staleness.

**Official best-practice checklist:**
1. Consolidate duplicate content
2. **Block URLs with robots.txt** for pages users need but Google shouldn't crawl — explicitly noting `noindex` "still wastes crawling resources"
3. Return `404` / `410` for permanently removed pages
4. Eliminate soft 404s
5. Keep sitemaps updated with accurate **`<lastmod>`**
6. Avoid long redirect chains
7. Improve page load speed and server response time
8. **Enable HTTP caching / return `304 (Not Modified)`** to conditional requests
9. Monitor crawling (GSC Crawl Stats)

**Sitemap hard limits:** 50,000 URLs **or** 50 MB uncompressed per sitemap file; a sitemap index may reference up to 50,000 sitemaps and is subject to the same 50 MB limit.

**`<lastmod>` discipline:** setting `lastmod` to "now" on every regeneration makes the signal worthless and Google may start ignoring it. **Our sitemap generator must derive `lastmod` from actual content-hash change, not from build time.** This is a concrete, easy differentiator.

**Crawl-budget diagnostics our agent should compute:**
```
crawl_waste_ratio = crawl_requests_to_(param|search|sort|facet)_URLs / total_crawl_requests
orphan_products   = |sitemap_products \ internally_linked_products|
discovered_not_indexed_rate = GSC(Discovered–currently not indexed) / total_submitted
avg_click_depth_to_product   (target <= 3-4)
redirect_chain_max_hops      (target 1)
soft_404_count               (GSC Index Coverage)
non_200_rate_in_sitemap      (target 0)
```

---

## 10. Internationalization & currency

- **Merchant listing requirement (2025-12 doc): "Distinct URL per currency."** A single URL that swaps currency via JS/cookie cannot carry unambiguous merchant-listing markup.
- `hreflang` is the only Google-supported mechanism for telling Search which localized version to serve; it must be **reciprocal** and include a self-reference. `x-default` for the fallback.
- ⚠️ Google has historically said **don't create country-specific pages via hreflang purely for a currency change** — "Google folds pages together if they're identical, so either make them unique, or just make one English version." `[Source: Google spokesperson via Search Engine Roundtable, ~2018 — ≤2024, POSSIBLY STALE and in tension with the 2025 merchant-listing "distinct URL per currency" requirement.]`
- **Our agent's resolution:** if the market difference is **only** currency and shipping, prefer a single canonical page + Merchant Center feeds per target country (feeds carry currency without needing separate indexed URLs). If there is genuine localization (language, sizing, legal, assortment, price), use distinct URLs + full hreflang cluster + per-currency merchant listing markup.
- Shopify Markets **auto-generates hreflang and meta tags for every international domain or subfolder**, and includes all published languages in sitemaps. Do not double-emit hreflang on Shopify — detect first.

---

## 11. Platform-specific SEO: what's broken, what's writable

### 11.1 Shopify

**Structural SEO problems (all automatable to detect, most to fix):**

| Problem | Detail | Fix mechanism |
|---|---|---|
| **Dual product URLs** | Every product is reachable at `/products/{handle}` **and** `/collections/{c}/products/{handle}` for every collection it belongs to. A 500-product store with 20 collections can expose 10,000+ crawlable product URLs. | Shopify emits a canonical to `/products/{handle}`, but **internal links still point to the collection-scoped URL** because themes use the Liquid `\| within: collection` filter (present in Dawn, Shopify's own reference theme). Fix = edit the product-grid template (Dawn: `snippets/card-product.liquid` / `sections/main-collection-product-grid.liquid`) to strip `within:`. |
| **robots.txt** | Editable **only** via a `robots.txt.liquid` template in the theme (Online Store 2.0). Must preserve `robots.default_groups` and layer rules on top. Shopify Support explicitly does not support edits to it. | Write `templates/robots.txt.liquid` via Admin API theme asset write or GitHub-connected theme. |
| **`/collections/all`** | A duplicate of the entire catalog; often indexed. | Robots-disallow or canonical. |
| **`?variant=` URLs** | Every variant selection creates a URL. | Canonical to base PDP (Shopify does this by default — verify, don't assume). |
| **Pagination canonical** | Many themes canonical `?page=N` → page 1. Now against Google guidance (§4). | Theme edit. |
| **Sitemap** | Auto-generated at `/sitemap.xml`, **not editable**. Includes all published products/collections/pages/blogs. Cannot exclude individual URLs from it via API. | Only lever is publish/unpublish and `noindex` meta via theme conditionals. |
| **Blog URL structure** | Forced `/blogs/{blog}/{handle}`. | Not fixable. |
| **Variant limit** | Raised to **2,048 variants per product** (from 100) in **October 2025**. Enables consolidating what used to be separate near-duplicate products into one `ProductGroup`. |

**Write API (this is what our executor uses):**
- **Admin GraphQL API** (latest version `2026-04`). REST Admin is legacy.
- `productUpdate(input: ProductInput)` — `ProductInput` includes `seo: SEOInput { title, description }`, `handle`, `descriptionHtml`, `metafields`, `productType`, `tags`, `status`.
- `productVariantsBulkUpdate`, `productSet` for bulk.
- `metafieldsSet` for standalone metafield writes (namespace/key/type must match a metafield definition).
- `urlRedirectCreate(urlRedirect: { path, target })` → returns `UrlRedirect { id, path, target }` + `userErrors`. Also `urlRedirectUpdate`, `urlRedirectDelete`, and `urlRedirectImportCreate` for bulk.
- `collectionUpdate` for collection `seo`, `descriptionHtml`, `handle`.
- Theme asset writes: `themeFilesUpsert` (GraphQL) or the Asset REST endpoint — this is how we deploy `robots.txt.liquid`, JSON-LD snippets, and canonical fixes.

**Rate limits** (`shopify.dev/docs/api/usage/rate-limits`) — **cost-based leaky bucket, points/second restore rate:**
| Plan | GraphQL Admin points/sec |
|---|---|
| Standard | **100** |
| Advanced | **200** |
| Shopify Plus | **1,000** |
| Enterprise (Commerce Components) | **2,000** |

Single query cap: **1,000 points** regardless of plan. Input arrays capped at **250** items. Pagination capped at **25,000** objects. Storefront API has no fixed request limit for genuine buyer traffic (bots are throttled; Web Bot Auth-signed traffic gets higher allowances).

> **Build note:** at 100 pts/sec on a Standard plan, a full catalog crawl+update of 50k products via GraphQL needs careful batching and a token-bucket client with cost introspection (`extensions.cost.throttleStatus`). Design for resumable, checkpointed jobs.

### 11.2 WooCommerce / WordPress

- **Catalog API:** WooCommerce REST API **v3** (`/wp-json/wc/v3/products`), full CRUD, key/secret auth over HTTPS. Fields: `name`, `slug`, `description`, `short_description`, `sku`, `stock_status`, `catalog_visibility`, `images[]` (with `alt`), `categories[]`, `attributes[]`, `meta_data[]`.
- **SEO metadata is NOT native.** It lives in the SEO plugin:
  - **Yoast SEO REST API is READ-ONLY** — no POST/PUT to update meta. To write, you must set the underlying post meta (`_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_canonical`, `_yoast_wpseo_meta-robots-noindex`) via the WP REST API with those keys registered, or ship a small companion plugin.
  - **Rank Math:** no first-party write API either; community plugins (e.g. `Devora-AS/rank-math-api-manager`) expose `rank_math_title`, `rank_math_description`, `rank_math_canonical_url`, `rank_math_focus_keyword` over REST, including for WooCommerce products.
  - ⚠️ **Architectural decision for our tool: ship our own tiny WordPress companion plugin** that (a) registers the Yoast/Rank Math meta keys with `show_in_rest`, (b) exposes redirect CRUD, (c) exposes a `robots.txt` / JSON-LD injection hook, and (d) reports which SEO plugin is active. This removes the single biggest execution blocker on WooCommerce.
- Common Woo SEO problems: `?orderby=`, `?filter_*`, `?min_price=/?max_price=` (WooCommerce price filter widget) generating infinite facet URLs; attribute archive pages (`/pa_color/blue/`) indexed by default; `?add-to-cart=` URLs; product tag archives; default `/?p=123` duplicates.
- No native `<lastmod>` accuracy; Yoast/Rank Math sitemaps are usually fine but chunk at 1,000 URLs by default (configurable).

### 11.3 Magento / Adobe Commerce

Source: Adobe Experience League `commerce-admin/marketing/seo/*`

- **Canonical config path:** `Stores > Settings > Configuration > Catalog > Catalog > Search Engine Optimization`
  - `Use Canonical Link Meta Tag for Categories` (Yes/No)
  - `Use Canonical Link Meta Tag for Products` (Yes/No)
  - Adobe's guidance: enable **both** as a best practice; if you want category-path-only indexing, set categories=Yes / products=No, and vice-versa.
- **Configurable products:** "ensure that the canonical URL is set to the parent product URL, as Google might index the child product URLs, which can lead to duplicate content issues."
- "Make sure that canonical URLs do not point to redirects (301)."
- **Meta data:** meta description field accepts up to **255 characters**; Adobe recommends **150–160**.
- **Layered navigation is Magento's biggest crawl liability** — 20 filterable attributes on a 500-product category yields millions of URLs. Native controls are weak; the robots-meta-header-for-filtered-pages setting and third-party extensions (Mageworx, Mirasvit, Amasty) are the usual fix. `[BLOG-ONLY for the "millions of URLs" figure — but the combinatorics are trivially verifiable by counting attributes.]`
- **URL rewrites** table (`url_rewrite`) is the redirect mechanism; writable via REST (`/V1/products/{sku}` with `custom_attributes: url_key`, plus `save_rewrites_history`) — note that changing `url_key` with history enabled auto-creates the 301.
- **APIs:** REST (`/rest/V1/products`, `/rest/V1/categories`) and GraphQL. SEO fields live in `custom_attributes`: `url_key`, `meta_title`, `meta_description`, `meta_keyword`, `description`, `short_description`.
- Magento's default `robots.txt` is configured under `Content > Design > Configuration > Search Engine Robots` (Edit custom instruction of robots.txt File) — writable via config API.

### 11.4 BigCommerce

- **Catalog API v3** (`/stores/{hash}/v3/catalog/products`) exposes the SEO fields directly on the product object: `page_title`, `meta_description`, `meta_keywords`, `search_keywords`, `description`, `is_visible`, `availability`, `custom_url: { url, is_customized }`. Categories have the equivalent set.
- **301 redirects:** `/v3/storefront/redirects` (GET/PUT/DELETE), supports bulk upsert — this is one of the cleanest redirect APIs of the four platforms.
- **Faceted (Product Filtering) search** generates a URL per filter combination by default; filters include brand, size, color, price, material, plus custom attributes. Stencil themes let you control canonical/robots via template edits; **Catalyst (Next.js reference storefront)** requires emitting canonical via App Router `generateMetadata().alternates.canonical`.
- **Rate limits** (`docs.bigcommerce.com/developer/docs/overview/api-fundamentals/rate-limits`): OAuth apps get a quota **refreshed every 30 seconds**; the maximum quota varies by store plan and resource. Some **Enterprise clients are on an "Unlimited Rate Plan" with no request-rate limits** (bounded only by physical infrastructure). Response headers expose remaining quota (`X-Rate-Limit-Requests-Left`, `X-Rate-Limit-Time-Reset-Ms`) — **read these, don't hardcode.**
- BigCommerce natively supports editing `robots.txt` in the control panel (unlike Shopify's theme-file-only approach).

### 11.5 Platform capability matrix (what our executor can actually write)

| Capability | Shopify | WooCommerce | Magento/Adobe | BigCommerce |
|---|---|---|---|---|
| Title / meta description via API | ✅ `SEOInput` | ⚠️ plugin-dependent | ✅ `custom_attributes` | ✅ `page_title`/`meta_description` |
| URL slug change | ✅ `handle` | ✅ `slug` | ✅ `url_key` (+auto-301) | ✅ `custom_url` |
| Create 301 redirect | ✅ `urlRedirectCreate` | ⚠️ plugin | ✅ `url_rewrite` | ✅ `/v3/storefront/redirects` |
| Edit robots.txt | ⚠️ theme file only | ✅ (plugin/file) | ✅ admin config | ✅ control panel/API |
| Per-page meta robots noindex | ⚠️ theme conditional | ⚠️ plugin | ✅ (extension) | ⚠️ theme |
| Inject custom JSON-LD | ✅ theme file | ✅ plugin/hook | ✅ layout XML/block | ✅ script manager / theme |
| Edit image alt text | ✅ `productUpdateMedia` | ✅ media `alt_text` | ✅ media gallery API | ✅ image `description` |
| Bulk category description | ✅ `collectionUpdate` | ✅ term meta | ✅ category API | ✅ category API |
| Control sitemap contents | ❌ | ✅ | ✅ | ⚠️ partial |

---

## 12. Content quality & the scaled-content-abuse boundary

Source: `developers.google.com/search/docs/essentials/spam-policies` (last updated **2026-08-28**)

**Scaled content abuse — exact wording:**
> "Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings and not helping users."
> Examples include: "Using generative AI tools or other similar tools to generate many pages without adding value for users" and "Scraping feeds, search results, or other content to generate many pages (including through automated transformations like synonymizing, translating, or other obfuscation techniques), where little value is provided to users."

**Thin affiliation — exact wording:**
> "Thin affiliation is the practice of publishing content with product affiliate links where the product descriptions and reviews are copied directly from the original merchant without any original content or added value."

**Doorway abuse:**
> "Doorway abuse is when sites or pages are created to rank for specific, similar search queries. They lead users to intermediate pages that aren't as useful as the final destination."

> 🚨 **This is the sharpest product-risk for an autonomous SEO tool.** Mass-generating 50,000 AI product descriptions or spinning up thousands of `{color} {product} in {city}` facet landing pages is *literally the named example* of scaled content abuse.
>
> **Design guardrails we must ship by default:**
> 1. **Hard cap** on new pages created per site per day/week, with an explicit user override + warning.
> 2. **Value gate:** never create a facet/category landing page unless it (a) has verified external search demand, (b) has ≥N products, and (c) receives unique, non-templated content.
> 3. **Rewrite, don't inflate:** default content action is *replacing manufacturer boilerplate on existing indexed pages*, not creating new URLs.
> 4. **Uniqueness check:** reject generated copy with shingle similarity ≥0.7 against any other page on the site.
> 5. **Provenance log** on every generated asset so the user can audit and roll back.

---

## 13. Measurement: what to read from GSC

- **Search Console API `searchAppearance` dimension values:** `MERCHANT_LISTINGS` and `PRODUCT_SNIPPETS` (split out of the old combined "Product results" appearance).
  - ⚠️ **API constraint:** `searchAppearance` cannot be combined with other dimensions in the same query the way you'd expect — you must first query `dimensions=["searchAppearance"]` alone to enumerate available appearance values, then run a filtered query with `dimensionFilterGroups` on `searchAppearance` plus `dimensions=["page","query"]`. Encode this two-step in the client.
- **Definitions (Google's):** merchant listings = "results that include specific data about a product, such as price and availability (for example, on Popular products or Shopping knowledge panels)"; product snippets = "an extension of the URL, title and description that appear for organic results, including elements such as ratings, review counts, and price or stock availability."
- **Rich results reports** ("Merchant listings", "Product snippets") are **UI-only** — there is no public API for the rich-results enhancement reports. Our tool must reconstruct validation itself by running the Rich Results Test logic locally (schema validation against Google's required/recommended matrix) rather than trying to read the report.
- **URL Inspection API** (`urlInspection.index.inspect`): **2,000 queries/day and 600 queries/minute per property** — the only programmatic way to get Google's canonical, indexing state, and *rich results detected* per URL. On a 50k-SKU catalog that's a 25-day full sweep. **Design a priority queue, not a full sweep.**
- **Crawl Stats report:** UI-only. For crawl-waste analysis, prefer server log ingestion (Nginx/Cloudflare/Fastly logs) where available.

---

## 14. Highest-ROI automatable e-commerce SEO wins, ranked

Ordered by (expected revenue impact × automatability × reversibility) ÷ risk.

### Tier 1 — Do these first, they are near-pure upside

**1. Merchant-listing structured data completeness sweep**
- *Why:* unlocks Popular Products / Shopping Knowledge Panel / Images-Lens shopping AND feeds Merchant Center automated feeds. Directly gates the highest-CTR e-commerce SERP features.
- *Detect:* crawl every PDP → parse JSON-LD (raw HTML **and** rendered DOM, diffed) → score against the §1.2 matrix → rank by (missing required props) then (missing high-value recommended: `gtin`, `brand`, `aggregateRating`, `shippingDetails`, `hasMerchantReturnPolicy`).
- *Data needed:* site crawl; platform catalog API for `gtin`/`mpn`/`sku`/`brand`/`condition`; return + shipping policy (one-time user input or scraped from policy pages).
- *Execute:* inject/patch JSON-LD via theme snippet (Shopify `themeFilesUpsert`, Woo hook, Magento block, BC Script Manager). **Server-rendered is the default and the recommended target** — but client-side injection is *officially supported* for organic rich results and works in practice for Merchant Center, so it is a valid fallback on headless stacks where template access is limited. Never tell a merchant their client-rendered site is "ineligible."
- *Emit `itemCondition`, not `condition`* — `condition` is a feed attribute, not a schema.org property (§5.4).

**2. `priceValidUntil` / stale-price / availability drift monitor**
- *Why:* an expired `priceValidUntil` silently kills merchant listing display; a mismatch between markup and page price is a Merchant Center policy violation → disapproval.
- *Detect:* parse `priceValidUntil` < today; diff JSON-LD price vs. visible DOM price vs. catalog API price vs. feed price.
- *Execute:* rewrite the schema template to emit a rolling date (e.g. today + 90d) and to bind price/availability to the live product object.
- *This is a 30-line fix with outsized effect and near-zero risk.* Best first-run "wow" moment.

**3. Crawl-waste elimination via facet governance**
- *Why:* on large catalogs, blocking genuinely worthless facet URLs reallocates crawl toward products that are `Discovered — currently not indexed`.
- *Sequencing (corrected — see §2.1):* **classify indexability first, method second.** Only facets classified "does not need to be indexed" are candidates for robots.txt or URL fragments; demand-having facets get `INDEX` (crawlable + best-practice URLs) and sort/view duplicates get `CANONICALIZE`. robots.txt is **not** a global default.
- *Detect:* parameter inventory from crawl + GSC page data + (if available) logs; compute `crawl_waste_ratio` and the facet cardinality per category.
- *Execute:* generate a `robots.txt` patch **with a dry-run diff and a simulated "URLs newly blocked" count**, require explicit approval, and keep a one-click revert. Scope the patch to a user-agent and include `allow` carve-outs for superset URLs (Google's own example uses `allow: /*?products=all$`). Also verify no currently-indexed, click-earning URL would be blocked (query GSC first — **this check is mandatory**). Offer **URL fragments** as the co-equal alternative where the merchant controls the storefront front-end.
- *Risk:* highest-blast-radius action in the whole product. Never auto-apply without approval.

**4. Out-of-stock / discontinued lifecycle automation**
- *Why:* prevents soft-404 decay on temporarily-OOS items and recovers equity from dead SKUs.
- *Detect:* catalog availability + GSC clicks/impressions + internal-link count + successor similarity.
- *Execute:* set `availability` enum in schema + feed; demote from grids; create 301s (`urlRedirectCreate` / BC redirects / Magento `url_rewrite`) or 410s per §6.2 tree.
- *Data needed:* inventory API, GSC Search Analytics, redirect API.

**5. Image compliance + alt text at scale**
- *Why:* the **500×500 minimum enforced 2027-01-31** will disapprove products wholesale; alt text is a genuine Images/Lens ranking input and is universally neglected.
- *Detect:* fetch each `image_link` → dimensions, bytes, format, IPTC; detect empty/duplicate/filename-derived alt text.
- *Execute:* generate descriptive alt from product attributes (brand + product type + color + material + distinguishing feature — **not** keyword-stuffed); write via platform media API. Flag (don't auto-fix) undersized images — that requires re-shooting/upscaling and is a merchandising decision.

### Tier 2 — High value, needs more judgment

**6. Duplicate/near-duplicate product consolidation + `ProductGroup` markup**
- *Data:* full catalog, `gtin`/`mpn`, description embeddings, GSC per-URL performance.
- *Execute:* emit `ProductGroup` with `variesBy`/`hasVariant`/`productGroupID`; canonical the losers; (Shopify) exploit the 2,048-variant limit to merge.

**7. Category-page content + `ItemList`/`BreadcrumbList` schema**
- *Data:* category → product mapping, GSC queries mapped to categories, competitor SERP for the head term.
- *Execute:* short intro above grid + expanded copy/FAQ below; strict uniqueness gate (§12).

**8. Internal linking: orphan rescue + hub reinforcement**
- *Detect:* build the internal link graph from the crawl; find products with 0–1 inbound internal links; find high-impression/low-position pages that deserve more links.
- *Execute:* insert contextual links in category copy, "related products" blocks, and blog content. **Bounded**: cap links added per page, never auto-link from PDP body copy in a way that looks templated.
- *This is the single most under-automated high-ROI lever on large catalogs.*

**9. Pagination canonical repair**
- *Detect:* `?page=N` with canonical → page 1.
- *Execute:* theme edit to self-canonical. Low risk, mechanically verifiable.

**10. Title/meta template optimization at catalog scale**
- *Detect:* duplicate titles (exact + near), titles >60 chars truncating, missing brand/variant differentiators, categories with the same title as their parent.
- *Execute:* template-driven regeneration with per-URL overrides for high-traffic pages; **always** measure with GSC before/after on a holdout set of URLs.

**11. Merchant Center wiring (automated feeds → free listings)**
- *Why:* for a merchant with no feed, turning on automated feeds/website-crawl after fixing structured data is a step-change in surface coverage at zero marginal cost.
- *Data/API:* Merchant API v1 — `accounts.dataSources.create`, `accounts.productInputs.insert`, `accounts.products.list` for disapproval reasons, `accounts.reports.search`.
- *Execute:* guided flow — verify+claim site → confirm required schema attrs (`title`, `price`, `availability`, `image_link`) → create the website-crawl data source → monitor disapprovals.

### Tier 3 — Valuable but slower / more bespoke

12. Review generation workflow (post-purchase email → third-party collector → on-page render → `aggregateRating`). Must render reviews server-side or the markup is invalid.
13. Return-policy + loyalty-program `Organization` markup (one-time, sitewide, ~1 hour of work, unlocks distinct SERP annotations in 8 countries).
14. `hreflang` cluster repair for multi-market stores.
15. Sitemap re-architecture with honest `<lastmod>` and segmented files (products-in-stock / products-oos / categories / content).
16. Log-file-driven crawl-budget reallocation (needs log access — gate behind an integration).
17. UCP / agentic-commerce readiness audit (`/.well-known/ucp` manifest presence, Merchant Center linkage, inventory freshness ≤ 60 min).

---

## 15. Emerging: AI Mode, agentic commerce, UCP

Source: `developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/` (published **2026-01-11**), `blog.google/products/ads-commerce/...`

- **Universal Commerce Protocol (UCP)** — "an open-source standard designed to power the next generation of agentic commerce." Announced 2026-01-11 at NRF.
- Components: **Shopping Service** (discovery/catalog), **Checkout Capability**, **Discount Extension**, **Fulfillment Extension**, and a payment architecture that separates payment instruments from handlers.
- Transport: **OpenAPI schemas** + **JSON manifest discovery at `/.well-known/ucp`**; also A2A (Agent2Agent) and **MCP** bindings.
- Merchant prerequisites: **an active Google Merchant Center account with eligible products**, plus either UCP REST endpoints or an embedded checkout option. Merchant remains the Merchant of Record.
- Repos: `github.com/universal-commerce-protocol/ucp`, `.../python-sdk`, `.../samples`.
- Availability: eligible **U.S.-based merchants**, global expansion planned through 2026.
- Partners named: Shopify, Etsy, Wayfair, Target, Walmart; endorsers include Adyen, Amex, Best Buy, Flipkart, Macy's, Mastercard, Stripe, Home Depot, Visa, Zalando.

`[BLOG-ONLY]` Claims such as "stores with 99.9% attribute completion see 3–4× higher visibility in AI recommendations" and "sync inventory every 15–60 minutes" come from vendor blogs, not Google. Do not present these as fact in-product.

**What this means for our architecture:** the structured-data + Merchant Center work in Tier 1 is *also* the AI-shopping and agentic-commerce prerequisite. A single "product data completeness score" drives organic rich results, free listings, AI Mode grounding, and UCP eligibility. **Build one canonical product-data model internally and project it into all four outputs.**

---

## 16. Direct implications for our tool

### 16.1 Architecture decisions

1. **Model the catalog, not the site.** Build a normalized internal `Product` entity (id, sku, gtin, mpn, brand, title, description, images[], price, currency, availability, condition, variants[], category_path, canonical_url, inventory, gsc_clicks_90d, internal_inbound_links). Every adapter (Shopify/Woo/Magento/BC/generic-crawl) populates this. Every check and every action reads from it. This is the difference between a crawler and an e-commerce SEO engineer.

2. **Dual-fetch every PDP: raw HTML + rendered DOM. Keep the feature — but rejustify it.** *(Rationale corrected: the original "JS-only markup is disqualified" premise is false — see §5.4.)* The diff is **not** detecting ineligible markup; it is detecting (a) the **raw-vs-rendered discrepancy** that Google's own Merchant Center crawling engineer named as the actual cause of GMC quality problems, and (b) **price/availability drift between the markup and what the shopper sees**, which *is* a hard Merchant Center disqualifier ("Structured data must match the values that are shown to the customer"). Report severity accordingly:
   - **HIGH** — markup values differ between raw HTML and rendered DOM, or differ from the visible price/availability, or the page personalizes price by IP/browser (these are real disqualifiers).
   - **MEDIUM/advisory** — schema present only after render. Frame as "Shopping crawls may be less frequent and less reliable; move to the initial HTML for best results," **not** as ineligibility. Client-rendered JSON-LD is officially supported for organic rich results.
   - Also flag literal `"condition"` keys in emitted JSON-LD — the correct property is `itemCondition`.

3. **Do not build on Content API for Shopping.** It was sunset **2026-08-18**. Target **Merchant API v1** (`merchantapi.googleapis.com`) exclusively. Read quotas at runtime via `accounts.quotas.list` / `accounts.limits.get`; never hardcode.

4. **Ship a WordPress companion plugin.** WooCommerce is the largest self-hosted e-commerce base and it has **no writable SEO-meta API** out of the box. A ~300-line plugin that registers Yoast/Rank Math meta keys with `show_in_rest`, exposes redirects, and provides a JSON-LD injection point turns WooCommerce from "read-only" to "fully executable." This is the highest-leverage engineering week in the whole project.

5. **Rate-limit clients must be cost-aware, not request-aware.** Shopify GraphQL is a points/second leaky bucket (100 / 200 / 1,000 / 2,000 by plan) with a 1,000-point single-query cap; BigCommerce refreshes quota every 30s with plan-dependent maxima and exposes remaining quota in response headers. Build a generic `RateLimitedClient` with pluggable strategies: `token_bucket_cost` (Shopify), `window_quota_headers` (BigCommerce), `fixed_rps` (WP/Magento), `daily_quota` (Google APIs).

6. **URL Inspection API is the scarcest resource** (2,000/day, 600/min per property). Treat it as a budgeted resource with a priority queue: highest-revenue SKUs, pages with schema changes pending verification, pages suspected orphaned, pages with canonical conflicts. Never full-sweep a large catalog.

7. **Every write action is a versioned, revertible change record.** `{action_id, url, field, before, after, applied_at, applied_by(agent|human), revert_payload, verification_status}`. For theme-file edits, store the full prior file. For robots.txt, store the prior file **and** the GSC-verified list of URLs that were earning clicks before the change.

### 16.2 Autonomy tiering (opinionated defaults)

| Autonomy | Actions allowed by default |
|---|---|
| **L1 Observe** | Crawl, diagnose, report only |
| **L2 Auto-safe** | Alt text, `priceValidUntil` refresh, schema property completion (from existing catalog data), image alt/filename, sitemap `lastmod` correction, meta description generation for pages with none |
| **L3 Auto-with-diff** | Title/meta rewrites on existing pages, internal link insertion (capped), category copy on empty categories, `ProductGroup` consolidation markup, pagination canonical repair |
| **L4 Approval-required (always)** | **robots.txt changes**, `noindex` additions, 301/410 creation, URL slug changes, canonical target changes, deleting/unpublishing products, any action creating >N new URLs, Merchant Center feed source changes |

**Never auto-apply:** robots.txt edits, redirects, noindex, slug changes. These are the four ways an autonomous SEO tool destroys a business.

### 16.3 Guardrails specific to e-commerce

- **Pre-flight GSC check before any blocking action:** if the URL pattern about to be robots-disallowed or noindexed has >0 clicks in the last 90 days, hard-block the action and escalate.
- **Facet method selection must be branch-gated, never a flat ranking.** The engine may not propose `ROBOTS_DISALLOW` for a facet until that facet has been classified as "not needed in the index" (no search demand, no impressions, no clicks). robots.txt and `rel=canonical` solve *different* problems and are not interchangeable (§2.1).
- **Never make an unsupportable eligibility claim to a merchant.** Specifically: do not tell a prospect that a React/Vue/headless storefront is ineligible for rich results or Merchant Center because its structured data is client-rendered. It is a factually false sales claim a technical buyer can refute in one search. Say "less reliable for Shopping crawls; server-rendering is recommended."
- **Scaled-content-abuse governor:** cap net-new indexable URLs per site per week; require a demand signal (GSC impressions or keyword volume) + product-count threshold before creating any facet/category landing page; reject generated copy with ≥0.7 shingle similarity to existing pages.
- **Merchant Center policy pre-check** before recommending feed enablement: scan for prohibited categories (firearms, recreational drugs, tobacco/vaping, gambling) — these disqualify merchant listing structured data entirely.
- **Currency/locale sanity:** never emit merchant-listing markup with multiple currencies on one URL.
- **Review markup gate:** allow `Product` → `aggregateRating` (permitted), block `Organization`/`LocalBusiness` → `aggregateRating` where the entity controls the reviews (prohibited). Verify reviews are visible in the raw HTML before emitting the markup.

### 16.4 The first-run experience that sells the product

For an e-commerce site, the first 10-minute run should produce, in order:
1. **"N of your M products are not eligible for Merchant listings"** with the exact missing property per product.
2. **"N products have an expired `priceValidUntil`"** — one-click fix.
3. **"N products will be disapproved by Google on 2027-01-31 because their images are under 500×500."**
4. **"X% of Googlebot's crawl on your site goes to filter/sort URLs that can never rank."**
5. **"N products are orphaned — no internal links point to them."**
6. **"N discontinued products are returning 200 with no content (soft-404 risk)."**

Every one of these is computable from a crawl + catalog API + GSC, is quantified, and maps to a concrete executable action. That is the demo.

---

## 17. Open questions / things to verify before shipping

1. Exact numeric default daily/per-minute quotas for `accounts.productInputs.insert` in Merchant API v1 — Google's quotas overview deliberately omits numbers; must be read at runtime.
2. Whether the Content API for Shopping "extended access" application is still open post-2026-08-18 and what it grants.
3. Whether Google will extend the self-serving-review restriction from `Organization`/`LocalBusiness` to `Product` (repeatedly rumored, not policy as of 2026-07-24 doc).
4. Whether `membershipPointsEarned` has exited beta.
5. Whether `variesBy` will gain more supported schema.org properties (currently only 6).
6. What, if any, structured-data or feed requirements attach to AI Mode shopping grounding specifically — Google has not published a distinct spec; all current claims are vendor-blog.
7. Whether UCP `/.well-known/ucp` will become an SEO-relevant discovery signal for non-agentic surfaces.
8. Google Search Console rich-results enhancement reports remain UI-only — confirm no API before building around scraping (don't scrape).
9. ⚠️ **unverified — must be confirmed during implementation:** whether the GMC crawler actually renders JavaScript for a *given* merchant domain. Google's engineer says it can (2024-06), the help doc still says it can't, and Google has not rewritten the doc in the 2+ years since. Confirm empirically per-domain (inject markup client-side on a canary SKU, watch whether automatic item updates fire) before promising it to a customer.
10. ⚠️ **unverified — must be confirmed during implementation:** whether "advanced data extractor" coverage exists for a given merchant domain. Google states coverage is not universal, and offers no API to check it.
11. ⚠️ **unverified — must be confirmed during implementation:** whether Google treats a hash-fragment facet implementation (`#color=blue`) as fully crawl-neutral for *all* Google product crawlers, or only Google Search. The doc's wording is scoped to "Google Search."

---

## Sources

All accessed **2026-08-31**.

**Google Search Central (primary)**
- Intro to Product structured data — https://developers.google.com/search/docs/appearance/structured-data/product (doc updated 2025-12-10)
- Merchant listing structured data — https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Product snippet structured data — https://developers.google.com/search/docs/appearance/structured-data/product-snippet (updated 2025-12-10)
- Product variants (`ProductGroup`) — https://developers.google.com/search/docs/appearance/structured-data/product-variants (updated 2026-05-20)
- Loyalty program (`MemberProgram`) — https://developers.google.com/search/docs/appearance/structured-data/loyalty-program (updated 2025-12-10)
- Return policy (`MerchantReturnPolicy`) — https://developers.google.com/search/docs/appearance/structured-data/return-policy (updated 2025-12-10)
- Review snippet — https://developers.google.com/search/docs/appearance/structured-data/review-snippet (updated 2026-07-24)
- Ecommerce SEO hub — https://developers.google.com/search/docs/specialty/ecommerce
- Share your product data with Google — https://developers.google.com/search/docs/specialty/ecommerce/share-your-product-data-with-google (updated 2025-12-10)
- Ecommerce URL structure — https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites (updated 2025-12-10)
- Ecommerce site structure — https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure (updated 2025-12-10)
- Pagination & incremental page loading — https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading (updated 2025-12-10)
- Where ecommerce data can appear — https://developers.google.com/search/docs/specialty/ecommerce/where-ecommerce-data-can-appear-on-google (updated 2025-12-10)
- Managing crawling of faceted navigation URLs — https://developers.google.com/crawling/docs/faceted-navigation (substance published 2024-12-17; "Last updated 2025-12-18" is a doc-site migration, not a policy change)
- Old location, now 301s to the above — https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation
- Google crawling documentation changelog (confirms the 2025-12-18 entry is a migration) — https://developers.google.com/crawling/docs/changelog
- Crawling December: Faceted navigation — https://developers.google.com/search/blog/2024/12/crawling-december-faceted-nav (2024-12-17)
- Large site crawl budget management — https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget (updated 2026-07-22)
- Build and submit a sitemap — https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google Images best practices — https://developers.google.com/search/docs/appearance/google-images (updated 2026-03-02)
- Spam policies for Google Web Search — https://developers.google.com/search/docs/essentials/spam-policies (updated 2026-08-28)
- Merchant listings report announcement — https://developers.google.com/search/blog/2022/09/merchant-listings `[2022 — historical context only]`
- Faceted navigation best (and 5 of the worst) practices — https://developers.google.com/search/blog/2014/02/faceted-navigation-best-and-5-of-worst `[2014 — carries a Google deprecation banner; rel=prev/next and the URL Parameters tool are dead. Directionally superseded by the 2024 doc, but NOT "reversed" — it already offered robots.txt disallow as one of three co-equal options.]`

**Google Merchant Center / Merchant API (primary)**
- Product data specification — https://support.google.com/merchants/answer/7052112
- Image link [image_link] — https://support.google.com/merchants/answer/6324350
- Set up structured data for Merchant Center — https://support.google.com/merchants/answer/7331077
- Structured data markup for automatic item updates — https://support.google.com/merchants/answer/6386198
- Automatic item updates / advanced data extractors — https://support.google.com/merchants/answer/12157888
- Merchant Center Next "Automations" — https://support.google.com/merchants/answer/15623993
- Landing page requirements — https://support.google.com/merchants/answer/6069143
- Generate structured data with JavaScript (client-side JSON-LD is supported) — https://developers.google.com/search/docs/appearance/structured-data/generate-structured-data-with-javascript
- Search Engine Roundtable: Google on JS-generated structured data for Shopping (Ryan Levering, 2024-06) — https://www.seroundtable.com/google-warns-javascript-structured-data-37599.html
- Use automated feeds to build your product data — https://support.google.com/merchants/answer/7538732
- Understanding quotas in Google Merchant Center — https://support.google.com/merchants/answer/16564100
- Merchant API versioning & sunset dates — https://developers.google.com/merchant/api/guides/versioning
- Merchant API quotas and limits — https://developers.google.com/merchant/api/guides/quotas-limits (updated 2026-08-27)
- Content API for Shopping (deprecated) — https://developers.google.com/shopping-content/reference/rest/v2.1
- Under the Hood: Universal Commerce Protocol (UCP) — https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/ (2026-01-11)
- New tech and tools for retailers in an agentic shopping era — https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/

**Platform docs (primary)**
- Shopify API rate limits — https://shopify.dev/docs/api/usage/rate-limits
- Shopify `ProductInput` — https://shopify.dev/docs/api/admin-graphql/latest/input-objects/productinput
- Shopify `urlRedirectCreate` — https://shopify.dev/docs/api/admin-graphql/latest/mutations/urlRedirectCreate
- Shopify manage metafields — https://shopify.dev/docs/apps/build/custom-data/metafields/manage-metafields
- Shopify customize robots.txt — https://shopify.dev/docs/storefronts/themes/seo/robots-txt
- Shopify `robots.txt.liquid` template — https://shopify.dev/docs/storefronts/themes/architecture/templates/robots-txt-liquid
- Shopify Help: editing robots.txt.liquid — https://help.shopify.com/en/manual/promoting-marketing/seo/editing-robots-txt
- Shopify variant limit now 2048 — https://shopify.dev/changelog/the-product-variant-limit-is-now-2048-for-all-merchants
- Shopify international domains (auto hreflang) — https://help.shopify.com/en/manual/international/managing-international-domains
- WooCommerce REST API v3 — https://woocommerce.github.io/woocommerce-rest-api-docs/
- Yoast SEO REST API (read-only) — https://developer.yoast.com/customization/apis/rest-api/
- Rank Math API Manager (community plugin) — https://github.com/Devora-AS/rank-math-api-manager
- Adobe Commerce meta data — https://experienceleague.adobe.com/en/docs/commerce-admin/marketing/seo/meta-data
- Adobe Commerce URL rewrites — https://experienceleague.adobe.com/en/docs/commerce-admin/marketing/seo/url-rewrites/url-rewrite
- Adobe Commerce Storefront SEO overview / indexing — https://experienceleague.adobe.com/developer/commerce/storefront/setup/seo/
- BigCommerce REST Catalog: Products — https://docs.bigcommerce.com/docs/rest-catalog/products
- BigCommerce API rate limits — https://docs.bigcommerce.com/developer/docs/overview/api-fundamentals/rate-limits

**Secondary / practitioner (clearly labelled as such above)**
- Search Engine Land: Google expands UCP — https://searchengineland.com/google-expands-universal-commerce-protocol-and-launches-new-agentic-shopping-tools-478113
- Search Engine Land: GSC splits merchant listings / product snippets — https://searchengineland.com/google-search-console-breaks-out-merchant-listings-and-product-snippets-appearances-394865
- Brodie Clark: Merchant listings in GSC — https://brodieclark.com/merchant-listings/
- Amsive: Shopify collection/product duplicate content — https://www.amsive.com/insights/seo/resolving-shopify-duplicate-content-between-collection-product-pages/
- Search Engine Roundtable: Google on redirecting vs 404ing removed products — https://www.seroundtable.com/google-on-redirecting-vs-404ing-products-that-no-longer-exist-21927.html `[≤2024 — POSSIBLY STALE]`
- Search Engine Roundtable: don't make country pages just for currency — https://www.seroundtable.com/google-country-specific-pages-hreflang-currency-24672.html `[≤2024 — POSSIBLY STALE]`
- Search Engine Roundtable: block internal search results — https://www.seroundtable.com/google-index-search-results-35232.html
- Search Engine Journal: Google clarifies structured data rules for returns & loyalty — https://www.searchenginejournal.com/google-clarifies-structured-data-rules-for-returns-loyalty-programs/550952/
- VersaFeed: Merchant Center image requirements changing — https://www.versafeed.com/blog/google-merchant-center-image-requirements-are-changing-start-preparing-now/

---

## Fact-check log

Independent verification pass, **2026-09-01**. Six load-bearing claims were checked; four came back **CONFIRMED** and were left as written. The two **PARTIALLY_TRUE** verdicts were corrected inline in §1.2, §2, §5.4, §7.1, §14, §16.1, §16.3 and §17.

### 1. Faceted navigation — "robots.txt is the preferred method, a 3-rung ladder, new 2025-12-18 guidance, reverses 2014" — **PARTIALLY_TRUE**

*Claim as originally written:* Google's current (2025-12-18) guidance ranks robots.txt disallow as the PREFERRED method for faceted-navigation crawl control, with `rel=canonical` less effective and `rel=nofollow` least effective; this reverses the 2014 "crawl and canonicalize" advice.

*What survives:* canonical/nofollow ARE explicitly rated below robots.txt for crawl control — verbatim: "these methods are generally less effective in the long term than the previously mentioned methods."

*Corrections applied:*
- **No three-way ranking.** Canonical and nofollow appear in one sentence as a **single tier**; the doc never ranks nofollow below canonical. The 4-row "ranked preference order" table in §2.1 was rewritten as a two-branch decision tree with a two-method top tier and a single lower tier.
- **robots.txt is not singularly "preferred."** The doc offers robots.txt **and URL fragments** as **co-equal** members of the top tier ("one of the following ways"). Added `URL_FRAGMENT` as a fifth disposition in the §2.3 governance matrix.
- **The 2025-12-18 date is a red herring.** Substance published **2024-12-17** ("Crawling December"); the Dec-2025 stamp is a documentation-site migration per the crawling changelog ("The functionality hasn't changed, only the location"). No 2026 changelog entry touches faceted navigation. Corrected in §2 header and in Sources.
- **"Reverses" is overstated.** The 2014 post offered three co-equal options including robots.txt disallow, and already said "only a robots.txt disallow prevents crawling." Changed to "a change of emphasis, not a reversal." Also noted: the 2014 post now carries a deprecation banner, and Search Console's URL Parameters tool was retired in 2022.
- **Biggest design impact:** "less effective" is scoped **only to reducing crawl volume.** The doc is gated on "if you don't need your faceted navigation URLs to show up in Google Search." robots.txt and `rel=canonical` are **not substitutes** — robots.txt forfeits indexing and signal consolidation. Rewrote §2.3, the §7.1 canonical table rows for sort/facet URLs, §14 item 3, and added a §16.3 guardrail requiring **branch-on-indexability before method selection.**
- Also encoded: Google's robots.txt example is user-agent-scoped with an `allow: /*?products=all$` carve-out; the crawlable branch requires the `&` separator, stable filter order in path-encoded filters, and a hard **404** (not a redirect to a generic error page) on zero-result combinations.

*Sources:* https://developers.google.com/crawling/docs/faceted-navigation · https://developers.google.com/crawling/docs/changelog · https://developers.google.com/search/blog/2024/12/crawling-december-faceted-nav · https://developers.google.com/search/blog/2014/02/faceted-navigation-best-and-5-of-worst · https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation

### 2. Merchant Center automatic item updates — "exactly four schema values required; client-side JS does not qualify" — **PARTIALLY_TRUE**

*Claim as originally written:* GMC automatic item updates require exactly `price`, `priceCurrency`, `availability`, `condition`, and structured data "must be present in the HTML returned from the web server" — client-side JS markup does not qualify.

*What survives:* both quoted sentences are **verbatim-accurate and still live** on `answer/7331077` as of 2026-09-01. Everything below concerns what they actually mean.

*Corrections applied:*
- **`condition` is not a schema.org property.** The property is **`itemCondition`**; `condition` is the *feed attribute* name. An executor emitting `"condition"` produces markup Google ignores. Added a hard rule in §5.4, §14 Tier 1 item 1, and a linter check in §16.1.
- **"Exactly four" is false as a spec.** `priceSpecification.price` / `priceSpecification.priceCurrency` is an equally valid encoding (`answer/6386198`).
- **Structured data is not a gate at all.** `answer/12157888`: with no/incomplete markup, "we rely on advanced data extractors… independent of structured data markup." The four values are accuracy-improving, not gating.
- **The JS prohibition is acknowledged by Google to be overstated.** Ryan Levering (Google, GMC crawling), June 2024: the crawler *can* render JS; the doc is "worded a bit more harshly than it should be"; "it's just a recommendation"; the real issue is "quality problems with the rendering and discrepancies." Google said it was reworking the wording — still unchanged 2+ years later. Reclassified as stale doc copy expressing a strong preference.
- **Client-rendered JSON-LD IS supported for organic rich results** ("Google Search can understand and process structured data that's available in the DOM when it renders the page"). The "fix once → rich results AND free listings" value prop does **not** collapse for React/Vue storefronts. §1.2 eligibility bullet rewritten.
- **The real Shopping penalty is degradation, not disqualification:** "dynamically-generated markup can make Shopping crawls less frequent and less reliable."
- **Requirement levels differ by surface:** on the Search merchant-listing spec, `offers.availability` and `itemCondition` are only **Recommended**. Don't hard-code one list.
- **Naming drift:** Merchant Center Next surfaces this as **"Automations"** (`answer/15623993`); scope is price/availability/condition, on by default.
- **Recommendations rewritten:**
  - §16.1 #2 (dual-fetch raw HTML + rendered DOM): **kept, rationale replaced.** It now detects raw-vs-rendered discrepancy and markup-vs-visible-price drift — the actual causes of GMC failure — with severity tiers, instead of flagging "client-side only" as disqualifying. This is a more defensible signal than the original.
  - §14 Tier 1 #1 "Server-rendered, never client-only" → server-rendered is the **default and recommendation**, client-side injection is a **valid fallback** on headless stacks.
  - §16.3: new guardrail forbidding the sales claim that a client-rendered storefront is ineligible.
  - §5.4: added the **two genuine disqualifiers** to enforce instead — landing pages that "change based on information about the customer, such as if you adapt prices based on a customer's IP address," and "Structured data must match the values that are shown to the customer."

*Sources:* https://support.google.com/merchants/answer/7331077 · https://support.google.com/merchants/answer/6386198 · https://support.google.com/merchants/answer/6069143 · https://support.google.com/merchants/answer/12157888 · https://support.google.com/merchants/answer/15623993 · https://developers.google.com/search/docs/appearance/structured-data/generate-structured-data-with-javascript · https://developers.google.com/search/docs/appearance/structured-data/merchant-listing · https://developers.google.com/search/docs/appearance/structured-data/product · https://www.seroundtable.com/google-warns-javascript-structured-data-37599.html

### 3–6. Confirmed, no changes made

| Claim | Verdict |
|---|---|
| Content API for Shopping v2.1 sunset **2026-08-18**; Merchant API v1beta discontinued **2026-02-28**; only Merchant API v1 at `merchantapi.googleapis.com` remains (§5.2, §16.1 #3) | **CONFIRMED** |
| `image_link` minimum **500 × 500 px** for all product images, enforcement **2027-01-31**, superseding 250×250 apparel / 100×100 non-apparel; max 64 MP / 16 MB (§5.6) | **CONFIRMED** |
| Shopify GraphQL Admin cost limits **100 / 200 / 1,000 / 2,000** points-per-second by plan, 1,000-point single-query cap, 250-item input arrays, 25,000-object pagination (§11.1, §16.1 #5) | **CONFIRMED** |
| Self-serving-review restriction is scoped to `LocalBusiness` / `Organization` only; `Product` → `aggregateRating` on a merchant's own customer reviews remains eligible (§1.6, §16.3) | **CONFIRMED** |
