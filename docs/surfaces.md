# AI visibility, local, off-page, verticals

Phase 9. The surfaces beyond classic organic. This is a free wedge, not a
revenue line.

```bash
sean visibility
sean local
sean mentions
```

## AI visibility

A DIY prompt panel (~20 prompts × ChatGPT + Gemini, monthly, ~$1.11/run at
verified 2026 API rates) parses citations and computes share-of-voice and
citation share. Bing Webmaster Tools' AI Performance report is ingested as a
CSV — it has no API. Google's Search Console Generative AI report is
impressions-only and absent from the Search Analytics API.

Sean will not sell these as AEO levers:

- Schema markup (Ahrefs matched DiD, 1,885 pages: no measurable effect)
- Content length (r = 0.04 with AI citations)
- `llms.txt` (97% of published files are never fetched)

Citation *selection* and answer *absorption* are distinct. High-impact pages
are dense in extractable evidence: definitions, numeric facts, comparisons,
procedures.

**Training crawlers are not citation crawlers.** `GPTBot`, `ClaudeBot`,
`Google-Extended` are training; `OAI-SearchBot`, `Claude-SearchBot`,
`PerplexityBot` are citation. An autonomous `robots.txt` writer that conflates
them silently destroys AI citation eligibility. `edit_robots_txt` is T3.

MCP: `ai_citation_share`. Dashboard: `/ai`.

## Local SEO

Google Business Profile write APIs start at **0 QPM** until Google approves
Basic API Access and the profile is verified 60+ days. Caps: 10 edits/min per
profile (not increasable) and 300 QPM per API. Sean token-buckets writes and
degrades to read-only without approval. The GBP title is never auto-written.

T4, no setting exists:

- Review generation (incentives, gating, staff-name asks)
- Unbounded city×service pages (doorway abuse *and* scaled content abuse)

An AI citation gap report is worth more than another local rank tracker.
BrightLocal 2026: AI tools jumped from 6% to 45% of local discovery in a year.

## Off-page & brand authority

Mention-first. Ahrefs (Dec 2025, 75,000 brands): branded web mentions
correlate 0.656–0.709 with AI-assistant visibility versus 0.266–0.326 for
Domain Rating.

Full autonomy: inbound-404 recovery, unlinked mention discovery, competitor
gap, prospect scoring. T3 permanently: outreach send (per-message two-key
approval). Locked: disavow, unless a Search Console manual action exists. GSC
has no links endpoint and no disavow endpoint.

MCP: `brand_mentions`.

## Vertical presets

A 24-signal auto-detector plus six onboarding questions. v1 presets: B2B SaaS
and multi-location. Content generation is hard-blocked for affiliate and YMYL
— the detector writes `sites.ymyl_category`, and the 15-check validator
refuses `refresh_content` / `create_page` on those sites.

The monthly `surfaces` job is the scheduler cadence (`YYYY-MM` period bucket).
