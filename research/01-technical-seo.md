# Technical SEO: The Complete Auditable Checklist (2026)

**Research date:** 2026-08-31
**Purpose:** Specification-grade enumeration of every machine-checkable technical SEO check a professional crawler-based auditor performs in 2026, with detection logic, severity, fix, and auto-apply safety — designed to be turned directly into code for an autonomous SEO agent.

---

## 0. How to read this dossier

Every check is expressed with a stable ID so it can be a row in a `checks` table and a rule in a rules engine.

### 0.1 Canonical check record (recommended DB schema)

```sql
CREATE TABLE check_definitions (
  check_id        TEXT PRIMARY KEY,      -- e.g. 'RESP.301_CHAIN'
  category        TEXT NOT NULL,         -- RESP | CANON | ROBOTS | SMAP | ...
  name            TEXT NOT NULL,
  severity        TEXT NOT NULL,         -- critical | high | medium | low | insight
  detect_scope    TEXT NOT NULL,         -- url | site | template | resource | domain
  requires        TEXT[],                -- ['rendered_dom','gsc','crux','logs','sitemap']
  autonomy_tier   TEXT NOT NULL,         -- T0_auto | T1_auto_reversible | T2_propose | T3_human_only
  fix_kind        TEXT,                  -- header | html_head | redirect | robots | sitemap | content | link | none
  rollback        BOOLEAN NOT NULL
);

CREATE TABLE findings (
  finding_id   BIGSERIAL PRIMARY KEY,
  crawl_id     BIGINT NOT NULL,
  check_id     TEXT REFERENCES check_definitions,
  url          TEXT,
  evidence     JSONB,        -- raw values used to trigger, for diffing + rollback
  first_seen   TIMESTAMPTZ,
  last_seen    TIMESTAMPTZ,
  status       TEXT          -- open | fixed | wontfix | regressed | auto_fixed
);
```

### 0.2 Severity scale (aligned with the three major commercial tools)

| Tier | Sitebulb | Screaming Frog | Ahrefs | Our meaning |
|---|---|---|---|---|
| 1 | Critical | Issue (High priority) | Error (red) | Blocks indexing or serves wrong content to Google. Fix now. |
| 2 | High | Issue | Error | Materially degrades indexing/ranking of a template. |
| 3 | Medium | Warning | Warning (yellow) | Wastes crawl budget or dilutes signals. |
| 4 | Low | Warning/Opportunity | Notice (blue) | Hygiene; low measured impact. |
| 5 | Insight | Opportunity | Notice | Informational, needs human judgment. |

Reference counts for calibration: Screaming Frog ships **300+ issues** across the categories reproduced in §1–§20; Sitebulb ships **300+ Hints** across **15 categories** (Indexability, Links, On Page, Redirects, Internal, Search Traffic, XML Sitemaps, Security, International, Accessibility, AMP, Duplicate Content, Mobile Friendly, Performance, Rendered); Ahrefs Site Audit ships **170+** predefined issues across Internal pages, Indexability, Links, Redirects, Content, Social tags, Duplicates, Localization, Usability and performance, Images, JavaScript, CSS, Sitemaps, External pages, Other.

### 0.3 Autonomy tiers (used throughout)

- **T0_auto** — deterministic, provably safe, idempotent, no semantic judgment (e.g. add `loading="lazy"` to below-fold images, add missing `width`/`height`, strip a `<meta name="robots" content="all">`). Auto-apply with a diff log.
- **T1_auto_reversible** — safe but visible; auto-apply only if a one-click rollback exists and the change is confined to `<head>` or a header (e.g. add self-referencing canonical, add missing `alt`, fix hreflang return links).
- **T2_propose** — generate the exact patch, require approval (e.g. redirect maps, robots.txt edits, canonical *retargeting*, noindex additions).
- **T3_human_only** — never auto-apply (e.g. site migrations, mass noindex, robots.txt `Disallow: /`, canonical to a different domain, deleting URLs).

**Hard rule for the agent: any action whose failure mode is "site disappears from Google" is T2 minimum, and any *site-wide* instance of it is T3.** That set is exactly: `robots.txt` writes, `noindex` writes, `X-Robots-Tag` writes, canonical retargeting, redirect rules, and `Disallow` additions.

---

## 1. HTTP status codes, redirects, chains and loops (`RESP.*`)

### 1.1 Ground truth from Google (primary source, 2026)

| Fact | Value | Source |
|---|---|---|
| Redirect hops Googlebot follows | **up to 10 redirect hops**; beyond that recorded as a redirect error, content not indexed | Google, *How HTTP status codes, and network and DNS errors affect Google Search* |
| Redirect hops for **robots.txt** specifically | **up to 5**; then treated as `404` | Google, *robots.txt spec* |
| 301 vs 302/307 | `301`/`308` = **strong** canonicalization signal; `302`/`307` = **weak** signal | Google HTTP status doc |
| `4xx` | Content ignored, previously-indexed URLs **removed from index**. `404` and `410` treated substantially the same (410 slightly faster removal). | Google HTTP status doc |
| `429` | Treated as a **server error**, not a client error — signals overload | Google HTTP status doc |
| `5xx` | Crawlers **temporarily slow down**; URLs kept initially then dropped if persistent | Google HTTP status doc |
| Max bytes fetched | **first 15 MB** of a file; Googlebot uses a **2 MB** practical threshold for HTML | Google, *Overview of Google crawlers*; Sitebulb Critical hint "HTML file size exceeds Google's 2MB limit" |
| Protocols | HTTP/1.1 and HTTP/2 (also FTP/FTPS, rarely) | Google crawler overview |

### 1.2 Checks

| ID | Check | Programmatic detection | Sev | Fix | Autonomy |
|---|---|---|---|---|---|
| `RESP.5XX_INTERNAL` | Internal server error (5XX) | `status >= 500 && status <= 599 && is_internal` | Critical | Fix app/server; return 503 + `Retry-After` only for real maintenance | T3 |
| `RESP.4XX_INTERNAL` | Internal client error (4XX) | `400 <= status < 500 && is_internal && status != 429` | Critical | 301 to nearest live equivalent, or remove inlinks | T2 |
| `RESP.429` | Rate limited / crawl throttling | `status == 429` on Googlebot UA or own crawler | High | Raise crawl capacity; whitelist verified Googlebot | T2 |
| `RESP.NO_RESPONSE` | Connection timeout / DNS failure / reset | socket error, no HTTP status | Critical | Infra | T3 |
| `RESP.REDIRECT_CHAIN` | Redirect chain (hops ≥ 2) | Walk `Location` graph; `hops >= 2` | High | Rewrite source link **and** collapse rule to single hop to final 200 | T2 (rule) / T1 (internal link rewrite) |
| `RESP.REDIRECT_CHAIN_LONG` | Chain ≥ 5 hops (near Google's 10 limit) | `hops >= 5` | Critical | Collapse | T2 |
| `RESP.REDIRECT_LOOP` | Redirect loop | Cycle detected in `Location` graph (visited-set) | Critical | Break cycle | T2 |
| `RESP.INTERNAL_3XX` | Internal link points to a redirect | Internal `<a href>` target has `300 <= status < 400` | Medium | Rewrite `href` to final destination | **T1** (highest-volume safe auto-fix) |
| `RESP.302_PERMANENT` | Temporary redirect used for a permanent move | `status in (302,307)` AND stable across ≥ 2 crawls ≥ 14 days apart | Medium | Change to 301/308 | T2 |
| `RESP.META_REFRESH` | Meta refresh redirect | `<meta http-equiv="refresh" content="N;url=...">` | Medium | Replace with server 301 | T2 |
| `RESP.HTTP_REFRESH` | HTTP `Refresh:` header redirect | `Refresh` response header present | Medium | Replace with 301 | T2 |
| `RESP.JS_REDIRECT` | JS-only redirect | Rendered final URL ≠ raw HTML URL, no 3xx and no meta refresh | Medium | Server-side 301 | T2 |
| `RESP.REDIRECT_TO_404` | Redirect terminates on 4xx/5xx | Terminal node status ≥ 400 | High | Retarget | T2 |
| `RESP.REDIRECT_TO_NOINDEX` | Redirect terminates on a noindex URL | Terminal node has `noindex` | High | Retarget | T2 |
| `RESP.SOFT_REDIRECT_HOME` | Mass redirects to homepage | ≥ 20 distinct sources → `/` | High | Retarget to topical equivalents or serve real 404 | T2 |
| `RESP.MIXED_PROTOCOL_CHAIN` | `http→https→www` multi-hop | Chain contains both protocol change and host change | High | Single combined rule | T2 |
| `RESP.EXT_4XX` / `RESP.EXT_5XX` | Broken external link | External target ≥ 400 (recheck twice, 24h apart, honour 429/403 bot-blocking) | Medium | Update/remove link | T1 |
| `RESP.BLOCKED_ROBOTS` | Internal URL blocked by robots.txt but linked | robots matcher = disallow AND inlinks > 0 | High | Decide: unblock or delink | T2 |
| `RESP.BLOCKED_RESOURCE` | JS/CSS/image required for render is disallowed | Resource URL disallowed in robots.txt AND referenced by a rendered page | Critical | Unblock resource paths | T2 |
| `RESP.SLOW_TTFB` | Server response time | `ttfb_ms > 600` (Google's "good" TTFB guidance ≈ 800 ms; use 600 as warn, 1800 as critical) | High | Caching/CDN/origin | T2 |
| `RESP.NO_304` | No conditional-request support | Send `If-Modified-Since`/`If-None-Match`; server returns 200 with identical body | Medium | Implement ETag/Last-Modified → 304 (explicitly recommended by Google's crawl-budget doc) | T2 |
| `RESP.BAD_CONTENT_TYPE` | Content-Type mismatch | `Content-Type` header ≠ actual sniffed type | Medium | Fix header | T2 |
| `RESP.OVER_2MB_HTML` | HTML > 2 MB | `len(html_bytes) > 2_097_152` | Critical | Reduce payload (usually inlined JSON state) | T2 |
| `RESP.OVER_15MB` | Any resource > 15 MB | `len(bytes) > 15_728_640` | High | Split/compress | T2 |

### 1.3 Redirect-graph algorithm (implementation)

```python
def resolve_chain(url, fetch, max_hops=10):
    seen, chain = set(), []
    cur = url
    for hop in range(max_hops + 1):
        if cur in seen:
            return {"terminal": None, "chain": chain, "loop": True, "hops": hop}
        seen.add(cur)
        r = fetch(cur, allow_redirects=False)
        chain.append((cur, r.status))
        if not (300 <= r.status < 400 and r.headers.get("location")):
            return {"terminal": (cur, r.status), "chain": chain, "loop": False, "hops": hop}
        cur = urljoin(cur, r.headers["location"])
    return {"terminal": None, "chain": chain, "loop": False, "hops": max_hops + 1,
            "exceeds_google_limit": True}
```

Store the full chain in `findings.evidence` — it is what produces the "rewrite this `<a href>` to X" patch and what proves the fix later.

---

## 2. Canonicalization (`CANON.*`)

### 2.1 Ground truth (Google, *Consolidate duplicate URLs*)

Google's stated **signal strength ordering**:
1. **Redirects** — "a strong signal that the target of the redirect should become canonical."
2. **`rel="canonical"`** — "a strong signal that the specified URL should become canonical."
3. **Sitemap inclusion** — "a weak signal."
Plus: HTTPS preference, hreflang cluster membership, internal link patterns.

Key wording to encode: canonical is a **hint, not a directive** ("Google will identify which version of the URL is objectively the best version to show"). Google explicitly warns: *"Don't specify different URLs as canonical for the same page using different canonicalization techniques."* And: do **not** use robots.txt or the removals tool for canonicalization; do **not** use a fragment as canonical; do **not** use `noindex` to influence canonical selection within a site.

### 2.2 Checks

| ID | Check | Detection | Sev | Fix | Autonomy |
|---|---|---|---|---|---|
| `CANON.MISSING` | No canonical | No `<link rel=canonical>` in `<head>` and no `Link: <...>; rel="canonical"` header | Medium | Add self-referencing absolute canonical | **T1** |
| `CANON.MULTIPLE_CONFLICT` | Multiple conflicting canonicals | `count(distinct canonical_targets) > 1` across head + header + rendered DOM | Critical | Keep one | T2 |
| `CANON.MULTIPLE_SAME` | Multiple canonicals, same target | `count > 1`, one distinct value | Low | Dedupe | T1 |
| `CANON.HTML_HEADER_MISMATCH` | HTML canonical ≠ HTTP header canonical | compare normalized URLs | High | Reconcile | T2 |
| `CANON.OUTSIDE_HEAD` | Canonical outside `<head>` | Node's ancestor chain does not include `head`, or appears after first `<body>`-forcing tag in raw HTML | Critical | Move into `<head>` before any invalid element | T1 |
| `CANON.HEAD_BROKEN_EARLY` | `<head>` truncated by invalid element before canonical | Raw HTML: presence of `<img>`, `<div>`, `<iframe>`, `<noscript><img>`, `<p>` inside `<head>` preceding the canonical | Critical | Remove offending element | T2 |
| `CANON.RELATIVE` | Relative canonical | Value does not start with `http://`/`https://` | Medium | Absolutize | **T1** |
| `CANON.FRAGMENT` | Canonical contains `#` | `'#' in value` | High | Strip fragment | T1 |
| `CANON.EMPTY_MALFORMED` | Empty or unparseable | `value.strip()==''` or `urlparse` fails | High | Fix | T2 |
| `CANON.TO_NON_200` | Canonical target 4xx/5xx | Fetch target status ≥ 400 | High | Retarget | T2 |
| `CANON.TO_REDIRECT` | Canonical target redirects | Target status 3xx | Medium | Point to final URL | T1 |
| `CANON.TO_NOINDEX` | Canonical target is noindex | Target has noindex | High | Remove noindex or retarget | T2 |
| `CANON.TO_DISALLOWED` | Canonical target blocked by robots.txt | robots matcher disallow | High | Unblock | T2 |
| `CANON.CHAIN` | Canonical points to another canonicalized URL | `canonical(target) != target` | High | Point directly to the final canonical | T1 |
| `CANON.LOOP` | Canonical loop (A→B→A) | Cycle in canonical graph | High | Break | T2 |
| `CANON.TO_HTTP` | Canonical points to HTTP while site is HTTPS | scheme mismatch | Critical | Fix scheme | **T1** |
| `CANON.TO_HOMEPAGE` | Deep page canonicalizes to `/` | `target == origin + '/'` and `source != origin + '/'` | Medium | Almost always a CMS bug — self-reference | T2 |
| `CANON.CANONICALISED` | Page is canonicalised away (non-self) | `canonical != self` | Insight | Confirm intentional; check it is not in sitemap | T2 |
| `CANON.CANONICALISED_IN_SITEMAP` | Canonicalised URL present in XML sitemap | set intersection | High | Remove from sitemap (conflicting signal) | **T1** |
| `CANON.NOINDEX_AND_CANONICAL` | `noindex` + canonical to another URL | both present | High | Conflicting signals — pick one (Google: don't use noindex for canonicalization) | T2 |
| `CANON.RENDER_MISMATCH` | Rendered canonical ≠ raw HTML canonical | diff raw vs rendered | High | Serve canonical in raw HTML | T2 |
| `CANON.RENDER_ONLY` | Canonical only exists after JS | absent raw, present rendered | High | Server-side render it | T2 |
| `CANON.UNLINKED` | Canonical target has no internal inlinks | `inlinks(target) == 0` | Medium | Link to it | T1 |
| `CANON.CROSS_DOMAIN` | Canonical to a different registrable domain | eTLD+1 differs | Insight | Verify intentional (syndication) | T3 |
| `CANON.PARAM_VARIANT` | Parameterised duplicates lacking canonical to clean URL | URL has tracking params (`utm_*`, `gclid`, `fbclid`, `msclkid`, `_ga`) AND canonical == self-with-params | High | Canonical to param-stripped URL | T1 |
| `CANON.WWW_SPLIT` | Both www and non-www return 200 | fetch both hosts | Critical | 301 one to the other | T2 |
| `CANON.TRAILING_SLASH_SPLIT` | `/path` and `/path/` both 200 with same content | fetch both | High | 301 one form | T2 |
| `CANON.CASE_SPLIT` | Case variants both 200 | fetch lowercased variant | Medium | 301 to lowercase | T2 |
| `CANON.INDEX_HTML_SPLIT` | `/dir/` and `/dir/index.html` both 200 | fetch both | Medium | 301 | T2 |

### 2.3 "Conflicting signals" detector (the check nobody ships well)

Build a per-URL **signal vector** and flag disagreement. This is the single highest-value differentiator for an autonomous auditor.

```python
SIGNALS = ["self_canonical", "http_status", "robots_meta", "x_robots_tag",
           "robots_txt_allow", "in_xml_sitemap", "hreflang_self", "internal_inlinks",
           "gsc_google_canonical", "gsc_coverage_state"]

def conflict_score(u):
    wants_index = []
    if u.robots_meta_noindex or u.x_robots_noindex: wants_index.append(False)
    if u.in_xml_sitemap: wants_index.append(True)
    if u.canonical == u.url: wants_index.append(True)
    if u.canonical and u.canonical != u.url: wants_index.append(False)
    if not u.robots_txt_allowed: wants_index.append(False)
    if u.internal_inlinks > 0: wants_index.append(True)
    if u.gsc_google_canonical and u.gsc_google_canonical != u.canonical:
        return ("GOOGLE_DISAGREES", u.gsc_google_canonical)
    return ("CONFLICT" if (True in wants_index and False in wants_index) else "OK", None)
```

Named conflict patterns to ship as discrete checks:

| ID | Pattern | Sev |
|---|---|---|
| `CONF.NOINDEX_IN_SITEMAP` | `noindex` + present in XML sitemap | High |
| `CONF.DISALLOW_PLUS_NOINDEX` | robots.txt `Disallow` + `noindex` meta (Google can never see the noindex) | High |
| `CONF.CANON_VS_HREFLANG` | hreflang points at URL X, canonical points at Y ≠ X | High |
| `CONF.CANON_VS_REDIRECT` | canonical says A, server 301s A→B | High |
| `CONF.GOOGLE_CHOSE_OTHER` | GSC URL Inspection `googleCanonical != userCanonical` | High |
| `CONF.SITEMAP_VS_NOINDEX_HEADER` | sitemap URL returns `X-Robots-Tag: noindex` | High |
| `CONF.PAGINATED_CANON_TO_P1` | page 2..n canonicalises to page 1 (deprecated pattern; hides items) | Medium |

---

## 3. robots.txt (`ROBOTS.*`)

### 3.1 Ground truth (Google, *robots.txt spec*, verified 2026-08-31)

| Rule | Exact value |
|---|---|
| Location | Top-level directory of the host/protocol/port; per-origin |
| Encoding | UTF-8 plain text |
| **Max size Google parses** | **500 kibibytes (KiB)** — content past that is ignored |
| Recognised fields | `user-agent`, `disallow`, `allow`, `sitemap` — **only these four** |
| `crawl-delay` | **Not supported by Google** (Bing/Yandex do support it) |
| Precedence | **Least restrictive rule wins**; specificity by **longest matching path** |
| Wildcards | `*` = zero-or-more chars; `$` = end-of-URL anchor; trailing `*` is a no-op (`/fish*` ≡ `/fish`) |
| HTTP `2xx` | Rules processed normally |
| HTTP `3xx` | Follows **up to 5** redirects, then treats as `404` |
| HTTP `4xx` (except 429) | Treated as **"no restrictions"** — full crawl allowed |
| HTTP `5xx` / 429 | After 12 hours of failures Google uses the **cached** version for up to **30 days**; if no cache, assumes no restrictions |
| Cache duration | **Up to 24 hours**, modulated by `Cache-Control` |
| Interaction with `noindex` | If a URL is disallowed, Google **never sees** the `noindex` → the rule is ignored and the URL can still be indexed URL-only |

### 3.2 Checks

| ID | Check | Detection | Sev | Fix | Autonomy |
|---|---|---|---|---|---|
| `ROBOTS.MISSING` | No robots.txt | `GET /robots.txt` → 404 | Low | Add minimal file with `Sitemap:` line | T1 |
| `ROBOTS.5XX` | robots.txt returns 5xx | status ≥ 500 | **Critical** | Fix immediately — Google will keep the 30-day cache then stop crawling | T3 alert |
| `ROBOTS.REDIRECTS` | robots.txt redirects | 3xx (esp. cross-host or > 5 hops) | High | Serve 200 at each origin | T2 |
| `ROBOTS.WRONG_CONTENT_TYPE` | Not `text/plain` | `Content-Type` header | Medium | Fix | T2 |
| `ROBOTS.OVER_500KIB` | > 500 KiB | `len(bytes) > 512000` | High | Shrink; move rules to meta robots | T2 |
| `ROBOTS.DISALLOW_ALL` | `Disallow: /` for `*` or `Googlebot` | parse | **Critical** | Emergency alert; almost always a staging config leaked to prod | T3 alert |
| `ROBOTS.BLOCKS_CSS_JS` | Disallow matches `.css`/`.js` used in render | intersect rendered resource list with matcher | Critical | Add `Allow:` for those paths | T2 |
| `ROBOTS.BLOCKS_IMAGES` | Disallow matches images used on indexable pages | intersect | High | Allow | T2 |
| `ROBOTS.BLOCKS_SITEMAP_URLS` | Sitemap contains disallowed URLs | intersect sitemap set with matcher | High | Remove from sitemap or unblock | T1 (sitemap side) |
| `ROBOTS.NOINDEX_DIRECTIVE` | Legacy `Noindex:` line in robots.txt | regex `^\s*noindex\s*:` | High | Unsupported since 2019 — remove and use meta robots | T1 |
| `ROBOTS.CRAWL_DELAY` | `Crawl-delay` present | parse | Low | No-op for Google; note it does affect Bing | T1 |
| `ROBOTS.NO_SITEMAP_LINE` | No `Sitemap:` directive | parse | Low | Add | **T0** |
| `ROBOTS.SITEMAP_LINE_404` | `Sitemap:` URL 404s | fetch | Medium | Fix URL | T1 |
| `ROBOTS.SITEMAP_RELATIVE` | `Sitemap:` value is relative | not absolute | Medium | Absolutize | T0 |
| `ROBOTS.SYNTAX_ERROR` | Unknown/malformed directive lines | line not matching the 4 fields + comments | Low | Clean | T1 |
| `ROBOTS.UA_ORDER_TRAP` | A `User-agent: *` group appears before a `Googlebot` group and author expects merge | group analysis: Googlebot group exists → `*` group is entirely ignored for Googlebot | High | Duplicate needed rules into the Googlebot group | T2 |
| `ROBOTS.BLOCKS_AI_UNINTENDED` | `Google-Extended`, `GPTBot`, `ClaudeBot`, `PerplexityBot`, `CCBot`, `Applebot-Extended`, `Bytespider`, `meta-externalagent` blocked | parse | Insight | Surface as a **policy choice**, never auto-change | T3 |
| `ROBOTS.CHANGED` | robots.txt content changed since last crawl | content hash diff | High | Diff alert with before/after | T0 (alerting) |

**Implementation note:** do not hand-roll the matcher. Use Google's own open-source C++ implementation (`google/robotstxt`, Apache-2.0) or the Python port `protego` (used by Scrapy) — it implements longest-match + least-restrictive semantics and `$`/`*`. Naive `robotparser` from Python stdlib does **not** implement wildcards correctly.

### 3.3 AI crawler control (2026 reality check)

- **`llms.txt` is not read by Google.** Gary Illyes (Google Search Central Live) and John Mueller have both stated Google Search has no system that reads or acts on `llms.txt`; Mueller compared it to the keywords meta tag. An Ahrefs study of 137K sites found **97% of `llms.txt` files were never requested** by any AI crawler. *(Ahrefs study is vendor research, not a primary standard — flagged.)*
- **`Google-Extended` is a robots.txt token, not a crawler with its own user agent.** Blocking it controls Gemini/Vertex grounding use, **not** Google Search indexing.
- Ship `llms.txt` generation as an **opt-in, clearly-labelled experimental** feature. Do not present it as a ranking factor.

---

## 4. Meta robots / X-Robots-Tag (`DIRECT.*`)

### 4.1 Ground truth (Google, *Robots meta tag, data-nosnippet, and X-Robots-Tag*)

Supported values: `all`, `noindex`, `nofollow`, `none`, `nosnippet`, `indexifembedded`, `max-snippet:[n]`, `max-image-preview:[none|standard|large]`, `max-video-preview:[n]`, `notranslate`, `noimageindex`, `unavailable_after:[date]`.

Header form: `X-Robots-Tag: noindex, nofollow`; UA-targeted form `X-Robots-Tag: googlebot: noindex`. Meta-tag UA tokens Google honours: `googlebot`, `googlebot-news`.

**Conflict resolution: "In the case of conflicting robots rules, the more restrictive rule applies."**
**Blocking rule: "If a page is disallowed from crawling through the robots.txt file, then any information about indexing or serving rules will not be found and will therefore be ignored."**

`data-nosnippet` is valid only on `<span>`, `<div>`, `<section>` with properly closed tags.

**Stale/uncertain — flag:** current Google docs list `noarchive`/`nocache` and `nositelinkssearchbox` as no longer used (consistent with the Sept-2024 removal of cached-page links). Treat as "parsed but no-op"; do not auto-remove, just report.

### 4.2 Checks

| ID | Check | Detection | Sev | Autonomy |
|---|---|---|---|---|
| `DIRECT.NOINDEX_INDEXABLE_TEMPLATE` | `noindex` on a page with organic clicks in GSC | meta/header noindex AND GSC clicks(28d) > 0 | **Critical** | T2 (alert) |
| `DIRECT.NOINDEX_UNEXPECTED` | `noindex` on a URL present in the sitemap | intersect | High | T1 (remove from sitemap) |
| `DIRECT.NOINDEX_HTML_HEADER_MISMATCH` | noindex in header but not HTML (or vice versa) | compare | High | T2 |
| `DIRECT.MULTIPLE_NOINDEX` | Multiple `noindex` declarations | count | Medium | T1 |
| `DIRECT.OUTSIDE_HEAD` | Meta robots outside `<head>` | DOM ancestry | **Critical** (ignored by Google) | T1 |
| `DIRECT.RENDER_ONLY_NOINDEX` | `noindex` only in original HTML, removed by JS | raw has noindex, rendered does not | **Critical** — Google uses the raw signal at crawl time and may drop before render | T2 |
| `DIRECT.JS_ADDED_NOINDEX` | `noindex` only in rendered DOM | rendered has noindex, raw does not | High | T2 |
| `DIRECT.NOFOLLOW_SITEWIDE` | `nofollow` on templates with internal links | meta nofollow AND outlinks > 0 | High | T2 |
| `DIRECT.NONE` | `none` used (= noindex,nofollow) | parse | High | T2 |
| `DIRECT.UNAVAILABLE_AFTER_PAST` | `unavailable_after` date in the past | parse RFC 822/850/ISO 8601 | Medium | T1 |
| `DIRECT.NOSNIPPET_ON_MONEY_PAGE` | `nosnippet` on high-traffic page | parse + GSC | Medium | T2 |
| `DIRECT.MAX_SNIPPET_ZERO` | `max-snippet:0` | parse | Medium | T2 |
| `DIRECT.NO_MAX_IMAGE_PREVIEW` | Missing `max-image-preview:large` on visual content | absent on Article/Product pages | Low (opportunity: larger Discover/Search thumbnails) | **T1** |
| `DIRECT.NOIMAGEINDEX` | `noimageindex` present | parse | Medium | T2 |
| `DIRECT.INVALID_VALUE` | Unrecognised directive token | not in supported set | Low | T1 |
| `DIRECT.DISALLOW_MASKS_NOINDEX` | Disallowed **and** noindex | robots matcher + meta | High | T2 |

---

## 5. XML sitemaps (`SMAP.*`)

### 5.1 Ground truth (Google, *Build and submit a sitemap*, verified 2026-08-31)

| Rule | Value |
|---|---|
| Max per sitemap | **50,000 URLs** or **50 MB uncompressed** — whichever comes first, for all formats |
| Sitemap index | Same limits: 50,000 sitemaps / 50 MB |
| Formats | XML (only format supporting image/video/news/hreflang extensions), RSS/Atom, plain text |
| Encoding | **UTF-8**, entity-escaped |
| URLs | Must be **fully-qualified absolute** URLs on the same host as the sitemap (or cross-host if cross-submission is verified in GSC) |
| `<priority>` | **Ignored by Google** |
| `<changefreq>` | **Ignored by Google** |
| `<lastmod>` | Used **only if consistently accurate**; must reflect significant content change, not a template/copyright date. W3C Datetime format. |
| Submission | GSC Sitemaps report, **Search Console API `sitemaps.submit`**, `Sitemap:` line in robots.txt, WebSub for RSS/Atom |
| **Ping endpoint** | **DEAD — confirmed by live probe 2026-09-01.** `https://www.google.com/ping?sitemap=…` returns **HTTP 404** with no redirect. Announced June 2023, effective end of 2023. Bing removed theirs too (Bing's equivalent returns **410**, not 404). Do not implement. |

Screaming Frog ships exactly: `XML Sitemap With Over 50k URLs`, `XML Sitemap Over 50mb`, `URLs Not In Sitemap`, `Orphan URLs`, `Non-Indexable URLs In Sitemap`, `URLs In Multiple Sitemaps`.

### 5.2 Checks

| ID | Check | Detection | Sev | Fix | Autonomy |
|---|---|---|---|---|---|
| `SMAP.MISSING` | No sitemap discoverable | robots.txt has no `Sitemap:`, `/sitemap.xml` and `/sitemap_index.xml` 404 | High | Generate | T1 |
| `SMAP.OVER_50K` | > 50,000 `<url>` entries | count | High | Split + index file | **T0** (if we own generation) |
| `SMAP.OVER_50MB` | > 50 MB uncompressed | byte length after gunzip | High | Split | T0 |
| `SMAP.MALFORMED_XML` | Parse error | XML parser exception | Critical | Regenerate | T1 |
| `SMAP.WRONG_NAMESPACE` | Missing/incorrect `xmlns` | root attr ≠ `http://www.sitemaps.org/schemas/sitemap/0.9` | High | Fix | T0 |
| `SMAP.NON_200` | Sitemap URL not 200 | status | Critical | Fix | T2 |
| `SMAP.GZIP_BROKEN` | `.gz` not valid gzip | decompress error | High | Fix | T1 |
| `SMAP.CONTAINS_NON_200` | Sitemap URLs returning 3xx/4xx/5xx | fetch each | High | Remove or fix | **T1** (removal) |
| `SMAP.CONTAINS_NOINDEX` | Sitemap URLs with noindex | fetch + parse | High | Remove | **T1** |
| `SMAP.CONTAINS_CANONICALISED` | Sitemap URLs canonicalising elsewhere | canonical ≠ self | High | Remove | **T1** |
| `SMAP.CONTAINS_DISALLOWED` | Sitemap URLs blocked by robots.txt | matcher | High | Remove/unblock | T1 |
| `SMAP.RELATIVE_URLS` | Relative `<loc>` | not absolute | Critical | Absolutize | T0 |
| `SMAP.CROSS_HOST` | `<loc>` on a different host than the sitemap | host compare | High | Move or cross-verify in GSC | T2 |
| `SMAP.MIXED_PROTOCOL` | http URLs in an https site's sitemap | scheme | High | Fix | T0 |
| `SMAP.UNESCAPED_ENTITIES` | Raw `&`, `<`, `>`, `'`, `"` in `<loc>` | regex on raw text | High | Escape | T0 |
| `SMAP.LASTMOD_MISSING` | No `<lastmod>` | absent | Low | Add real values | T1 |
| `SMAP.LASTMOD_INVALID_FORMAT` | Not W3C Datetime | regex `^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z\|[+-]\d{2}:\d{2}))?$` | Medium | Fix | T0 |
| `SMAP.LASTMOD_FUTURE` | `lastmod` in the future | `> now()` | Medium | Fix | T0 |
| `SMAP.LASTMOD_ALL_IDENTICAL` | Every URL has the same `lastmod` | `count(distinct) == 1 && n > 50` | High — Google will start ignoring lastmod for the whole site | Emit real per-URL modification dates | T1 |
| `SMAP.LASTMOD_ALL_TODAY` | `lastmod` == today for > 90% of URLs on consecutive crawls | rolling comparison | High | Same | T1 |
| `SMAP.LASTMOD_CONTRADICTS_CONTENT` | `lastmod` newer than last observed content-hash change | compare with stored `content_sha256` history | Medium | Stop touching lastmod without a real edit | T1 |
| `SMAP.PRIORITY_PRESENT` | `<priority>` used | present | Low (no-op) | Remove for byte savings | T0 |
| `SMAP.CHANGEFREQ_PRESENT` | `<changefreq>` used | present | Low (no-op) | Remove | T0 |
| `SMAP.DUP_ACROSS_SITEMAPS` | Same URL in multiple sitemaps | set count > 1 | Low | Dedupe (breaks per-sitemap coverage reporting in GSC) | T1 |
| `SMAP.INDEX_NESTED_TOO_DEEP` | Sitemap index referencing another index | nested `<sitemapindex>` | Medium | Flatten to one level | T1 |
| `SMAP.NOT_IN_ROBOTS` | Sitemap exists but not declared in robots.txt | parse | Low | Add line | **T0** |
| `SMAP.NOT_SUBMITTED_GSC` | Sitemap not listed via `sitemaps.list` | API | Medium | `sitemaps.submit` | **T1** |
| `SMAP.GSC_ERRORS` | GSC reports sitemap errors/warnings | `sitemaps.get` → `errors`, `warnings`, `isPending`, `lastDownloaded` | High | Investigate | T2 |
| `SMAP.STALE_DOWNLOAD` | `lastDownloaded` > 30 days ago | API | Medium | Resubmit + verify accessibility | T1 |
| `SMAP.HREFLANG_MISMATCH` | `xhtml:link` alternates in sitemap disagree with on-page hreflang | compare sets | High | Reconcile | T2 |
| `SMAP.IMAGE_EXT_MISSING` | No `<image:image>` on image-heavy site | absent | Low | Add | T1 |
| `SMAP.VIDEO_EXT_INVALID` | Missing required video fields (`thumbnail_loc`, `title`, `description`, and one of `content_loc`/`player_loc`) | parse | Medium | Fix | T1 |

### 5.3 Indexation gap analysis (sitemap × crawl × GSC)

Compute six disjoint sets every run. This is the core "indexation gap" report and it is what a human SEO actually wants.

```
S = URLs in XML sitemap(s)
C = indexable URLs discovered by our crawler (status 200, self-canonical, not noindex, robots-allowed)
G = URLs GSC reports as indexed  (via URL Inspection API per-URL, or BigQuery bulk export impressions as a proxy)
```

| Set | Meaning | Check ID | Action |
|---|---|---|---|
| `C \ S` | Crawlable but **not in sitemap** | `GAP.NOT_IN_SITEMAP` | Add to sitemap (T0 if we generate) |
| `S \ C` | In sitemap but **not reachable by crawl** = **orphan** | `GAP.ORPHAN_SITEMAP` | Add internal links (T2) |
| `S ∩ C \ G` | Submitted + crawlable but **not indexed** | `GAP.SUBMITTED_NOT_INDEXED` | Diagnose via URL Inspection `coverageState` |
| `G \ S` | Indexed but not in sitemap | `GAP.INDEXED_NOT_SUBMITTED` | Usually parameterised/duplicate — canonicalise |
| `G \ C` | Indexed but not linked = **live orphan** | `GAP.ORPHAN_INDEXED` | Link or remove |
| `logs \ (S ∪ C)` | Googlebot crawls URLs we don't know about | `GAP.ORPHAN_LOGS` | Investigate crawler traps |

**GSC index-coverage data IS available per-URL, but there is no bulk/aggregate export of the Page Indexing report.** *(Corrected 2026-09-01 — the earlier claim "no API for the Index Coverage report" was wrong.)* The URL Inspection API (`POST v1/urlInspection/index:inspect`) returns `IndexStatusInspectionResult.coverageState` — the **same human-readable string the Page Indexing report shows** (`"Submitted and indexed"`, `"Crawled - currently not indexed"`, `"Discovered - currently not indexed"`, …) — plus `verdict` (PASS/PARTIAL/FAIL/NEUTRAL), `robotsTxtState`, `indexingState` (`INDEXING_ALLOWED` / `BLOCKED_BY_META_TAG` / `BLOCKED_BY_HTTP_HEADER` / `BLOCKED_BY_ROBOTS_TXT`), `pageFetchState` (12 enum values incl. `SOFT_404`, `REDIRECT_ERROR`), `crawledAs`, `googleCanonical`, `userCanonical`, `sitemap[]`, `referringUrls[]`, `lastCrawlTime`. What does **not** exist is a bulk/aggregate endpoint returning the whole report — you must poll URL-by-URL against the hard cap. Options, in order of preference:
1. **Bulk Data Export → BigQuery** (`searchdata_url_impression`) — gives every URL that got an impression = a strong proxy for "indexed and serving". The only *bulk* option.
2. **URL Inspection API** — authoritative per-URL `coverageState`, but capped at **2,000 QPD / 600 QPM per property** (10,000,000 QPD / 15,000 QPM per Cloud project). Use as the diagnostic scalpel, not the census.
3. Site: queries / scraping — brittle, against ToS. Don't.

---

## 6. Crawl budget, crawl depth, crawler traps (`CRAWL.*`)

### 6.1 Ground truth (Google, *Large site owner's guide to managing crawl budget*)

- **Crawl capacity limit** = "the total amount of time your server spends holding connections open for Google" (parallel connections × duration).
- **Crawl demand** = size, update frequency, page quality, relative popularity.
- **Applies to:** large sites (**1M+ unique pages**, content changing ~weekly), medium/large sites (**10k+ unique pages**) with rapidly changing content, and any site with a large share of `Discovered - currently not indexed`.
- Explicit guidance: **"Don't use `noindex`"** to save crawl budget — Google still requests the page. Use robots.txt.
- Return **`404`/`410`** for permanently removed content rather than blocking it.
- **Support `304 (Not Modified)`** to reduce bandwidth.
- Consolidate duplicate content; improve server response time.
- Only two ways to *increase* budget: add server resources (if capacity-limited), or improve content quality/popularity (if demand-limited).
- The **Crawl Rate Limiter tool in Search Console was removed (Jan 2024)** — Google now auto-adjusts based on 500/503/429 responses. *(2024 fact — flagged as possibly stale, but no reinstatement found.)*

### 6.2 Checks

| ID | Check | Detection | Sev |
|---|---|---|---|
| `CRAWL.DEPTH_GT_3` | Click depth from homepage > 3 | BFS shortest path over follow-able internal links | Medium |
| `CRAWL.DEPTH_GT_5` | Depth > 5 | BFS | High |
| `CRAWL.ORPHAN` | 0 internal follow inlinks, but exists | inlink count | High |
| `CRAWL.INFINITE_SPACE` | Crawler trap | path segment repeats ≥ 3× (`/a/b/a/b/a/b`), or unique-URL growth continues while unique content-hash count plateaus | Critical |
| `CRAWL.CALENDAR_TRAP` | Date-parameter infinite space | URL matches `[?&](date\|month\|year\|day)=` with unbounded distinct values | High |
| `CRAWL.SESSION_ID` | Session IDs in URLs | `[?&](sid\|sessionid\|phpsessid\|jsessionid)=` | High |
| `CRAWL.FACET_EXPLOSION` | Combinatorial facet URLs | ≥ 3 distinct filter params co-occurring; count distinct combos | High |
| `CRAWL.SORT_PARAMS` | Sort/view params crawlable | `[?&](sort\|order\|orderby\|view\|display\|limit\|per_page)=` and not disallowed | Medium |
| `CRAWL.THIN_RATIO` | Crawl waste ratio | `1 - (indexable_200_selfcanon / total_discovered)`; alert > 0.4 | High |
| `CRAWL.LOW_VALUE_CRAWL_SHARE` | Googlebot hits on non-indexable URLs (logs) | `hits_on_noindex_or_3xx_or_4xx / total_googlebot_hits`; alert > 0.3 | High |
| `CRAWL.SLOW_UNDER_LOAD` | TTFB rises with concurrency | measure p95 TTFB at 1 vs 5 concurrent | High |
| `CRAWL.STALE_IMPORTANT` | High-value URL not crawled recently | logs: `days_since_last_googlebot_hit > 30` on URLs with clicks > 0 | High |
| `CRAWL.DISCOVERED_NOT_INDEXED` | Large `Discovered - currently not indexed` bucket | URL Inspection `coverageState` | High |

### 6.3 Crawl-depth / internal PageRank computation

Two distinct numbers; ship both.

**(a) Click depth** — unweighted BFS from the homepage over `<a href>` links that are (i) internal, (ii) not `rel=nofollow`, (iii) resolve to an indexable URL. Store `depth` per URL.

**(b) Internal PageRank** — power iteration on the internal link graph:

```python
import numpy as np
def internal_pagerank(edges, nodes, d=0.85, iters=50, tol=1e-8):
    n = len(nodes); idx = {u: i for i, u in enumerate(nodes)}
    out = np.zeros(n)
    for s, t in edges: out[idx[s]] += 1
    r = np.full(n, 1.0 / n)
    for _ in range(iters):
        new = np.full(n, (1 - d) / n)
        dangling = sum(r[idx[u]] for u in nodes if out[idx[u]] == 0)
        new += d * dangling / n
        for s, t in edges:
            new[idx[t]] += d * r[idx[s]] / out[idx[s]]
        if np.abs(new - r).sum() < tol: r = new; break
        r = new
    return dict(zip(nodes, r))
```

Derived checks:

| ID | Check | Detection |
|---|---|---|
| `LINK.PR_STARVED_MONEY_PAGE` | Page with GSC impressions in top quartile but internal PR in bottom quartile | join PR × GSC |
| `LINK.PR_WASTED` | High internal PR flowing to non-indexable URLs | sum of PR on noindex/canonicalised/3xx URLs ÷ total |
| `LINK.HUB_OVERLOAD` | > 300 internal outlinks on one page | count (Screaming Frog: `Pages With High Internal Outlinks`) |
| `LINK.NO_OUTLINKS` | Page with zero internal outlinks (dead end) | count == 0 |
| `LINK.NOFOLLOW_INTERNAL` | Internal links with `rel=nofollow` | attribute scan |
| `LINK.NOFOLLOW_ONLY_INLINKS` | Page reachable only via nofollow links | inlink rel analysis |
| `LINK.JS_ONLY_LINKS` | Links only present after render / `onclick` navigation without `href` | raw vs rendered anchor-set diff; `<a>` without `href`; `<div onclick>` |
| `LINK.EMPTY_ANCHOR` | Internal outlink with no anchor text and no image alt | text.strip()=='' and no img alt |
| `LINK.GENERIC_ANCHOR` | Non-descriptive anchor | anchor ∈ {"click here","read more","here","this","learn more","more"} |
| `LINK.INLINK_CONCENTRATION` | Gini coefficient of inlink distribution | compute Gini; > 0.85 = over-concentrated |
| `LINK.BROKEN_INTERNAL` | Internal link → 4xx/5xx | status |
| `LINK.BROKEN_FRAGMENT` | `#anchor` target id does not exist on destination | parse destination DOM for `id`/`name` |
| `LINK.LOCALHOST` | Link to `localhost`/`127.0.0.1`/`.local`/staging host | host match |
| `LINK.UNSAFE_CROSS_ORIGIN` | `target="_blank"` without `rel="noopener"` | attribute scan | 
| `LINK.PROTOCOL_RELATIVE` | `//example.com/x` resource links | scan |

---

## 7. Pagination (`PAGE.*`)

**Status of `rel="next"`/`rel="prev"`:** Google announced in **March 2019** that it had not used these for indexing for years and removed them from documentation. They are still honoured by Bing and are still valid HTML. *(2019 fact; no reversal found through 2026.)* Screaming Frog still ships a Pagination issue group because the *structure* matters even though the markup hint does not.

Current Google position: paginated pages should each be **self-canonical**, each page must be **crawlable via real `<a href>` links**, and page 2..n should **not** canonicalise to page 1.

| ID | Check | Detection | Sev | Fix | Autonomy |
|---|---|---|---|---|---|
| `PAGE.CANON_TO_P1` | Page 2..n canonicalises to page 1 | canonical == page-1 URL | High | Self-canonical each page | T2 |
| `PAGE.NOT_IN_ANCHOR` | Pagination links not in `<a href>` (button/JS) | rendered anchors ∌ pagination URLs but raw JS contains them | High | Real `<a href>` | T2 |
| `PAGE.NON_200` | Pagination URL returns non-200 | status | High | Fix | T2 |
| `PAGE.UNLINKED` | Paginated URL exists but is unreachable | discovered via sitemap/logs only | Medium | Link it | T2 |
| `PAGE.LOOP` | `rel=next` chain loops | cycle detection | Medium | Fix | T2 |
| `PAGE.SEQUENCE_ERROR` | Non-sequential rel next/prev | value ordering | Low | Fix | T1 |
| `PAGE.NOINDEX` | Paginated pages noindexed | meta robots | Medium | Usually wrong — it orphans deep items | T2 |
| `PAGE.INFINITE_SCROLL_NO_URLS` | Infinite scroll with no paginated URL equivalents | rendered DOM grows on scroll, no `?page=` URLs exist | High | Add crawlable paginated URLs (History API + real links) | T2 |
| `PAGE.DUPLICATE_TITLES` | Page 2..n identical `<title>` to page 1 | string equality | Low | Append " - Page N" | **T1** |
| `PAGE.VIEW_ALL_MISSING` | No view-all option on long lists | heuristic | Insight | Optional | T3 |

---

## 8. Faceted navigation & URL parameters (`PARAM.*`)

### 8.1 Ground truth (Google, *Faceted navigation best practices*, doc updated **December 2025**)

- Two named harms: **"overcrawling"** of seemingly-novel URLs, and **"slower discovery crawls"**.
- "Crawling faceted URLs tends to cost sites large amounts of computing resources."
- Use **standard `&` separators**. Commas, semicolons, brackets as separators are hard for crawlers to detect.
- Path-based filters: keep a **consistent logical order**, no duplicate filters.
- Prevention options: robots.txt `Disallow` for faceted URLs while allowing base pages; **URL fragments** (`#products=fish&color=green`) which crawlers ignore; `rel="canonical"` to the unfiltered version; `rel="nofollow"` on facet links (only effective if **every** anchor to that URL has it).
- If facets must be crawlable: return **`404`** for impossible filter combinations rather than redirecting to an error page.
- **The URL Parameters tool is gone** (removed from Search Console in April 2022) — no mention in current docs.

### 8.2 Checks

| ID | Check | Detection | Sev |
|---|---|---|---|
| `PARAM.TRACKING_INDEXABLE` | Tracking params on indexable URLs | param ∈ {`utm_source`,`utm_medium`,`utm_campaign`,`utm_term`,`utm_content`,`utm_id`,`gclid`,`gbraid`,`wbraid`,`fbclid`,`msclkid`,`ttclid`,`twclid`,`li_fat_id`,`igshid`,`mc_cid`,`mc_eid`,`_ga`,`_gl`,`yclid`,`ref`,`referrer`} and canonical == self | High |
| `PARAM.NON_STANDARD_SEPARATOR` | `,`/`;`/`[`/`]` used as param separator | regex on query string | Medium |
| `PARAM.ORDER_VARIANTS` | Same param set, different order, both 200 | normalise by sorting params; hash | High |
| `PARAM.CASE_VARIANTS` | Param value case variants | lowercase compare | Medium |
| `PARAM.EMPTY_VALUE` | `?filter=&sort=` empty params | regex `[?&][^=&]+=(&\|$)` | Low |
| `PARAM.DUPLICATE_KEY` | `?a=1&a=2` | key count > 1 | Low |
| `PARAM.FACET_COMBO_COUNT` | Distinct facet combinations crawled | count distinct param-sets per path prefix; alert > 1000 | High |
| `PARAM.FACET_ZERO_RESULTS` | Facet URL with 0 results returns 200 | rendered text matches `no results\|0 products\|nothing found` + item count 0 | High (soft 404) |
| `PARAM.FACET_NOT_DISALLOWED` | Facet params crawlable and not canonicalised | robots allow + self-canonical | High |
| `PARAM.FACET_IN_SITEMAP` | Facet URLs in the XML sitemap | intersect | High |
| `PARAM.FRAGMENT_OK` | Facets implemented as `#` fragments | detect | Insight (good) |

**Parameter fingerprinting algorithm** — cluster URLs by `(path_template, sorted(param_keys))` where `path_template` replaces numeric/uuid/slug segments with `{n}`/`{uuid}`/`{slug}`. Report per-cluster: URL count, distinct content hashes, mean word count, GSC clicks. A cluster with **10,000 URLs, 12 distinct content hashes, 0 clicks** is a facet explosion — that single roll-up is more actionable than 10,000 individual findings and it is how you keep the dashboard usable.

---

## 9. Duplicate & near-duplicate content (`DUP.*`)

### 9.1 Algorithms

**Exact duplicates** — SHA-256 over the normalised **rendered** main-content text (strip nav/header/footer/aside via readability extraction; collapse whitespace; lowercase; strip punctuation). Screaming Frog computes exact duplicates over **full HTML**; we should do both and label them differently, because full-HTML equality is rare and main-content equality is the useful one.

**Near-duplicates — MinHash + LSH (recommended default).**
- Shingle size: **k = 5** word-grams (Screaming Frog and Sitebulb both operate on page text, not HTML, for near-dupes).
- Signature: **128 or 256 permutations** (128 gives ≈ ±0.07 Jaccard error; 256 ≈ ±0.05).
- LSH banding: for threshold t, choose `b` bands × `r` rows with `t ≈ (1/b)^(1/r)`. For **t = 0.9** with 128 perms: `b = 16, r = 8` → `(1/16)^(1/8) = 0.707`… too loose; use `b = 4, r = 32` → `(1/4)^(1/32) = 0.957`. Practical: `datasketch.MinHashLSH(threshold=0.9, num_perm=128)` picks optimal b/r for you.
- **Default threshold: 0.90 Jaccard similarity** — this is exactly Screaming Frog's default ('Config > Content > Duplicates', minhash algorithm, 90%).

**SimHash (alternative, cheaper).** Manku, Jain & Das Sarma (Google, WWW 2007), *Detecting Near-Duplicates for Web Crawling*: **64-bit** fingerprints, near-duplicates defined as **Hamming distance ≤ 3**, validated over 8 billion pages. SimHash needs far less storage than MinHash (a 64-bit SimHash ≈ a 24-byte MinHash in performance). Use SimHash when you must store fingerprints for millions of URLs; use MinHash+LSH when you want tunable thresholds and explainable "which pages are similar" output.

**Semantic near-duplicates (2025/2026 addition).** Screaming Frog ships `Semantically Similar` and `Low Relevance Content` issues driven by embeddings. Implementation: sentence embeddings of main content → cosine similarity; flag > 0.95 as semantic duplicates, and flag pages whose embedding is far (< 0.5) from their own `<title>`+`<h1>` embedding as `Low Relevance Content`.

```python
from datasketch import MinHash, MinHashLSH

def shingles(text, k=5):
    w = text.split()
    return {" ".join(w[i:i+k]) for i in range(max(1, len(w)-k+1))}

def signature(text, num_perm=128):
    m = MinHash(num_perm=num_perm)
    for s in shingles(text): m.update(s.encode("utf8"))
    return m

lsh = MinHashLSH(threshold=0.90, num_perm=128)
# index: lsh.insert(url, signature(main_text))
# query: lsh.query(signature(main_text))  -> near-duplicate cluster
```

### 9.2 Checks

| ID | Check | Detection | Sev | Fix | Autonomy |
|---|---|---|---|---|---|
| `DUP.EXACT_BODY` | Identical main content, different URLs | SHA-256 collision | High | Canonical or 301 | T2 |
| `DUP.EXACT_HTML` | Identical full HTML | SHA-256 of raw HTML | High | Canonical/301 | T2 |
| `DUP.NEAR` | Jaccard ≥ 0.90 | MinHash+LSH | Medium | Consolidate or differentiate | T2 |
| `DUP.SEMANTIC` | Cosine ≥ 0.95 on embeddings | embeddings | Medium | Consolidate | T2 |
| `DUP.TITLE` | Duplicate `<title>` across URLs | group-by | Medium | Rewrite | **T1** (with generated title) |
| `DUP.META_DESC` | Duplicate meta description | group-by | Low | Rewrite | **T1** |
| `DUP.H1` | Duplicate `<h1>` | group-by | Low | Rewrite | T2 |
| `DUP.CROSS_DOMAIN` | Content also on another domain | shingle match against a fetched external copy | Insight | Cross-domain canonical or DMCA | T3 |
| `DUP.BOILERPLATE_RATIO` | Main content < 25% of page text | `len(main_text)/len(all_text)` | Medium | Reduce boilerplate | T3 |
| `DUP.PAGINATED_DUP` | Paginated pages near-identical | MinHash within pagination cluster | Medium | Check pagination is working | T2 |
| `DUP.PRINT_VERSION` | `?print=1` / `/print/` duplicates | pattern + hash | Medium | noindex or canonical | T2 |
| `DUP.HTTP_AND_HTTPS` | Both schemes serve 200 | fetch both | Critical | 301 http→https + HSTS | T2 |

### 9.3 Thin content (`THIN.*`)

| ID | Check | Detection | Sev |
|---|---|---|---|
| `THIN.LOW_WORDCOUNT` | Main-content word count below template median | `words < max(200, 0.4 * median_words_for_template)` — always relative to template, never a global "300 words" rule | Medium |
| `THIN.NO_MAIN_CONTENT` | Readability extraction yields < 50 words | extractor | High |
| `THIN.TEMPLATE_ONLY` | Page text ≈ boilerplate of its template | shingle-overlap with template boilerplate > 0.9 | High |
| `THIN.LOREM_IPSUM` | Placeholder text | regex `lorem ipsum\|dolor sit amet\|placeholder text\|TODO\|FIXME\|\[insert` | Critical |
| `THIN.ZERO_IMPRESSIONS` | Indexable page, 0 GSC impressions in 90 days, age > 90 days | GSC join | Medium |
| `THIN.NO_INTERNAL_VALUE` | thin + orphan + zero impressions | composite | High |
| `THIN.AUTOGEN_PATTERN` | Templated pages differing only by a swapped entity | near-dup cluster where the diff is a single named entity | High (scaled-content-abuse risk under Google's March 2024 spam policy) |

**Spam-policy note (still current in 2026):** Google's *Spam policies for Google web search* covers **scaled content abuse**, **site reputation abuse**, and **expired domain abuse**. Any auto-generation feature in our tool must be gated behind a check that the output is not a near-duplicate cluster of its siblings. Ship `THIN.AUTOGEN_PATTERN` as a **guardrail on our own content writer**, not just an audit check.

---

## 10. Soft 404s (`SOFT404.*`)

Google's definition: a `2xx` response for a page that "doesn't exist", or that returns an error message / appears empty. Reported in the Page Indexing report as the literal string **`Soft 404`**.

Detection stack (run all, require ≥ 2 signals to fire):

| Signal | Implementation |
|---|---|
| Phrase match | Rendered text matches `(?i)\b(page not found\|not found\|404\|no results\|nothing found\|no products (were )?found\|out of stock\|sorry, we couldn'?t find\|this page (doesn'?t\|does not) exist\|error 404\|content unavailable\|no longer available\|coming soon\|under construction)\b` in the first 500 chars of main content |
| Title match | `<title>` matches the same patterns |
| Content-length anomaly | Main-content length < 15th percentile for the template |
| **Random-URL baseline** | Fetch `https://host/<random-32-char-slug>`. If it returns **200**, the whole site has soft 404s. Then compare candidate pages against that baseline's content hash / MinHash — any 200 page with Jaccard ≥ 0.9 to the baseline is a soft 404. **This is the highest-precision detector and almost nobody ships it.** |
| GSC confirmation | URL Inspection API `coverageState == "Soft 404"` |
| SPA route | Rendered DOM shows a not-found route component while status is 200 |

| ID | Check | Sev | Fix | Autonomy |
|---|---|---|---|---|
| `SOFT404.RANDOM_URL_200` | Nonexistent URL returns 200 | Critical | Return real 404/410 | T2 |
| `SOFT404.PHRASE` | Error phrase on a 200 page | High | Return 404 | T2 |
| `SOFT404.EMPTY_LISTING` | Category/facet with 0 items, 200 | High | 404 (Google's explicit faceted-nav advice) or noindex | T2 |
| `SOFT404.GSC_CONFIRMED` | GSC says Soft 404 | High | Fix status code | T2 |
| `SOFT404.SPA_ROUTE` | JS router renders 404 view on 200 | High | Server 404 or inject `noindex` (Google's documented SPA workaround) | T2 |
| `SOFT404.REDIRECT_TO_HOME` | Missing pages 301 to `/` | High | Return 404 | T2 |
| `SOFT404.OOS_PRODUCT` | Permanently out-of-stock product, 200, no alternatives | Medium | 404/410 or link to replacements | T2 |

---

## 11. JavaScript rendering & hydration (`JS.*`)

### 11.1 Ground truth (Google, *JavaScript SEO basics*)

- Three phases: **crawling → rendering → indexing**, with a separate render queue. "The page may stay on this queue for a few seconds, but it can take longer than that."
- Renderer: **evergreen Chromium**, headless.
- Links are discovered **only** from `<a>` elements with an `href` attribute. Fragment routing (`#/products`) is unreliable — use the History API.
- Googlebot **does not** persist state across page loads: cookies, `localStorage`, `sessionStorage`, IndexedDB are cleared between pages. Service workers are not used for rendering. Permission-requesting APIs (camera, geolocation, notifications) are auto-denied.
- SPA 404s: JS-redirect to a real 404 URL **or** inject `<meta name="robots" content="noindex">`.
- Canonical can be set by JS but "you shouldn't use JavaScript to change the canonical URL to something else than the URL you specified."
- Web Components: shadow DOM + light DOM are flattened; use `<slot>`.
- JSON-LD injected by JS is supported; verify with Rich Results Test.

### 11.2 Raw-HTML vs rendered-DOM diff (the core detector)

Fetch each URL **twice**: (a) plain HTTP GET, no JS; (b) headless Chromium (Playwright/Puppeteer) with `networkidle` + a hard cap (e.g. 15 s), UA = Googlebot Smartphone, viewport 412×823, device-scale 2.625.

Then diff these extracted fields:

```python
FIELDS = ["title", "meta_description", "canonical", "meta_robots", "h1", "h2s",
          "word_count", "main_text_minhash", "anchor_hrefs", "jsonld_blocks",
          "hreflang_set", "img_srcs", "status_hint"]

def js_dependency_report(raw, rendered):
    out = {}
    for f in FIELDS:
        r, d = raw.get(f), rendered.get(f)
        if r == d:                      out[f] = "same"
        elif r in (None, "", [], set()): out[f] = "rendered_only"   # JS-dependent
        elif d in (None, "", [], set()): out[f] = "raw_only"        # removed by JS
        else:                            out[f] = "changed"
    out["content_delta_pct"] = 1 - jaccard(raw["main_text_minhash"], rendered["main_text_minhash"])
    out["link_delta"] = len(set(rendered["anchor_hrefs"]) - set(raw["anchor_hrefs"]))
    return out
```

### 11.3 Checks (mirrors Screaming Frog's JavaScript tab, extended)

| ID | Check | Detection | Sev |
|---|---|---|---|
| `JS.CONTENT_ONLY_RENDERED` | > 50% of main content only after JS | `content_delta_pct > 0.5` | High |
| `JS.NO_RAW_CONTENT` | Raw HTML main content < 100 words while rendered > 500 | compare | Critical |
| `JS.TITLE_RENDER_ONLY` | Title only in rendered HTML | field diff | High |
| `JS.TITLE_UPDATED_BY_JS` | Title differs raw vs rendered | field diff | Medium |
| `JS.META_DESC_RENDER_ONLY` / `JS.META_DESC_UPDATED` | same for meta description | field diff | Medium |
| `JS.H1_RENDER_ONLY` / `JS.H1_UPDATED` | same for H1 | field diff | Medium |
| `JS.CANONICAL_RENDER_ONLY` | Canonical only after JS | field diff | High |
| `JS.CANONICAL_MISMATCH` | Canonical differs raw vs rendered | field diff | High |
| `JS.NOINDEX_RAW_ONLY` | `noindex` in raw HTML removed by JS | field diff | **Critical** |
| `JS.NOFOLLOW_RAW_ONLY` | `nofollow` in raw, gone after render | field diff | High |
| `JS.LINKS_RENDER_ONLY` | > 30% of internal links only after render | `link_delta / total` | High |
| `JS.NO_HREF_LINKS` | Navigation via `onclick`/`<button>`/`<div>` with no `<a href>` | DOM scan for click handlers navigating | High |
| `JS.HASH_ROUTING` | URLs use `#/` routes | URL pattern | High |
| `JS.OLD_AJAX_SCHEME` | `#!` URLs or `<meta name="fragment" content="!">` | scan | High |
| `JS.BLOCKED_RESOURCES` | Render-required JS/CSS disallowed in robots.txt | intersect | Critical |
| `JS.CONSOLE_ERRORS` | Page throws JS errors during render | CDP `Runtime.exceptionThrown` | Medium |
| `JS.FAILED_REQUESTS` | Render-time requests failing (4xx/5xx/CORS) | CDP `Network.loadingFailed` | Medium |
| `JS.RENDER_TIMEOUT` | Render exceeds 15 s / never reaches networkidle | timer | High |
| `JS.JSONLD_RENDER_ONLY` | Structured data injected by JS | field diff | Medium (works, but adds render-queue latency) |
| `JS.HYDRATION_MISMATCH` | SSR HTML replaced wholesale by client render | raw main text vs rendered main text Jaccard < 0.5 while both non-empty | High |
| `JS.COOKIE_DEPENDENT` | Content differs with cookies disabled | second render with cookies blocked | High |
| `JS.LOCALSTORAGE_DEPENDENT` | Content requires `localStorage` | render with storage disabled | High |
| `JS.CONSENT_WALL` | Cookie/consent overlay blocks content for the crawler | rendered main text < 100 words + presence of known CMP containers (`#onetrust-consent-sdk`, `#usercentrics-root`, `.cky-consent-container`, `#didomi-host`, `#CybotCookiebotDialog`) | **Critical** |
| `JS.GEO_REDIRECT` | IP-based redirect sends Googlebot elsewhere | compare fetch from ≥ 2 geographies | High |
| `JS.CLOAKING_RISK` | Googlebot UA sees materially different content than a normal UA | fetch with both UAs, compare MinHash < 0.8 | **Critical** (policy violation) |
| `JS.INFINITE_SCROLL_NO_SSR` | Only first N items in DOM without scroll | count items before/after scroll | High |

**Testing tools for confirmation:** GSC **URL Inspection → Live Test** returns Google's actual rendered HTML, screenshot, page resources and JS console messages. The **Rich Results Test** (`search.google.com/test/rich-results`) also renders and shows the rendered HTML — but **neither has a public API** (verified 2026-09-01: `POST /v1/urlTestingTools/richResultsTest:run` returns a genuine server 404 and appears in neither the live discovery document nor the API reference index; `validator.schema.org` exposes no discovery document). Google **deprecated the Mobile-Friendly Test API on 2023-12-01** along with the Mobile Usability report and the Mobile-Friendly Test tool. **Nuance (verified 2026-09-01):** "removed" is imprecise — `urlTestingTools/mobileFriendlyTest.run` (`POST v1/urlTestingTools/mobileFriendlyTest:run`) is **still present in the live v1 discovery document and still routed** (unauthenticated calls return `403 PERMISSION_DENIED`, whereas a fabricated method name returns a true 404). It is *de-documented and useless*, not de-routed. Likewise `MobileUsabilityInspectionResult` still lingers in the URL Inspection response schema but has been dead since Dec 2023. **Do not build against either.** So programmatic "what does Google see" is only available via URL Inspection API (2,000/day/property), and it does **not** return rendered HTML — only status fields (incl. `coverageState` and `richResultsResult`). **Our own headless Chromium is the only scalable render oracle.**

---

## 12. Core Web Vitals & performance (`CWV.*`, `PERF.*`)

### 12.1 Ground truth (web.dev/articles/vitals, verified 2026-08-31)

**The three Core Web Vitals in 2026 are unchanged: LCP, INP, CLS.** No fourth metric has been added; no metric has been announced for removal.

| Metric | Measures | Good | Needs improvement | Poor | Percentile |
|---|---|---|---|---|---|
| **LCP** | Loading | **≤ 2.5 s** | 2.5–4.0 s | > 4.0 s | p75 |
| **INP** | Interactivity | **≤ 200 ms** | 200–500 ms | > 500 ms | p75 |
| **CLS** | Visual stability | **≤ 0.1** | 0.1–0.25 | > 0.25 | p75 |

- **INP fully replaced FID on 2024-03-12.** FID was fully retired from CrUX and tooling in **September 2024**. *(2024 fact — stable, no change found through 2026.)*
- **2025-12-12: Safari 26.2 shipped LCP and INP support**, making both **"Baseline Newly available"** — every major browser can now measure them. Practical effect: CrUX data for Safari-heavy sites (Apple-centric audiences, iOS Safari) is now included, which can **shift a site's p75 without any code change**. Flag this in our regression detector so we don't attribute a Dec-2025/2026 CWV shift to a deploy.
- Google's own commitment: "the definitions and thresholds of the Core Web Vitals" remain "stable, and updates to have prior notice and a predictable, annual cadence."
- Diagnostic (non-Core) metrics: **TTFB**, **FCP**, **TBT** (lab-only proxy for INP).
- Page experience doc (last updated **2025-12-10**): named signals are **Core Web Vitals, HTTPS, mobile-friendly display, intrusive interstitials, ad density**. Explicit wording: *"There is no single signal. Our core ranking systems look at a variety of signals that align with overall page experience."*
- **Search Console:** the Core Web Vitals report and HTTPS report remain. The **Page Experience report, Mobile Usability report, Mobile-Friendly Test tool and Mobile-Friendly Test API were retired (announced Nov 2023, effective 2023-12-01).** The 2023-12-01 date is confirmed and the API is gone from the reference index, but the `mobileFriendlyTest:run` method is **still listed in the live v1 discovery doc and still routed** (403, not 404) — de-documented, not de-routed. Treat it as dead.

### 12.2 Field (CrUX) vs lab (Lighthouse) — decision rules

| Dimension | CrUX / field | Lighthouse / lab |
|---|---|---|
| Source | Real Chrome users, opted-in | Simulated single load |
| Used for ranking | **Yes** — this is the ranking input | **No** |
| Granularity | Origin-level always; URL-level **only if the URL has enough traffic** | Any URL |
| Latency | **28-day rolling window**, daily-updated (`queryRecord`); monthly series via History API | Instant |
| Metrics | LCP, INP, CLS, TTFB (experimental), FCP, RTT, navigation types, LCP resource type | LCP, CLS, TBT, FCP, Speed Index + insight audits; **no INP** (lab can't measure real interactions) |
| Failure mode | `404` when insufficient data (`CHROME_UX_REPORT_NOT_FOUND`) | Always returns something |

**Rule for the agent:** *Never* report a Lighthouse performance score as if it were the ranking signal. Use CrUX for "are we passing", Lighthouse insight audits for "why not". If CrUX returns 404 at URL level, fall back to origin level and label the finding "origin-level estimate".

### 12.3 CrUX API (primary source: developer.chrome.com/docs/crux/api)

```
POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=API_KEY
POST https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=API_KEY
```

- **Quota: 150 queries per minute per Google Cloud project. Free. Cannot be increased or purchased.**
- Auth: **API key only** (no OAuth) — great for self-hosted, user pastes their own key.
- Request body: exactly one of `url` or `origin`; optional `formFactor` ∈ `DESKTOP | PHONE | TABLET` (omit for all); optional `metrics` array.
- Metric keys: `largest_contentful_paint`, `interaction_to_next_paint`, `cumulative_layout_shift`, `experimental_time_to_first_byte`, `first_contentful_paint`, `round_trip_time`, `navigation_types`, `form_factors`, `largest_contentful_paint_resource_type`, plus LCP image sub-part metrics (`largest_contentful_paint_image_resource_load_delay`, `..._resource_load_duration`, `..._element_render_delay`, `..._time_to_first_byte`).
- Response: `record.key`, `record.metrics.<name>.histogram[]` (3 bins with `start`/`end`/`density`), `record.metrics.<name>.percentiles.p75`, `record.collectionPeriod.{firstDate,lastDate}`, and `urlNormalizationDetails`.
- **Also available free: the `chrome-ux-report` public BigQuery dataset** (monthly, origin-level, no rate limit beyond BigQuery cost) — better for historical/competitor analysis at scale.

### 12.4 PageSpeed Insights API

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
    ?url=...&strategy=MOBILE|DESKTOP&category=PERFORMANCE&key=API_KEY
```
- **Quota: 25,000 requests/day; 240 requests/minute** per project (widely cited as "100 per 100 seconds" historically; current documented default is 240 rpm / 25k per day). *Flag: the exact per-minute number is not stated on a single canonical Google page and is best read live from the Cloud Console quota tab — treat 60 rpm as a safe conservative default and back off on HTTP 429.*
- Returns **both** `lighthouseResult` (lab) and `loadingExperience` / `originLoadingExperience` (CrUX field) in one call — cheaper than two calls when you need both.
- Without a key you get an aggressive anonymous quota; **always require a key**.

### 12.5 Lighthouse 13 (primary source: developer.chrome.com/blog/lighthouse-13-0, published **2025-10-10**)

- Ships in Chrome stable **143**; requires **Node ≥ 22.19**.
- Performance audits were replaced by **15 "insight" audits** shared with the DevTools Performance panel. New IDs to key on:
  `cls-culprits-insight`, `document-latency-insight`, `dom-size-insight`, `duplicated-javascript-insight`, `font-display-insight`, `forced-reflow-insight`, `image-delivery-insight`, `interaction-to-next-paint-insight`, `lcp-discovery-insight`, `lcp-phases-insight`, `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight`, `third-parties-insight`, `use-efficient-cache-lifetimes` (naming per the Screaming Frog PageSpeed tab, which mirrors these).
- **Removed with no replacement (7):** `first-meaningful-paint`, `font-size`, `no-document-write`, `uses-passive-event-listeners`, `offscreen-images`, `preload-fonts`, `uses-rel-preload`, `third-party-facades`.
- `layout-shifts`, `non-composited-animations` and `unsized-images` were **merged into `cls-culprits-insight`** (the latter two survive as separate diagnostics).
- **No scoring change** — the performance score is computed from metrics, not audits.
- **Lighthouse 13.3 (May 2026) added an experimental "Agentic Browsing" category** running deterministic checks over WebMCP, accessibility, layout stability and `llms.txt`. *(Source: vendor blog, not a Google primary page — flagged as needing verification before we depend on it. Do not build product surface on this yet.)*

**Migration hazard for us:** if we pin audit IDs, a Lighthouse major bump silently zeroes out checks. **Store audit IDs in a versioned config keyed by Lighthouse major version, and assert on startup that every expected ID exists in the report; alert on unknown/missing IDs.**

### 12.6 Performance checks

| ID | Check | Detection | Sev |
|---|---|---|---|
| `CWV.LCP_FAIL` | CrUX p75 LCP > 2.5 s | CrUX | Critical |
| `CWV.INP_FAIL` | CrUX p75 INP > 200 ms | CrUX | Critical |
| `CWV.CLS_FAIL` | CrUX p75 CLS > 0.1 | CrUX | Critical |
| `CWV.NO_FIELD_DATA` | CrUX 404 at URL level | API | Insight |
| `CWV.MOBILE_DESKTOP_GAP` | Phone p75 > 1.5× desktop p75 | CrUX both form factors | High |
| `CWV.REGRESSION` | p75 worsens > 15% week-over-week | stored history | High |
| `PERF.TTFB` | TTFB p75 > 800 ms | CrUX `experimental_time_to_first_byte` | High |
| `PERF.LCP_IS_IMAGE_NO_PRELOAD` | LCP element is an image discovered late | `lcp-discovery-insight` | High |
| `PERF.LCP_LAZY_LOADED` | LCP image has `loading="lazy"` | DOM + LCP element ID | **High, and a T0 auto-fix** |
| `PERF.RENDER_BLOCKING` | Render-blocking CSS/JS | `render-blocking-insight` | High |
| `PERF.NO_CACHE_HEADERS` | Static assets with `Cache-Control: max-age` < 1 year or missing | header scan on `.js/.css/.woff2/.png/.jpg/.webp/.avif` | Medium |
| `PERF.NO_COMPRESSION` | Text asset served without `br`/`gzip` | `Content-Encoding` absent on `text/*`, `application/javascript`, `application/json` | High |
| `PERF.NO_CDN` | No CDN edge headers and high TTFB variance by geo | absence of `cf-ray`/`x-amz-cf-id`/`x-vercel-cache`/`x-cache`/`fastly-*` + multi-geo TTFB spread > 400 ms | Medium |
| `PERF.CACHE_MISS_RATE` | CDN `x-cache: MISS` on repeat fetches of static assets | two fetches | Medium |
| `PERF.HTTP1_ONLY` | No HTTP/2 or HTTP/3 | ALPN negotiation | Medium |
| `PERF.NO_UNSIZED_IMG` | `<img>` without `width`/`height` or `aspect-ratio` | DOM scan | Medium (**T0 auto-fix** when intrinsic dims are known) |
| `PERF.FONT_NO_DISPLAY_SWAP` | `@font-face` without `font-display` | CSS parse | Medium (**T0**) |
| `PERF.LEGACY_JS` | ES5 polyfills shipped to modern browsers | `legacy-javascript-insight` | Medium |
| `PERF.DUPLICATE_JS` | Same module bundled twice | `duplicated-javascript-insight` | Medium |
| `PERF.DOM_SIZE` | DOM > 1,400 nodes / depth > 32 | `dom-size-insight` | Medium |
| `PERF.THIRD_PARTY_BLOCKING` | Third-party main-thread time > 250 ms | `third-parties-insight` | High |
| `PERF.PAGE_WEIGHT` | Total transfer > 3 MB (mobile) | sum | Medium |

---

## 13. HTTPS, mixed content, security headers (`SEC.*`)

| ID | Check | Detection | Sev | Autonomy |
|---|---|---|---|---|
| `SEC.HTTP_URLS` | Internal URLs served over http | scheme | Critical | T2 |
| `SEC.NO_HTTPS_REDIRECT` | http:// does not 301 to https:// | fetch http | Critical | T2 |
| `SEC.MIXED_ACTIVE` | http `<script>`/`<link rel=stylesheet>`/`<iframe>` on https page | DOM scan | Critical | T1 (rewrite to https) |
| `SEC.MIXED_PASSIVE` | http `<img>`/`<video>`/`<audio>` on https page | DOM scan | High | T1 |
| `SEC.PROTOCOL_RELATIVE` | `//host/...` resource URLs | scan | Medium | T0 |
| `SEC.CERT_EXPIRING` | TLS cert expires < 30 days | X.509 `notAfter` | Critical | T2 alert |
| `SEC.CERT_INVALID` | Hostname mismatch, self-signed, expired, incomplete chain | TLS handshake + chain validation | Critical | T3 |
| `SEC.TLS_OLD` | TLS < 1.2 supported | handshake probe | Medium | T2 |
| `SEC.NO_HSTS` | No `Strict-Transport-Security` header | header | Medium | T2 (never T0 — HSTS is hard to undo) |
| `SEC.HSTS_SHORT` | `max-age` < 31536000 | parse | Low | T2 |
| `SEC.FORM_INSECURE` | `<form action="http://...">` | DOM | High | T1 |
| `SEC.FORM_ON_HTTP` | Form on an http page | scheme | High | T2 |
| `SEC.NO_CSP` | Missing `Content-Security-Policy` | header | Low | T3 |
| `SEC.NO_XCTO` | Missing `X-Content-Type-Options: nosniff` | header | Low | T1 |
| `SEC.NO_XFO` | Missing `X-Frame-Options`/`frame-ancestors` | header | Low | T1 |
| `SEC.NO_REFERRER_POLICY` | Missing/weak `Referrer-Policy` | header | Low | T1 |
| `SEC.UNSAFE_TARGET_BLANK` | `target="_blank"` without `rel="noopener"` | DOM | Low | **T0** |
| `SEC.CANONICAL_HTTP` | Canonical points to http on an https site | compare | Critical | T1 |
| `SEC.HREFLANG_HTTP` | hreflang alternates use http | compare | High | T1 |
| `SEC.SITEMAP_HTTP` | Sitemap contains http URLs | scan | High | T0 |

HTTPS remains an explicitly named page-experience signal in Google's 2025-12-10 documentation.

---

## 14. Hreflang & international (`HREF.*`)

### 14.1 Ground truth (Google, *Localized versions of your page*)

- **Bidirectional requirement:** "If page X links to page Y, page Y must link back to page X." Missing return links → annotations may be **ignored entirely**.
- **Self-reference required:** "Each language version must list itself as well as all other language versions."
- **Absolute URLs required:** "Alternate URLs must be fully-qualified, including the transport method (http/https)." Relative and protocol-relative are invalid.
- Three equivalent implementations: HTML `<link>` in `<head>`, HTTP `Link:` header, XML sitemap `<xhtml:link>`. **Pick one** — no benefit to combining.
- Code format: **ISO 639-1 language** (required) optionally + **ISO 3166-1 Alpha-2 region**, optionally + ISO 15924 script (`zh-Hans`).
- **Region alone is invalid.** `be` = Belarusian, not Belgium.
- Invalid region codes explicitly called out: `EU`, `UN`, **`UK`** (must be `GB`).
- `x-default` for the fallback/language-selector page.
- Google **ignores malformed annotations rather than correcting them**.

### 14.2 Checks (superset of Screaming Frog's Hreflang tab)

| ID | Check | Detection | Sev | Autonomy |
|---|---|---|---|---|
| `HREF.MISSING_SELF` | No self-referencing hreflang | self URL ∉ alternate set | High | **T1** |
| `HREF.MISSING_RETURN` | Target does not link back | fetch target, check its set contains source | High | **T1** |
| `HREF.NON_RECIPROCAL_CODE` | Return link uses a different code | compare codes both directions | High | T2 |
| `HREF.INVALID_LANG_CODE` | Not ISO 639-1 | validate against list | High | T1 |
| `HREF.INVALID_REGION_CODE` | Not ISO 3166-1 Alpha-2 (`UK`,`EU`,`UN`,`EN`) | validate | High | **T1** (`UK`→`GB` is deterministic) |
| `HREF.REGION_ONLY` | Region without language (`hreflang="de"` used for Germany-region intent, or `hreflang="gb"`) | parse | High | T2 |
| `HREF.MALFORMED` | Not `lang[-Script][-REGION]` | regex `^([a-z]{2,3})(-[A-Z][a-z]{3})?(-([A-Z]{2}\|[0-9]{3}))?$\|^x-default$` | High | T1 |
| `HREF.RELATIVE_URL` | Relative/protocol-relative alternate | scheme check | High | **T1** |
| `HREF.NON_200` | Alternate returns 3xx/4xx/5xx | fetch | High | T1 |
| `HREF.TO_REDIRECT` | Alternate redirects | 3xx | Medium | T1 |
| `HREF.TO_NOINDEX` | Alternate is noindex | parse | High | T2 |
| `HREF.TO_CANONICALISED` | Alternate canonicalises elsewhere ("not using canonical") | canonical ≠ self | High | T2 |
| `HREF.CANON_CONFLICT` | Canonical points outside the hreflang cluster | set membership | High | T2 |
| `HREF.MULTIPLE_SAME_CODE` | Two URLs claim the same hreflang code | group-by | High | T2 |
| `HREF.DUPLICATE_ENTRIES` | Same code+URL repeated | dedupe | Low | T0 |
| `HREF.OUTSIDE_HEAD` | `<link rel=alternate hreflang>` outside `<head>` | DOM ancestry | Critical | T1 |
| `HREF.MISSING_X_DEFAULT` | No `x-default` in the cluster | set check | Medium | T1 |
| `HREF.MULTIPLE_X_DEFAULT` | > 1 `x-default` | count | Medium | T1 |
| `HREF.UNLINKED_ALTERNATE` | Alternate has no internal inlinks | inlink count | Medium | T2 |
| `HREF.MIXED_IMPLEMENTATION` | hreflang in both HTML and sitemap with different sets | set diff | High | T2 |
| `HREF.HTTP_ALTERNATE` | Alternate uses http | scheme | High | T1 |
| `HREF.CLUSTER_ASYMMETRY` | Cluster sizes differ across members | group sizes | High | T2 |
| `HREF.LANG_MISMATCH` | Declared `hreflang` disagrees with detected page language | `lingua`/`fasttext` language ID on main content vs declared code | High | T2 |
| `HREF.HTML_LANG_MISMATCH` | `<html lang>` ≠ hreflang self code | compare | Medium | T1 |
| `HREF.CURRENCY_MISMATCH` | Product currency doesn't match region | schema `priceCurrency` vs region | Medium | T2 |

**Cluster validation algorithm:** build an undirected graph where each hreflang annotation is a directed edge `(src, code) → dst`. A **valid cluster** is one where the edge set is symmetric, every member self-references, all codes are unique within the cluster, and every member is 200 + self-canonical + indexable. Report per-cluster, not per-URL — a 12-locale site with one broken return link should produce **one** finding, not 12.

---

## 15. Structured data (`SD.*`)

### 15.1 What Google actually supports in 2026 (primary source: Search Gallery, fetched 2026-08-31)

The Search Gallery listed exactly these **25** features:

`Article` · `Breadcrumb` · `Carousel` (only paired with Recipe, Course, Restaurant, Movie) · `Course list` · `Dataset` · `Discussion forum` · `Education Q&A` · `Employer aggregate rating` · `Event` · `Image metadata` · `Job posting` · `Local business` · `Math solver` · `Movie` · `Organization` · `Product` (incl. product snippets, merchant listings, variants) · `Profile page` · `Q&A` · `Recipe` · `Review snippet` · `Software app` · `Speakable` · `Subscription and paywalled content` · `Vacation rental` · `Video`

**Notably absent — do not generate for rich-result purposes:**

| Type | Status | Date |
|---|---|---|
| **FAQPage** | Deprecation notice added **2025-05-08**; **"FAQ rich results are no longer appearing in Google Search" as of 2026-05-07**; documentation removed **2026-06-15**. FAQ rich result report dropped from Search Console **June 2026**; Search Console **API support removed August 2026**. Google still *parses* FAQ markup for page understanding. | 2026 |
| **HowTo** | Removed from rich results (2023) | stale-but-settled |
| **Sitelinks Searchbox** | Removed (2023) | stale-but-settled |
| **Practice problems** | Removed from Search Console rich-result reporting, Rich Results Test and search-appearance filters, **January 2026** *(reported via SEO trade press — flag: verify against the Search Central changelog before hard-coding)* | 2026 |
| **Book actions, Course info, ClaimReview, Estimated salary, Learning video, Special announcement, Vehicle listing** | Retired **June 2025**. **However, in November 2025 Google removed the deprecation banner from Book Actions and confirmed it remains supported.** *(This nuance comes from SEO trade press; the Search Gallery no longer lists Book actions as a standalone gallery item — treat Book Actions as ambiguous and do not auto-generate.)* | 2025 |

**Design rule for us:** ship a **versioned, dated `supported_types.json`** and refresh it from the Search Gallery + the Search Central *Documentation updates* changelog on a schedule. Never hard-code the list in application code. Emit `SD.TYPE_DEPRECATED` findings when a site still ships a retired type.

### 15.2 Validation stack (what exists programmatically in 2026)

| Tool | API? | Notes |
|---|---|---|
| **Rich Results Test** (`search.google.com/test/rich-results`) | **No public API.** The old Structured Data Testing Tool API was deprecated and never replaced. | UI only; renders JS |
| **Schema Markup Validator** (`validator.schema.org`) | **No official public API** | UI only |
| **Search Console URL Inspection API** | **Yes** — `richResultsResult` in the response gives detected items + issues | Only for **indexed URLs in a verified property**; 2,000 QPD/property |
| **Search Console Rich Results reports** | Read via the UI; **no API for the aggregate report itself** (per-URL issues *are* available via URL Inspection `richResultsResult`) | — |
| **`schemaorg` Python package / `schema-dts` (TypeScript)** | Yes — local | Type/shape validation against schema.org vocabulary |
| **`extruct` (Python, Zyte)** | Yes — local | Extracts JSON-LD, Microdata, RDFa, Open Graph, Microformats from HTML. **This is the right parser for our crawler.** |
| **`structured-data-testing-tool` (npm)** | Yes — local | Ships Google-specific presets |
| **SHACL shapes** | Yes — local | Best way to encode Google's *required vs recommended* property matrix as machine-checkable rules |

**Recommended architecture:** parse with `extruct` → normalise to JSON-LD → validate against (a) schema.org vocabulary and (b) a per-feature **required/recommended property table** we maintain from Google's docs. Use URL Inspection API `richResultsResult` as the **ground-truth reconciliation signal** on a sampling budget (~50–200 URLs/day) to confirm our local validator agrees with Google.

**Why local validation, stated correctly** *(corrected 2026-09-01)*: it is **not** true that Google offers no rich-result validation via API — `UrlInspectionResult.richResultsResult` returns `detectedItems[]` (`richResultType`, `items[]`) plus per-item `RichResultsIssue` objects carrying `severity` (`ERROR` | `WARNING`) and `issueMessage`, and an overall `verdict`. The genuine reasons to build our own validator are:
1. URL Inspection only reflects Google's **last-crawled/indexed version of an already-live URL** — it cannot validate draft, staged, or unpublished markup.
2. It requires the property to be **verified in the customer's Search Console**.
3. **2,000 URLs/day/property** does not scale to full-site auditing.
4. It gives **no pre-publish feedback loop**, which is exactly what our fix-generation pipeline needs.

### 15.3 Google's General Structured Data Guidelines — encode these as policy checks

| ID | Rule (from Google's `sd-policies` page) | Detection | Sev |
|---|---|---|---|
| `SD.HIDDEN_CONTENT` | Marked-up content must be **visible to users**; don't mark up invisible content | JSON-LD field values not found in rendered visible text | Critical (manual-action risk) |
| `SD.IRRELEVANT` | Markup must describe the page | type vs page content mismatch | High |
| `SD.MISLEADING` | No fake/misleading reviews or ratings | `aggregateRating` present with 0 visible reviews | Critical |
| `SD.SELF_SERVING_REVIEW` | Review snippets not allowed for reviews the entity wrote about itself | `Review` about `Organization`/`LocalBusiness` = self | High |
| `SD.SITEWIDE_AGG_RATING` | `aggregateRating` on every page identically | duplicate rating values sitewide | High |

### 15.4 Structured-data checks

| ID | Check | Detection | Sev | Autonomy |
|---|---|---|---|---|
| `SD.PARSE_ERROR` | JSON-LD is invalid JSON | `json.loads` fails | Critical | **T1** (regenerate) |
| `SD.MISSING_CONTEXT` | No `@context: https://schema.org` | key check | Critical | T1 |
| `SD.MISSING_TYPE` | No `@type` | key check | Critical | T1 |
| `SD.UNKNOWN_TYPE` | `@type` not in schema.org vocabulary | vocab lookup | Medium | T1 |
| `SD.TYPE_DEPRECATED` | Type no longer produces rich results (FAQPage, HowTo, etc.) | lookup in `supported_types.json` | Medium | T2 |
| `SD.MISSING_REQUIRED_PROP` | Required property absent for the feature | per-feature required table | Critical (blocks rich result) | **T1** if derivable from page |
| `SD.MISSING_RECOMMENDED_PROP` | Recommended property absent | per-feature table | Low | T1 |
| `SD.INVALID_ENUM` | Bad enum (e.g. `availability` not a schema.org `ItemAvailability`) | enum list | High | T1 |
| `SD.INVALID_DATE` | Date not ISO 8601 | parse | High | T0 |
| `SD.INVALID_DURATION` | Duration not ISO 8601 (`PT30M`) | parse | Medium | T0 |
| `SD.INVALID_URL_PROP` | `url`/`image`/`logo` not absolute or 404s | fetch | High | T1 |
| `SD.IMAGE_TOO_SMALL` | Image < 1200 px wide (Article/Recipe/Product guidance) | fetch dimensions | Medium | T1 |
| `SD.PRICE_MISMATCH` | `Product.offers.price` ≠ visible price | regex visible price vs markup | Critical | T2 |
| `SD.NO_BREADCRUMB` | No `BreadcrumbList` on a deep page | absence + depth ≥ 2 | Medium | **T1** (derivable from URL path + nav) |
| `SD.NO_ORGANIZATION` | No `Organization` on homepage | absence | Medium | **T1** |
| `SD.ORG_INCONSISTENT` | `Organization` name/logo/sameAs differ across pages | group-by | Medium | T1 |
| `SD.MULTIPLE_ENTITIES_NO_GRAPH` | Multiple disconnected JSON-LD blocks with no `@id` linkage | graph analysis | Low | T1 (emit `@graph` with `@id`s) |
| `SD.MICRODATA_JSONLD_CONFLICT` | Microdata and JSON-LD disagree on same property | compare | Medium | T2 |
| `SD.JS_INJECTED` | Structured data only in rendered DOM | raw vs rendered | Medium | T2 |
| `SD.NOT_IN_HEAD_OR_BODY` | JSON-LD in an invalid location | DOM position | Low | T1 |
| `SD.MISSING_ON_ELIGIBLE_TEMPLATE` | Template that qualifies for a rich result has none | template classification (blog post → `Article`; product page → `Product`; store page → `LocalBusiness`) | High (opportunity) | **T1** |

**Highest-value autonomous action in this whole category:** detect page template → generate the matching JSON-LD from on-page facts (title, author, dates, breadcrumb from URL, price/availability from the DOM) → validate locally → inject into `<head>`. It is deterministic, reversible, and has a well-documented eligibility payoff. Gate it on `SD.HIDDEN_CONTENT` (never assert a fact that isn't visible).

---

## 16. Titles, meta descriptions, headings, images (`ONP.*`, `IMG.*`)

Screaming Frog's exact thresholds (useful defaults; note Google does not publish limits — these are pixel/char heuristics):

| Element | Too long | Too short | Pixel limit |
|---|---|---|---|
| `<title>` | > 60 chars | < 30 chars | > 561 px / < 200 px |
| Meta description | > 155 chars | < 70 chars | > 985 px / < 400 px |
| `<h1>` / `<h2>` | > 70 chars | — | — |

| ID | Check | Sev | Autonomy |
|---|---|---|---|
| `ONP.TITLE_MISSING` | High | **T1** (generate) |
| `ONP.TITLE_MULTIPLE` | Medium | T0 (keep first) |
| `ONP.TITLE_OUTSIDE_HEAD` | High | T1 |
| `ONP.TITLE_DUPLICATE` | Medium | T1 |
| `ONP.TITLE_TOO_LONG` / `_TOO_SHORT` / `_PIXEL_OVER` | Low | T1 |
| `ONP.TITLE_SAME_AS_H1` | Low | T2 |
| `ONP.TITLE_REWRITTEN_BY_GOOGLE` | Medium — compare `<title>` to the title Google shows (only observable via SERP data or GSC + manual) | T2 |
| `ONP.META_DESC_MISSING` / `_MULTIPLE` / `_DUPLICATE` / `_TOO_LONG` / `_TOO_SHORT` / `_OUTSIDE_HEAD` | Low–Medium | **T1** |
| `ONP.H1_MISSING` / `_MULTIPLE` / `_DUPLICATE` / `_TOO_LONG` | Medium | T2 |
| `ONP.H_NON_SEQUENTIAL` | Heading levels skip (h1→h3) | Low | T1 |
| `ONP.ALT_TEXT_IN_H1` | Low | T1 |
| `ONP.NO_VIEWPORT` | `<meta name="viewport">` missing | High | **T0** |
| `ONP.VIEWPORT_FIXED_WIDTH` | `width=1024` or `user-scalable=no` | Medium | T1 |
| `ONP.NO_LANG` | `<html lang>` missing | Medium | **T1** |
| `ONP.NO_CHARSET` | Missing `<meta charset>` (or not in first 1024 bytes) | Medium | T1 |
| `ONP.SPELLING` / `ONP.GRAMMAR` | Screaming Frog ships both | Low | T2 |
| `ONP.READABILITY` | Flesch reading ease < 30 ("Very Difficult") | Low | T3 |
| `ONP.URL_OVER_115_CHARS` / `_UPPERCASE` / `_UNDERSCORES` / `_SPACES` / `_NON_ASCII` / `_MULTIPLE_SLASHES` / `_REPETITIVE_PATH` | Low | T3 (URL changes are migrations) |

### Images

| ID | Check | Detection | Sev | Autonomy |
|---|---|---|---|---|
| `IMG.MISSING_ALT_ATTR` | No `alt` attribute at all | DOM | Medium | **T1** (generate from context/vision) |
| `IMG.MISSING_ALT_TEXT` | `alt=""` on a content image | DOM + not decorative (`role=presentation`) | Medium | T1 |
| `IMG.ALT_TOO_LONG` | > 100 chars | len | Low | T1 |
| `IMG.ALT_KEYWORD_STUFFED` | Repeated keyword tokens | token freq | Medium | T2 |
| `IMG.NO_DIMENSIONS` | No `width`/`height`/`aspect-ratio` (CLS cause) | DOM | Medium | **T0** |
| `IMG.OVER_100KB` | > 100 KB | Content-Length | Medium | **T1** (recompress) |
| `IMG.INCORRECTLY_SIZED` | Intrinsic ≫ displayed size | natural vs layout dims from render | Medium | **T1** |
| `IMG.LEGACY_FORMAT` | JPEG/PNG where AVIF/WebP would save > 30% | re-encode test | Medium | **T1** |
| `IMG.NO_SRCSET` | Responsive images without `srcset`/`sizes` or `<picture>` | DOM | Low | T1 |
| `IMG.LCP_LAZY` | LCP image has `loading="lazy"` | LCP element + attr | **High** | **T0 (remove the attr)** |
| `IMG.BELOW_FOLD_EAGER` | Below-fold image without `loading="lazy"` | bounding box y > viewport height | Low | **T0 (add the attr)** |
| `IMG.BROKEN` | `src` returns 4xx/5xx | fetch | High | T1 |
| `IMG.BACKGROUND_CONTENT` | Meaningful content as CSS background (invisible to image search) | heuristic | Low | T3 |
| `IMG.NOT_IN_SITEMAP` | Images absent from image sitemap on an image-heavy site | intersect | Low | T1 |

---

## 17. Mobile (`MOB.*`)

The Mobile Usability report, Mobile-Friendly Test tool **and** Mobile-Friendly Test API were **all retired on 2023-12-01** (date confirmed 2026-09-01). Precisely: the report and tool are gone and the API is undocumented, but the `mobileFriendlyTest:run` method is still present in the live discovery document and still routed (403 for unregistered callers) — and `MobileUsabilityInspectionResult` still lingers in the URL Inspection schema. Both are dead weight; do not build against them. Mobile-friendliness remains a named page-experience signal and **mobile-first indexing** is universal, so the checks must be run **by us**, not fetched from Google.

Implementation: render at Googlebot Smartphone dimensions (**412 × 823 CSS px, DPR 2.625, UA = `Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`**).

| ID | Check | Detection |
|---|---|---|
| `MOB.NO_VIEWPORT` | Viewport meta absent |
| `MOB.CONTENT_WIDER_THAN_SCREEN` | `document.scrollWidth > window.innerWidth + 2` |
| `MOB.FONT_TOO_SMALL` | Computed `font-size` < 12 px on > 10% of text nodes (note: Lighthouse **removed** its `font-size` audit in v13 — we must implement it ourselves) |
| `MOB.TAP_TARGETS` | Interactive element bounding box < 24 × 24 CSS px or < 8 px gap to a neighbour (WCAG 2.2 Target Size Minimum) |
| `MOB.UNSUPPORTED_PLUGIN` | `<object>`/`<embed>` with Flash/Silverlight |
| `MOB.HORIZONTAL_SCROLL` | Any element overflows the viewport |
| `MOB.MOBILE_DESKTOP_CONTENT_GAP` | Mobile render main-text Jaccard < 0.9 vs desktop render — **critical** under mobile-first indexing (mobile is the indexed version) |
| `MOB.MOBILE_MISSING_SD` | Structured data present on desktop, missing on mobile | Critical |
| `MOB.MOBILE_MISSING_HREFLANG` | hreflang present on desktop only | High |
| `MOB.SEPARATE_M_DOT` | `m.` subdomain still in use | High — legacy; consolidate |
| `MOB.INTERSTITIAL` | Full-screen overlay covering > 30% of viewport on load | High (named page-experience signal) |

---

## 18. Log-file analysis (`LOG.*`)

### 18.1 Bot verification (mandatory before any log conclusion)

Never trust the user-agent string. Two valid methods:
1. **Reverse DNS + forward DNS**: `PTR` of the IP must end in `.googlebot.com`, `.google.com`, or `.googleusercontent.com`, and the forward `A`/`AAAA` of that hostname must return the original IP.
2. **Published IP range JSON** (faster, cacheable):
   - `https://developers.google.com/static/search/apis/ipranges/googlebot.json`
   - `https://developers.google.com/static/search/apis/ipranges/special-crawlers.json`
   - `https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json`
   - `https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers-google.json`
   - Bing: `https://www.bing.com/toolbox/bingbot.json`
   - OpenAI: `https://openai.com/gptbot.json`, `.../searchbot.json`, `.../chatgpt-user.json`
   - Anthropic publishes ClaudeBot ranges; Perplexity publishes PerplexityBot ranges.

Google's crawler UA tokens to segment on: `Googlebot` (Desktop + Smartphone), `Googlebot-Image`, `Googlebot-Video`, `Googlebot-News`, `Google-InspectionTool` (URL Inspection live tests + Rich Results Test), `GoogleOther` / `GoogleOther-Image` / `GoogleOther-Video`, `Google-Extended` (robots.txt token only, not a UA), `Google-CloudVertexBot`, `Storebot-Google`, `Google-Safety`, `AdsBot-Google`, `AdsBot-Google-Mobile`, `Mediapartners-Google`, `FeedFetcher-Google`, `Google-Read-Aloud`, `Google-Site-Verification`.

### 18.2 Checks

| ID | Signal | Computation | Sev |
|---|---|---|---|
| `LOG.STATUS_MIX` | % of Googlebot hits by status class | group-by; alert if non-2xx > 20% | High |
| `LOG.5XX_TO_BOT` | 5xx served to verified Googlebot | filter | Critical |
| `LOG.CRAWL_WASTE` | % of hits on non-indexable URLs | join with crawl | High |
| `LOG.UNCRAWLED_IMPORTANT` | Indexable URLs with 0 bot hits in 30 days | set difference | High |
| `LOG.ORPHAN_IN_LOGS` | URLs hit by Googlebot but not in crawl or sitemap | set difference | High |
| `LOG.CRAWL_FREQ_BY_TEMPLATE` | Hits/day per URL template | group-by | Insight |
| `LOG.FRESHNESS_MISMATCH` | Frequently-updated templates crawled rarely | join content-change history with hit rate | High |
| `LOG.CRAWL_DEPTH_DECAY` | Hits vs click depth | correlation | Insight |
| `LOG.SPIKE` | Sudden > 3σ change in daily Googlebot hits | time series | High |
| `LOG.DROP` | > 50% drop in Googlebot hits week-over-week | time series | **Critical** (leading indicator of a traffic drop) |
| `LOG.PARAM_WASTE` | % of hits on parameterised URLs | regex | High |
| `LOG.SLOW_RESPONSES_TO_BOT` | p95 response time for Googlebot requests | percentile | High |
| `LOG.FAKE_BOT` | UA claims Googlebot, fails rDNS/IP verification | verification | Medium (security) |
| `LOG.AI_CRAWLER_VOLUME` | GPTBot/ClaudeBot/PerplexityBot/Bytespider hits and bandwidth | group-by | Insight |
| `LOG.MOBILE_VS_DESKTOP_BOT` | Ratio of Googlebot Smartphone to Desktop | group-by (expect smartphone-dominant) | Insight |
| `LOG.LAST_CRAWLED_AGE` | Days since last Googlebot hit per URL | max(timestamp) | Insight |

**Ingestion note:** logs are the single hardest data source to obtain for a self-hosted tool. Support, in priority order: (1) direct file/`journalctl` path on the same host, (2) Cloudflare Logpush → S3/R2, (3) AWS ALB/CloudFront logs in S3, (4) Vercel/Netlify log drains, (5) Nginx/Apache combined format upload. Ship parsers for **combined**, **Cloudflare Logpush JSON**, **CloudFront W3C**, and **ALB** formats.

---

## 19. Search Console & data-source APIs (the integration surface)

### 19.1 Search Console API — exact quotas (primary source: `developers.google.com/webmaster-tools/limits`, verified 2026-08-31)

| Resource | Per-site | Per-user | Per-project |
|---|---|---|---|
| **Search Analytics** | **1,200 QPM** | **1,200 QPM** | **40,000 QPM; 30,000,000 QPD** |
| **URL Inspection (index)** | **600 QPM; 2,000 QPD** | — | **15,000 QPM; 10,000,000 QPD** |
| **All other resources** (Sitemaps, Sites) | — | **20 QPS; 200 QPM** | **100,000,000 QPD** |

Plus a separate **load quota** for Search Analytics measured in 10-minute and 1-day windows. Exceeding any quota returns a `quotaExceeded` error (HTTP 429/403).

**The 2,000 QPD per-property URL Inspection cap is the single hardest constraint on our architecture.** It means: on a 50,000-URL site you can inspect the whole site once every **25 days**. Design accordingly (see §22).

### 19.2 Endpoints we will use

| Purpose | Method + endpoint | Scope | Notes |
|---|---|---|---|
| Performance data | `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` | `webmasters.readonly` | `rowLimit` **max 25,000**, default 1,000; paginate with `startRow`. Dimensions: `query, page, country, device, searchAppearance, date, hour`. `type` ∈ `web` (default), `image`, `video`, `news`, `discover`, `googleNews`. `dataState` ∈ `final` (default), `all` (fresh), `hourly_all`. `aggregationType` ∈ `auto, byPage, byProperty, byNewsShowcasePanel`. Filters support `equals, contains, notEquals, notContains, includingRegex, excludingRegex`. **16 months of history.** |
| Index status | `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect` | `webmasters.readonly` | Body: `inspectionUrl`, `siteUrl`, optional `languageCode`. Returns `inspectionResult.indexStatusResult` (`verdict`, `coverageState` — **the same string the Page Indexing report shows**, `robotsTxtState`, `indexingState`, `pageFetchState`, `googleCanonical`, `userCanonical`, `crawledAs`, `lastCrawlTime`, `sitemap[]`, `referringUrls[]`), plus `richResultsResult` (`detectedItems[]` with `richResultType`/`items[]`, per-item `RichResultsIssue` with `severity` ERROR\|WARNING and `issueMessage`, and an overall `verdict`), `ampResult`, `inspectionResultLink`, and a vestigial `mobileUsabilityResult` (dead since 2023-12-01 — ignore). **Only the indexed version — no live test via API.** |
| Sitemap submit | `PUT https://searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` | `webmasters` (write) | The only **sitemap** write operation available (verified against the live discovery doc, 2026-09-01; discovery `baseUrl` is `https://searchconsole.googleapis.com/` — `www.googleapis.com` still resolves). |
| Sitemap read | `GET .../sitemaps` and `GET .../sitemaps/{feedpath}` | readonly | Returns `errors`, `warnings`, `contents[]`, `lastSubmitted`, `lastDownloaded`, `isPending`, `isSitemapsIndex` |
| Sitemap delete | `DELETE .../sitemaps/{feedpath}` | write | |
| Property list | `GET https://searchconsole.googleapis.com/webmasters/v3/sites` | readonly | Returns `permissionLevel` — check for `siteOwner`/`siteFullUser` before attempting writes |
| **Property add** | `PUT https://searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}` | `webmasters` (write) | **Also a write operation** — registers a property on the user's account. Directly relevant to automating customer onboarding. *(Added 2026-09-01; the dossier previously claimed sitemaps + Indexing API were the only writes.)* |
| **Property delete** | `DELETE https://searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}` | `webmasters` (write) | Unregisters a property. Destructive to the customer's account view — treat as T3. |

**`siteUrl` formats:** URL-prefix properties need a **trailing slash** (`https://example.com/`); Domain properties use the **`sc-domain:example.com`** prefix.

### 19.3 Bulk Data Export → BigQuery (the scale answer)

- Configure in GSC UI (Settings → Bulk data export). **No API to configure it.**
- Grant `search-console-data-export@system.gserviceaccount.com` the roles **BigQuery Job User** (`bigquery.jobUser`) and **BigQuery Data Editor** (`bigquery.dataEditor`).
- Dataset name **always starts with `searchconsole`**; location is chosen once and **cannot easily be changed**.
- Tables: **`searchdata_site_impression`**, **`searchdata_url_impression`**, **`ExportLog`**.
- **No historical backfill** — data starts accumulating from setup. First export up to **48 hours** later.
- Set **partition expiration** (Google's minimum recommendation: **14 days or longer**) or data accumulates forever and costs money.
- `searchdata_url_impression` carries per-URL query data plus search-appearance booleans (`is_amp_top_stories`, `is_job_listing`, `is_job_details`, `is_product_snippets`, `is_review_snippet`, `is_video`, `is_organic_shopping`, `is_translated_result`, etc.) — this is **the only bulk, unsampled, unaggregated source of per-URL+query data Google offers**, and it has no row cap.

### 19.4 Indexing API — the honest answer

```
POST https://indexing.googleapis.com/v3/urlNotifications:publish
GET  https://indexing.googleapis.com/v3/urlNotifications/metadata?url=...
```
(Verified against the live v3 discovery document 2026-09-01: **these two methods are the entire API surface** — `urlNotifications.publish` and `urlNotifications.getMetadata`.)
- **Eligible content types: `JobPosting` and `BroadcastEvent` embedded in a `VideoObject`. Nothing else.**
- **Default quota: 200 publish requests/day per Google Cloud project** — documented as being "for API onboarding and submission testing"; anything more requires Google approval (`URL_UPDATED` + `URL_DELETED` combined); **180 QPM** for `getMetadata`; **380 QPM** across all endpoints. Daily quota resets midnight Pacific.
- **Free** — "All use of the Indexing API is available without payment."
- Higher quota requires a Google approval form; "quota may increase or decrease based on the document quality."
- Auth: **service account** with `https://www.googleapis.com/auth/indexing`, added as an **Owner** of the GSC property.

**Do not build "instant indexing" as a headline feature for blogs/SaaS/e-commerce.** It will work mechanically (Google accepts the call) but it is outside the documented policy and provides no indexing benefit for non-job/non-broadcast pages. Offer instead: **IndexNow** (see below) + sitemap `lastmod` hygiene + internal linking from freshly-crawled hubs.

### 19.5 IndexNow (the one real "push" API for everyone else)

- `POST https://api.indexnow.org/indexnow` with `{"host":"...","key":"...","keyLocation":"...","urlList":[...]}` — up to **10,000 URLs per request**.
- Also `GET https://<engine>/indexnow?url=...&key=...` for single URLs.
- Key: a 8–128 hex-char file at `https://host/<key>.txt` containing the key.
- **Adopted by Bing, Yandex, Seznam, Naver; Cloudflare and Wix auto-submit.** **Google has publicly said it is testing/evaluating IndexNow but has NOT adopted it** *(status as of research date — verify before claiming Google support)*.
- Response `200` = accepted, `202` = key validation pending, `400` bad request, `403` key not valid, `422` URLs don't belong to host, `429` too many requests.
- **Ship this.** It is free, keyless-of-OAuth, works for every site type, and is the correct answer to "notify search engines fast".

### 19.6 GA4 Data API (for the analytics side)

- `POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`
- Standard properties: **core tokens quota** — 25,000 tokens/property/day, 1,250 tokens/hour; **concurrent requests: 10**; **server errors: 10/hour/property**. GA4 360 has ~10× limits. *(Token accounting is complex and changes; read `properties.quotas` from the response `propertyQuota` object at runtime rather than hard-coding.)*
- Auth: OAuth or service account with `analytics.readonly`.

---

## 20. Site migrations (`MIG.*`)

### 20.1 Ground truth (Google, *Site moves with URL changes*)

Five phases: review best practices → prepare the new site → **create a URL map** → configure redirects & move → monitor traffic on both sites.

- **"Keep the redirects for as long as possible, generally at least 1 year."**
- **Change of Address tool** applies only to **domain or subdomain** moves. **Not needed** for HTTP→HTTPS, www variations on the same domain, or path changes within one domain.
- Google recommends moving **all URLs simultaneously** for smaller sites; large sites may move in sections.
- Submit a new sitemap with the new URLs; expect the new sitemap to show 0 indexed initially while old URLs remain indexed, then invert.
- Monitor via Index Coverage / Page Indexing, Sitemaps, and search-query reports.

### 20.2 Migration checklist as code

| ID | Check | Detection | Sev |
|---|---|---|---|
| `MIG.MAP_COVERAGE` | Every old indexable URL has a mapping | old crawl set minus mapped set | Critical |
| `MIG.MAP_ONE_HOP` | Each mapping resolves in exactly one 301 | chain length == 1 | Critical |
| `MIG.MAP_RELEVANCE` | Old→new pair is topically equivalent | MinHash/embedding similarity of old (archived) vs new content ≥ 0.6 | High |
| `MIG.NO_MASS_HOMEPAGE` | < 5% of mappings target `/` | ratio | Critical |
| `MIG.OLD_SITEMAP_RETAINED` | Old sitemap kept live during transition | fetch | Medium |
| `MIG.CANONICAL_UPDATED` | New pages self-canonical to new URLs | parse | Critical |
| `MIG.HREFLANG_UPDATED` | hreflang points at new URLs | parse | Critical |
| `MIG.INTERNAL_LINKS_UPDATED` | Internal links point at new URLs, not via redirects | link scan | High |
| `MIG.ROBOTS_MIGRATED` | New robots.txt is not `Disallow: /` (staging leak) | parse | **Critical** |
| `MIG.NOINDEX_LEAK` | Staging `noindex` shipped to prod | scan | **Critical** |
| `MIG.GSC_NEW_PROPERTY` | New property verified in GSC | `sites.list` | Critical |
| `MIG.CHANGE_OF_ADDRESS` | Change of Address submitted (domain moves only) | manual/UI — **no API** | Critical |
| `MIG.ANALYTICS_CONTINUITY` | GA4/GTM present on new URLs | scan | High |
| `MIG.STRUCTURED_DATA_PARITY` | Same SD types on new templates | compare | High |
| `MIG.PERF_PARITY` | New TTFB/LCP not worse than old | CrUX/lab compare | High |
| `MIG.BACKLINK_TARGETS_ALIVE` | Top external-linked old URLs 301 correctly | join backlink data with redirect map | Critical |
| `MIG.TRAFFIC_DELTA` | Clicks 28-day post vs pre | GSC | Critical |
| `MIG.REDIRECT_EXPIRY` | Redirects still live at 12 months | scheduled recheck | High |

**Autonomy: migrations are T3 across the board.** The tool should *build and verify* the redirect map, run parity diffs, and monitor — but must never execute a migration.

---

## 21. Highest-ROI technical fixes (empirical ranking)

There is **no peer-reviewed causal study** ranking technical SEO fixes by revenue impact. What follows is ranked by (a) what Google's own documentation says it acts on, (b) mechanism directness — does the fix change whether a page can be indexed at all, and (c) observed effect sizes reported in vendor case studies. **Anything in the "evidence" column marked *vendor* is marketing-blog-grade and should not be quoted as fact to users.**

### Tier A — changes whether pages exist in the index (mechanism: binary, immediate)

| Rank | Fix | Why it dominates | Evidence grade |
|---|---|---|---|
| 1 | **Remove accidental `noindex` / `Disallow: /` on money templates** | Directly restores indexability. Documented Google behaviour, not correlational. | Primary (Google robots/meta docs) |
| 2 | **Fix robots.txt returning 5xx** | After 12h of failures Google uses a 30-day cache, then **stops crawling the site**. | Primary (Google robots.txt spec) |
| 3 | **Unblock render-required CSS/JS** | Blocked resources → Google renders a broken page → soft 404 / thin classification. | Primary (Google JS SEO docs) |
| 4 | **Fix consent/cookie walls that hide content from the crawler** | Rendered main text ≈ empty → mass soft 404. Extremely common on EU sites. | Primary mechanism + widely reported |
| 5 | **Resolve canonical conflicts where GSC reports "Duplicate, Google chose different canonical than user"** | Google is currently ignoring the site's declared canonical. | Primary (GSC coverage states) |
| 6 | **Convert soft 404s to real 404/410** | Recovers crawl budget and stops thin-content classification. | Primary (Google crawl-budget doc explicitly recommends this) |

### Tier B — changes how much of the site gets crawled and consolidated

| Rank | Fix | Mechanism | Evidence |
|---|---|---|---|
| 7 | **Collapse redirect chains to one hop; rewrite internal links to final URLs** | Google follows ≤ 10 hops; each hop costs crawl budget and dilutes. Highest-volume safe auto-fix. | Primary + universal tool consensus |
| 8 | **Block/canonicalise faceted & parameter URLs** | Google's own doc names "overcrawling" and "slower discovery crawls" as the harms. | Primary (faceted-nav doc, updated Dec 2025) |
| 9 | **Fix XML sitemap hygiene** (remove non-200/noindex/canonicalised URLs; make `lastmod` truthful) | Google ignores `lastmod` entirely if it's not consistently accurate. | Primary (sitemap doc) |
| 10 | **Fix orphan pages / reduce click depth to ≤ 3** | Discovery + internal PageRank. | Mechanism + strong tool consensus; *effect size vendor-only* |
| 11 | **Improve TTFB / add CDN + `304` support** | Crawl capacity limit is literally defined as time spent holding connections. | Primary (crawl-budget doc) |

### Tier C — changes appearance & CTR (real but smaller, and measurable)

| Rank | Fix | Mechanism | Evidence |
|---|---|---|---|
| 12 | **Add missing/valid structured data on eligible templates** (Product, Article, Breadcrumb, LocalBusiness, Video, Recipe, JobPosting) | Rich result eligibility is documented and binary. | Primary (Search Gallery) |
| 13 | **Fix hreflang return links** | Malformed annotations are *ignored entirely* — so this is also binary. | Primary |
| 14 | **Rewrite duplicate/missing titles & meta descriptions** | CTR. Directly measurable in GSC as CTR delta at stable position. | Primary metric availability; effect size varies |
| 15 | **Fix CWV failures (LCP → INP → CLS)** | Named ranking signal, but Google repeatedly frames it as a tiebreaker. | Primary but explicitly de-emphasised: *"there is no single signal"* |

### Tier D — hygiene with weak or unproven direct impact

Alt text (accessibility/image-search value, not ranking), URL length/underscores, heading order, `priority`/`changefreq` removal, security headers beyond HTTPS, `llms.txt`.

**Measurement protocol we should implement** (so we don't repeat the industry's evidence problem): for each auto-applied fix, record `fix_applied_at`, the affected URL set, and a matched control set of unaffected URLs from the same template. Then compare 28-day pre/post **clicks, impressions, average position, and CTR** for treatment vs control via a difference-in-differences on GSC data. Report the delta with a confidence interval. **This turns our tool into the first thing in the category that can actually prove its own ROI.**

---

## 22. Auto-apply vs human review: the definitive matrix

### 22.1 Safe to auto-apply (T0 — no approval needed)

Deterministic, idempotent, zero semantic judgment, trivially reversible:

- Add `loading="lazy"` to images below the fold; **remove** `loading="lazy"` from the LCP image.
- Add `width`/`height` (or `aspect-ratio`) to `<img>` from intrinsic dimensions.
- Add `rel="noopener"` to `target="_blank"` links.
- Add `font-display: swap` to `@font-face`.
- Add `<meta name="viewport" content="width=device-width, initial-scale=1">` when absent.
- Add `<html lang>` when absent and language is confidently detected (> 0.95).
- Escape unescaped entities in XML sitemaps; absolutize sitemap/robots URLs; drop `<priority>`/`<changefreq>`; fix `lastmod` format.
- Add the `Sitemap:` line to robots.txt (additive only).
- Split sitemaps exceeding 50,000 URLs / 50 MB.
- Remove duplicate identical canonical/hreflang/robots tags (keep first).
- Add `max-image-preview:large` to Article/Product templates.
- Compress/convert images to WebP/AVIF **keeping originals**.
- Submit/resubmit sitemaps via `sitemaps.submit`; ping IndexNow.

### 22.2 Auto-apply with rollback (T1 — apply, log, one-click undo, notify)

- Add **self-referencing** canonical where none exists.
- Absolutize a relative canonical; strip a fragment; fix `http`→`https` in canonical.
- Point a canonical at the final destination of a redirect it currently targets.
- Rewrite internal `<a href>` values that point at redirects/404s to their final live target.
- Fix hreflang: add self-reference, add missing return links, correct `UK`→`GB`, absolutize URLs.
- Remove non-200 / noindex / canonicalised URLs from the XML sitemap; add missing indexable URLs.
- Generate and inject valid JSON-LD for a clearly-classified template, using only facts visible on the page.
- Generate missing/duplicate `<title>` and meta descriptions.
- Generate missing `alt` text.
- Rewrite `http://` resource references to `https://` (mixed content).
- Add `Sitemap`/`X-Content-Type-Options`/`Referrer-Policy` headers.
- Add "Page N" disambiguation to paginated titles.

**Guardrails required for every T1 action:** (1) store the exact prior value in `findings.evidence`; (2) cap volume per run (e.g. ≤ 2% of site URLs or 200 URLs, whichever is smaller); (3) never batch across more than one template per run; (4) re-crawl the affected URLs within 15 minutes and auto-revert on any regression in status code, canonical, or indexability; (5) hard kill-switch if sitewide GSC clicks drop > 15% in 7 days.

### 22.3 Propose only (T2 — generate the exact patch, require approval)

- Any `robots.txt` change other than adding a `Sitemap:` line.
- Any addition or removal of `noindex` / `X-Robots-Tag`.
- Any **canonical retargeting** (pointing a page at a *different* page).
- Any new redirect rule, or changing 302→301.
- Consolidating duplicate/near-duplicate pages.
- Converting 200 → 404/410.
- Blocking or nofollowing faceted URLs.
- Deleting or merging content.
- Adding HSTS.
- Changing pagination structure.
- Anything touching `Product.offers.price` or other commercial claims.

### 22.4 Never automate (T3)

- Site migrations, domain changes, URL structure changes.
- Change of Address submission (no API anyway).
- Sitewide `Disallow` / sitewide `noindex`.
- Cross-domain canonicals.
- Blocking or unblocking AI crawlers (`Google-Extended`, `GPTBot`, `ClaudeBot`, …) — this is a business/licensing decision.
- Disavow files.
- Anything on a URL with > 5% of site traffic without explicit per-URL sign-off.

### 22.5 The blast-radius formula

```python
def requires_approval(fix, site):
    if fix.tier in ("T2", "T3"): return True
    affected_traffic = sum(gsc_clicks_28d[u] for u in fix.urls)
    if affected_traffic / site.total_clicks_28d > 0.05: return True
    if len(fix.urls) / site.indexable_url_count > 0.02:  return True
    if fix.touches in {"robots", "noindex", "canonical_retarget", "redirect"}: return True
    if site.autonomy_level == "suggest_only": return True
    return False
```

Expose exactly three autonomy levels in the UI: **Observe** (findings only), **Assist** (T0+T1 auto, T2 queued as PRs), **Autopilot** (T0+T1 auto, T2 auto after a 24-hour review window with email/Slack notification, T3 never).

---

## 23. Execution surfaces — how fixes actually get applied

A fix is only real if there is a write path. Rank integrations by write capability:

| Surface | Write mechanism | Covers | Notes |
|---|---|---|---|
| **WordPress** | REST API `/wp/v2/posts`, `/wp/v2/pages` + our own plugin for `<head>` injection & redirects | ~40%+ of the web | Best single integration. Plugin can own robots.txt, sitemaps, JSON-LD, redirects, headers. |
| **Webflow** | Data API v2 (CMS items, custom code per page) | SMB/marketing sites | Per-page custom code limits |
| **Shopify** | Admin GraphQL (`metafields`, `productUpdate`), theme `.liquid` via Asset API, `redirect` resource | e-commerce | `urlRedirect` mutations are a real, supported redirect write path |
| **Ghost** | Admin API + `redirects.json` upload | blogs | |
| **Contentful / Sanity / Strapi / Payload** | CMS APIs | headless | Content only; head tags depend on the frontend |
| **Git (GitHub/GitLab)** | Open a **pull request** | Next.js/Astro/Hugo/Jekyll static sites | **This is the ideal T2 surface** — the "approval" is a code review |
| **Cloudflare Workers** | Worker script deployed via API; HTMLRewriter for `<head>` edits, redirects, headers | **any origin** | The universal fallback: an edge-injection layer that works regardless of CMS |
| **Vercel / Netlify** | `vercel.json` / `_redirects` / `_headers` via Git or API | Jamstack | |
| **Nginx/Apache snippet** | Generated config file for the user to install | self-hosted | Manual step |

**Strategic recommendation: build the Cloudflare Worker / reverse-proxy edge layer early.** It converts "we found a problem" into "we fixed it" for **every** site type without CMS-specific work, and every edit through it is trivially reversible (delete the rule). Pair it with a WordPress plugin for the long tail and a Git-PR mode for developer-run sites.

---

## 24. Reference: crawler architecture requirements

To pass as a "professional-grade" auditor, our crawler must:

1. **Two-pass fetch** — raw HTTP + headless Chromium render, storing both, so every JS check in §11 works.
2. **Correct robots.txt semantics** — use `google/robotstxt` or `protego`, not stdlib.
3. **Respect and record `crawl-delay` for non-Google engines**, adaptive concurrency with backoff on 429/5xx, and a configurable politeness budget (default: 5 concurrent, 2 rps).
4. **Identify honestly** — a custom UA string with a URL explaining the bot, and support for the user allowlisting it.
5. **Store content hashes and MinHash signatures per crawl** so duplicate detection and change detection are incremental.
6. **Maintain a persistent URL graph** across crawls (`url`, `first_seen`, `last_seen`, `status_history`, `canonical_history`, `depth`, `inlinks`, `outlinks`, `pagerank`) — this is what enables regression detection, which is the real product.
7. **Support sitemap-only, list-only, and full-discovery crawl modes.**
8. **Incremental recrawl scheduling** — priority = f(internal PageRank, GSC clicks, days since last crawl, observed change frequency, template importance). This is the analogue of Google's own crawl demand and it's what makes a 24/7 agent cheap to run.
9. **Handle 15 MB / 2 MB limits, gzip/br, HTTP/2, IPv6, and cookie-less rendering.**
10. **Never exceed the URL Inspection 2,000 QPD cap** — implement a token-bucket scheduler that spends the daily budget on the highest-value unknowns (see §25).

---

## 25. URL Inspection budget allocation (concrete algorithm)

With **2,000 inspections/day/property**, spend them like this:

```python
def daily_inspection_queue(site, budget=1800):   # 10% headroom
    q = []
    # 1. Confirm/deny our own high-severity findings (Google's opinion beats ours)
    q += top(site.findings(sev="critical", unverified=True), 400)
    # 2. Pages with clicks that suddenly dropped >30% WoW
    q += top(site.urls_with_click_drop(threshold=0.30), 400)
    # 3. Newly published URLs (age < 14d, never inspected)
    q += top(site.new_urls(days=14), 400)
    # 4. Sitemap URLs never confirmed indexed
    q += top(site.sitemap_urls(unconfirmed=True), 300)
    # 5. Rotating audit of the long tail, oldest-inspection-first
    q += site.urls_by_last_inspected_asc(300)
    return dedupe(q)[:budget]
```

Cache every result with `lastCrawlTime` and treat an inspection as valid for **30 days** unless the page's content hash changes. For sites > 50k URLs, rely primarily on **BigQuery bulk export impressions** as the indexation proxy and use URL Inspection purely for diagnosis.

---

## 26. Things that are commonly asserted but are FALSE or stale in 2026

Encode these as **anti-checks** so our agent never recommends them:

| Myth | Reality | Source |
|---|---|---|
| "Ping Google when your sitemap changes" | Endpoint removed; returns **404** | Google Search Central blog, June 2023 |
| "Set `<priority>` and `<changefreq>` correctly" | **Ignored by Google** | Sitemap doc |
| "Use `rel=next`/`rel=prev` for pagination" | Google stopped using it; announced 2019 | Google |
| "Use `Crawl-delay` to control Googlebot" | **Not supported by Google** | robots.txt spec |
| "Use `Noindex:` in robots.txt" | Unsupported since Sept 2019 | Google |
| "Use the URL Parameters tool" | Removed from Search Console (2022); not in current docs | faceted-nav doc |
| "Run the Mobile-Friendly Test / check the Mobile Usability report" | Both retired **2023-12-01**, along with the API. (The `mobileFriendlyTest:run` route still exists in the discovery doc and 403s — de-documented, not de-routed. Still useless.) | Google |
| "There's no API for index coverage, so you must scrape" | **False** — `urlInspection.index.inspect` returns `coverageState` per URL. Only the *bulk* report has no API. | Live discovery doc |
| "There's no API to validate rich results" | **False** — URL Inspection returns `richResultsResult` with per-item `severity`/`issueMessage`. It just can't see unpublished markup. | Live discovery doc |
| "Add FAQPage schema for FAQ rich results" | FAQ rich results **gone as of 2026-05-07**; docs removed 2026-06-15 | Google FAQPage doc |
| "Add HowTo schema" | Removed from rich results in 2023 | Google |
| "Use the Indexing API to index your blog posts" | Policy limits it to **JobPosting** and **BroadcastEvent** only | Indexing API quota doc |
| "Add `llms.txt` to rank in AI search" | Google does not read it; 97% of files never requested | Illyes/Mueller statements; Ahrefs study *(vendor)* |
| "FID is a Core Web Vital" | Replaced by **INP** on 2024-03-12; removed from CrUX Sept 2024 | web.dev |
| "Use `noindex` to save crawl budget" | Google explicitly says **don't** — it still crawls them | crawl-budget doc |
| "The Lighthouse performance score is a ranking factor" | It is lab data; ranking uses **CrUX field data** | web.dev / page-experience doc |
| "300 words minimum for content" | No such Google rule; use template-relative thresholds | — |
| "Use the Search Console crawl rate limiter" | Removed January 2024 | Google *(2024 fact — flagged)* |

---

## 27. Direct implications for our tool

### 27.1 Non-negotiable architectural constraints (derived from the quota facts above)

1. **URL Inspection is capped at 2,000/day/property.** Do **not** design any feature that assumes per-URL Google index status for every page daily. Make **BigQuery bulk export** the primary indexation signal and URL Inspection the diagnostic scalpel (§25). For the hosted $8/mo tier, this cap is per-property and applies to the *end user's* property — so the quota is naturally sharded per customer, which is good; but our **Cloud project** limit (15,000 QPM / 10M QPD) is shared across all hosted customers, so instrument per-project usage and shard across multiple GCP projects if we exceed ~5,000 properties.
2. **CrUX is 150 QPM per Cloud project, unpurchasable.** At 150 QPM, one project supports ~216,000 queries/day. For the hosted tier, budget 2 CrUX calls per site per day (origin phone + origin desktop) → ~100k sites per project. **Have users supply their own API key in self-hosted mode** (it's free and takes 2 minutes) so we never bottleneck.
3. **PageSpeed Insights is 25,000/day.** Cheap. Use PSI when we want lab + field in one call and don't want to run Chromium; run **our own Lighthouse/Chromium** when we need rendered HTML, DOM diffs, or custom audits. Self-hosted users get unlimited local Lighthouse; hosted tier should default to local Chromium to avoid the PSI ceiling.
4. **There is no API for: the Rich Results Test, the Schema Markup Validator, the *aggregate* Index Coverage / Page Indexing report, Change of Address, the Mobile-Friendly Test, or sitemap ping.** *(Rewritten 2026-09-01 — the previous version overstated this and would have led us to build the wrong thing.)* Concretely:
   - **Per-URL index coverage DOES have an API.** `urlInspection.index.inspect` returns `coverageState` verbatim from the Page Indexing report, plus `verdict`/`robotsTxtState`/`indexingState`/`pageFetchState`/`googleCanonical`/`userCanonical`/`sitemap[]`/`referringUrls[]`. What's missing is only the **bulk/aggregate export**. Architecture: BigQuery bulk export for the census, URL Inspection for per-URL truth, budgeted against the hard **2,000 QPD / 600 QPM per property** ceiling.
   - **Per-URL rich-results validation DOES have an API** — `richResultsResult` with `detectedItems[]` and `RichResultsIssue{severity, issueMessage}`. We still build a local `extruct` + schema.org + required-property-table validator, but for the correct reasons: it must work on **draft/staged/unpublished** markup, on **unverified** properties, at **full-site scale**, and in a **pre-publish feedback loop** — none of which URL Inspection can do. Use `richResultsResult` as the reconciliation oracle, not as "nothing exists".
   - Genuinely absent, build local or hand off to the user: Rich Results Test API (`richResultsTest:run` → true 404), Schema Markup Validator API (no discovery doc), Change of Address (UI only), sitemap ping (404), Mobile-Friendly Test (de-documented; the route still 403s but returns nothing useful).
5. **Google write operations available to us are exactly: `sites.add` (`PUT /webmasters/v3/sites/{siteUrl}`), `sites.delete`, `sitemaps.submit`, `sitemaps.delete`, and (policy-limited) `urlNotifications:publish`.** *(Corrected 2026-09-01 — `sites.add`/`sites.delete` were previously missing, and they matter: `sites.add` lets us automate customer onboarding rather than walking users through the GSC UI. Gate `sites.delete` at T3.)* Crucially, **none of these can fix anything on a customer's site** — every write is account/discovery plumbing (register a property, submit a sitemap) or policy-gated to job postings and livestreams. That conclusion is unchanged and it still makes the CMS/edge execution layer (§23) the actual product, not the Google APIs. What *is* richer than we assumed is the **read/verification** layer.
6. **OAuth scopes:** request `https://www.googleapis.com/auth/webmasters.readonly` by default and escalate to `https://www.googleapis.com/auth/webmasters` **only** when the user enables sitemap writes **or opts into automated property registration via `sites.add`**. Google's OAuth verification for these scopes is a real process — budget for it in the hosted tier. Self-hosted users can use their own OAuth client (document this path clearly; it also sidesteps verification entirely).

### 27.2 Product decisions I would make

1. **Ship ~250–300 checks at v1, not 50.** The commercial baseline is 170 (Ahrefs) to 300+ (Screaming Frog, Sitebulb). Anything less reads as a toy. §1–§20 above enumerate well over 300 — implement them as a declarative rules file (YAML/JSON), not as code, so checks can be added without a release.
2. **The differentiator is not "find issues" — it is (a) conflicting-signal detection (§2.3), (b) indexation gap analysis (§5.3), (c) regression detection over a persistent URL graph, and (d) actually applying fixes.** No existing crawler does (a) or (d) well.
3. **Build the edge-injection layer (Cloudflare Worker / reverse proxy) before the CMS integrations.** It's the only path to "works on any website" and it makes every fix instantly reversible, which is what makes autonomy tolerable.
4. **Default to `Assist` autonomy, not `Autopilot`.** Ship the blast-radius formula (§22.5) and the auto-revert watchdog on day one. One customer deindexed by our tool ends the project.
5. **Roll findings up to templates.** Report "1 issue affecting 12,000 product URLs", never 12,000 findings. Cluster by `(path_template, sorted(param_keys))` (§8.2).
6. **Version the "what Google supports" data.** `supported_types.json`, `lighthouse_audit_ids_v13.json`, `cwv_thresholds.json`, `robots_directives.json` — all dated, all refreshed by a scheduled job that diffs Google's Search Central *Documentation updates* changelog. FAQ/HowTo/Practice-Problems churn proves this is not optional.
7. **Implement the diff-in-diff ROI measurement (§21).** It is a genuine moat, it justifies the $8/mo, and it forces us to be honest.
8. **Do not market Indexing API "instant indexing" or `llms.txt`.** Both are documented dead ends. Ship **IndexNow** instead — it's free, unlimited-ish (10k URLs/request), covers Bing/Yandex/Naver/Seznam, and requires no OAuth.
9. **Cost model for the hosted tier at $8/month:** the dominant cost is headless Chromium renders. At ~1–2 s CPU and ~300 MB RAM per render, a 5,000-URL site fully re-rendered weekly ≈ 20k renders/month ≈ real money. Mitigate with: incremental recrawl by priority (§24.8), raw-HTTP-only for URLs whose `ETag`/`Last-Modified` is unchanged, rendering only a stratified sample per template (e.g. 20 URLs/template) plus all high-traffic URLs, and hard per-plan render caps. **Self-hosted users bear their own compute — make the self-hosted path the default and the hosted tier explicitly capped.**
10. **Log-file ingestion is the highest-value, lowest-adoption feature.** Ship parsers for Cloudflare Logpush, CloudFront, ALB and Nginx combined, and make Cloudflare Logpush a one-click setup — it's the only realistic path to log data for most SMB sites and it unlocks §18 entirely.

### 27.3 Suggested v1 → v2 sequencing

- **v1 (audit + safe autofix):** crawler with two-pass rendering, §1–§5 + §10 + §13 + §16 checks, GSC OAuth + Search Analytics + URL Inspection budget scheduler, CrUX + PSI, sitemap generation & `sitemaps.submit`, WordPress plugin + Git-PR mode, T0/T1 autofixes only.
- **v1.5:** structured data generation & validation (§15), hreflang cluster validation (§14), JS/hydration diffing (§11), near-duplicate + thin content (§9), IndexNow.
- **v2:** Cloudflare Worker edge layer, log-file ingestion (§18), BigQuery bulk export, internal PageRank & link-graph optimisation (§6.3), migration assistant (§20), diff-in-diff ROI reporting (§21).

---

## 28. Open questions / things to verify before shipping

**⚠️ unverified — must be confirmed during implementation.** Every item below fell outside the 2026-09-01 fact-check pass and none of them has been independently confirmed. Do not treat any of them as settled fact in code, marketing copy, or the rules file.

1. Exact current PageSpeed Insights API per-minute quota — read live from Cloud Console rather than trusting any blog.
2. Whether the Practice Problems removal (Jan 2026) and the Book Actions un-deprecation (Nov 2025) are reflected in the Search Central changelog, not just trade press.
3. Whether Lighthouse 13.3's "Agentic Browsing" category is stable enough to expose (it is experimental and only documented in vendor write-ups so far).
4. Whether Google has adopted IndexNow (they were "testing" it; last confirmed status is non-adoption).
5. Exact GSC OAuth verification requirements/timeline for the `webmasters` (write) scope for a hosted multi-tenant app.
6. Whether GSC Bulk Data Export can be enabled programmatically (currently UI-only) — this is a meaningful onboarding-friction question. **Note:** the live discovery doc shows no such method, so plan for UI-only; but `sites.add` *does* exist, so property registration itself can be automated.
7. Current status of `noarchive` / `nositelinkssearchbox` — docs list them as unused; confirm before auto-removing them from customer sites.
8. Whether Search Console's Core Web Vitals report has shifted since Safari 26.2 (Dec 2025) added LCP/INP to CrUX — build a changepoint annotation for Dec 2025 into our CWV trend charts.

---

## Sources

All URLs accessed **2026-08-31** unless noted.

### Google primary documentation
- Structured data gallery — https://developers.google.com/search/docs/appearance/structured-data/search-gallery
- General structured data guidelines — https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- FAQPage (deprecation notice) — https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Build and submit a sitemap — https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- robots.txt specification — https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
- Robots meta tag / X-Robots-Tag — https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- Consolidate duplicate URLs (canonicalization) — https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- HTTP status codes, network and DNS errors — https://developers.google.com/search/docs/crawling-indexing/http-network-errors
- Large site owner's guide to managing crawl budget — https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget
- Faceted navigation best practices (updated Dec 2025) — https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation
- JavaScript SEO basics — https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Localized versions / hreflang — https://developers.google.com/search/docs/specialty/international/localized-versions
- Site moves with URL changes — https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- Overview of Google crawlers — https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers
- Page experience (updated 2025-12-10) — https://developers.google.com/search/docs/appearance/page-experience
- Sitemaps ping endpoint is going away (June 2023) — https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping
- Bulk data export announcement — https://developers.google.com/search/blog/2023/02/bulk-data-export
- URL Inspection API announcement — https://developers.google.com/search/blog/2022/01/url-inspection-api

### Google API references & quotas
- Search Console API usage limits — https://developers.google.com/webmaster-tools/limits
- Search Analytics: query — https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- URL Inspection: index.inspect — https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- Sitemaps resource — https://developers.google.com/webmaster-tools/v1/sitemaps
- Indexing API quota & pricing — https://developers.google.com/search/apis/indexing-api/v3/quota-pricing
- Indexing API quickstart — https://developers.google.com/search/apis/indexing-api/v3/quickstart
- CrUX API — https://developer.chrome.com/docs/crux/api
- Start a new bulk data export (Search Console Help) — https://support.google.com/webmasters/answer/12917675
- Page Indexing report — https://support.google.com/webmasters/answer/7440203

### Web performance
- Web Vitals — https://web.dev/articles/vitals
- What's new in Lighthouse 13 (published 2025-10-10) — https://developer.chrome.com/blog/lighthouse-13-0
- Lighthouse moving to performance insight audits — https://developer.chrome.com/blog/moving-lighthouse-to-insights

### Tool vendor documentation (issue taxonomies)
- Screaming Frog — 300+ SEO issues — https://www.screamingfrog.co.uk/seo-spider/issues/
- Screaming Frog — Near Duplicates issue — https://www.screamingfrog.co.uk/seo-spider/issues/content/near-duplicates/
- Screaming Frog — How to check for duplicate content (90% minhash default) — https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-check-for-duplicate-content/
- Sitebulb — Hints index — https://sitebulb.com/hints/
- Sitebulb — Indexability hints (with severity levels) — https://sitebulb.com/hints/indexability/
- Ahrefs Site Audit — issue categories (API reference) — https://docs.ahrefs.com/en/api/reference/site-audit/get-issues

### Academic / algorithmic
- Manku, Jain & Das Sarma, *Detecting Near-Duplicates for Web Crawling* (Google, WWW 2007) — 64-bit simhash, Hamming distance ≤ 3 — https://research.google.com/pubs/archive/33026.pdf
- Shrivastava & Li, *In Defense of MinHash Over SimHash* — https://arxiv.org/pdf/1407.4416

### Secondary / trade press (flagged as non-primary)
- Search Engine Land — Google drops Mobile Usability report, Mobile-Friendly Test tool and API — https://searchengineland.com/google-officially-drops-mobile-usability-report-mobile-friendly-test-tool-and-mobile-friendly-test-api-435377
- Search Engine Land — Google to deprecate Sitemaps ping endpoint — https://searchengineland.com/google-to-deprecate-sitemaps-ping-endpoint-later-this-year-428661
- Ahrefs — "We Analyzed 137K Sites: 97% of llms.txt Files Never Get Read" (**vendor study**) — https://ahrefs.com/blog/llmstxt-study/
- Search Engine Journal — Lighthouse audit overhaul — https://www.searchenginejournal.com/google-lighthouse-to-undergo-major-audit-overhaul-what-to-know/545864/
- 2026 structured-data change logs (**trade press, verify against Google changelog**) — https://www.aischemagen.com/blog/google-structured-data-changes-2026 ; https://protoneffect.com/google-structured-data-changes/

### Explicitly flagged as 2024-or-earlier (possibly stale)
- INP replaced FID (2024-03-12); FID removed from CrUX (Sept 2024)
- Search Console crawl rate limiter removed (January 2024)
- Mobile-Friendly Test tool + API and Mobile Usability report removed (2023-12-01)
- Sitemaps ping endpoint deprecated (June 2023, removed within 6 months)
- `rel=next`/`rel=prev` no longer used by Google (announced 2019)
- `Noindex:` in robots.txt unsupported (September 2019)
- URL Parameters tool removed from Search Console (April 2022)
- HowTo and Sitelinks Searchbox rich results removed (2023)

---

## Fact-check log

**Pass date:** 2026-09-01. Six load-bearing factual claims from this dossier were independently verified against live Google discovery documents, live HTTP probes and primary Google documentation. Five came back **CONFIRMED**; one came back **PARTIALLY_TRUE** and has been corrected inline above (§5.1, §5.3, §11 render-oracle note, §12.1, §15.2, §16, §19.2, §19.4, §26 myth table, §27.1 items 4–6).

| # | Claim as originally written | Verdict | Correction applied |
|---|---|---|---|
| 1 | URL Inspection API is hard-capped at 2,000 QPD / 600 QPM per property; 15,000 QPM and 10,000,000 QPD per Cloud project. Search Analytics is 1,200 QPM per site and per user. | **CONFIRMED** | None. |
| 2 | The Indexing API only accepts pages with `JobPosting` or `BroadcastEvent` (embedded in a `VideoObject`) structured data, default quota 200 publish requests/day/project, free of charge. | **CONFIRMED** | None (added the documented framing that the 200 default exists "for API onboarding and submission testing" and that more requires Google approval, plus confirmation that `urlNotifications.publish` + `urlNotifications.getMetadata` are the entire API surface). |
| 3 | The CrUX API (`POST https://chromeuxreport.googleapis.com/v1/records:queryRecord`) is limited to 150 QPM per Cloud project, is free, and quota cannot be purchased. | **CONFIRMED** | None. |
| 4 | No public API for the Rich Results Test or Schema Markup Validator; no API for the Search Console Index Coverage / Page Indexing report; Mobile-Friendly Test API removed 2023-12-01; sitemap ping returns 404; the only Google write operations are `sitemaps.submit`/`sitemaps.delete` and the policy-limited Indexing API. | **PARTIALLY_TRUE** | Four corrections, all applied inline — see the detail block below. |
| 5 | Core Web Vitals in 2026 are exactly three metrics — LCP (good ≤2.5 s), INP (good ≤200 ms), CLS (good ≤0.1) — all at the 75th percentile; no new metric added or announced. | **CONFIRMED** | None. |
| 6 | FAQ rich results stopped appearing 2026-05-07; FAQPage docs removed 2026-06-15; FAQ report dropped from Search Console June 2026; Search Console API support removed August 2026. | **CONFIRMED** | None. |

### Detail on claim 4 (PARTIALLY_TRUE)

**Survived verification:**
- `sitemaps.submit` = `PUT webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` and `sitemaps.delete` = `DELETE` on the same path — exactly right. Discovery `baseUrl` is `https://searchconsole.googleapis.com/`.
- Sitemap ping is dead: live probe returned **HTTP 404**, no redirect. (Bing's equivalent returns **410**.)
- **No Rich Results Test API** — `POST /v1/urlTestingTools/richResultsTest:run` returns a genuine server 404 and is absent from both the discovery doc and the API reference index.
- **No Schema Markup Validator API** — `validator.schema.org` exposes no discovery document (404).
- Indexing API is policy-limited to `JobPosting` and `BroadcastEvent`-in-`VideoObject` only.

**REFUTED — correction 1 (most important).** "No API for the Index Coverage / Page Indexing report" is **false at the per-URL level**. `urlInspection.index.inspect` returns `IndexStatusInspectionResult.coverageState` — the identical human-readable string the Page Indexing report shows — plus `verdict`, `robotsTxtState`, `indexingState`, `pageFetchState` (12 enum values), `crawledAs`, `googleCanonical`, `userCanonical`, `sitemap[]`, `referringUrls[]`, `lastCrawlTime`. The accurate statement: **there is no bulk/aggregate export of the Page Indexing report**; you poll URL-by-URL against 2,000 QPD / 600 QPM per property. Fixed in §5.3, §19.2, §26, §27.1.4.

**REFUTED — correction 2.** "We must build local structured-data validation because Google exposes no validation endpoint" is **overstated**. `UrlInspectionResult.richResultsResult` returns `detectedItems[]` (`richResultType`, `items[]`) with per-item `RichResultsIssue{severity: ERROR|WARNING, issueMessage}` and an overall `verdict`. Local validation is still correct to build, but for different reasons: it must handle draft/staged/unpublished markup, unverified properties, full-site scale, and a pre-publish feedback loop. Fixed in §15.2 and §27.1.4.

**INCOMPLETE — correction 3.** `sitemaps.submit`/`delete` and the Indexing API are **not** the only writes. `sites.add` (`PUT webmasters/v3/sites/{siteUrl}`) and `sites.delete` (`DELETE` same path) are also write operations — directly relevant to automating customer onboarding. Fixed in §19.2 and §27.1.5.

**NUANCE — correction 4.** The Mobile-Friendly Test API retirement date of **2023-12-01 is correct** and it is gone from the API reference index, but "removed" is imprecise: `urlTestingTools/mobileFriendlyTest.run` is **still present in the live v1 discovery document and still routed** — unauthenticated calls return `403 PERMISSION_DENIED`, whereas a fabricated method name returns a true 404. `MobileUsabilityInspectionResult` likewise lingers in the URL Inspection schema but has been dead since Dec 2023. De-documented, not de-routed; build against neither. Fixed in §11, §12.1, §16, §26.

**Net effect on the product decision:** the core inference **holds**. No Google API can fix anything on a customer's site — every write is account/discovery plumbing or policy-gated to job postings and livestreams, so the CMS/edge execution layer remains the only real execution surface. But the **read/verification layer is richer than the dossier assumed**: use URL Inspection for per-URL `coverageState` *and* rich-results issues, budgeted against the hard 2,000/day/property ceiling.

### Sources used for this pass

- https://searchconsole.googleapis.com/$discovery/rest?version=v1 — live discovery document, fetched 2026-09-01 (authoritative method list, HTTP verbs, flatPaths, and full `UrlInspectionResult` / `IndexStatusInspectionResult` / `RichResultsInspectionResult` schemas)
- https://indexing.googleapis.com/$discovery/rest?version=v3 — live discovery document (confirms only `urlNotifications.publish` and `urlNotifications.getMetadata`)
- https://developers.google.com/webmaster-tools/v1/sitemaps
- https://developers.google.com/webmaster-tools/v1/api_reference_index — confirms `mobileFriendlyTest` is no longer documented; confirms `sites.add` and `sites.delete`
- https://developers.google.com/webmaster-tools/limits — URL Inspection 2,000 QPD / 600 QPM per site; 10,000,000 QPD / 15,000 QPM per project
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- https://developers.google.com/search/apis/indexing-api/v3/quickstart — `JobPosting` / `BroadcastEvent`-in-`VideoObject` restriction; default 200 quota
- https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping — ping deprecation announcement
- Live HTTP probe: `GET https://www.google.com/ping?sitemap=…` → HTTP 404 (2026-09-01)
- Live HTTP probe: `POST https://searchconsole.googleapis.com/v1/urlTestingTools/mobileFriendlyTest:run` → 403 PERMISSION_DENIED (route still registered); `POST …/richResultsTest:run` → genuine 404
- https://searchengineland.com/google-officially-drops-mobile-usability-report-mobile-friendly-test-tool-and-mobile-friendly-test-api-435377 *(secondary, for the 2023-12-01 date)*
