# Day-0 clock: Google OAuth sensitive-scope verification

**Start this before writing feature code.** Google's stated turnaround is 3–5
business days. 2026 developer-forum threads show **33 to 86+ days** with no
Trust & Safety contact. Submit once, with the full 12-month scope set, so we
never re-enter the queue.

These scopes are **sensitive, not restricted**. Restricted is Gmail, Drive, Fit,
Chat, Data Portability, Photos Ambient, Health. We are **not** on that list, so
verification is **free**, with **no CASA assessment** and **no annual
re-verification**.

## Cloud project

Create a Google Cloud project owned by the `seanhq` organization (or the
personal account that currently owns this repo, then transfer).

App type for the OSS daemon: **Desktop app** + **Web application**.

- Desktop: RFC 8252 loopback redirect
  `http://127.0.0.1:<ephemeral>/oauth/callback` — the IP literal, **not**
  `localhost`. PKCE S256. OS-assigned ephemeral port.
- Web: the hosted broker on `agentsean.com` (Phase 2). **Never ship
  `client_id` / `client_secret` in this repository.** Google APIs ToS §4(b)
  forbids it verbatim.

Self-hosters who do not want our broker create their own Cloud project. That
escape hatch is documented in [`docs/google.md`](google.md); the verification
we submit is for the first-party broker.

The broker is **stateless**. It holds `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
in the hosted environment only, encrypts the refresh token with a wrap key the
local daemon generated, and 302s to `http://127.0.0.1:<port>/oauth/callback`.
The hosted origin never fetches the daemon.

## Full 12-month scope set — declare at once

| Scope | Why |
| --- | --- |
| `https://www.googleapis.com/auth/webmasters.readonly` | GSC Search Analytics, URL Inspection |
| `https://www.googleapis.com/auth/webmasters` | sitemap submit/delete (one of two Google write APIs) |
| `https://www.googleapis.com/auth/analytics.readonly` | GA4 Data API |
| `https://www.googleapis.com/auth/siteverification` | Search Console property verification |
| `https://www.googleapis.com/auth/business.manage` | Google Business Profile (local SEO, Phase 9) |

Do **not** request Gmail, Drive, or any restricted scope. Do not request
`adwords` or Indexing API until we actually ship those (Indexing API is
contractually JobPosting/BroadcastEvent only).

## Submission checklist

- [ ] Cloud project created
- [ ] OAuth consent screen: External, app name **Agent Sean**, support email,
      logo, privacy policy URL, TOS URL, authorized domains `agentsean.com`
- [ ] Brand verification (domain + homepage)
- [ ] All five scopes listed above added **in the same submission**
- [ ] Scope justification written per scope (what data, why, how displayed)
- [ ] Demo video recorded (YouTube unlisted): install → connect GSC → see
      read-only numbers. Do not show writes in the verification video.
- [ ] Homepage, privacy policy, and TOS are publicly reachable
- [ ] Submit for verification
- [ ] Record the submission date and case ID in this file

**Submitted:** _not yet — blocked on `agentsean.com` and the Cloud project._
**Case ID:** —
**Submitted by:** —
**Date:** —

Privacy / TOS drafts for the consent screen (serve them on the domain once it
exists): [`web/privacy.html`](../web/privacy.html), [`web/tos.html`](../web/tos.html).

Until the domain is live, the consent-screen URLs cannot be filled. Create the
Cloud project and the draft consent screen today anyway; the queue does not
start until Submit. BYO remains the OSS path: `sean connect google --byo`.

## BYO-project escape hatch (always)

Self-hosters can paste their own `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
into the local daemon. They stay under their own 100-user unverified cap
forever (they are 1 user) and click through the unverified warning. This is
the path that keeps OSS usable if verification stalls at day 86.
