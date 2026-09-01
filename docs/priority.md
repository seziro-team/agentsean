# Finding priority (`pr-1.0.0`)

```
priority = severity × coverage × indexability × traffic × confidence ÷ effort
```

Severity alone is wrong — Sitebulb says so, and nobody else ships the full
formula openly.

| Term | Values |
|---|---|
| `severity` | Critical 100 · High 40 · Medium 12 · Low 4 · Insight 1 |
| `coverage` | `0.2 + 0.8 × min(1, affected_urls / max(25, 0.05 × total_urls))` |
| `indexability` | `0.15 + 0.85 × (indexable_affected / affected_urls)` |
| `traffic` | `1 + log10(1 + gsc_clicks_28d)` capped at 4. Equals 1 with no GSC. |
| `confidence` | 0.5–1.0 from the detector |
| `effort` | T0/T1 auto 1.0 · T2 1.3 · T3 2.5 · T4 5.0 |

`sean audit --json` returns findings already sorted by this number.
