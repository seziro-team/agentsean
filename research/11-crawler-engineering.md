# 11 — Crawler & Site-Analysis Engine: Engineering Dossier

**Research date:** 2026-08-31. All version numbers verified against the live npm registry on 2026-08-31 unless noted.
**Fact-check pass:** 2026-09-01 — six load-bearing claims independently verified; four required correction. Corrections are applied inline at the point of use; see **§22 Fact-check log** for the full record. Sections materially revised: **§3** (robots.txt — the "Google violates RFC 9309" framing was false), **§8.2/8.3** (Playwright memory — the ~250 MB/page figure was fabricated), **§13.2** (structured data — the URL Inspection API cannot test live URLs), **§15.3** (sqlite-vec — ANN now exists, in alpha only).
**Scope:** production-grade crawler + analysis engine for a self-hostable, Node.js/TypeScript autonomous SEO agent. Target: run comfortably on a developer laptop (8–16 GB RAM) for sites of 1k–100k URLs, degrade gracefully to 1M URLs.

---

## 0. TL;DR — the recommended stack

| Concern | Pick | Version (2026-08-31) | Why |
|---|---|---|---|
| Language/runtime | **TypeScript on Node.js ≥ 22.19 LTS** | — | Lighthouse v13 hard-requires Node ≥ 22.19; `node:sqlite` and `node:zlib` zstd exist; Playwright/undici are first-class |
| HTTP client | **undici** (`Pool`/`Agent` + custom dispatcher) | 8.10.1 | Fastest, owns the socket pool, native H2 |
| HTML parse (bulk) | **cheerio** in `htmlparser2` mode; **parse5** only for spec-critical paths | cheerio 1.2.0, parse5 8.0.1, htmlparser2 12.0.0 | htmlparser2 ≈ 2× parse5 throughput |
| DOM-shaped work | **linkedom** | 0.18.13 | Real DOM API, linear perf, needed by Readability |
| JS rendering | **Playwright** (chromium headless shell), adaptive per-URL | 1.62.1 | Better browser lifecycle + `route()` blocking than Puppeteer 25.9.0 |
| robots.txt | Vendored/forked parser implementing **RFC 9309 + Google deltas** | — | `robots-parser` 3.0.1 last published **2023-02-21** → STALE, do not depend on it unmaintained |
| Sitemaps | Custom **SAX streaming** parser (`sax` / `saxes`) + `zlib.gunzip` | — | Must handle 50 MB / 50k limits and index nesting without buffering DOM |
| Storage | **SQLite (better-sqlite3 13.0.3) in WAL**, `node:sqlite` as zero-install fallback | — | Synchronous API is ideal for a batch crawler; DuckDB only for analytics rollups |
| Analytics rollups | **@duckdb/node-api** (Neo) | 1.x / npm `@duckdb/node-api` | Legacy `duckdb` package is deprecated after 1.4.x |
| Vectors | **sqlite-vec 0.1.9 (stable channel = brute-force only)** for < ~200k chunks; **@lancedb/lancedb 0.38.0** above that | — | ANN (rescore / IVF / DiskANN) exists only in the undocumented `0.1.10-alpha.*` prerelease line; the stable release you install by default is flat-scan |
| Embeddings | **@huggingface/transformers 4.2.0** (Transformers.js v4) local ONNX, EmbeddingGemma-300M or all-MiniLM-L6-v2; OpenAI `text-embedding-3-small` at **$0.02 / 1M tokens** as opt-in | — | Local = $0 and private; API = better multilingual quality for ~pennies |
| Lab CWV | **lighthouse 13.4.1** programmatic + chrome-launcher | — | v13.0.0 shipped 2025-10-10; v13.4.1 on 2026-07-20 |
| Field CWV | **CrUX API** (150 QPM/project, free, hard cap) | — | Cannot be paid-upgraded |
| Main content | **@mozilla/readability 0.6.0** on linkedom (flag: last publish 2025-03-03) | — | Python `trafilatura` 2.2.0 scores F1 **0.924** vs readability-lxml **0.826** — consider an optional Python sidecar |

---

## 1. Language choice: TypeScript, with two narrow Python escape hatches

**Decide TypeScript.** Reasons that are actually load-bearing rather than taste:

1. Lighthouse only ships a JS/Node programmatic API (`import lighthouse from 'lighthouse'`). Python wrappers shell out to the Node CLI anyway.
2. Playwright's Node bindings are the reference implementation; the Python bindings lag and are a separate process boundary.
3. The dashboard is already a web app; one language, one `node_modules`, one install story (`npx seoe init`) is a real UX advantage for a self-hosted tool competing with n8n/OpenHands on "one command".
4. Transformers.js v4 now has a **C++-rewritten WebGPU runtime that runs in Node/Bun/Deno**, so local embeddings no longer force Python.

**Where Python still wins, and how to handle it:**

- **Main-content extraction.** `trafilatura` 2.2.0 benchmark (990 docs, Python 3.13, benchmark dated 2026-08-04): F1 **0.924** (P 0.906 / R 0.943) vs `readability-lxml` 0.8.4.1 F1 **0.826** (P 0.898 / R 0.764). Readability.js is the same family as readability-lxml, so expect ~0.83 F1 from the JS path. That ~10-point F1 gap matters when you are asking an LLM "is this page thin content?" → ship JS Readability by default, offer an **optional `seoe extras install python`** sidecar that runs trafilatura over a local HTTP/stdio bridge.
- **Heavy dedup / clustering at 1M scale.** `datasketch` MinHashLSH is more battle-tested than any JS equivalent. Mitigation: implement SimHash in TS (it's ~80 lines) rather than MinHash — see §7.

Never make Python a hard install dependency. Self-hosted SEO tooling dies on `pip` + `libxml2` build failures.

---

## 2. HTTP fetching stack

### 2.1 Pick undici, and configure it explicitly

`undici` 8.10.1 (published 2026-08-31; v8.0.0 was 2026-04-02, v7.0.0 was 2024-11-27). It *is* the engine behind Node's global `fetch`. Use the low-level `Pool`/`Agent` API, not global `fetch`, because you need per-origin pool control.

**Verified `Client`/`Pool` option defaults (undici docs, main branch, accessed 2026-08-31):**

| Option | Default | Crawler setting |
|---|---|---|
| `keepAliveTimeout` | `4e3` (4 s) | `10_000` — sitemaps and crawls are bursty per host |
| `keepAliveMaxTimeout` | `600e3` (600 s) | keep default |
| `headersTimeout` | `300e3` (300 s) | **`15_000`** — 300 s will hang your frontier |
| `bodyTimeout` | `300e3` (300 s) | **`30_000`** |
| `pipelining` | `1` | keep `1` for HTTP/1.1 (pipelining breaks on many origins) |
| `allowH2` | **`true`** (undici v8 default; was `false` in v7) | keep `true` |
| `maxConcurrentStreams` | `100` | `10`–`20` for politeness |
| `maxHeaderSize` | Node `--max-http-header-size` or `16384` (16 KiB) | default |
| `maxResponseSize` | `-1` (disabled) | **set to `10 * 1024 * 1024`** — hard-stop 10 MB bodies so one 500 MB "HTML" file can't OOM the crawler |
| `connections` (Pool) | `null` = **unlimited** | **must set** (see gotcha) |
| `clientTtl` (Pool) | `null` | `60_000` to recycle idle clients |

**Gotcha #1 — Pool defaults defeat HTTP/2.** Undici's own docs state: *"With the default unlimited `connections`, the pool opens a new client per concurrent dispatch, which defeats HTTP/2 multiplexing. To benefit from h2 multiplexing on a single session, cap `connections`."* For a polite crawler you want `connections: 1` or `2` per origin anyway, so this aligns: **one H2 session per host, N concurrent streams**.

**Gotcha #2 — `undici.request()` does NOT decompress.** `fetch()` transparently decodes `Content-Encoding`; `request()` returns the raw compressed stream even if you sent `accept-encoding`. If you use the low-level API (you should, for streaming + byte accounting), you must pipe through `zlib` yourself. There is an open undici issue for a decompression interceptor (#4316) — as of 2026-08-31 it is **not** in the default `request()` path.

**Gotcha #3 — undici timers.** Delays ≤ 1000 ms use native timers; larger delays use undici's fast timers with ~500 ms resolution. Don't build a crawl-delay scheduler on undici timeouts; use your own scheduler.

### 2.2 Accept-Encoding and decompression

Send: `accept-encoding: gzip, deflate, br, zstd` — but only include `zstd` if `process.version` supports it.

- Brotli in `node:zlib`: **added in v11.7.0 / v10.16.0** (stable).
- Zstd in `node:zlib` (`zstdCompress`, `createZstdDecompress`, …): **added in v23.8.0 and v22.15.0**, marked **Stability 1 – Experimental**.

Decode table (implement as a small `decodeBody(stream, contentEncoding)`):

```
gzip | x-gzip  -> zlib.createGunzip()
deflate         -> zlib.createInflate() with raw fallback (many servers send raw deflate)
br              -> zlib.createBrotliDecompress()
zstd            -> zlib.createZstdDecompress()   // guard on Node >= 22.15
identity/none   -> passthrough
```

Handle **chained encodings** (`Content-Encoding: gzip, br`) by applying decoders right-to-left. undici has had bugs here (issues #2158, #3762) — write your own and unit-test it.

Also: **count both wire bytes and decoded bytes**. "Transfer size vs resource size" is a real SEO deliverable ("your HTML is 480 KB uncompressed / 62 KB gzipped") and you get it for free at this layer.

### 2.3 Retry / backoff policy

Do **not** use `got`'s built-in retry (got 16.0.0 is excellent but adds a dependency layer over undici and its retry semantics are per-request, not per-host). Implement a host-scoped policy:

```
retryable: ECONNRESET, ECONNREFUSED, EPIPE, ETIMEDOUT, EAI_AGAIN,
           UND_ERR_CONNECT_TIMEOUT, UND_ERR_HEADERS_TIMEOUT, UND_ERR_SOCKET,
           HTTP 408, 425, 429, 500, 502, 503, 504, 522, 524
non-retryable: 4xx except 408/425/429
maxAttempts: 3 (5 for 429)
backoff: min(baseDelay * 2^(attempt-1), 60_000) with full jitter
baseDelay: 1000ms
honor Retry-After (both delta-seconds and HTTP-date forms) and let it OVERRIDE the backoff, capped at 300s
```

On `429` or `5xx`, also apply a **host-level circuit breaker** (§9.3), not just per-request retries. Google's own crawl-budget doc says the same thing about itself: *"if a site responds with server errors (5xx HTTP status codes) or rate-limiting signals (such as HTTP 429), the limit goes down."* We should behave at least as well as Googlebot.

### 2.4 Other HTTP details that bite crawlers

- **Redirects:** follow max 5 hops for pages, and record the **full chain** (this is a first-class SEO artifact: redirect chains, loops, 302-instead-of-301, protocol/host normalization redirects). Do NOT let undici auto-follow — use `undici.interceptors.redirect` with `maxRedirections: 0` at the dispatcher and drive the chain yourself so each hop lands in the DB.
- **robots.txt redirects:** Google *"follows at least five redirect hops … and then stops and treats it as a 404 for the robots.txt file."*
- **HEAD then GET** is usually a pessimization (2 RTTs); prefer conditional GET (§10).
- **User-Agent:** ship a truthful, identifiable UA with a URL, e.g. `Mozilla/5.0 (compatible; SeoeBot/1.0; +https://<docs-url>/bot) undici/8`. Offer a config to impersonate the site owner's own browser only for their **own verified** property. Never ship a default that impersonates Googlebot — that's a fast route to being blocked and to legal/ToS problems.
- **Per-host cookie jar:** off by default; some CMSes 302-loop without a session cookie. Use `tough-cookie` only when a loop is detected.
- **TLS:** set `connect: { rejectUnauthorized: true }` but surface cert errors as an *SEO finding* (expired/mismatched cert = catastrophic), with a per-site `allowInsecure` override for staging.

---

## 3. robots.txt: parsing, precedence, and the Google/RFC delta

> **Correction (fact-check, 2026-09-01):** an earlier draft of this section claimed Google's 5xx handling *diverges* from RFC 9309. **That framing is wrong and must not be repeated in docs or marketing — it will not survive review.** RFC 9309 §2.3.1.4 explicitly authorises Google's exact behaviour. The real Google/RFC delta is narrow: group selection (Google picks one most-specific group, the RFC merges matching groups) and a handful of unsupported directives. On status codes, cache lifetime and size limits, Google sits *inside* the RFC's MAY/SHOULD clauses — in several cases exactly at the RFC's stated floor. Note also that three of RFC 9309's four authors (M. Koster, G. Illyes, H. Zeller, L. Sassman) are Google employees; the spec was written to codify Googlebot's existing behaviour. RFC 9309 (September 2022) is a *Proposed Standard*, not a full Internet Standard.

### 3.1 The two normative sources (and where they disagree)

**RFC 9309 (Robots Exclusion Protocol, IETF standard):**
- Group matching: *"case-insensitive matching to find the group that matches the product token"*; if multiple groups match, *"the matching groups' rules MUST be combined into one group"*; if none match, *"crawlers MUST obey the group with a user-agent line with the '*' value."*
- Precedence: *"The most specific match found MUST be used. The most specific match is the match that has the most octets."* On a tie, *"the 'allow' rule SHOULD be used."*
- Wildcards: `*` = *"0 or more instances of any character"*; `$` = *"the end of the match pattern."*
- Caching: crawlers *"SHOULD NOT use the cached version for more than 24 hours, unless the robots.txt file is unreachable."*
- Size: *"The parsing limit MUST be at least 500 kibibytes."* (§2.5) — this is a **floor**, and Google's 500 KiB sits exactly on it.
- Redirects: crawlers *"SHOULD follow at least five consecutive redirects, even across authorities"* (§2.3.1.2).
- Status: **4xx "unavailable"** (§2.3.1.3) → *"the crawler MAY access any resources on the server"*. **5xx "unreachable"** (§2.3.1.4) → *"the crawler MUST assume complete disallow"* — **but the same section continues**: *"If the robots.txt file is undefined for a reasonably long period of time (for example, 30 days), crawlers MAY assume that the robots.txt file is unavailable as defined in Section 2.3.1.3 or continue to use a cached copy."* The 30-day carve-out, the permission to fall back to permissive "unavailable" semantics, and the permission to keep serving a cached copy are **all in the standard**. Quoting only the first sentence (as tools and blog posts routinely do) manufactures a divergence that does not exist.

**Google's documented behaviour** (page shows *"Last updated 2026-08-31 UTC"*; **differs from the RFC only on group selection and unsupported directives — not on status codes**):
- Size limit: **500 kibibytes (KiB)**; *"Content which is after the maximum file size is ignored."*
- Cache: *"up to 24 hours, but may cache it longer in situations where refreshing the cached version isn't possible."*
- Conflicts: *"Google uses the least restrictive rule"* — with the more specific (longer path) rule winning first.
- Group selection: *"Only one group is valid for a particular crawler"* — Google picks *"the group with the most specific user agent that matches"*, i.e. it does **not** merge across different product tokens the way RFC 9309 describes for multiple matching lines.
- **4xx (except 429):** *"Google's crawlers treat all 4xx errors, except 429, as if a valid robots.txt file didn't exist"* → no restrictions.
- **5xx (and 429, and DNS/network/timeout):** *"For the first 12 hours, Google stops crawling the site but keeps trying to fetch the robots.txt file. If Google can't fetch a new version, for the next 30 days Google will use the last good version, while still trying to fetch a new version."* After 30 days the outcome is a **branch, not an unconditional allow**: *"If the site is generally available to Google, Google will behave as if there is no robots.txt file. If the site has general availability problems, Google will stop crawling the site."* This is **RFC-compliant**, not a divergence — it is precisely the §2.3.1.4 MAY. Three details that matter for implementation:
  - The 12h/30d ladder presupposes a **previously-fetched good copy** — Google's wording is *"If Google finds a robots.txt file but can't fetch it."* A site that has **never** served a parseable robots.txt has no "last good version", so the 30-day cached phase does not apply at all.
  - **429 is not merely an exception to the 4xx rule** — it is handled on the *5xx path* (server-error semantics: stop crawling, retry). DNS failures, network errors and timeouts are likewise *"treated as a server error"*, and 503 specifically *"results in fairly frequent retrying."* Key your 5xx state machine on `{5xx, 429, DNS/network/timeout}`, **not** on the 500–599 range alone.
  - Implementing only the permissive post-30-day branch is exactly the failure mode that hammers an already-failing site. Implement the availability branch.
- Trailing wildcards are ignored: `/fish*` ≡ `/fish`.
- Redirects: *"Google follows at least five redirect hops as defined by RFC 1945 and then stops and treats it as a 404"* — i.e. it falls through to the **permissive 4xx rule**, not to disallow. Google *"doesn't follow logical redirects (frames, JavaScript, or meta refresh-type redirects)."*

**Implementation decision for us:** implement **RFC 9309 matching semantics** (most-octets wins, allow wins ties). Then note the key point: **both modes below are simultaneously RFC 9309 compliant** — the RFC's MAY clauses are wide enough to cover both. The difference is a *risk posture*, not a standards question. Simulation mode exercises the §2.3.1.4 MAY (30-day cache, then the availability branch); live-crawl mode simply declines to exercise it and stays in the conservative "MUST assume complete disallow" position, which is safer for a failing customer site and still conformant.

```
mode = 'simulate-googlebot' | 'polite-crawl'

server-error class = { 5xx, 429, DNS failure, network error, timeout }   // Google groups these

server-error robots.txt:
  polite-crawl      -> back off entirely for 12h; then disallow all until robots.txt is
                       fetchable again (never exercise the 30-day MAY; conservative but
                       fully RFC 9309 compliant)
  simulate-googlebot-> mirror Google exactly: 12h pause, then last-good cached copy for 30d
                       (only if a last-good copy exists), then BRANCH:
                         site generally available   -> behave as if no robots.txt
                         site availability problems -> stop crawling the site
4xx robots.txt (except 429):
  both              -> allow all (matches RFC §2.3.1.3 and Google)
robots.txt redirects:
  both              -> follow up to 5 hops, then treat as 404 -> allow all
```

**Do not document this as "Google violates the RFC".** It doesn't.

### 3.2 Library situation in 2026 — this is a build, not a buy

| Package | Version | Last publish | Verdict |
|---|---|---|---|
| `robots-parser` (samclarke) | 3.0.1 | **2023-02-21** | Most-used, but ~3.5 years without a release. **Flag as stale.** Fine to fork/vendor (MIT, ~500 LOC) — do not take an unmaintained runtime dep for a security-adjacent parser |
| `robotstxt-util` (muratgozel) | — | 2025-ish | RFC 9309 builder+parser, zero deps, fully typed. Smaller community; audit before use |
| `robots-txt-parser` | — | older | wildcards + caching + promises, but weaker precedence handling |
| Google `robotstxt` (C++, Apache-2.0) | — | reference impl | **Best fidelity option: compile to WASM.** This is what "we match Googlebot exactly" actually means |

**Recommendation:** vendor a TS implementation (fork `robots-parser`, keep the tests) as the default path, and offer an optional **WASM build of Google's C++ `robotstxt`** as `seoe extras install robots-wasm` for users who need byte-exact Googlebot parity. Ship a corpus of ~200 real-world robots.txt files as golden tests.

### 3.3 Matching algorithm (implementable pseudocode)

```ts
function isAllowed(path: string, ua: string, groups: Group[]): boolean {
  // 1. Group selection (Google style: single most-specific match)
  const uaLower = ua.toLowerCase();
  const matching = groups.filter(g =>
    g.agents.some(a => a === '*' || uaLower.includes(a.toLowerCase())));
  const specific = matching.filter(g => !g.agents.includes('*'));
  const chosen = specific.length
    ? specific.sort((a,b) => longestAgent(b) - longestAgent(a))[0]
    : matching.find(g => g.agents.includes('*'));
  if (!chosen) return true;

  // 2. Rule matching: most octets wins; tie -> allow
  let best: { len: number; allow: boolean } | null = null;
  for (const rule of chosen.rules) {           // rule = { pattern, allow }
    if (!patternMatches(rule.pattern, path)) continue;
    const len = effectiveLength(rule.pattern); // exclude trailing '*'; '$' counts 0
    if (!best || len > best.len || (len === best.len && rule.allow)) {
      best = { len, allow: rule.allow };
    }
  }
  return best ? best.allow : true;
}
```

`patternMatches` must: percent-decode consistently on both sides *except* for `/`, `?`, `#`; treat `*` as `.*`; treat a trailing `$` as end-anchor; and **not** anchor the end otherwise. Empty `Disallow:` = allow everything. `Disallow: /` = disallow everything.

### 3.4 Directives beyond allow/disallow

- `Sitemap:` — **absolute URL, not group-scoped.** Collect all of them; they are your primary seed source.
- `Crawl-delay:` — **Google ignores it** (Google's public repo lists crawl-delay among unsupported tags). **Bing and Yandex honour it.** We should honour it in `polite-crawl` mode: it's our host, we want to not get banned. Cap at 30 s and warn the user if their robots.txt sets an absurd value (a `Crawl-delay: 120` on a 50k-page site is itself an SEO finding — it makes full recrawl take ~70 days).
- `Host:`, `Clean-param:` — Yandex-only; parse and report, don't act.
- `noindex:` in robots.txt — unsupported since 2019; if we see it, emit a **finding** ("you have `Noindex:` in robots.txt; it does nothing").

### 3.5 robots meta / X-Robots-Tag (separate subsystem — don't conflate)

Parse from three places, and record which won:
1. `X-Robots-Tag` response header (may appear multiple times, may be UA-scoped: `X-Robots-Tag: googlebot: noindex`)
2. `<meta name="robots">` / `<meta name="googlebot">` in `<head>`
3. Only in the **rendered** DOM if JS injected it (a real and nasty failure mode)

Rule: the **most restrictive** directive wins across sources. Track `noindex`, `nofollow`, `none`, `noarchive`, `nosnippet`, `max-snippet:N`, `max-image-preview:[none|standard|large]`, `max-video-preview:N`, `notranslate`, `noimageindex`, `unavailable_after:<date>`, `indexifembedded`.

---

## 4. Sitemap ingestion

### 4.1 Hard limits (sitemaps.org protocol + Google, both verified 2026-08-31)

- **≤ 50,000 URLs** per sitemap file.
- **≤ 50 MB uncompressed** (`52,428,800` bytes). Google's doc states the same "50MB (uncompressed)".
- Sitemap **index** files: same limits — max 50,000 sitemaps listed, 50 MB.
- `<loc>` must be **< 2,048 characters**.
- **UTF-8 required**; entity-escape `&` `<` `>` `"` `'`.
- **Path scoping:** a sitemap at `https://example.com/catalog/sitemap.xml` may only list URLs under `https://example.com/catalog/`. Same protocol + same host, unless cross-host ownership is proven via robots.txt.
- Gzip is allowed (`.xml.gz`); the **50 MB limit applies to the uncompressed size**.

### 4.2 What Google actually uses

- `<lastmod>`: used *"if it's consistently and verifiably accurate"*. W3C Datetime; `YYYY-MM-DD` acceptable.
- `<changefreq>` and `<priority>`: **"Google ignores `<priority>` and `<changefreq>` values."** → Emit a finding when a CMS pumps out `priority=1.0` on every URL (harmless but a signal of an unmanaged sitemap), and **never** use them for our own scheduling either; use `lastmod` + our own observed change rate.
- Supported formats: **XML**, **RSS 2.0 / Atom 1.0**, and **plain text** (one URL per line). Support all three — WordPress/Shopify/Ghost emit different things.
- Extensions to parse: `image:image`, `video:video`, `news:news`, and **`xhtml:link rel="alternate" hreflang=`** (hreflang-in-sitemap is very common and is a rich source of findings).

### 4.3 Parsing strategy

**Stream, never DOM-parse.** A 50 MB sitemap through `linkedom`/`parse5` will cost hundreds of MB. Use `saxes` (or `sax`) in streaming mode:

```
GET sitemap URL (accept-encoding: gzip)
  -> if content-type is gzip OR path ends .gz OR magic bytes 1f 8b -> gunzip stream
  -> saxes parser
  -> on <sitemapindex> root: enqueue child <loc> as sitemaps (depth-limited)
  -> on <urlset> root: batch-insert URLs into frontier in chunks of 1,000 inside one SQLite transaction
```

Guards to implement:
- **Depth limit 3** on sitemap-index nesting (spec says index files can't point at index files, but the real world does it).
- **Cycle detection** by URL set — self-referencing indexes exist.
- **Byte ceiling of 60 MB** decoded per file; abort and emit a finding "sitemap exceeds the 50 MB limit".
- **URL count ceiling of 50,001**; if exceeded, emit finding "sitemap has N URLs, over the 50,000 limit — Google may ignore it".
- Reject `<loc>` values whose host/scheme doesn't match the sitemap's own (finding: cross-host sitemap entry).
- Tolerate BOM, wrong `Content-Type` (`text/html` for XML is extremely common), missing XML declaration, and unescaped `&`.

`sitemapper` 4.1.6 (published 2026-05-10) is a reasonable reference but buffers; write our own for the streaming + findings requirements.

### 4.4 Discovery order for seeds

1. `robots.txt` `Sitemap:` lines (may be several, may be on another host).
2. Google Search Console `sitemaps.list` for the property (authoritative — tells you what Google *knows about*, plus its error counts).
3. Conventional guesses: `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap-index.xml`, `/wp-sitemap.xml` (WP 5.5+ core), `/sitemap.xml.gz`, `/sitemaps.xml`, `/page-sitemap.xml`.
4. `<link rel="sitemap">` in the homepage head (rare).

**Cross-check as a first-class analysis:** `sitemap_urls ⊖ crawled_urls` gives you the four canonical buckets — *orphaned in sitemap* (in sitemap, not linked internally), *missing from sitemap* (linked, indexable, absent from sitemap), *sitemap contains non-200*, *sitemap contains non-canonical/noindex URLs*. These four are among the highest-value automated findings the whole product can produce.

---

## 5. URL normalization & canonicalization

Two *different* things; keep them in separate modules.

### 5.1 Normalization (identity — "are these the same fetchable resource?")

Apply **RFC 3986 syntax-based normalization** only. Everything beyond that is a heuristic that must be per-site configurable, because it can destroy real URLs.

**Safe (always apply):**
1. Lowercase scheme and host. **Never lowercase the path** (case-sensitive on most Linux origins).
2. Remove default port (`:80` for http, `:443` for https).
3. Percent-encoding normalization: uppercase hex digits (`%2f` → `%2F`); decode unreserved characters (`A-Za-z0-9-._~`).
4. Remove dot segments (`/a/./b/../c` → `/a/c`).
5. Empty path → `/`.
6. **Strip the fragment** (`#...`) — but keep `#!` hashbang URLs flagged as a legacy-AJAX finding.
7. IDN → punycode (`toASCII`) for the host; keep the Unicode form for display.
8. Normalize `+` in query only for `application/x-www-form-urlencoded` semantics — safer to leave alone.

**Configurable (default ON, per-site overridable):**
- Strip known tracking params: `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `twclid`, `igshid`, `mc_cid`, `mc_eid`, `_ga`, `_gl`, `yclid`, `dclid`, `ref`, `ref_src`, `si` (YouTube), `srsltid` (Google Merchant — huge in 2025/26 and generates enormous duplicate-URL noise). Maintain this list as data, not code.
- Sort remaining query params alphabetically.
- Drop empty-valued params (`?a=&b=1` → `?b=1`).
- Trailing-slash policy: **detect** the site's own convention from 200-vs-301 behaviour on a sample, then normalize to it. Do not hardcode.

**Never do by default:** removing `?page=`, `?p=`, `?id=`, session ids, or "looks like a duplicate" params. That is what the *analysis* layer is for.

Store both `url_raw` and `url_normalized`; hash `url_normalized` (xxhash64 or SHA-256 truncated to 128 bits) as the frontier primary key.

### 5.2 Canonicalization (SEO — "which URL should rank?")

Independent signal collection, then a conflict report:

| Signal | Source | Notes |
|---|---|---|
| `<link rel="canonical">` | head (raw **and** rendered) | Multiple canonicals = finding. Canonical in `<body>` = ignored by Google = finding |
| `Link: <...>; rel="canonical"` | HTTP header | Header and HTML disagreeing = finding |
| Redirect target | 301/302 chain | 302 to canonical = finding |
| `hreflang` cluster | head / sitemap / header | Missing return links = finding |
| Sitemap membership | sitemap | Non-canonical in sitemap = finding |
| GSC `googleCanonical` vs `userCanonical` | URL Inspection API | **The ground truth.** Disagreement is the single highest-value canonical finding |

Note two GSC constraints, both binding:

1. **Quota.** URL Inspection is **600 QPM / 2,000 QPD per site** (plus a per-project ceiling of **15,000 QPM / 10,000,000 QPD**, which is irrelevant for one site but is the real limit for a multi-tenant hosted tier — one GCP project serving many client properties hits the project cap, not the site cap). On a 100k-URL site you can only inspect 2% of URLs per day.
2. **It cannot run a live test.** The `urlInspection.index.inspect` reference states verbatim: *"Presently only the status of the version in the Google index is available; you cannot test the indexability of a live URL."* The request body has exactly three fields — `inspectionUrl` (required), `siteUrl` (required), `languageCode` (optional) — with no live-inspection flag. (The "live page or the version in Google's index" phrasing on the `UrlInspectionResult` page describes the **UI tool**, not the API.) So `googleCanonical` reflects Google's **last crawl**, which lags your deployment by the recrawl interval (days to weeks).

Consequence: canonical ground-truthing must be *sampled and prioritized* (see §14) **and** treated as a **lagging regression monitor**, never as a pre-deploy check. A `googleCanonical` value may describe markup you have already replaced.

---

## 6. Deduplication & near-duplicate detection

### 6.1 Exact duplicates
Hash the **normalized main content text** (post-Readability), not raw HTML — raw HTML differs by CSRF tokens, timestamps, and cart counts. Use **xxhash3-64** (via `xxhash-wasm`, ~5 GB/s) or BLAKE3. Exact-hash collisions across different URLs = "duplicate content" finding.

### 6.2 Near-duplicates — use SimHash, not MinHash

Manku et al. (Google, WWW 2007, "Detecting Near-Duplicates for Web Crawling") is still the reference. Consensus in the literature and practice:
- **64-bit SimHash fingerprints with Hamming distance k = 3** is the standard web-scale operating point.
- SimHash is *"way faster than minhash, even on enormous corpuses, and typically requires less storage"*, at the cost of a narrow similarity range and harder tuning.
- MinHash gives you real Jaccard similarity (better if you want a *score*), SimHash gives you a cheap near-dupe *decision*.

For our scale (≤ 1M docs on a laptop), the pragmatic design:

```
features   = word 4-shingles of the extracted main text, lowercased, whitespace-collapsed
weight     = 1 per shingle (or tf, capped at 3)
hash       = xxhash64(shingle)
simhash    = sign-aggregate the 64 bit positions -> 64-bit fingerprint
storage    = INTEGER column (SQLite stores as int64)
lookup     = 4 permuted tables (Manku's technique): split 64 bits into 4x16-bit blocks,
             build 4 indexes each keyed on a different 16-bit prefix,
             probe each -> candidates share >= 16 bits -> verify popcount(a^b) <= 3
```

With 4 tables at 1M docs this is ~4 index probes returning tens of candidates each — sub-millisecond in SQLite. Below ~200k docs you can honestly just brute-force popcount over an in-memory `BigInt64Array`: 200k × 64-bit XOR+popcount ≈ **<10 ms** per query in plain JS.

**Also do structural dedup:** hash the sequence of tag names (`h1>p>p>ul>...`) to catch templated pages with different text but identical boilerplate — useful for detecting doorway/programmatic pages.

### 6.3 What to *do* with duplicates
Cluster → pick a cluster head by (has canonical pointing to it) > (in sitemap) > (most internal links) > (shortest URL) > (oldest lastmod). Emit: "N near-duplicate pages, recommend canonical → X" plus a ready-to-apply patch. This is one of the most executable actions in the whole product.

---

## 7. HTML parsing

### 7.1 The three engines and when each is correct

| Library | Version | Model | Relative speed | Use for |
|---|---|---|---|---|
| `htmlparser2` | 12.0.0 | SAX + light DOM, forgiving, **not** spec-compliant | **~2× parse5** (cheerio issue #1259: *"parse5 is about half the performance of htmlparser2"*) | Bulk crawl extraction: links, meta, headings, images |
| `parse5` | 8.0.1 | Full HTML5 tree construction (spec-exact) | 1× baseline | Anything where *"what would the browser build?"* matters: implied `<tbody>`, misnested tags, `<head>` boundary detection, foster parenting |
| `linkedom` | 0.18.13 | Real DOM API over parse5-ish tree; goals: *"avoid maximum callstack/recursion or crashes"*, *"guarantee linear performance from small to big documents"* | between the two | When a library needs a `Document`: **Readability**, `microdata`/RDFa extractors, DOM-diffing |
| `jsdom` | — | Full browser-ish env | **~1.7× slower than cheerio** on the same extraction (300.95 ms vs 517.16 ms in one published benchmark); uses ~3–5× the memory | Avoid in the crawl loop entirely |

**cheerio 1.2.0** (published 2026-01-23; 1.0.0 was 2024-08-09) can use *either* backend:

```ts
import * as cheerio from 'cheerio';
// FAST PATH — bulk crawl
const $ = cheerio.load(html, { xml: false }, false);       // 3rd arg false => htmlparser2
// SPEC PATH — head/meta boundary correctness, malformed pages
const $strict = cheerio.load(html);                        // parse5 (default)
```

**Ballpark throughput to design against** (typical 100–300 KB page, modern laptop CPU, single core — these are order-of-magnitude planning numbers, verify with your own bench before quoting them to users):

| Engine | Pages/sec/core | Peak RSS per 200 KB doc |
|---|---|---|
| htmlparser2 (SAX, no DOM) | ~800–2,000 | ~2–4 MB |
| cheerio + htmlparser2 | ~300–600 | ~5–10 MB |
| cheerio + parse5 | ~150–300 | ~8–15 MB |
| linkedom | ~150–300 | ~10–20 MB |
| jsdom | ~30–80 | ~30–60 MB |

At 500 pages/s/core parsing, a 100k-page site parses in ~3.5 min on one core — **parsing is never the bottleneck; the network and the DB are.** So optimize for correctness, and reserve htmlparser2 for the 1M-URL tier.

**Large-document guard:** cheerio degrades noticeably at 10–50 MB documents and hits significant memory pressure above 50 MB. Enforce a **10 MB HTML cap** at the HTTP layer (`maxResponseSize`) and emit a finding for anything over 2 MB ("your HTML document is 3.4 MB; Google truncates around several MB and it hurts LCP").

### 7.2 What to extract in one pass

Design a single `extractRaw(html, url)` returning a flat record — one parse, many outputs:

```
status, finalUrl, redirectChain[], contentType, charset, wireBytes, decodedBytes, ttfbMs, totalMs
title, titleLength, metaDescription, metaDescLength
h1[], h2[], h3[], headingOrderViolations[]
canonical{html, header}, robotsMeta{html, header}, viewport, lang, charsetDeclared
links[] { href, rawHref, absUrl, anchorText, rel[], target, isNofollow, isUgc, isSponsored,
          isInternal, inNav, inFooter, inMain, position, xpathish }
images[] { src, srcset, alt, width, height, loading, decoding, isLcpCandidate }
hreflang[] { lang, href, source: 'head'|'header'|'sitemap' }
jsonLd[], microdata[], rdfa[], openGraph{}, twitterCard{}
scripts[] { src, async, defer, type, inlineBytes }
stylesheets[] { href, media, inlineBytes }
wordCount, textToHtmlRatio, contentHash, simhash, structuralHash
issues[]  // synchronous, cheap checks emitted inline
```

Link *position* classification (nav/main/footer/sidebar) is worth real effort — Google reportedly weights main-content links more, and it's essential for the internal-linking engine (§13). Classify by nearest ancestor among `<nav> <header> <footer> <aside> <main> <article>`, falling back to `role=` attributes, then to `class`/`id` regex (`/(^|[-_])(nav|menu|footer|sidebar|breadcrumb)([-_]|$)/i`).

---

## 8. JavaScript rendering: Playwright, budgets, and the raw-vs-rendered diff

### 8.1 Playwright vs Puppeteer (2026)

`playwright` 1.62.1 (2026-08-31) vs `puppeteer` 25.9.0 (2026-08-25). Both are healthy. **Choose Playwright** for:
- `browserContext` isolation with cheap creation (*"creating a context takes milliseconds compared to launching a browser which takes seconds"*).
- First-class `route()`/`abortOnRequest` for resource blocking, and `request` interception that survives navigations.
- **Two Chromium builds**: the lightweight **chromium headless shell** (default when `channel` is unset) and the **new headless mode** (`channel: 'chromium'`), which is *"the real Chrome browser… more authentic, reliable, and offers more features."* Install with `npx playwright install --with-deps --only-shell chromium` to avoid downloading the full browser (important for a self-hosted install footprint).
- `--only-shell` / `--no-shell` install flags let us keep the install small.

Keep a Puppeteer adapter behind an interface if you care about Chrome-extension-based flows; otherwise don't.

### 8.2 Memory reality check — real, but **not** the binding constraint

> **Correction (fact-check, 2026-09-01).** An earlier draft asserted ~706 MB RSS per browser, ~250 MB per page, degradation after 1,000–1,500 pages, and concluded that full-site JS rendering is *"infeasible on a laptop."* Direct measurement refutes that. The 250 MB/page figure and the 1,000–1,500-page degradation figure are **not in the cited source at all**; the correct memory model is **fixed + marginal**, not `250 MB × pages`; and **memory is not the limiting factor — wall-clock time and CPU are.**

**What the frequently-cited datawookie (2025-06-06) numbers actually are.** The article reports *"peak memory consumption for standard is 1094 MB, while for the headless and minimal alternatives it drops to 706 MB and 690 MB"*:

| Browser | Standard | Headless | Minimal flags |
|---|---|---|---|
| Chromium | 1,094 MB | 706 MB | 690 MB |
| Firefox | 874 MB | 826 MB | 770 MB |
| WebKit | **590 MB** | **588 MB** | — |

Three caveats that invalidate the way these are usually quoted:

- **It is not "RSS of a browser."** The article sums RSS across the Python driver process *and every child Chromium process*. Chromium spawns 7–8 processes sharing hundreds of MB of mapped binary, so summing RSS double-counts heavily. Reproducing the method on Playwright 1.60.0 (Linux): **sum-of-RSS 567 MB vs true PSS 340 MB** — the metric inflates real incremental cost by ~1.7×. Budget in **PSS**, not sum-of-RSS.
- **It is a one-time browser-launch cost, not a per-page cost.** The article's script loads only `https://example.com` (~1 KB static) and idles 5 s.
- **It is channel-dependent and partly stale.** Since Playwright 1.49 `headless=True` defaults to the lighter `chromium-headless-shell`. Measured today: headless shell **569 MB sum-RSS / 341 MB PSS**; `channel: 'chromium'` (Chrome for Testing) **940 MB sum-RSS / 481 MB PSS**. A ~1.7× swing from a config flag — this is a decision, not a constant. **Note WebKit is ~40% cheaper than Chromium** and is worth evaluating.

**Measured cost model (Playwright 1.60.0, real sites — Wikipedia, Hacker News, python.org; PSS via `/proc/[pid]/smaps_rollup` across the full process tree):**

| Quantity | Sum-of-RSS | **PSS (use this)** |
|---|---|---|
| Browser launched, zero pages (headless shell) | 437 MB | **287 MB** |
| Same, `channel: 'chromium'` | 940 MB | **481 MB** |
| Marginal cost per **concurrently open** page (own context) | ~140 MB | **~45–55 MB** |
| Marginal retained cost per **sequential** page (open → goto → close) | — | **~1.5 MB** |
| 8 concurrent pages, total | — | **~700 MB** |

So the correct budget is **fixed ≈ 290–340 MB PSS per browser process tree, plus ≈ 50 MB PSS per concurrent page** (use ~480 MB fixed if you pin `channel: 'chromium'`). The old "~250 MB average per page" figure is **5× too high for concurrent pages and ~150× too high for sequential ones.**

**"Degradation after 1,000–1,500 pages" — do not design around this.** ⚠️ **unverified — must be confirmed during implementation.** It traces to `microsoft/playwright#29163`, a single user's bug report, **closed with no maintainer root-cause confirmation**, whose own numbers were ~800 MB *total* rather than runaway growth. A 40-page sequential run measured here showed growth **plateauing, not degrading**: +17 MB PSS at page 1, then flat at 326→327→328 MB across pages 5–15, ending at 349 MB after 40 pages (+62 MB total, decelerating). No leak signature. (`microsoft/playwright#38489`, opened 2025-12-09 against 1.57, reports "~20 GB per instance" with Chrome for Testing — an unverified outlier, not a general figure.) Treat pathological-page blowup as the real risk: a single heavy SPA can allocate far more than 50 MB.

**Design consequences:**
1. **One browser process, N contexts, 1 page per context.** Never one browser per page. (Unchanged — still correct.)
2. **Cap concurrent rendered pages from available RAM**, using the fixed+marginal model, not a flat per-page constant:
   `maxRenderPages = clamp(floor((availableMemMB - 400) / 60), 1, cpuCores)`
   On an 8 GB laptop with ~4 GB available this yields tens of pages, so **CPU cores, not RAM, is the binding cap** — clamp to cores. Full-site JS rendering is **memory-feasible on 8 GB**; it is *time*-infeasible, which is why §8.3 adaptive rendering still matters.
3. **Recycle the browser every N pages** (default **300**) and every 15 minutes. Justify this as **cheap insurance against pathological pages**, not as a measured necessity at 1,000–1,500 pages — no leak was reproducible.
4. **Close contexts explicitly** in a `finally`; a leaked context is ~30–80 MB forever.
5. Launch flags: `--disable-dev-shm-usage` (essential in Docker — /dev/shm defaults to 64 MB), `--disable-gpu`, `--no-sandbox` only when the environment requires it (document the security tradeoff), `--js-flags=--max-old-space-size=512` so a runaway renderer dies instead of the host, `--disable-background-networking`, `--disable-extensions`, `--mute-audio`, `--blink-settings=imagesEnabled=false` when not doing visual checks.
6. **Block by resource type** via `route()`: abort `image`, `media`, `font`, and third-party `stylesheet` unless the run needs layout/CWV. Reported savings: **40–60% memory** and large latency wins. Keep CSS when you need CLS/LCP or above-the-fold analysis.
7. Set `deviceScaleFactor: 1`, viewport `360×640` (mobile-first, matches Google's mobile-first indexing) or `1350×940` desktop; `isMobile: true` reduces rendered content volume.

### 8.3 Deciding *per URL* whether to render — the core cost lever

Rendering is ~20–60× more expensive than an HTTP fetch **in wall-clock and CPU** (≈1.5–4 s and a full CPU core vs ≈150–400 ms and almost none). The **memory** premium is far smaller than the earlier draft claimed — ~50 MB PSS per concurrent page on top of a ~300 MB fixed browser cost, not ~300 MB per page (§8.2). At 100k URLs, rendering everything is 40+ hours: **the reason adaptive rendering matters is time and CPU, not RAM.** Do not justify it on a 250 MB/page constant — that number is wrong and a reviewer will catch it. **Adaptive rendering is still the single most important architectural decision in this subsystem**, and rendering can safely be defaulted **on** at sane concurrency without OOMing an 8 GB user.

Prior art: Crawlee's `AdaptivePlaywrightCrawler` uses a `RenderingTypePredictor` (default `DefaultRenderingTypePredictor`) that *"predicts which crawling method should be used and learns from already crawled pages"*, sampling via **`renderingTypeDetectionRatio`, default `0.1`** — i.e. ~10% of requests are checked both ways to keep the predictor calibrated. Adopt this pattern; don't invent one.

**Our algorithm:**

```
Phase A — site fingerprint (first 50 URLs, always dual-fetch raw + rendered):
  compute per-URL jsDependencyScore (see 8.4)
  cluster URLs by "template key" = (path depth, path segment pattern, body class list hash,
                                    presence of a <main> id, count of <script src> hosts)
  per template: renderPolicy = ALWAYS | NEVER | SAMPLE
    ALWAYS if median jsDependencyScore > 0.35
    NEVER  if p95 jsDependencyScore < 0.05
    SAMPLE otherwise (dual-fetch 10% forever, per Crawlee's ratio)

Phase B — steady state:
  render only ALWAYS + the 10% samples + explicit user overrides
  re-evaluate a template's policy if 3 consecutive samples disagree with the policy

Always-render overrides (regardless of score):
  - the homepage and the top 20 URLs by GSC clicks (highest business value)
  - any URL whose raw HTML contains a known SPA root and nothing else
    (#root, #app, #__next with empty children, <app-root>, data-reactroot, ng-version)
  - any URL where raw HTML has < 200 words but the page is in the sitemap
  - any URL where <noscript> contains a "please enable JavaScript" string
Never-render:
  - non-HTML content types, PDFs, and anything > 5 MB raw
```

### 8.4 The raw-vs-rendered diff (a product feature, not just a heuristic)

Fetch both, then compute a structured delta. This produces some of the best findings the tool can generate, because "Google may not see this" is exactly what SEOs pay for.

```ts
interface RenderDiff {
  wordCountRaw: number; wordCountRendered: number;
  wordDeltaRatio: number;        // (rendered - raw) / max(rendered, 1)
  linksRaw: number; linksRendered: number;
  linksOnlyInRendered: string[]; // <-- CRITICAL: links Google finds only after render
  linksOnlyInRaw: string[];      // removed by JS (rare, usually a bug)
  titleChanged: boolean; titleRaw: string; titleRendered: string;
  metaDescChanged: boolean;
  canonicalChanged: boolean;     // <-- HIGH SEVERITY
  robotsMetaChanged: boolean;    // <-- CRITICAL if raw=index, rendered=noindex or vice versa
  hreflangChanged: boolean;
  jsonLdOnlyInRendered: object[];// schema injected by GTM/JS
  h1Changed: boolean;
  mainContentSimilarity: number; // cosine over extracted text, 0..1
  jsDependencyScore: number;     // 0..1 composite, see below
  blockedResources: string[];    // resources robots.txt-disallowed at render time
}

jsDependencyScore =
    0.40 * clamp(wordDeltaRatio, 0, 1)
  + 0.25 * clamp((linksRendered - linksRaw) / max(linksRendered, 1), 0, 1)
  + 0.15 * (1 - mainContentSimilarity)
  + 0.10 * (titleChanged || metaDescChanged ? 1 : 0)
  + 0.10 * (jsonLdOnlyInRendered.length > 0 ? 1 : 0)
```

Severity mapping for findings:
- `robotsMetaChanged` where rendered adds `noindex` → **P0** ("JS is deindexing this page").
- `canonicalChanged` → **P0**.
- `linksOnlyInRendered.length / linksRendered > 0.5` → **P1** ("half your internal links require JS; Google renders on a deferred queue").
- `wordDeltaRatio > 0.8` → **P1** ("~all your content is client-rendered").
- `blockedResources` containing JS/CSS → **P1**, and quote Google verbatim: *"Google Search won't render JavaScript from blocked files or on blocked pages."*

Google's own documented pipeline is the justification: crawl → **render (queued)** → index; all 200-status pages are *"queued for rendering… the page may stay on this queue for a few seconds, but it can take longer than that"*, executed by *"an evergreen version of Chromium."*

### 8.5 Rendering budget

Expose as first-class config, enforced by a token bucket:

```yaml
render:
  enabled: true
  maxPagesPerRun: 500          # laptop default
  maxConcurrent: auto          # min(cpuCores, floor((availMB - 400)/60)) — CPU-bound in practice, see 8.2
  channel: headless-shell      # 'headless-shell' (~290 MB PSS) | 'chromium' (~480 MB PSS) | 'webkit' (cheapest)
  timeoutMs: 20000
  waitUntil: networkidle       # fall back to domcontentloaded + 1500ms settle on timeout
  recycleBrowserEvery: 300
  blockResourceTypes: [image, media, font]
  detectionRatio: 0.1
```

Show the user the tradeoff in the dashboard as a live estimate: *"Rendering 500 of 12,400 pages ≈ 18 min, ~0.7 GB peak RAM (8 concurrent). Rendering all ≈ 7 h 40 m."* Note the honest framing: the cost the user is spending is **time**, not memory. This is a differentiator versus tools that silently either render everything (slow) or nothing (wrong).

---

## 9. Crawl frontier & politeness

### 9.1 Frontier data structure

Do **not** hold the frontier in memory at 1M scale. Keep it in SQLite with an in-memory *ready set* per host.

```sql
CREATE TABLE frontier (
  url_hash     BLOB PRIMARY KEY,      -- 16 bytes, xxhash128(url_normalized)
  url          TEXT NOT NULL,
  host_id      INTEGER NOT NULL,
  depth        INTEGER NOT NULL,
  priority     REAL NOT NULL,         -- higher = sooner
  discovered_from BLOB,               -- url_hash of referrer
  discovery    TEXT,                  -- 'sitemap'|'link'|'gsc'|'seed'|'log'|'ga4'
  state        INTEGER NOT NULL,      -- 0 queued, 1 in-flight, 2 done, 3 failed, 4 skipped
  attempts     INTEGER DEFAULT 0,
  scheduled_at INTEGER,               -- epoch ms; supports crawl-delay & retry backoff
  etag         TEXT,
  last_modified TEXT,
  content_hash BLOB,
  last_crawled_at INTEGER
) STRICT;
CREATE INDEX ix_frontier_ready ON frontier(state, scheduled_at, priority DESC)
  WHERE state = 0;
CREATE INDEX ix_frontier_host  ON frontier(host_id, state);
```

Pop batches of 200–1,000 with a single `UPDATE ... RETURNING` (SQLite 3.35+) so claiming is atomic:

```sql
UPDATE frontier SET state = 1, attempts = attempts + 1
WHERE url_hash IN (
  SELECT url_hash FROM frontier
  WHERE state = 0 AND scheduled_at <= :now AND host_id = :host
  ORDER BY priority DESC, depth ASC LIMIT :n)
RETURNING url_hash, url, depth, etag, last_modified;
```

**Priority function** (tune, but start here):

```
priority = 3.0 * (in_sitemap ? 1 : 0)
         + 2.0 * log1p(gsc_clicks_28d)
         + 1.5 * log1p(internal_inlinks)
         + 1.0 * (depth <= 2 ? 1 : 0)
         + 1.0 * (has_recent_lastmod ? 1 : 0)
         - 0.5 * depth
         - 2.0 * (looks_faceted ? 1 : 0)      // many query params, known facet keys
```

BFS by depth is the sane default *shape*; priority reorders within it. Cap default `maxDepth` at 10 and `maxUrls` at 50,000 for the first run, with a visible "raise limit" control.

### 9.2 Politeness

- **Per-host concurrency default: 2.** Ramp to 4–8 only if p95 latency stays < 800 ms and the error rate is 0 over 200 requests. This is the "we are crawling our own customer's site, and they'd like it to stay up" default.
- **Crawl-delay:** honour it in `polite-crawl` mode (Bing/Yandex semantics); ignore it in `simulate-googlebot` mode because *Google ignores crawl-delay* and sets rate from server response. Cap honoured values at 30 s and surface a warning.
- **Global concurrency** across hosts: `min(64, cpus * 8)`.
- **Bandwidth cap** option (MB/s) for people on metered connections.
- Respect `Retry-After` absolutely.
- Add a **quiet-hours** schedule (self-hosted users often crawl their own production e-commerce site; let them pin crawls to 02:00–06:00 local).

### 9.3 Adaptive throttling (AIMD, per host)

```
state per host: { concurrency, delayMs, consecutiveErrors, ewmaLatency }

on success:
  ewmaLatency = 0.9*ewmaLatency + 0.1*latency
  consecutiveErrors = 0
  every 50 clean responses AND ewmaLatency < 800ms:
     concurrency = min(concurrency + 1, maxPerHost)          // additive increase

on 429 or 503:
  concurrency = max(1, floor(concurrency / 2))               // multiplicative decrease
  delayMs = max(delayMs * 2, retryAfterMs ?? 1000)
  consecutiveErrors++

on 5xx (not 503):
  consecutiveErrors++
  if consecutiveErrors >= 3: concurrency = max(1, floor(concurrency/2))

on latency spike (ewmaLatency > 3 * baselineLatency):
  concurrency = max(1, concurrency - 1)                      // gentle backpressure

circuit breaker:
  if consecutiveErrors >= 10: pause host for 5 min, then half-open with concurrency=1
  if a host trips the breaker 3 times in a run: abort the host, emit a finding
```

Also implement **hard stop conditions**: if > 30% of responses in a 100-request window are 5xx, stop the entire crawl and tell the user "we appear to be hurting your server; crawl aborted." An autonomous SEO agent that DDoSes its owner is a product-ending bug.

---

## 10. Incremental / differential crawling

### 10.1 Conditional requests

Store `etag` and `last_modified` per URL and replay them:

```
If-None-Match: <etag>            // preferred; strong or weak (W/"...")
If-Modified-Since: <last_modified>  // only if no etag
```

Handle `304 Not Modified`: no body, so **keep the previous parse**, update `last_crawled_at`, and count it as a "cheap check". On real sites this typically eliminates 40–80% of body transfer on recrawls of static-ish sections. Google's crawl-budget doc explicitly recommends sites support **HTTP 304** caching, so a tool that *uses* it is also modelling Googlebot correctly.

Caveats to code around:
- Many CDNs return a **new ETag on every response** (weak ETags derived from timestamps). Detect: if ETag changes but `content_hash` doesn't, over 3 observations, stop sending `If-None-Match` for that host and rely on content hashing. Emit a finding — churning ETags waste Google's crawl budget too.
- Some servers 200 with an empty body on `If-Modified-Since`. Guard: if `304` semantics are violated (200 + `content-length: 0`), treat as failure, retry unconditionally.

### 10.2 Change detection tiers

Compute three hashes per crawl and store all three:

| Hash | Over | Detects |
|---|---|---|
| `raw_hash` | full decoded body bytes | any byte change (noisy: nonces, timestamps) |
| `content_hash` | Readability main text, whitespace-normalized, lowercased | real content edits |
| `seo_hash` | canonical JSON of {title, metaDesc, h1, robots, canonical, hreflang[], jsonLd[], internal links set} | SEO-relevant changes |

Alerting policy: `seo_hash` change → always create a change event and evaluate rules. `content_hash` change → recompute embeddings, re-run thin-content and readability checks. `raw_hash`-only change → ignore.

### 10.3 Recrawl scheduling (adaptive)

Per-URL interval based on observed change rate + business value:

```
changeRate = decayed count of content_hash changes / observations
baseInterval =
   changeRate > 0.5 -> 1 day
   changeRate > 0.2 -> 3 days
   changeRate > 0.05-> 7 days
   else             -> 30 days
interval = baseInterval / (1 + 0.5*log1p(gsc_clicks_28d))   // valuable pages checked more
clamp to [6 hours, 90 days]
```

Also force-recrawl on: sitemap `lastmod` newer than `last_crawled_at`; a GSC coverage-status change; a CMS webhook (if connected); any page whose *linked-from* page changed structurally.

### 10.4 The "crawl tick" (continuous operation)

Because we're a 24/7 agent, not a one-shot crawler:

```
every 5 min:  drain any due frontier items (respecting budgets)
hourly:       re-fetch robots.txt if cache > 24h; re-fetch sitemaps if lastmod/ETag changed
daily:        pull GSC Search Analytics (incl. searchAppearance for rich-result outcomes;
              1,200 QPM/site — cheap, use freely)
daily:        sampled URL Inspection batch (2,000/day/site cap; index-state only — cannot
              test live URLs, so treat results as lagging by the recrawl interval)
daily:        CrUX origin + top-N URL field data (150 QPM budget)
weekly:       full structural re-crawl of the site skeleton (nav/footer/hub pages)
on demand:    user-triggered full crawl
```

---

## 11. Storage & scaling to 100k–1M URLs on a laptop

### 11.1 The engine decision

| Engine | Node package | Verdict |
|---|---|---|
| **SQLite (better-sqlite3)** | `better-sqlite3` 13.0.3 (2026-08-05) | **Primary store.** Synchronous API is a *feature* for a crawler (no promise overhead in tight loops), supports `LOAD EXTENSION` (needed for sqlite-vec), has backup API, user-defined functions |
| **node:sqlite** | built-in, Node ≥ 22 | **Stability 1.2 (Release Candidate)** as of Node 24+. Zero install, no native compile, no postinstall. **Use as automatic fallback** when better-sqlite3's prebuilt binary is unavailable — this materially improves `npx` install success rate |
| **DuckDB** | `@duckdb/node-api` (Neo) — legacy `duckdb` package **deprecated after 1.4.x, not published for 1.5.x** | **Analytics only.** Columnar; far faster for `GROUP BY`/joins over crawl history and log files. Can query Parquet directly |
| **LMDB** | `lmdb` 3.5.6 (2026-06-18) | Excellent KV for the **page-body blob store** and the frontier's hot set. Memory-mapped, extremely fast reads, but no SQL. Optional |

**Recommendation: SQLite for everything transactional; keep DuckDB behind an optional `seoe extras install analytics` that attaches the SQLite file (`INSTALL sqlite; ATTACH 'seoe.db' (TYPE sqlite)`) or reads Parquet exports.** Two required native deps is one too many for a self-hosted tool.

### 11.2 SQLite configuration (copy this verbatim)

```sql
PRAGMA journal_mode = WAL;          -- concurrent readers during crawl writes
PRAGMA synchronous = NORMAL;        -- WAL + NORMAL is crash-safe enough; ~10x faster than FULL
PRAGMA cache_size = -262144;        -- 256 MB page cache (negative = KiB)
PRAGMA mmap_size = 1073741824;      -- 1 GB memory-mapped I/O
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = 10000;
PRAGMA foreign_keys = ON;
PRAGMA wal_autocheckpoint = 4000;   -- ~16 MB at 4 KiB pages; larger = fewer stalls
PRAGMA page_size = 8192;            -- set BEFORE first write; better for blobby rows
PRAGMA auto_vacuum = INCREMENTAL;
PRAGMA optimize;                    -- run on close and after big batches
```

**Batching rules that make or break throughput:**
- Wrap every N inserts in one transaction. Unbatched inserts ≈ **hundreds/sec**; batched in a transaction ≈ **50k–200k/sec** for small rows. Use `db.transaction()` (better-sqlite3) with batches of **1,000**.
- Use prepared statements once, reuse forever.
- Never `SELECT *` the body column in list queries; put bodies in a separate table or an external blob store.
- Checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`) at run end, not mid-crawl.
- Single writer. Run the crawl in one process; use `worker_threads` for CPU-bound parse/embed work and hand results back to the writer thread over `postMessage` (transferables for buffers).

### 11.3 Memory budget for 1M URLs

Never load the URL set into a JS `Map` — 1M entries with string keys ≈ 250–400 MB and V8 will thrash.

- **Seen-set:** use a **Bloom filter** in a `Uint8Array` for "definitely not seen", backed by SQLite for confirmation. 1M URLs at 1% FPR ≈ **1.2 MB** (9.6 bits/element, 7 hashes). At 0.1% ≈ 1.8 MB. This is the single biggest memory win.
- **In-flight set:** bounded, ≤ concurrency × hosts (thousands, not millions).
- **Per-host state:** ~200 bytes × hosts — trivial for single-site crawls.
- **Parse results:** stream to DB in batches; never accumulate.
- Target steady-state RSS for the crawl process (no rendering): **< 600 MB at 1M URLs**. With rendering, add `~300 MB` (fixed browser tree, PSS, headless shell) `+ maxRenderPages × ~50 MB` — e.g. 8 concurrent rendered pages adds ~700 MB, not ~2.4 GB.

Run the process with `--max-old-space-size=2048` by default and expose it in config.

### 11.4 Table layout (core)

```sql
-- one row per unique normalized URL, mutable "current state"
CREATE TABLE pages (
  url_hash BLOB PRIMARY KEY, url TEXT NOT NULL, host_id INTEGER,
  status INTEGER, final_url_hash BLOB, content_type TEXT,
  title TEXT, meta_description TEXT, h1 TEXT, canonical TEXT,
  robots_directives TEXT, lang TEXT, word_count INTEGER,
  wire_bytes INTEGER, decoded_bytes INTEGER, ttfb_ms INTEGER, total_ms INTEGER,
  depth INTEGER, in_sitemap INTEGER, indexable INTEGER,
  raw_hash BLOB, content_hash BLOB, seo_hash BLOB, simhash INTEGER,
  rendered INTEGER, js_dependency_score REAL,
  first_seen_at INTEGER, last_crawled_at INTEGER, last_changed_at INTEGER
) STRICT;

-- append-only history: one row per crawl of a URL, small
CREATE TABLE page_observations (
  id INTEGER PRIMARY KEY, url_hash BLOB, crawled_at INTEGER,
  status INTEGER, content_hash BLOB, seo_hash BLOB, total_ms INTEGER,
  changed_fields TEXT  -- JSON array
) STRICT;
CREATE INDEX ix_obs_url_time ON page_observations(url_hash, crawled_at DESC);

-- edges: the internal link graph. THE most valuable table in the product.
CREATE TABLE links (
  src_hash BLOB, dst_hash BLOB, anchor_text TEXT, rel TEXT,
  position TEXT,          -- nav|main|footer|aside|header
  ordinal INTEGER, is_internal INTEGER, discovered_at INTEGER,
  PRIMARY KEY (src_hash, dst_hash, ordinal)
) STRICT WITHOUT ROWID;
CREATE INDEX ix_links_dst ON links(dst_hash);

-- issues/findings, keyed so they can be deduped and closed
CREATE TABLE findings (
  id INTEGER PRIMARY KEY, fingerprint TEXT UNIQUE, rule_id TEXT, severity INTEGER,
  url_hash BLOB, data TEXT, opened_at INTEGER, closed_at INTEGER, status TEXT
) STRICT;
```

At 1M pages: `pages` ≈ 1M × ~700 B ≈ **700 MB**; `links` at ~80 links/page = 80M rows × ~90 B ≈ **7 GB**. That's too big for a laptop, so:
- **Cap stored links per page at 300** (record `links_truncated_count`).
- **Intern anchor text** into a dictionary table (huge win — anchor text repeats massively).
- **Intern URLs**: store `host_id` + `path_id` rather than full TEXT in `links`.
- With interning, `links` drops to ~28 B/row ≈ 2.2 GB at 80M edges. For the 100k-URL tier it's ~8M edges ≈ 220 MB — fine.

### 11.5 Storing page snapshots & diffs

Do **not** store full HTML for every page every crawl.

**Tiered snapshot policy:**
1. **Always store** the derived record (title/meta/links/hashes) — small.
2. **Store compressed raw HTML** only for: (a) the most recent crawl of each page, (b) any crawl where `seo_hash` changed, (c) the top 1,000 pages by GSC clicks. Compress with **Brotli quality 5** (good ratio, ~10× faster than q11) or **zstd level 3** on Node ≥ 22.15. Typical 120 KB HTML → **12–20 KB**.
3. **Content-addressed blob store**: `blobs(hash BLOB PRIMARY KEY, algo TEXT, bytes BLOB)`. Because templates repeat, dedup by hash saves 30–60% on real sites.
4. **Shared dictionary compression** is the big lever: train a **zstd dictionary** on 100 sample pages of the site, then compress each page with it. On templated HTML this commonly yields **3–5× better** ratios than standalone compression (120 KB → ~4 KB). Node's zstd bindings expose dictionary options; verify support on your target Node before relying on it. *(Flag: this specific ratio is an engineering expectation, not a cited benchmark — measure it.)*
5. **Diffs:** don't store HTML diffs. Store a **semantic diff** as JSON: `{field, before, after}` for the SEO fields, plus a text-level diff of the *extracted main content* using `diff-match-patch` or `fast-diff` (store the patch, not both versions). Main-text patches are typically < 2 KB.
6. **Retention:** default 90 days of observations, 10 snapshots per URL, configurable. Add `seoe db compact` that prunes and runs `VACUUM`.

Storage estimate for a 100k-page site, 90 days, weekly recrawl:
`pages` 70 MB + `page_observations` (100k × 13 × 60 B) 78 MB + `links` 220 MB + snapshots (100k × 15 KB × ~1.4 versions) ≈ 2.1 GB + embeddings (§13) ≈ 300 MB → **~2.8 GB**. Acceptable. Publish this number in the docs so users can plan.

---

## 12. Performance data: Lighthouse (lab) vs CrUX (field) vs PSI

### 12.1 Core Web Vitals — current thresholds (web.dev, accessed 2026-08-31)

| Metric | "Good" | Status |
|---|---|---|
| **LCP** | ≤ **2.5 s** | Stable |
| **INP** | ≤ **200 ms** | Stable |
| **CLS** | ≤ **0.1** | Stable |

All evaluated at the **75th percentile of page loads, segmented across mobile and desktop.** No new stable CWV metric as of 2026-08-31.

### 12.2 Lighthouse programmatic (lab)

`lighthouse` **13.4.1** (2026-07-20); v13.0.0 landed **2025-10-10**. **Breaking: minimum Node bumped to 22.19.** v13 removed several audits now covered by "performance insights": `preload-fonts`, `uses-rel-preload`, `font-size`, `offscreen-images`, `no-document-write`, `uses-passive-event-listeners`, `third-party-facades`, `first-meaningful-paint`; and removed artifacts `ResponseCompression`, `OptimizedImages`, `DOMStats`, `CacheContents`. **Do not hardcode audit IDs** — enumerate `lhr.audits` and map defensively, or your rules break on every Lighthouse major.

```ts
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
const options = { logLevel: 'info', output: 'json',
                  onlyCategories: ['performance'], port: chrome.port };
const runnerResult = await lighthouse('https://example.com', options);
// runnerResult.report -> string; runnerResult.lhr -> object
runnerResult.lhr.categories.performance.score * 100;
runnerResult.lhr.finalDisplayedUrl;
await chrome.kill();
```

Config with `{ extends: 'lighthouse:default', settings: { onlyAudits: [...] } }`.

**Scoring weights (Lighthouse 10+ desktop/mobile performance category):** TBT **30%**, LCP **25%**, CLS **25%**, FCP **10%**, Speed Index **10%**. *(Flag: this weighting is widely reported in 2026 secondary sources; verify against `lighthouse-core/config/default-config.js` for the exact version you ship, since v13 adjusted a11y weights.)*

**Operational notes:**
- Lighthouse runs ~15–40 s per URL and needs a dedicated Chrome instance. Budget it separately from the crawl.
- **Lab ≠ field.** Lighthouse cannot measure INP (it reports TBT as a proxy). Never tell a user "your INP is X" from Lighthouse.
- Run it on a **sample**: homepage + one representative URL per template cluster + top 20 by GSC clicks. Default **25 URLs/run**.
- Pin `--preset=desktop` and mobile runs separately; store both.
- Reuse the Playwright-launched Chrome? Possible via CDP port, but fragile. Cleaner: `chrome-launcher` with its own instance, serialized (concurrency 1) to keep results comparable.

### 12.3 CrUX API (field) — the quota is the constraint

- Endpoint: `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord`
- **API key required** (`?key=API_KEY`).
- **Quota: 150 queries per minute per Google Cloud project, free**, and per Google's docs *"it is not possible to pay for an increased quota."* **This is a hard architectural ceiling** — no money solves it. Design a token-bucket scheduler at 150 QPM shared across all sites in a hosted deployment.
- Request union: `origin` **or** `url`. `formFactor`: `DESKTOP | PHONE | TABLET`.
- Response: `record.key` (formFactor, origin/url), `record.metrics` (histogram + `percentiles.p75`), `urlNormalizationDetails`.
- **CrUX History API** exists separately (`records:queryHistoryRecord`) giving ~25 weekly data points; quota not stated on the main page — treat as also 150 QPM until verified.
- Coverage gap: CrUX only has data for **sufficiently popular** origins/URLs. Most SMB/local-business sites — our exact target market — will get **404 / no data at URL level**, and often at origin level too. **Plan for CrUX being empty and make Lighthouse + optional RUM the primary path.**

### 12.4 PageSpeed Insights API — the convenient middle

- Endpoint: `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`
- API key **optional** but *"recommended for frequent, automated queries."*
- Returns **both** the Lighthouse lab result **and** the CrUX field data in one call — attractive because it removes the need to ship Chrome.
- Quota commonly cited as **25,000 queries/day and ~400 queries per 100 seconds** with a key. *(Flag: I could not find this stated on Google's own PSI docs page; the numbers come from the Google Cloud console defaults and community sources. Verify in the Cloud console before depending on it.)*
- Trade-off vs local Lighthouse: PSI is a Google-hosted run from Google's network — great for consistency and zero local CPU, bad for private/staging sites, sites behind auth, and localhost. **Ship both**: PSI as default for public sites (fast, no Chrome download), local Lighthouse for private/staging and for users who want higher volume.

### 12.5 Own-RUM option (strongly recommended)
Because CrUX will be empty for most of our users, ship an optional ~2 KB `web-vitals`-based RUM snippet that posts LCP/INP/CLS to the self-hosted instance. This gives real field data for small sites where Google has none — a genuine competitive advantage over tools that can only read CrUX.

---

## 13. Structured data: extraction and validation

### 13.1 Extraction

Three syntaxes; extract all three and merge.

| Syntax | Approach | Library |
|---|---|---|
| **JSON-LD** | `document.querySelectorAll('script[type="application/ld+json"]')`, `JSON.parse` with a lenient pre-pass (strip HTML comments/CDATA wrappers, tolerate trailing commas), expand `@graph` | `jsonld` for framing/expansion if you need full JSON-LD 1.1 |
| **Microdata** | walk `[itemscope]` / `itemprop` / `itemtype` — needs a real DOM | `microdata-node` (audit maintenance) or write ~150 LOC over linkedom |
| **RDFa 1.1** | `vocab`/`typeof`/`property`/`resource` | `green-turtle` / `rdfa-streaming-parser`. Rare in the wild — implement last |

**Important:** run extraction on the **rendered** DOM when the page renders, and diff against raw — GTM-injected schema is extremely common and Google *does* see it (after the render queue), but it's fragile. Report it.

Normalize everything into an internal shape: `{ type, id, props, source: 'jsonld'|'microdata'|'rdfa', raw, rendered }` and resolve `@id` references across blocks.

### 13.2 Validation — there is no Rich Results Test API, and the one API that exists cannot test live pages

**Verified constraints (re-verified 2026-09-01):**

- **Google's Rich Results Test has no public API.** Still true. The official structured-data docs list only two **web-UI** tools — Rich Results Test (`search.google.com/test/rich-results`) and Schema Markup Validator (`validator.schema.org`) — and mention no API. The Search Console API v1 surface consists only of `sites`, `sitemaps`, `searchanalytics`, and `urlInspection`; there is **no** rich-results / structured-data / enhancement-report resource.
- **Correction — there was never an official SDTT *API* to deprecate.** An earlier draft said "Google deprecated the old Structured Data Testing Tool API." Google never published a documented public SDTT API. What existed was an **undocumented internal `validate` endpoint** that third parties reverse-engineered (e.g. the `padosoft/laravel-google-structured-data-testing-tool` package, which describes itself as using the *"undocumented API"*). What was deprecated was the **tool**: announced July 2020, relocated rather than killed after industry backlash (Dec 15, 2020 announcement), Google support ended ~**August 10, 2021**, functionality migrated to `validator.schema.org`.
  **Practical implication:** any "Rich Results Test API" you find in a library or an SEO vendor product is **scraping an unsanctioned endpoint** — subject to CAPTCHA, rate-limiting, silent breakage, and arguably ToS-violating. **Do not design on it.**
- **`validator.schema.org` (Schema Markup Validator)** — Google-operated for the schema.org community, extracts **JSON-LD 1.0, RDFa 1.1, Microdata**, can fetch by URL or validate pasted markup, and *"can extract structured data injected by JavaScript."* Its docs page **documents no public API, rate limits, or automated-use policy**. Critically, it validates **schema.org syntax compliance only and explicitly does NOT check Google rich-result eligibility** — so it is **not a substitute ground-truth source**. Treat scripted use as unsupported; do not build a product dependency on it.
- **Correction — there are *two* sanctioned programmatic sources, not one.** An earlier draft called URL Inspection "the only" one. They measure different things and have wildly different quotas:

| Source | What it tells you | Quota |
|---|---|---|
| **URL Inspection API** → `richResultsResult` (`RichResultsInspectionResult`): verdict enum `PASS` (Valid) / `FAIL` (Error) / `NEUTRAL` (Excluded) / `VERDICT_UNSPECIFIED`, plus `detectedItems[]` grouped by rich-result type with per-item issues. **The field is absent entirely if no rich results were found.** | **ELIGIBILITY**, as of Google's last crawl | **600 QPM / 2,000 QPD per site**; per-project 15,000 QPM / 10,000,000 QPD (the project cap is the binding one for a multi-tenant hosted tier) |
| **Search Analytics API** → `searchAppearance` dimension: which rich-result types the site actually earned impressions in. Per the query docs, *"You can filter by any dimension listed here, even if you are not grouping by that dimension"* — so filter by `searchAppearance` while grouping by `page` for per-URL rich-result appearance. | **ACTUAL SERP RENDERING** — arguably *stronger* ground truth than eligibility | **1,200 QPM per site / per user**; per-project 40,000 QPM / 30,000,000 QPD. **Not** subject to the 2,000/day cap. Bulk Data Export to BigQuery is a further unmetered path. |

- **⚠️ The most important constraint: the URL Inspection API cannot run a live test.** The `inspect` method reference states verbatim: *"Presently only the status of the version in the Google index is available; you cannot test the indexability of a live URL."* The request body has exactly three parameters — `inspectionUrl` (required), `siteUrl` (required), `languageCode` (optional) — with no live-inspection flag. (The "live page or the version in Google's index" phrasing on the `UrlInspectionResult` page describes the **UI tool**, not the API.) **It therefore cannot validate freshly generated or freshly deployed schema at all** — it replays Google's last-crawl state, so a `PASS` may reflect markup you already replaced, and the verdict lags deployment by the recrawl interval (days to weeks). The earlier framing that 2,000/day lets you "ground-truth 2% of a 100k-URL site daily" was optimistic: you can only ground-truth URLs Google has **already crawled**.

**Correct three-tier design:**

1. **Pre-deploy validation → local/offline.** A schema.org vocabulary validator plus Google's published per-feature required/recommended property tables. This is the only thing that can gate a write to the CMS. *(This is why building our own validator below is not optional.)*
2. **Outcome signal → Search Analytics `searchAppearance`.** Cheap, high-volume, reflects reality. Use this as the default monitoring loop.
3. **Regression monitor → URL Inspection on a prioritized sample.** Lagging, quota-scarce. Never a pre-deploy validator.

**⚠️ 2026 currency caveat — the supported-type list is shrinking, and API fields go silently null.** The Rich Results Test web tool still exists and is still Google's recommended eligibility checker, but: **June 2025** retired seven testable types (Book Actions, Course Info, Claim Review, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing); **FAQ rich results were dropped from Search on 2026-05-07**, removed from the Search Console rich-result report and the Rich Results Test in **June 2026**, and **FAQ data was removed from the Search Console API in August 2026 — i.e. already in effect as of today.** Treat the supported-type list as **versioned config that changes**, never a constant, and expect previously-populated API fields to become null without notice.

**Therefore: build our own validator.** This is a competitive moat, not a chore — and per (1) above it is the *only* thing that can validate markup before you write it.

```
Layer 1 — syntax:     valid JSON, valid @context (schema.org, https), parseable
Layer 2 — vocabulary: type exists in schema.org; every property is valid for that type
                      (including inherited properties via rdfs:subClassOf);
                      value ranges (Text/URL/Date/Number/nested type) match
Layer 3 — Google eligibility: per-feature required + recommended properties
                      (Article, BreadcrumbList, FAQPage, Product, Recipe, Review snippet,
                       LocalBusiness, Event, JobPosting, VideoObject, Organization, SoftwareApplication...)
Layer 4 — consistency: does the markup match the visible page? (price, name, rating,
                      breadcrumb labels). Google requires markup to represent visible content
Layer 5 — policy:     no fake reviews, no self-serving review markup, no spammy aggregateRating
```

For Layer 2, **vendor the schema.org vocabulary dump** (`https://schema.org/version/latest/schemaorg-current-https.jsonld`, CC BY-SA) at build time and generate a TypeScript type/property map. `schema-org-validate` (npm, a4csi) does exactly this — *"validates JSON-LD structured data against the official schema.org vocabulary with full support for type inheritance and property ranges"* — worth evaluating or copying the approach. **Flag: this is a small/young package; audit before adopting as a runtime dep.**

For Layer 3, Google's per-feature requirements are only available as prose in Search Central docs. Encode them as **data files** (one JSON per feature: `{required: [], recommended: [], types: []}`) and add a scheduled check that re-fetches the docs and diffs — Google changes these silently and often (HowTo and most FAQ eligibility cut in 2023; **seven types retired June 2025**; **FAQ dropped from Search 2026-05-07, from the Rich Results Test June 2026, and from the Search Console API August 2026**). Version the data files and record a `supportedFrom`/`retiredOn` per feature, so historical findings remain interpretable after a type disappears. Owning a *maintained, machine-readable* copy of Google's structured-data requirements is genuinely valuable IP for this product.

### 13.3 Generation (the "execute" half)
Since the product writes schema, also ship a generator with the same data files, plus a diff/patch mode that upgrades existing incomplete markup rather than replacing it. Always validate generated markup through Layers 1–4 before writing it to the CMS, and store a rollback.

---

## 14. Main-content extraction & readability

- **`@mozilla/readability` 0.6.0** — last published **2025-03-03**. *(Flag: 18 months without a release. Not abandoned — Firefox uses it — but pin the version and vendor a copy.)* Needs a DOM: pair with **linkedom** (not jsdom) for ~2–3× lower cost.
- **`cheer-reader`** — a port of Readability to cheerio. Avoids the DOM entirely; faster, but less battle-tested. Good option for the 1M-URL tier.
- **Python `trafilatura` 2.2.0** — best-in-class: F1 **0.924** vs readability-lxml **0.826** (benchmark run 2026-08-04, 990 docs). Offer as an optional sidecar.

**Also compute, in the same pass:**
- Word count of main content only (not nav/footer) — the correct denominator for "thin content".
- **Text-to-HTML ratio** (decoded text bytes / decoded HTML bytes) — a cheap, surprisingly good bloat signal.
- Readability scores: Flesch–Kincaid grade, Flesch Reading Ease, average sentence length, passive-voice ratio.
- Heading hierarchy validity (no skipped levels, exactly one H1).
- Boilerplate ratio = 1 − (main text length / full text length). A sudden jump across crawls means a template change.

**Fallback chain** when Readability returns < 100 words: (1) `<main>`; (2) `<article>`; (3) the densest text block by a `textLength / linkTextLength` density heuristic; (4) `<body>` minus `nav/header/footer/aside/script/style/noscript/form`.

---

## 15. Embeddings for internal linking

### 15.1 Local vs API

| Option | Cost | Quality | Notes |
|---|---|---|---|
| **Transformers.js v4** (`@huggingface/transformers` 4.2.0, 2026-04-22) + `all-MiniLM-L6-v2` (384-d) | **$0** | Adequate for English internal linking | ~90 MB model (q8). Runs in Node/Bun/Deno; v4 added a **C++-rewritten WebGPU runtime** usable from Node |
| **EmbeddingGemma-300M** (768-d, Matryoshka → 512/256/128) via Transformers.js/ONNX | **$0** | Best sub-500M multilingual on MTEB at release; **2,048-token context**; **< 200 MB RAM quantized**; Gemma terms | Strong default for multilingual sites |
| **OpenAI `text-embedding-3-small`** (1536-d, truncatable) | **$0.02 / 1M tokens** | Better than MiniLM, very good multilingual | 100k pages × ~600 tokens = 60M tokens = **$1.20** for a full site |
| **OpenAI `text-embedding-3-large`** (3072-d) | **$0.13 / 1M tokens** | Best of the three | Same site = **$7.80** |
| `text-embedding-ada-002` (legacy) | $0.10 / 1M | Worse than 3-small at 5× the price | Never use |

**Verdict:** default to **local (EmbeddingGemma-300M, 256-d Matryoshka truncation)** — zero cost, zero data egress, which matters enormously for a self-hosted privacy-positioned tool. Offer OpenAI as a one-checkbox upgrade and show the exact cost estimate before running ("12,400 pages ≈ 7.4M tokens ≈ **$0.15**"). At these prices the API is essentially free for the SMB tier, so the real argument for local is **privacy and no-API-key onboarding**, not cost.

Note dtype control: `dtype: 'q8'` or `'q4'` for CPU speed/memory, `'q4f16'` for WebGPU.

**Throughput planning (measure, don't quote):** expect roughly **30–120 chunks/sec/core** for MiniLM-L6 q8 on a modern laptop CPU, and **10–40/sec** for EmbeddingGemma-300M q8; WebGPU can be 3–10× faster. A 12k-page site at 3 chunks/page = 36k chunks ≈ **5–20 min** local, or ~1 min via API. Run embedding in `worker_threads` off the crawl path.

### 15.2 Chunking for internal linking
Don't embed whole pages. Embed:
1. **One "page vector"** = title + meta description + H1 + first 512 tokens of main content (this is the *topic*).
2. **Passage vectors** = each H2/H3 section, 200–400 tokens with 50-token overlap (these are the *link targets/anchors*).
Store both; page vectors drive "which pages are topically related", passage vectors drive "which exact sentence should carry the link."

### 15.3 Vector storage

| Store | Version | Verdict |
|---|---|---|
| **sqlite-vec** | **stable `0.1.9`, published 2026-03-31** (**not** 2026-05-18 — that date belongs to the newest *prerelease*, `0.1.10-alpha.4`, 2026-05-18). npm dist-tags: `{"latest":"0.1.9","alpha":"0.1.10-alpha.4"}`. Pre-1.0, but note `0.1.9` is flagged `prerelease=false` — it is a **stable point release**, so calling the shipping version "alpha" is imprecise; the alpha label belongs to the `0.1.10-alpha.*` line. Repo last pushed 2026-05-18, not archived, 8,061 stars | `vec0` virtual table. **ANN now exists — but only in the alpha channel.** Merged 2026-03-31 via PRs #276 (rescore index), #277 (experimental IVF), #278 (DiskANN); `v0.1.10-alpha.1` notes: *"Initial alpha release of sqlite-vec with new ANN indexes: rescore, ivf (experimental, not enabled), and DiskANN."* Source-diff confirms: `sqlite-vec.c` at `v0.1.9` has **0** case-insensitive `diskann` matches; at `v0.1.10-alpha.4` it has **141**, with a `Vec0IndexType` enum (`FLAT`/`RESCORE`/`IVF`/`DISKANN`). **The stable `0.1.9` you install by default is still pure brute-force flat scan.** IVF is explicitly *"experimental, not enabled."* No published docs yet (`site/features/ann.md` 404s; *"Proper docs/examples coming soon!"*). No stable release since 2026-03-31 (~5 months). Column caps verified **in source at both tags**, identical: `VEC0_MAX_VECTOR_COLUMNS 16`, `VEC0_MAX_PARTITION_COLUMNS 4`, `VEC0_MAX_AUXILIARY_COLUMNS 16`, `VEC0_MAX_METADATA_COLUMNS 16` (docs add a soft warning to avoid more than one partition key to prevent over-sharding; target ~100s of vectors per distinct partition value). Metadata TEXT filtering is *"slightly inefficient with long strings (> 12 characters)"* |
| **LanceDB** | `@lancedb/lancedb` **0.38.0** (2026-08-31) | Embedded, disk-native. `IVF_PQ`, `IVF_RQ`, `IVF_HNSW_FLAT/PQ/SQ`. Guidance: `num_partitions ≈ num_rows / 1,048,576`, `ef_construction` start at 150. **If you filter by metadata often, prefer IVF_RQ/IVF_PQ — HNSW-backed IVF has higher latency variance on filtered workloads** (exactly our case: "find related pages *in this section*, *indexable*, *not already linked*") |

**Also worth tracking: `vec1`, a first-party SQLite-team vector extension** (<https://sqlite.org/vec1>) — ANN via IVFADC with OPQ, portable C, no dependencies, AVX2/NEON SIMD. **Not yet released**; pre-1.0, with maintainers stating no further features are required for 1.0 but that testing is *"woefully inadequate"* and some x86 SIMD paths lack ARM/WASM equivalents. A plausible future one-file option to evaluate alongside LanceDB. ⚠️ **unverified for production — must be confirmed during implementation.**

**Recommendation:** ship **sqlite-vec** by default (one file, one database, trivial backup) and gate on scale. Brute-force over 256-d float32 vectors is ~1 KB/vector; 50k vectors = 50 MB and a full scan is **~10–30 ms** — completely fine. Add a hard switch: **above ~200,000 vectors, migrate to LanceDB** and tell the user. Use `int8` quantization in `vec0` (4× smaller, ~2–3% recall loss) to push the crossover higher.

**The ~200k crossover applies to `v0.1.9` flat scan and must be re-benchmarked against `v0.1.10-alpha.4` DiskANN before being baked in as a hard limit.** ⚠️ **unverified — must be confirmed during implementation.**

Critically: **the `VectorStore` abstraction is still the right call, but state the reason correctly.** The accurate framing is *"sqlite-vec's stable channel is brute-force only, and its ANN support exists solely in an undocumented alpha that has not seen a stable release in ~5 months"* — **not** *"sqlite-vec has no ANN and ANN is merely an open issue."* (Tracking issue asg017/sqlite-vec#25 *is* still open — created 2024-06-21, last updated 2026-06-13, 18 comments — but it is now an umbrella, not evidence that ANN is unimplemented; the PRs it tracks merged five months ago. Do not cite it as proof of absence.) Isolate sqlite-vec behind a `VectorStore` interface with `upsert/search/delete` so swapping to LanceDB, `vec1`, or plain brute force in a `Float32Array` is a one-file change.

### 15.4 The internal-linking algorithm (what the vectors are for)

```
for each candidate target page T (indexable, 200-status, canonical-self):
  1. retrieve top-K (K=50) source passages by cosine similarity to T's page vector
  2. filter: src != T; src indexable; edge (src -> T) not already in `links`;
             src not already linking to T's canonical; src outlink count < 150
  3. score = 0.45*cosine
           + 0.20*(1 - normalized_pagerank(T))     // boost under-linked targets
           + 0.15*log1p(gsc_impressions(src))      // link from pages Google already crawls
           + 0.10*same_section(src, T)
           + 0.10*(position == 'main' ? 1 : 0)
  4. LLM pass: given the passage + T's title/summary, propose anchor text + exact
     insertion point; reject if the anchor is not a natural fit
  5. guardrails: max 3 new internal links per source page per run;
     max 30 new inbound links per target; never link inside nav/footer;
     never create reciprocal-only pairs; anchor text diversity check (no >30%
     exact-match repetition to one target)
```

Compute **internal PageRank** over the `links` table (power iteration, damping 0.85, 20 iterations). At 100k nodes / 8M edges in a `Float64Array` this is ~2–5 s total. Recompute after each full crawl; it is the backbone of "which pages are orphaned / under-linked / wasting authority."

---

## 16. Log-file ingestion

Server logs are the only source of *actual* crawler behaviour (GSC's Crawl Stats report is aggregated and not exportable via API in useful detail).

### 16.1 Formats to support
- **Combined / Common Log Format** (Apache, nginx default) — regex parse.
- **nginx custom `log_format`** — accept a format string and compile it to a regex.
- **JSON lines** (modern nginx/Caddy/Traefik/Cloudflare Logpush).
- **Cloudflare Logpush** (JSON/NDJSON, gzipped), **AWS ALB** access logs (space-delimited, quoted), **CloudFront** (TSV with header), **Vercel/Netlify** log drains.
- Compressed: `.gz`, `.zst`, `.bz2`; rotated directories; multi-GB files.

**Parse as a stream** (`readline` over a gunzip stream), never `readFile`. Target ≥ **200k lines/sec/core** with a compiled regex; batch-insert into DuckDB/SQLite in 10k-row transactions.

### 16.2 Bot verification — do it properly

Never trust the `User-Agent` string. Google publishes machine-readable IP ranges at **`https://www.gstatic.com/static/crawling/ipranges/`**:

| File | Contains |
|---|---|
| `common-crawlers.json` | Googlebot and other robots.txt-respecting crawlers |
| `special-crawlers.json` | Special-case crawlers (e.g. AdsBot) that may not respect robots.txt |
| `user-triggered-fetchers.json` | User-initiated fetches (ignore robots.txt) |
| `user-triggered-fetchers-google.json` | Google-controlled user-triggered fetchers |
| `user-triggered-agents.json` | User-triggered agents |

Each is `{"creationTime": ..., "prefixes": [{"ipv4Prefix": "..."} | {"ipv6Prefix": "..."}]}`. Cache for 24 h; build a **binary-searchable sorted prefix array** (or a radix trie) for O(log n) lookup — at ~500 prefixes this is microseconds.

Fallback / cross-check: **reverse DNS then forward-confirm**. Google: *"Verify that the domain name is either `googlebot.com`, `google.com`, or `googleusercontent.com`"*, then confirm the forward lookup of that hostname returns the original IP. Do the same for Bing (`search.msn.com`) and apply IP-range files where vendors publish them (OpenAI publishes `gptbot.json`/`searchbot.json`, Anthropic publishes ClaudeBot ranges, Perplexity publishes ranges). Track **AI crawlers as a first-class category** — "is GPTBot/ClaudeBot/PerplexityBot crawling me, and what are they taking" is a 2025/26 question every site owner now asks, and answering it in a log report is a strong differentiator.

### 16.3 Analyses to derive
- Crawl frequency per URL / per directory / per template, by bot.
- **Crawl budget waste**: bot hits on non-200s, redirects, faceted/parameter URLs, noindex pages, `robots.txt`-disallowed URLs (yes, they still get hit), and pages not in the sitemap.
- **Orphan detection from logs**: URLs Googlebot fetches that our crawler never found via links or sitemap → these are the real orphans.
- Time-to-first-crawl for newly published URLs (a direct measure of whether our own actions worked).
- Bot response-time distribution vs human — slow bot responses directly reduce crawl capacity (Google: the crawl capacity limit *"factors in both the number of parallel connections and their duration"*).
- 404 sources: `Referer` header in logs gives you real broken-link sources including external ones.

Store logs in **DuckDB/Parquet**, not SQLite — this is the one genuinely columnar workload in the product. `SELECT date_trunc('day', ts), bot, status, count(*) FROM logs GROUP BY ALL` over 50M rows is sub-second in DuckDB and minutes in SQLite.

---

## 17. Recommended module structure

Monorepo, one package per bounded concern, so the crawler can be published standalone (good for OSS adoption and for contributors).

```
packages/
  core-types/            # zod schemas + TS types shared everywhere. No runtime deps.
    Url, PageRecord, Finding, CrawlConfig, RenderDiff, LinkEdge

  http/                  # everything socket-level. No SEO knowledge.
    dispatcher.ts        # undici Agent/Pool factory, per-host pools, H2 caps
    fetchPage.ts         # conditional GET, redirect chain capture, byte accounting
    decode.ts            # gzip/deflate/br/zstd, chained encodings, charset sniffing
    retry.ts             # backoff + Retry-After + jitter
    throttle.ts          # AIMD per-host controller + circuit breaker
    userAgent.ts

  robots/
    parse.ts             # RFC 9309 tokenizer -> groups
    match.ts             # most-octets precedence, wildcards, $ anchor
    policy.ts            # status-code policy (google vs rfc modes), 24h cache
    metaRobots.ts        # meta + X-Robots-Tag merge, most-restrictive wins
    __fixtures__/        # ~200 real robots.txt golden tests

  sitemap/
    discover.ts          # robots Sitemap:, GSC, conventional paths
    stream.ts            # saxes streaming, gzip, index recursion, limits + findings
    formats.ts           # xml / rss / atom / txt

  url/
    normalize.ts         # RFC 3986 + configurable tracking-param stripping
    classify.ts          # internal/external, template key, faceted detection
    canonical.ts         # signal collection + conflict detection

  parse/                 # pure functions: html -> PageRecord. No I/O.
    extract.ts           # single-pass cheerio(htmlparser2) extraction
    links.ts             # href resolution + position classification
    structuredData.ts    # jsonld / microdata / rdfa
    content.ts           # readability(linkedom) + readability metrics
    hashes.ts            # raw/content/seo hashes + simhash + structural hash

  render/
    browserPool.ts       # 1 browser, N contexts, recycling, RAM-derived caps
    renderPage.ts        # route() blocking, waitUntil strategy, timeouts
    predictor.ts         # per-template ALWAYS/NEVER/SAMPLE + 10% detection ratio
    diff.ts              # RenderDiff + jsDependencyScore

  frontier/
    queue.ts             # SQLite-backed, UPDATE...RETURNING claim, priority
    seen.ts              # bloom filter + DB confirmation
    scheduler.ts         # crawl-delay, quiet hours, budgets, recrawl intervals

  store/
    db.ts                # better-sqlite3 with node:sqlite fallback + PRAGMAs
    migrations/
    repositories/        # pages, links, observations, findings, blobs
    blobs.ts             # content-addressed, brotli/zstd + optional dictionary
    vectors.ts           # VectorStore interface: sqlite-vec | lancedb | memory
    analytics.ts         # optional DuckDB attach / Parquet export

  analyze/               # rules engine. Pure: (PageRecord[], SiteGraph) -> Finding[]
    rules/*.ts           # one file per rule, each with id, severity, fix generator
    graph.ts             # PageRank, orphan detection, depth, hub analysis
    duplicates.ts        # simhash clustering + canonical recommendation
    schemaValidate.ts    # the 5-layer validator + vendored schema.org vocab

  perf/
    lighthouse.ts        # chrome-launcher + programmatic API, sampling
    crux.ts              # 150 QPM token bucket, origin + url, history
    psi.ts               # PSI v5 alternative path
    rum.ts               # self-hosted web-vitals beacon endpoint

  logs/
    parse.ts             # CLF/nginx/JSON/ALB/CloudFront streaming parsers
    verifyBot.ts         # gstatic ipranges + rDNS forward-confirm
    analyze.ts           # crawl budget waste, orphans, AI-bot report

  embed/
    provider.ts          # local(transformers.js) | openai | none
    chunk.ts             # page vector + passage vectors
    internalLinks.ts     # candidate generation + scoring + guardrails

apps/
  cli/                   # `seoe init | crawl | serve | doctor | db compact`
  dashboard/             # local web UI
  daemon/                # the 24/7 scheduler
```

**Hard rules that keep this maintainable:**
1. `parse/` and `analyze/` are **pure** — no network, no DB. This makes 90% of the product testable from HTML fixtures and makes rules contributable by non-experts (huge for OSS).
2. Every rule is a file exporting `{ id, severity, appliesTo, evaluate(), generateFix() }`. The fix generator is what makes this an *executor*, not another auditor.
3. `render/` is optional at runtime — the tool must work with zero browsers installed, degrading to raw-HTML analysis with a clear banner.
4. All external quota consumers (`crux`, `psi`, `gsc`, `openai`) go through a shared `RateLimiter` with persisted token buckets so restarts don't blow quotas.
5. Ship a **golden-site fixture** (a 200-page static site with 40 deliberately planted SEO defects) and assert the rule engine finds exactly those. This is the regression suite.

---

## 18. Capacity plan (what to promise users)

Assumptions: modern 8-core laptop, 16 GB RAM, 100 Mbps, target site responds in 300 ms with 120 KB gzipped HTML, per-host concurrency 4.

| Site size | Fetch+parse (no render) | With 10% render | Peak RSS | Disk (90d) |
|---|---|---|---|---|
| 1,000 URLs | ~1.5 min | ~5 min | ~350 MB | ~40 MB |
| 10,000 URLs | ~14 min | ~50 min | ~450 MB | ~350 MB |
| 100,000 URLs | ~2.3 h | ~9 h | ~700 MB | ~2.8 GB |
| 1,000,000 URLs | ~23 h (needs higher concurrency + owner consent) | not advisable | ~1.5 GB | ~25 GB |

Bottleneck is **network round-trips**, not CPU: at 4 concurrent × 300 ms = ~13 URL/s/host. Raising per-host concurrency to 8 halves the time but doubles server load — make it an explicit, informed user choice with a "this is your own site, you own the risk" confirmation. For the 1M tier, recommend log-file + GSC-driven *sampling* rather than exhaustive crawling.

*(These are engineering estimates derived from the component numbers above, not measured benchmarks. Measure before publishing them in marketing.)*

---

## 19. Risk register & staleness flags

| Item | Risk | Mitigation |
|---|---|---|
| `sqlite-vec` stable is **0.1.9 (2026-03-31), pre-1.0, brute-force only**; ANN (rescore/IVF/DiskANN) exists **only** in the undocumented `0.1.10-alpha.*` line, no stable release in ~5 months | API break, or a perf wall at scale on the stable channel | `VectorStore` interface; LanceDB fallback; cap at 200k vectors on stable; **re-benchmark the cap against `0.1.10-alpha.4` DiskANN** before hardcoding it. Track `sqlite.org/vec1` as a future first-party option |
| `robots-parser` last published **2023-02-21** | Unmaintained security-adjacent parser | Vendor/fork; golden tests; optional Google WASM parser |
| `@mozilla/readability` last published **2025-03-03** | Slow maintenance | Pin + vendor; optional trafilatura sidecar |
| **CrUX 150 QPM is not purchasable** | Hard ceiling in the hosted tier | Shared token bucket; cache 24 h; own RUM beacon |
| **No Rich Results Test API** (and there never was a sanctioned SDTT API — only an undocumented endpoint) | Can't get Google's eligibility verdict programmatically; any library claiming a "Rich Results Test API" is scraping an unsanctioned endpoint | Build own validator as the **pre-deploy** gate; use Search Analytics `searchAppearance` as the cheap outcome signal; use GSC URL Inspection only as a lagging regression monitor on sampled URLs |
| **URL Inspection API cannot run a live test** — *"you cannot test the indexability of a live URL"* | Verdicts lag deployment by the recrawl interval; a `PASS` may describe markup you already replaced. Cannot validate freshly deployed schema **at all** | Never use it as a pre-deploy validator. Local/offline validator for pre-deploy; treat API verdicts as time-stamped last-crawl state and display the lag to the user |
| **GSC URL Inspection 2,000 QPD/site** (+ per-project 15,000 QPM / 10M QPD) | Only 2% of a 100k site per day; the **project** cap is the real limit for a multi-tenant hosted tier | Prioritized sampling by GSC clicks + change events; prefer Search Analytics (1,200 QPM/site, 40k QPM/project) or BigQuery Bulk Export for volume |
| **Google's rich-result type list is shrinking** — 7 types retired June 2025; FAQ dropped from Search 2026-05-07, from RRT June 2026, from the **Search Console API August 2026** | Previously-populated API fields go silently null; hardcoded type lists rot | Versioned config with `supportedFrom`/`retiredOn` per feature; scheduled docs diff; tolerate null/absent `richResultsResult` |
| Lighthouse majors remove audit IDs (v13 removed 7) | Rules silently break | Never hardcode audit IDs; snapshot-test against a pinned Lighthouse |
| Chrome memory: **~290–340 MB PSS fixed per browser tree + ~50 MB PSS per concurrent page** (~480 MB fixed if `channel: 'chromium'`) | Low. Previously overstated as ~250 MB/page — memory is **not** the binding constraint; wall-clock time and CPU are. Real risk is a pathological SPA, not steady-state growth | Fixed+marginal concurrency formula clamped to CPU cores; browser recycling every 300 pages as cheap insurance; prefer `chromium-headless-shell` over `channel:'chromium'`; **rendering can default ON at sane concurrency on 8 GB** |
| **Claiming "Google's robots.txt handling violates RFC 9309"** | Reputational/review risk — the claim is false. RFC 9309 §2.3.1.4 explicitly permits the 30-day cached-copy and fall-back-to-unavailable behaviour, and Google's 500 KiB sits exactly on the RFC's stated floor | Never publish the divergence framing (§3). Both crawl modes are RFC-compliant; document them as risk postures. The genuine deltas are group selection and unsupported directives only |
| Node zstd is **Stability 1 – Experimental** | API change | Feature-detect; brotli fallback |
| `node:sqlite` is **Stability 1.2 RC** | API change | better-sqlite3 primary; node:sqlite only as install fallback |
| Legacy `duckdb` npm package **deprecated after 1.4.x** | Dead dependency | Use `@duckdb/node-api` only |
| **Possibly stale (2024 or earlier):** Manku et al. SimHash paper (2007); RFC 9309 (2022); sitemaps.org protocol (0.90, 2008); Lighthouse scoring weights widely cited from the v10 era (2023) | Old but still normative/current | Sitemaps + RFC are still the operative specs. **Verify Lighthouse weights against the shipped version's `default-config.js`.** |

---

## 20. Direct implications for our tool

1. **Build the crawler as a standalone, publishable npm package first** (`@seoe/crawler`). It's the piece with the clearest OSS value, it's testable without any API keys, and it's what earns GitHub stars. The agent layer sits on top.
2. **Make "adaptive rendering" the headline technical feature — but sell it as a *time* budget, not a memory one.** Copy Crawlee's predictor pattern (10% detection ratio) and surface it in the UI as a live **wall-clock** estimate (RAM is a footnote: ~300 MB fixed + ~50 MB per concurrent page, §8.2). Rendering everything on a 100k site is 40+ hours of CPU, which is the actual reason not to. Corollary: **rendering can default ON** at a concurrency clamped to CPU cores — it will not OOM an 8 GB laptop, and defaulting it off would have been a mistake premised on a wrong number. Competitors either render everything (slow) or nothing (wrong). Our raw-vs-rendered diff turns a cost optimization into the product's best findings (`canonicalChanged`, `robotsMetaChanged`, `linksOnlyInRendered`).
3. **Vendor the robots.txt parser and the schema.org vocabulary; do not take runtime deps on unmaintained packages for correctness-critical logic.** Ship golden-test corpora for both. Offer the Google C++ robots parser as an optional WASM extra for byte-exact parity.
4. **Design every external-API consumer around its hardest quota from day one — and around *per-project* caps, not just per-site ones.** CrUX 150 QPM (unpurchasable) and GSC URL Inspection 2,000 QPD/site are the two that will shape the hosted tier. Persist token buckets to disk. In the $8/month hosted tier, CrUX at 150 QPM = 216,000 calls/day across *all* tenants — enough, but only with 24 h caching and origin-level (not URL-level) queries by default. **For a multi-tenant deployment the binding GSC limit is the per-project ceiling (URL Inspection 15,000 QPM / 10M QPD), not the per-site 2,000 QPD** — budget the token bucket at the project level and shard across GCP projects if tenant count demands it. Prefer Search Analytics (1,200 QPM/site, 40,000 QPM/project) and BigQuery Bulk Export for anything high-volume; reserve URL Inspection for genuinely per-URL ground truth.
5. **Assume CrUX has no data for our users.** SMB/local-business sites are below CrUX's popularity threshold. Ship the `web-vitals` RUM beacon as part of the CMS integration — it's a few KB and it gives us field data no competitor at this price point has.
6. **Own the structured-data requirement data — it is now load-bearing, not just defensible.** There is no Rich Results Test API, and the one API that returns Google's verdict (`urlInspection` → `richResultsResult`) **cannot test a live URL** — it replays Google's last crawl. So a maintained, machine-readable encoding of Google's per-feature required/recommended properties plus a local validator is **the only mechanism that can gate a schema write before it ships**. Structure the loop in three tiers: (a) local validator = pre-deploy gate; (b) Search Analytics `searchAppearance` = cheap, high-volume outcome signal ("did this URL actually earn the rich result?"); (c) URL Inspection on a prioritized sample = lagging regression monitor. Version the requirement data with `supportedFrom`/`retiredOn` — Google retired 7 types in June 2025 and removed FAQ from Search, the RRT, and the API across May–August 2026.
7. **One SQLite file per site, WAL, single writer, worker threads for CPU.** Resist the urge to add Postgres/Redis/Elasticsearch. "It's one file you can back up" is a self-hosting superpower. Put DuckDB behind an optional extra for logs and history analytics only.
8. **Default to local embeddings** (EmbeddingGemma-300M, Matryoshka-256d, q8) so onboarding requires zero API keys. Expose OpenAI `text-embedding-3-small` at **$0.02/1M tokens** with a pre-run cost estimate — for a 12k-page site that's ~$0.15, which reframes it as "free" and makes the local default a privacy choice, not a cost one.
9. **Ship `seoe doctor`** that checks Node ≥ 22.19, free RAM, whether Chromium is installed, whether better-sqlite3 compiled, disk space, and estimated crawl time — and degrades features explicitly rather than crashing. This is the difference between a tool people self-host and one they abandon in the first five minutes.
10. **Build the safety rails before the autonomy.** Hard-stop the crawl at >30% 5xx in a 100-request window; cap per-host concurrency at 2 by default; never impersonate Googlebot; always identify with a resolvable UA URL. An autonomous agent that takes down its owner's store is an existential product risk, and this is the layer where that gets prevented.
11. **Treat the internal link graph as the crown jewels.** `links` + PageRank + embeddings is what enables the highest-value autonomous action (internal linking) and is the hardest thing for a competitor to bolt on later. Intern URLs and anchor text so it fits on a laptop.
12. **Log-file ingestion is a differentiator, not a nice-to-have** — especially the AI-crawler report (GPTBot/ClaudeBot/PerplexityBot volumes, verified by published IP ranges). It's cheap to build on top of the DuckDB path and answers a question every site owner is asking in 2026.

---

## 21. Sources

All accessed **2026-08-31** unless stated.

**Primary / official**
- undici `Client` options + defaults — https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md
- undici `Pool` options + H2 multiplexing note — https://github.com/nodejs/undici/blob/main/docs/docs/api/Pool.md
- undici v7→v8 migration — https://undici.nodejs.org/best-practices/migrating-from-v7-to-v8
- Node.js `zlib` (Brotli v11.7.0/v10.16.0; Zstd v23.8.0/v22.15.0, Stability 1) — https://nodejs.org/api/zlib.html
- RFC 9309 Robots Exclusion Protocol — https://www.rfc-editor.org/rfc/rfc9309.html
- Google robots.txt spec (500 KiB, 24 h cache, 4xx/5xx handling, 5 redirects) — https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
- sitemaps.org protocol (50,000 URLs / 50 MB / 2,048-char loc) — https://www.sitemaps.org/protocol.html
- Google build-a-sitemap (ignores priority/changefreq) — https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google crawl budget (5xx/429 lower the limit; 1M / 10k thresholds) — https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget
- Google JavaScript SEO basics (crawl→render queue→index; evergreen Chromium; blocked files not rendered) — https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google verifying Googlebot + gstatic IP-range JSON files — https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
- Google crawler IP ranges — https://www.gstatic.com/static/crawling/ipranges/
- Search Console API quotas (URL Inspection 600 QPM / 2,000 QPD per site; per-project 15,000 QPM / 10M QPD; Search Analytics 1,200 QPM/site, 40,000 QPM / 30M QPD per project) — https://developers.google.com/webmaster-tools/limits
- URL Inspection `inspect` method ("you cannot test the indexability of a live URL") — https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- `UrlInspectionResult` / `RichResultsInspectionResult` verdict enum — https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult
- Search Analytics `query` (searchAppearance dimension; "filter by any dimension … even if you are not grouping by that dimension") — https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Console API v1 surface (sites / sitemaps / searchanalytics / urlInspection only) — https://developers.google.com/webmaster-tools/about
- Google structured data docs (lists only the two web-UI tools; no API) — https://developers.google.com/search/docs/appearance/structured-data
- Structured Data Testing Tool update (Dec 15, 2020; support ended ~2021-08-10; migrated to validator.schema.org) — https://developers.google.com/search/blog/2020/12/structured-data-testing-tool-update
- Evidence the old SDTT endpoint was undocumented/reverse-engineered — https://github.com/padosoft/laravel-google-structured-data-testing-tool
- Schema Markup Validator launch (schema.org syntax only; does not check Google eligibility) — https://searchengineland.com/schema-org-launches-its-schema-markup-validator-tool-348590
- FAQ rich results dropped from Search / Search Console / API (May–Aug 2026 timeline) — https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957
- CrUX API (150 QPM/project, not purchasable; `records:queryRecord`) — https://developer.chrome.com/docs/crux/api
- PageSpeed Insights v5 get-started (endpoint; key optional) — https://developers.google.com/speed/docs/insights/v5/get-started
- Core Web Vitals thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1, p75) — https://web.dev/articles/vitals
- Lighthouse programmatic Node API — https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md
- Lighthouse releases (v13 Node ≥ 22.19, removed audits) — https://github.com/GoogleChrome/lighthouse/releases
- Schema.org Markup Validator docs (no documented API) — https://schema.org/docs/validator.html
- sqlite-vec docs + `vec0` reference — https://alexgarcia.xyz/sqlite-vec/ and https://alexgarcia.xyz/sqlite-vec/features/vec0.html
- sqlite-vec releases (v0.1.9 stable 2026-03-31; v0.1.10-alpha.4 2026-05-18) — https://github.com/asg017/sqlite-vec/releases
- sqlite-vec ANN implementation PRs — #276 rescore, #277 IVF, #278 DiskANN — https://github.com/asg017/sqlite-vec/pull/276 · /277 · /278
- sqlite-vec ANN tracking issue (#25) — still open, but an umbrella; the PRs it tracks merged 2026-03-31 — https://github.com/asg017/sqlite-vec/issues/25
- `VEC0_MAX_*` constants + `diskann` presence, verified in source at both tags — https://raw.githubusercontent.com/asg017/sqlite-vec/v0.1.9/sqlite-vec.c and .../v0.1.10-alpha.4/sqlite-vec.c
- npm dist-tags (`latest=0.1.9`, `alpha=0.1.10-alpha.4`) — https://registry.npmjs.org/sqlite-vec
- SQLite first-party `vec1` extension (unreleased, IVFADC + OPQ) — https://sqlite.org/vec1
- LanceDB vector index docs (IVF_PQ / IVF_HNSW_*; filtering guidance) — https://docs.lancedb.com/indexing/vector-index
- DuckDB Node Neo client (`@duckdb/node-api`; legacy `duckdb` deprecated) — https://duckdb.org/docs/lts/clients/node_neo/overview and https://github.com/duckdb/duckdb-node
- Playwright browsers (chromium vs headless shell, `--only-shell`) — https://playwright.dev/docs/browsers
- Crawlee AdaptivePlaywrightCrawler options (`renderingTypeDetectionRatio` default 0.1) — https://crawlee.dev/js/api/playwright-crawler/interface/AdaptivePlaywrightCrawlerOptions
- Crawlee (Python) adaptive crawler guide (RenderingTypePredictor) — https://crawlee.dev/python/docs/guides/adaptive-playwright-crawler
- LinkeDOM README (linear performance goal, limitations) — https://github.com/WebReflection/linkedom
- Trafilatura evaluation table (2026-08-04 run; F1 0.924 vs readability-lxml 0.826) — https://trafilatura.readthedocs.io/en/latest/evaluation.html
- OpenAI API pricing (embeddings: 3-small $0.02/1M, 3-large $0.13/1M, ada-002 $0.10/1M) — https://developers.openai.com/api/docs/pricing
- EmbeddingGemma (308M params, 768-d + MRL 512/256/128, <200 MB quantized, 2K context) — https://huggingface.co/blog/embeddinggemma
- Transformers.js v4 announcement (C++ WebGPU runtime in Node/Bun/Deno) — https://huggingface.co/blog/transformersjs-v4
- npm registry version/date data for all packages — queried directly via `npm view` on 2026-08-31

**Secondary (blogs/comparisons — treat as indicative, not authoritative)**
- Playwright browser footprint measurements (Chromium 1,094 MB / headless 706 MB; WebKit 590 MB), datawookie, 2025-06-06 — https://datawookie.dev/blog/2025-06-06-playwright-browser-footprint/ — **NB: these are *sums of RSS* across the whole process tree (~1.7× true PSS), measured on a single `example.com` load; they are a browser-*launch* cost, not a per-page cost**
- Headless Chrome at scale (resource blocking 40–60% savings), Medium, 2026-06 — https://medium.com/@zlata_18516/headless-chrome-at-scale-cpu-ram-and-cost-optimization-strategies-caea743245c4 — **the "≈250 MB/page" figure previously attributed to the datawookie post is not in that post and is refuted by measurement; see §8.2**
- Playwright memory-growth reports — https://github.com/microsoft/playwright/issues/29163 (single user report, closed with no maintainer root-cause; source of the "1,000–1,500 pages" figure) and https://github.com/microsoft/playwright/issues/38489 (unverified "~20 GB" outlier, Chrome for Testing, 1.57)
- Playwright memory discussion — https://github.com/microsoft/playwright/issues/33566
- **Local primary measurement**, Playwright 1.60.0 + `chromium-headless-shell` on Linux: sum-of-RSS vs `/proc/[pid]/smaps_rollup` PSS across the full process tree, real sites (Wikipedia, Hacker News, python.org). Scripts: `/tmp/claude-1000/-home-vp2722-seoe/4911f4ca-31de-4720-8fa6-0f77468cd773/scratchpad/bench.py` and `bench2.py`
- cheerio issue #1259 "parse5 is about half the performance of htmlparser2" — https://github.com/cheeriojs/cheerio/issues/1259
- jsdom vs cheerio benchmark (517.16 ms vs 300.95 ms), ZenRows — https://www.zenrows.com/blog/jsdom-vs-cheerio
- Manku, Jain, Das Sarma, "Detecting Near-Duplicates for Web Crawling" (WWW 2007) — https://research.google.com/pubs/archive/33026.pdf  **(2007 — old, but still the operative reference)**
- SimHash vs MinHash discussion (64-bit, k=3) — http://ben-whitmore.com/simhash-and-solving-the-hamming-distance-problem-explained/
- `node:sqlite` Stability 1.2 RC vs better-sqlite3, 2026 — https://www.hirenodejs.com/blog/nodejs-builtin-sqlite-node-sqlite-2026
- SQLite driver benchmark — https://sqg.dev/blog/sqlite-driver-benchmark/
- Rich Results Test has no public API (2026 refresh) — https://library.linkbot.com/what-are-the-differences-between-the-rich-results-test-tool-and-the-structured-data-testing-tool-and-when-should-each-be-used-cr-20260302/
- `schema-org-validate` npm package — https://github.com/a4csi/schema-org-validate
- `robots-parser` — https://github.com/samclarke/robots-parser ; `robotstxt-util` — https://github.com/muratgozel/robotstxt-util
- Google ignores `Crawl-delay` (listed among unsupported tags, April 2026) — https://www.configclarity.dev/blog/google-ignores-crawl-delay/
- PSI API quota (25,000/day) — community/console-derived, **not confirmed on Google's docs page** — https://groups.google.com/g/pagespeed-insights-discuss/c/dB7hWmGAGsw
- got vs undici vs node-fetch 2026 — https://www.pkgpulse.com/guides/got-vs-undici-vs-node-fetch-http-clients-nodejs-2026

---

## 22. Fact-check log

Independent adversarial fact-check completed **2026-09-01**. Six load-bearing claims were checked; **two CONFIRMED clean**, **four PARTIALLY_TRUE and corrected inline above**. Corrections are applied at the point of use — this log is a record, not the fix.

### ✅ CONFIRMED (no change)

**1. CrUX API: 150 QPM per Google Cloud project, free, "it is not possible to pay for an increased quota."**
**Verdict: CONFIRMED.** The hard-ceiling framing in §12.3 and §20.4 stands.
Source: https://developer.chrome.com/docs/crux/api

**2. Lighthouse 13.0.0 (2025-10-10) raised minimum Node to 22.19 and removed eight audits (incl. `uses-rel-preload`, `offscreen-images`, `font-size`, `third-party-facades`, `first-meaningful-paint`) plus four artifacts.**
**Verdict: CONFIRMED.** §12.2 and the "never hardcode audit IDs" rule stand.
Source: https://github.com/GoogleChrome/lighthouse/releases

### ⚠️ PARTIALLY_TRUE — corrected

**3. "No public API for the Rich Results Test; the SDTT API was deprecated and never replaced. The only sanctioned programmatic source of Google's rich-result verdict is the URL Inspection API at 600 QPM / 2,000 QPD per site."**
**Verdict: PARTIALLY_TRUE.** Corrected in **§13.2**, **§5.2**, **§10.4**, **§19**, **§20.4**, **§20.6**.
- Quota numbers are **exactly right and current**. Omission corrected: additional **per-project** ceiling of 15,000 QPM / 10,000,000 QPD — non-binding for one site, binding for a multi-tenant SaaS.
- "No RRT API" is **correct and still true in 2026**.
- **Correction A:** Google never published a documented public SDTT *API*, so there was no sanctioned API to deprecate — only an undocumented `validate` endpoint that third parties reverse-engineered. What was deprecated was the **tool** (announced July 2020, relocated Dec 2020, support ended ~2021-08-10). Any library advertising a "Rich Results Test API" is scraping an unsanctioned endpoint. `validator.schema.org` checks schema.org syntax only and explicitly does **not** check Google rich-result eligibility, so it is not a substitute.
- **Correction B:** "the ONLY sanctioned source" is overstated — there are **two**. `urlInspection` → `richResultsResult` gives **eligibility**; Search Analytics `searchAppearance` gives **actual SERP rendering** at a far looser quota (1,200 QPM/site; 40,000 QPM / 30M QPD per project), plus unmetered BigQuery Bulk Export.
- **Correction C (largest):** the URL Inspection API **cannot run a live test** — *"Presently only the status of the version in the Google index is available; you cannot test the indexability of a live URL."* It therefore cannot validate freshly deployed schema, and the "ground-truth 2% of a 100k-URL site daily" framing was optimistic. Recommendation rewritten to a three-tier design (local validator pre-deploy → `searchAppearance` outcome signal → URL Inspection as lagging regression monitor).
- **Currency caveat added:** 7 rich-result types retired June 2025; FAQ dropped from Search 2026-05-07, from Search Console/RRT June 2026, from the **API August 2026** (already in effect).
Sources: https://developers.google.com/webmaster-tools/limits · https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect · https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult · https://developers.google.com/search/docs/appearance/structured-data · https://developers.google.com/webmaster-tools/v1/searchanalytics/query · https://developers.google.com/webmaster-tools/about · https://developers.google.com/search/blog/2020/12/structured-data-testing-tool-update · https://github.com/padosoft/laravel-google-structured-data-testing-tool · https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957 · https://searchengineland.com/schema-org-launches-its-schema-markup-validator-tool-348590

**4. "sqlite-vec is still 0.1.9 (published 2026-05-18), pre-1.0 alpha, brute-force KNN only with no ANN index (ANN is an open tracking issue). `vec0` caps metadata columns at 16, partition keys at 4."**
**Verdict: PARTIALLY_TRUE.** Corrected in **§0 table**, **§15.3**, **§19**.
- **Date REFUTED:** v0.1.9 is the latest *stable* release, published **2026-03-31**, not 2026-05-18. That date belongs to **v0.1.10-alpha.4**. npm dist-tags: `{"latest":"0.1.9","alpha":"0.1.10-alpha.4"}`.
- **"Alpha" imprecise:** the project is pre-1.0, but v0.1.9 is `prerelease=false` — a stable point release. The alpha label belongs to the `0.1.10-alpha.*` line.
- **"No ANN" REFUTED for current code:** ANN landed 2026-03-31 via PRs #276 (rescore), #277 (experimental IVF), #278 (DiskANN). Source diff: `sqlite-vec.c` has **0** `diskann` matches at `v0.1.9` and **141** at `v0.1.10-alpha.4`, with a `Vec0IndexType` enum. **Caveat preserving the decision:** ANN ships **only** in an alpha prerelease; the stable default install is still flat scan; IVF is "experimental, not enabled"; docs 404; no stable release in ~5 months.
- **Tracking issue #25 CONFIRMED open** (updated 2026-06-13) **but misleading** — it is an umbrella, not evidence ANN is unimplemented.
- **Column caps CONFIRMED exactly** in source at both tags; two further caps added (16 vector columns, 16 auxiliary columns) plus the docs' soft warning against >1 partition key.
- **Added:** SQLite's own first-party `vec1` extension (unreleased, IVFADC+OPQ) as a future option to track.
- **Reason restated:** the `VectorStore` + LanceDB conclusion stands, but on the corrected premise; the ~200k cap is a v0.1.9 flat-scan number and must be re-benchmarked against alpha DiskANN.
Sources: https://github.com/asg017/sqlite-vec/releases · /issues/25 · /pull/276 · /pull/277 · /pull/278 · https://raw.githubusercontent.com/asg017/sqlite-vec/v0.1.9/sqlite-vec.c · .../v0.1.10-alpha.4/sqlite-vec.c · https://registry.npmjs.org/sqlite-vec · https://pypi.org/pypi/sqlite-vec/json · https://alexgarcia.xyz/sqlite-vec/features/vec0.html · https://sqlite.org/vec1

**5. "Google's robots.txt handling diverges from RFC 9309 on 5xx (12h stop, 30d cache, then no restrictions) whereas the RFC says MUST assume complete disallow; plus 500 KiB limit, 24h cache, all 4xx except 429 treated as no robots.txt."**
**Verdict: PARTIALLY_TRUE.** Corrected in **§3 (preamble)**, **§3.1**, **§3.1 implementation decision**, **§19**.
- **All four numeric facts CONFIRMED** and current (Google's page: "Last updated 2026-08-31 UTC"). 500 KiB sits **exactly on** RFC 9309 §2.5's floor ("MUST be at least 500 kibibytes"). The 24h cache matches §2.4 including the unreachable exception.
- **The "divergence" premise REFUTED.** RFC 9309 §2.3.1.4 continues past the quoted sentence: *"If the robots.txt file is undefined for a reasonably long period of time (for example, 30 days), crawlers MAY assume that the robots.txt file is unavailable as defined in Section 2.3.1.3 or continue to use a cached copy."* Google is **compliant, not divergent**. Three of the RFC's four authors are Google employees; the spec codifies Googlebot's behaviour. (RFC 9309, Sept 2022, is a Proposed Standard.)
- **Three material omissions added:** (a) the post-30-day outcome is a **branch** on site availability, not an unconditional allow — implementing only the permissive branch hammers an already-failing site; (b) the 12h/30d ladder presupposes a previously-fetched good copy, so a site that never served a parseable robots.txt has no cached-copy phase; (c) **429 is handled on the 5xx path**, as are DNS failures, network errors and timeouts — key the state machine on `{5xx, 429, DNS/network/timeout}`. Also pinned: 3xx follows ≥5 hops then falls through to the **permissive** 404 rule, and logical redirects are not followed.
- **Recommendation rewritten:** both crawl modes are simultaneously RFC-compliant; the difference is risk posture, not standards conformance. **Do not document this as "Google violates the RFC."**
Sources: https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt · https://www.rfc-editor.org/rfc/rfc9309.html · https://datatracker.ietf.org/doc/html/rfc9309

**6. "A single headless Playwright Chromium browser peaks at ~706 MB RSS (1,094 MB headed), with ~250 MB average per-page footprint and degradation after 1,000–1,500 pages — making full-site JS rendering infeasible on a laptop."**
**Verdict: PARTIALLY_TRUE.** Corrected in **§8.2**, **§8.3**, **§8.5**, **§11.3**, **§19**, **§20.2**.
- **706 / 1,094 MB confirmed as quotation but mismeasured and mislabeled.** They are **sums of RSS across the whole process tree** (driver + 7–8 Chromium children sharing hundreds of MB of mapped binary), not browser RSS — reproduction gives sum-of-RSS 567 MB vs true **PSS 340 MB**, i.e. the metric inflates real cost ~1.7×. They are a one-time **launch** cost measured on a single `example.com` load, not a per-page cost. They are also channel-stale: since Playwright 1.49 `headless=True` defaults to `chromium-headless-shell` (569 MB sum-RSS / **341 MB PSS**) vs `channel:'chromium'` (940 MB / **481 MB PSS**) — a ~1.7× swing from one config flag. The source's WebKit figure (588 MB, ~40% cheaper than Chromium) was omitted and is now included.
- **"~250 MB per page" REFUTED / fabricated attribution.** The string "250" appears nowhere in the cited article, which measures no per-page figure at all. Measured: browser with zero pages = 437 MB sum-RSS / **287 MB PSS**; each additional **concurrent** page in its own context ≈ **45–55 MB PSS**; each **sequential** page (open → goto → close) retains **~1.5 MB PSS**. The claim is ~5× too high for concurrent pages and ~150× too high for sequential ones.
- **"Degradation after 1,000–1,500 pages" MISATTRIBUTED AND UNRELIABLE.** ⚠️ **unverified — must be confirmed during implementation.** Also absent from the cited blog; it traces to `microsoft/playwright#29163`, a single user report **closed with no maintainer root-cause**, whose own numbers were ~800 MB *total*. A 40-page sequential run showed growth **plateauing**: +17 MB at page 1, flat at 326→327→328 MB across pages 5–15, 349 MB after 40 pages. No leak signature.
- **"Infeasible on a laptop" REFUTED.** Correct model is **fixed + marginal**: ~290–340 MB PSS per browser tree (~480 MB if `channel:'chromium'`) + ~50 MB PSS per concurrent page. 8 concurrent pages ≈ 700 MB PSS; 16 ≈ 1.1 GB — both comfortable on 8 GB. **Memory is not the constraint; wall-clock time and CPU are.**
- **Recommendations rewritten:** adaptive rendering and browser recycling are retained but rejustified on latency/CPU and pathological-page defense, not a 250 MB/page constant. Concurrency formula changed to `clamp(floor((availableMemMB - 400) / 60), 1, cpuCores)` (CPU-bound in practice). Rendering may safely **default ON** at sane concurrency on 8 GB. Prefer `chromium-headless-shell`; consider WebKit.
Sources: https://datawookie.dev/blog/2025-06-06-playwright-browser-footprint/ · https://github.com/microsoft/playwright/issues/29163 · https://github.com/microsoft/playwright/issues/38489 · https://github.com/microsoft/playwright/issues/33566 · https://playwright.dev/docs/browsers · local primary measurement (Playwright 1.60.0, Linux; sum-of-RSS vs `smaps_rollup` PSS; scripts `bench.py`, `bench2.py`)

### ⚠️ Items flagged unverified elsewhere in this dossier (unchanged, restated here)

- **Lighthouse performance scoring weights** (TBT 30 / LCP 25 / CLS 25 / FCP 10 / SI 10) — widely reported in secondary sources; ⚠️ **unverified — must be confirmed during implementation** against the shipped version's `default-config.js`. (§12.2)
- **PSI API quota** (25,000/day, ~400 per 100 s) — not stated on Google's own PSI docs page; ⚠️ **unverified — must be confirmed during implementation** in the Cloud console. (§12.4)
- **zstd shared-dictionary compression ratio** (3–5× better on templated HTML) — engineering expectation, not a cited benchmark; ⚠️ **unverified — must be confirmed during implementation.** (§11.5)
- **HTML parser throughput and capacity-plan tables** (§7.1, §18) — order-of-magnitude planning estimates, not measured benchmarks; ⚠️ **unverified — must be confirmed during implementation** before publishing to users.
