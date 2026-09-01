# Measurement honesty

Phase 7. Sean is the only tool that tells you which of its claims are real.

Per-change attribution on small sites is statistically impossible. Pre/post
minimum detectable effect is ~80% at 28 days, ~55% at 56 days, ~41% at 91
days — and that floor is the same at 500 clicks/month and at 100,000, because
the binding constraint is autocorrelated market drift, not sample size. Daily
peeking raises the null false-positive rate from 4.7% to 22.9%. An agent
shipping 20 naively-tested changes a month has a 64% chance of fabricating a
win.

## Evidence ladder

Every claim in the dashboard carries a tier. Causation is allowed only at A.

| Tier | Meaning |
| --- | --- |
| **A** | Controlled experiment with a matched cohort, pre-registered, sufficient power |
| **B** | Matched-cohort observational, effect exceeds MDE |
| **C** | Pre/post with a Google-update annotation join, effect exceeds MDE |
| **D** | Directional signal only, below MDE |
| **E** | Applied; not measurable at this site's traffic volume |

Sites below the industry power bar (SearchPilot 30,000 organic sessions/month;
Semrush SplitSignal 300 pages and 100,000 clicks / 100 days) are told at
onboarding that most changes will land in E — and that this is true of every
SEO tool, ours included, but only ours says so.

## Experiments

`experiments` is a first-class table. Hypothesis, cohort assignment, and
analysis date are fixed **before** the change ships. `planned_end` is immutable
once the experiment is running. Analysis before that date returns a provisional
estimate with no verdict. The unit of causal claim is the cohort, never the URL.

Primary metric is **clicks**. Impressions / CTR / position are hard-blocked
across the 2025-05-13 → 2026-04-27 GSC logging-error window.

## GA4 ↔ GSC waterfall

Seventeen named discrepancy causes close to an explicit residual. They will
never match: ~46.8% of GSC clicks have no query, and a compliant EU property
has 40–65% of organic traffic permanently invisible in GA4. The leftover is
the honest number, not a bug.

```bash
sean measure
```
