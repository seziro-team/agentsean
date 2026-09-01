# Phase 12 — live gaps (checked 2026-09-02)

Desk research plus the probes we could run from this machine. Items that need *your* Cloud/Bing/Ads keys stay marked.

| # | Question | Verdict 2026-09-02 | What Sean does |
| --- | --- | --- | --- |
| 1 | Google Ads `GenerateKeywordIdeas` on a test MCC | **Unverified here** — needs a test MCC. Do not write onboarding copy that depends on it. | GSC + Bing + autocomplete remain the free default. |
| 2 | Bing `GetKeywordStats` still returning data? | **REST endpoint is live.** SOAP/POX retired **2026-08-31**. Unauthenticated call to `ssl.bing.com/webmaster/api.svc/json/GetKeywordStats` returned HTTP 400 `InvalidApiKey` (not 404). A key is required to see numbers. Default language is now `en-US` (country `us`). | Already on JSON/HTTP. Do not use SOAP. |
| 3 | PSI per-minute quota | **Keyed: 25,000/day and 240/min** (Google Cloud / Nexla / DebugBear 2025–2026). Anonymous shared pool: live probe 2026-09-02 returned **429** `Queries per day` on consumer `project_number:583797351490` with `quota_limit_value: 0`. Older “100/100s” (= 60 qpm) is the conflict; do not treat it as current keyed quota. | 429 exponential backoff already in `googleFetch`. Require a PSI API key in production. |
| 4 | Bing Webmaster rate limits | Microsoft: quotas unchanged in the REST migration notice (Aug 2026). Exact numbers still undocumented. | Conservative defaults; treat 429 as backoff. |
| 5 | Headless Chromium cost | Not benchmarked at hosted scale. Playwright stays lazy (not at install). | Do not price hosted on unmeasured render cost. |
| 6 | Google v. SerpApi amended complaint? | **Yes.** N.D. Cal. 4:25-cv-10826-YGR, amended complaint **Docket 45, 2026-08-10**. Original DMCA claims dismissed 2026-07-20; Google refiled on licensed-content / Reddit terms. Hearing on SerpApi’s second MTD set **2026-09-29**. | Sean **never scrapes Google**. Rank tracking is DataForSEO (optional) or first-party GSC. Vendor risk is why we do not scrape. |
| 7 | GSC Generative AI report in API / BigQuery? | **No.** UI report launched 2026-06-03, global by 2026-08-31. Search Analytics API `type` still web/image/video/news/discover/googleNews. No AI column in BigQuery bulk export (re-verified in secondary sources through Aug 2026). CSV export from the UI only. | Do not claim API AI-impression data. Import Bing Webmaster AI CSV; DIY prompt panel stays the citation instrument. |
| 8 | AI Mode separable in GA4? | **Not as its own referrer.** AI Overviews / AI Mode clicks land in `google / organic` (or Direct when referrer is stripped). GA4 “AI Assistant” channel (2026-05-13) covers ChatGPT/Gemini/Claude *web* referrals, not Google AI Mode. | Do not sell “AI Mode traffic” from GA4. Landing-page heuristics are E-tier. |

Ongoing: dependency audit, vendored `robots-parser` / `@mozilla/readability`, quarterly quota re-read from Cloud Console.
