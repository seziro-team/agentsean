# Google connections

Phase 2. Point Sean at Google Search Console, Analytics, CrUX and PageSpeed
Insights. The first crawl still works with zero credentials; this is the
upgrade.

## Connect in under two minutes

```bash
npx agentsean start
npx agentsean connect google
```

The CLI opens `http://127.0.0.1:<port>/connect`. Stay on that origin. A hosted
page is never allowed to talk to the local daemon — Chrome 142+ Local Network
Access would prompt and the flow would break.

Default metric everywhere is **clicks**. Google's impressions logging error
(`2025-05-13` → `2026-04-27`) contaminates impressions, CTR and average
position for almost the entire 16-month GSC window. Clicks were unaffected.
The `&num=100` removal (`2025-09-10`–`14`) is stored as a changepoint so a
naïve year-over-year impression comparison cannot fire a false content-decay
alert.

## Architecture (D9)

Shipping `client_id` / `client_secret` in this repository is forbidden:
Google APIs ToS §4(b), verbatim. The **first-party stateless OAuth broker**
on `oauth.agentsean.com` holds the secret. After Google consent it encrypts
the refresh token with a one-time wrap key the local daemon generated and
**302s to** `http://127.0.0.1:<port>/oauth/callback` (RFC 8252 IP literal,
not `localhost`). PKCE S256 is used on both the broker's Google client and
the BYO Desktop client.

Override the broker URL with `SEAN_OAUTH_BROKER_URL`.

Do **not** leave a Cloud project in Testing: refresh tokens expire after 7
days and silently kill a 24/7 agent. Unverified apps are hard-capped at 100
lifetime users.

## Bring your own Google Cloud project

Self-hosters who want zero dependency on our broker (and their own quota:
30M GSC QPD, 25k PSI/day, 150 CrUX QPM) create a Desktop app client.

1. `console.cloud.google.com` → create a project.
2. Enable **Search Console API**, **Google Analytics Data API**, **Google
   Analytics Admin API**, **Site Verification API**, **PageSpeed Insights
   API**, **Chrome UX Report API**.
3. Google Auth Platform → Branding: any name, your email, your homepage.
4. Audience → External → **Publish app**. Publishing kills the 7-day token
   expiry. It does **not** remove the unverified warning.
5. Data Access → add `webmasters`, `analytics.readonly`, `siteverification`.
6. Credentials → OAuth client ID → **Desktop app**. Download JSON.
7. Credentials → API key for PageSpeed Insights + CrUX.
8. `sean connect google --byo --credentials ./client_secret.json --api-key AIza…`
9. In the browser click **Advanced → Go to Agent Sean (unsafe)**. That
   warning is expected and permanent for a personal-use unverified client.

Environment variables `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_API_KEY` are also accepted.

## Site Verification

Sean can create **and verify** a Search Console property through the Site
Verification API (`POST /siteVerification/v1/token` then `POST /webResource`)
via `META`, `FILE`, `ANALYTICS`, `TAG_MANAGER` or `DNS_TXT`. The user never
opens a Google console. After verification Sean `PUT`s the GSC site.

## Quotas Sean designs against

| API | Limit |
| --- | --- |
| GSC Search Analytics | 25,000 rows/request, 1,200 QPM/site, 16-month window. Load quota is unpublished — on 429 wait ~15 minutes and prefer month-sized chunks. |
| GSC URL Inspection | **2,000 QPD/site**, 600 QPM. Per-URL daily checks are impossible at scale. Remaining budget is shown. |
| GA4 Data API | 14,000 tokens/hour per project-per-property |
| PageSpeed Insights | 25,000/day. Never run inside a page render. |
| CrUX | 150 QPM per Cloud project — **cannot be purchased**. URL-level 404 is "insufficient traffic", not an error; we fall back to origin. |
| Indexing API | 200/day, `JobPosting` + `BroadcastEvent` only. Not called in Phase 2. |

## Reconciliation

GSC clicks and GA4 Google-organic sessions are stored side by side. The
**residual** is `GA4 organic sessions − GSC clicks`. They will not match
(sessions vs clicks, attribution, consent mode, bot filtering). The residual
is the explicit gap, annotated with overlapping rows from
`https://status.search.google.com/incidents.json` (Atom feed fallback).
Incidents.json only returns the 10 most recent rows, so Sean upserts daily
and seeds curated confounders (impressions bug, `&num=100`, 2025–2026 core
and spam updates) on first sync.

## Scopes

First connect asks for `webmasters` (read + sitemap submit / property add),
`analytics.readonly`, and `siteverification`. `business.manage` waits for
Phase 9. No Gmail, Drive, or restricted scopes, ever.
