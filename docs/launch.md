# Launch

Phase 11. The repo gets found.

**Positioning:** *Every SEO tool tells you what's wrong. Agent Sean fixes it.*

Lead with the diff-and-revert image, not a feature list. The 90-second demo is Sean fixing a real site, the diff visible, Revert clicked. Host the recording as a GitHub Release asset when it exists; until then the SVG in [`docs/assets/demo.svg`](assets/demo.svg) is the story.

## What "done" means

A user runs one command, answers four questions (URL, CMS, Google, telemetry), and walks away. Sean then, without being asked:

- crawls weekly and after every deploy
- pulls Search Console and Analytics daily
- finds issues against ~300 checks
- **fixes** the safe ones in WordPress / Shopify / Git / the edge
- queues the dangerous ones for one click
- rewrites decaying content within 2 refreshes/day and 2 new pages/day
- tracks ranks and AI citation share
- reports weekly with an evidence tier on every claim
- records every change with a before-snapshot and a revert button
- stops instantly on `sean freeze`

It does not negotiate with stakeholders, argue strategy, or decide whether a business should want the traffic. Tools that pretend otherwise are the ones people stop trusting.

## Credit

[OpenSEO](https://github.com/every-app/open-seo) proved an open-source SEO platform could work. Agent Sean is the execution layer — not a fork, and not a report that stops at the finding.

## Sequence

Copy lives in [`docs/launch/`](launch/). Do not over-engineer the hour; sit in the thread. A non-front-page HN post is worth on the order of ~120 stars in 24h / ~290 in 7d (arXiv 2511.04453, keyword sample, not front page). 92% of the star effect is over by 48 hours.

1. Docs site (`web/`) + demo
2. Show HN
3. r/SEO, r/bigseo, r/selfhosted
4. Discord
5. SEO Twitter / LinkedIn corridor
6. WordPress plugin directory (`plugins/wordpress`) — its own discovery channel

## Packaging trap

npm v12 disables lifecycle scripts. Installers provision on first *run*. See [`install.md`](install.md).
