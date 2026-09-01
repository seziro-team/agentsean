# Action system

Phase 3 is the safety spine. Nothing writes to a customer site until an
`Action` has passed a deterministic reference monitor. The LLM never holds
credentials and never calls a write API (D4).

## Shape

```ts
type Action = {
  id: string;
  siteId: string;
  kind: ActionKind;           // closed enum, ~40 members
  tier: 0 | 1 | 2 | 3 | 4;    // from the policy matrix
  target: { pageId: string; url: string };  // must resolve to our crawl table
  payload: ActionPayload;     // closed schema per kind, no free-string URLs
  rationale: string[];
  findingIds: string[];
  estimatedImpact: { metric: "clicks"; estimate: number; confidence: number };
};
```

T3 (robots, canonicals, redirects, deletions, outreach, disavow) always
requires two HMAC-signed approvals from distinct actors. T4 (cloaking, PBNs,
YMYL generation, SERP scraping) is refused — no setting exists.

A 7-day observe-only period applies to every newly connected site. It can be
shortened to 24 hours, not to zero.

## Validator — 15 independent vetoes

1. Schema conformance (closed enums, no extra keys)
2. Target binding — `target.url` exists in `pages` for this site
3. URL allowlist — every URL in the payload is crawled or user-allowlisted
4. First-appearance — no entity whose first sighting was third-party content
5. Diff caps — max bytes and max % of the page
6. Blast radius — 25 URLs/run, plus hourly/daily caps; kill switch
7. Policy tier — T3/T4 are not overridable
8. Budget ledger
9. Invisible-character and Unicode tag-block scan
10. Encoded-payload detection (base64, entities, `%`, rot13)
11. Banned-substring scan on **output**, not input
12. Two-key rule for canonical/redirect/robots
13. Vertical block (YMYL / affiliate content generation)
14. Observe-period check
15. Rate limiter (2 new pages/day/site)

The monitor has no network and no LLM in its call graph. A red-team suite of
30 injection payloads (hidden text, JSON-LD `headline`, `X-AI` headers,
Unicode tag blocks, off-site canonicals) is asserted in CI: **zero** of them
pass.

## Executor

`snapshot → apply → verify → record`. Verify re-reads the target; a 200 is not
evidence the change landed. Every apply stores a full before-snapshot in
`change_snapshots`. We own rollback. WordPress has no restore endpoint;
Webflow has no restore API; we do not borrow theirs.

## Git adapter

`packages/adapters/git` is the first adapter: resolve a URL to a Next.js /
Astro / Hugo / Jekyll file, rewrite the title, branch, commit, open a PR,
verify the file, revert with `git revert` (or the shadow snapshot).

```bash
sean audit https://example.com
sean apply --repo ./my-next-app
sean revert <changeId>
```

Diffs are at `http://127.0.0.1:7777/activity`. One click reverts.
