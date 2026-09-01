# Daemon, dashboard, and scheduler (Phase 4)

Sean is one process, one port, one origin (`127.0.0.1:7777`). The dashboard is
a React SPA served by the same Fastify server. There is no CORS configuration
anywhere in the codebase.

```
sean start          # daemon + scheduler + dashboard
sean freeze         # global kill switch (survives restart)
sean unfreeze
```

The start command prints a loopback URL with a `#token=` fragment. The
dashboard exchanges that for a `SameSite=Strict` cookie and then uses
`X-Sean-Csrf: 1` on every mutating request.

## Scheduler

One `JobQueue` interface:

- Local: the `jobs` table in SQLite WAL (`createSqliteQueue`)
- Hosted: `createPgBossQueue(new PgBoss(DATABASE_URL))`

Cadences per site (idempotent per period bucket):

| Job | Default |
|---|---|
| crawl | weekly |
| gsc_sync | daily |
| cwv (CrUX / PSI) | weekly |
| rank_check | **weekly** (daily 200-keyword tracking is ~$3.60/mo, 45% of $8) |
| content | daily: decay → brief → PublishGate → refresh_content. Cap 2 refreshes and 2 new pages/site, not overridable |
| plan_and_apply | daily T1/T2 auto, T3 queued |

Crash recovery: a `running` row whose heartbeat is older than 5 minutes is
requeued. Long crawls checkpoint `seen` + remaining `queue` and resume.

Exponential backoff: 1m × 5^n, cap 6h, 8 attempts then `failed`.

## Screens

Onboarding, Overview, Findings (FTS5 + keyset pagination), Crawl explorer
(virtualized crawl-to-crawl diff with `filter_mode`), Activity, Approvals
(four diff modes), Automations, Content, Search performance, AI visibility,
Reports (immutable hashed snapshots + PDF), Settings (kill switch).

Remote access is Tailscale Serve or a Cloudflare Tunnel. Never bind `0.0.0.0`.
