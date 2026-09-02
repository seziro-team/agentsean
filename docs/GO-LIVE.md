# Go live

State as of 2026-09-02.

## Live

| | Where | State |
| --- | --- | --- |
| Public repo | [`seziro-team/agentsean`](https://github.com/seziro-team/agentsean) | AGPL-3.0, 20 topics, Discussions |
| npm | [`agentsean`](https://www.npmjs.com/package/agentsean) + 25 `@agentsean/*` | `1.0.4`, verified by a clean-room `npx` install |
| Release | [`v1.0.4`](https://github.com/seziro-team/agentsean/releases/tag/v1.0.4) | notes, install matrix |
| Site | [`agentsean.dev`](https://agentsean.dev) | GitHub Pages; DNS live, deploy gated on a link check |
| DNS + mail | Hostinger | apex → Pages; MX/SPF/DKIM/DMARC intact |
| CI | Node 22/24 × Linux/macOS/Windows | green |
| Security | CodeQL · Scorecard · dependency review · Dependabot | 0 open Dependabot alerts |
| Supply chain | Actions + base image pinned by digest, workflow token read-only | branch protection on `main` |
| **Billing** | Polar org `agentsean` | **active**, webhook live, Cloud + Team products |
| Cloud control plane | `apps/cloud` | builds with an empty env; **not yet deployed** |

`npx agentsean audit https://example.com` works from a cold cache with no
account and no credentials. That is the check that gates a release — see
`packages/launch/src/packaging.test.ts`.

## Billing — configured

Polar organization `agentsean` (Prajura Consultancy Services), id
`344b820a-c9ac-4eb7-9558-09d59a5a5f1b`, status **active**.

| Plan | Product id | Price |
| --- | --- | --- |
| `cloud_starter` | `c1e5161e-82c8-4846-b9fb-4fe2c87d2be1` | $9/mo (+ ₹799/mo) |
| `team` | `d97329d1-308f-492e-b141-7ece9d43044a` | $14.99/mo, up to 25 sites |
| `enterprise` | — | quoted, never listed |

Cloud Pro, Business and Agency are **archived** in Polar — the four-rung ladder
collapsed to one Team tier.

Those two product ids are live, not placeholders. Checked against the Polar API
on 2026-09-02: `c1e5161e…` is "Agent Sean" with prices 900 and 79900, and
`d97329d1…` is "Agent Sean — Team" at 1499, which is the flat $14.99 the
pricing page shows. They are also what `POLAR_PRODUCTS_JSON` ships with in
`apps/cloud/.env.example`, so a deploy that reads that file is already mapped.
Worth stating because they look like sample UUIDs and had been assumed to be.

**Checkout metadata does reach the webhook.** Plan activation depends entirely
on it — `createCheckout` writes `{tenantId, planId}` into the checkout and
`normalizeEvent` reads them back off the subscription event — so if it did not
propagate, a customer would pay and stay on free. Polar's own documentation
states: "Metadata set on the link is copied to the generated Checkout Session,
and propagates to the resulting Order and/or Subscription on success." A live
checkout created against the production org on 2026-09-02 confirmed the session
stores and echoes the metadata verbatim.

The one thing still unproven is the last hop, session → subscription, on a
*completed* payment; nobody has paid yet. The first real subscription is worth
watching: if `tenants.plan` does not move, look for a `billing_events` row with
`applied_at` null and note "no tenant resolved".

Webhook: `https://app.agentsean.dev/api/webhooks/billing`, format **raw**, all
events subscribed. The handler acts on eight of them and records the rest.

## Still needs you

### 1. Rotate the credentials that went through chat

Four secrets were pasted into a transcript. Treat all four as compromised:

| Credential | Where to rotate |
| --- | --- |
| GitHub PAT | Settings → Developer settings → Tokens |
| npm token | npmjs.com → Access Tokens → then update the `NPM_TOKEN` repo secret |
| Google **web** client secret | Cloud Console → Credentials → reset secret |
| Google **desktop** client secret | Cloud Console → Credentials → reset secret |

Client **IDs** are public and safe. The Polar token is a live all-access org
token — rotate it too once the app is deployed and reading it from env.

### 2. DNS and mail — done

`agentsean.dev` resolves to GitHub Pages. Set via the Hostinger API:

```
A      @      185.199.108-111.153        (GitHub Pages)
AAAA   @      2606:50c0:800{0..3}::153
CNAME  www    seziro-team.github.io.
CNAME  app    cname.vercel-dns.com.      (cloud app, once deployed)
CNAME  oauth  cname.vercel-dns.com.      (OAuth broker)
```

The Hostinger `ALIAS @` and its `www` CNAME were removed — an ALIAS on the apex
conflicts with the `A` records Pages needs. **Mail was left untouched and
verified after every step**: MX, SPF, all three DKIM CNAMEs, DMARC,
autoconfig and autodiscover are intact, so `support@` and `noreply@` keep
working.

Remaining: repo → **Settings → Pages** → confirm the custom domain validates,
then tick **Enforce HTTPS**. DMARC is currently `p=none` (monitor only);
consider `p=quarantine` with a `rua=` reporting address once you have seen a
week of reports.

### 4. Google OAuth

Both clients exist. Two things remain:

- **The consent screen is in Testing.** Only listed test users can authenticate.
  Publish it, then submit for verification — three sensitive scopes
  (`webmasters`, `analytics.readonly`, `siteverification`) mean review is
  mandatory. Observed times run 33–86 days.
- **Redirect URIs** on the web client must be exactly:
  `https://oauth.agentsean.dev/google/callback` and
  `https://app.agentsean.dev/auth/callback`.

The desktop client needs no secret in the app — it uses PKCE (S256), which is
why `packages/google/src/oauth-desktop.ts` implements the challenge itself.
Until verification lands, self-hosters use their own project:

```bash
sean connect google --byo --credentials ./client_secret.json
```

### 5. Deploy the cloud app

```bash
supabase db push                    # migrations 0001..0003
cd apps/cloud && vercel deploy      # then add the domain app.agentsean.dev
```

Set `SUPERADMIN_EMAILS` to your address **before** first login — that is what
bootstraps the super-admin. Everything else degrades to a visible
"not configured" banner, so a partial environment is fine.

### 6. Tighten branch protection

`main` blocks force pushes and deletion. Required status checks and mandatory
review are off, because required checks block direct pushes until the checks
pass for that exact commit. Turn both on once you stop pushing to `main`
directly: Settings → Branches → `main`.

### 7. Optional

- **Social preview image** — `web/assets/social.png` is correct; GitHub has no
  API for it, so set it at Settings → General → Social preview.
- **A dedicated org** — transferring the repo preserves stars, issues and forks,
  and GitHub serves permanent redirects, so clones and the installer keep
  working.
- **Launch posts** — drafts in [`launch/`](launch/): Show HN, Reddit, social,
  WordPress.org directory.
