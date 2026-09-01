# Content engine (Phase 5)

Sean writes and ships content a human would not be embarrassed by, at a rate
Google will not punish.

Default action is **refresh an existing URL**. New pages are T2, capped at
**2/day/site**, and that cap is not overridable.

```
sean content [origin] --repo ./site
```

The daily `content` job does the same thing unattended.

## Pipeline

1. **Decay** — GSC clicks, last 28 days vs the previous 28. Impressions are
   ignored (contaminated 2025-05-13 → 2026-04-27). Thin-content findings are
   the fallback.
2. **Brief** — playbook `content-brief`: entities, headings, GSC questions,
   internal-link targets from the crawl table, MarketMuse-style content score
   `Σ min(2, mentions)` over ≤50 topics.
3. **Draft** — BYOK via Vercel AI SDK 7. Mid-class model (Sonnet 5, $2/$10 per
   MTok) for drafting. The LLM emits JSON; it never holds CMS credentials and
   never calls a write API (D4).
4. **PublishGate** — ten deterministic checks, all must pass.
5. **Action** — `refresh_content` (T2) through the existing validator,
   executor, and Git adapter. Evidence tier **E**: applied, not measurable.

## PublishGate

| # | Check |
|---|---|
| 1 | Fact-check: every 2+ digit number / % / $ amount is in the brief |
| 2 | Near-duplicate vs the site corpus (simhash Hamming ≤ 3) |
| 3 | Readability and structure (H1, ≥2 H2s, word count, Flesch) |
| 4 | Brand voice (style profile) |
| 5 | Internal links resolve to crawled pages |
| 6 | JSON-LD valid against the vendored schema.org vocabulary |
| 7 | Banned-substring scan on output |
| 8 | New-page cap 2/day/site |
| 9 | YMYL / affiliate hard block (T4) |
| 10 | EU AI Act Art. 50 disclosure (`html_comment` by default) |

## Playbooks

`packages/playbooks` is versioned methodology, not prompts buried in code.
Nine entries are adapted from OpenSEO Agent Skills (MIT, Ben Senescu) plus
Sean’s `content-refresh`, `content-brief`, `publish-gate`, `brand-voice`, and
`vertical-block`.

## Model routing

| Task | Class | Why |
|---|---|---|
| Classification / triage | cheap (Haiku 4.5 / Flash-Lite) | Batched, low stakes |
| Drafting | mid (Sonnet 5, $2/$10 per MTok) | Quality/cost sweet spot |
| Weekly strategy | top (Opus 5) | Rare, high leverage |

Ollama is the zero-paid-key path. Without a key, briefs are skipped and the
dashboard says so.

## Evidence

Content publishes are Track B unless they sit inside a pre-registered
experiment. Unmeasured rewrites report **E — Applied; not measurable at this
site's traffic volume**. Sean will not claim a click recovery from a rewrite.
See [`measure.md`](measure.md).
