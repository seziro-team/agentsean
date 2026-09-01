# Site Score (`ss-1.0.0`)

Published formula. Stored with every audit. Never retro-computed when the
version changes.

```
SiteScore = round( 100 × Σ(wᵢ × sᵢ) )      where Σwᵢ = 1, each sᵢ ∈ [0,1]
```

| i | Pillar | w | sᵢ |
|---|---|---|---|
| 1 | Indexability & crawlability | 0.25 | `1 − (weighted_error_urls / eligible_urls)` |
| 2 | On-page fundamentals | 0.20 | Mean per-page pass-rate over title, unique title, meta description, single H1, canonical |
| 3 | Structured data & rich results | 0.10 | valid schema pages / applicable pages, minus validation-error penalty |
| 4 | Internal linking | 0.10 | depth ≤ 3 share, 1 − orphan rate, inverted Gini of inlinks |
| 5 | Performance / CWV | 0.10 | CrUX Good share; crawl TTFB proxy when CrUX is absent (labelled) |
| 6 | Search performance trend | 0.15 | GSC 28-day trend. **Redistributed** when GSC is not connected. |
| 7 | AI visibility | 0.05 | AI-crawler robots.txt accessibility in Phase 1 |
| 8 | Content freshness & quality | 0.05 | 1 − thin-page rate |

**Bands:** 0–30 Poor · 31–70 Needs work · 71–90 Good · 91–100 Excellent.

**Edge cases:** no GSC → partial score, pillar 6 excluded, weights renormalised.
Fewer than 50 crawled URLs → provisional. A pillar with no applicable signal is
excluded, never scored 0.

The live arithmetic for a given audit is in the `score` object of
`sean audit --json`.
