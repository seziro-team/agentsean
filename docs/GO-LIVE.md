# Go live

What is already live, and the short list that still needs a human with a browser
and a credit card.

Last updated 2026-09-02.

## Done

| | Where | State |
| --- | --- | --- |
| Public repo | [`seziro-team/agentsean`](https://github.com/seziro-team/agentsean) | AGPL-3.0, 20 topics, Discussions on |
| npm | [`agentsean`](https://www.npmjs.com/package/agentsean) + 25 `@agentsean/*` | `1.0.4`, verified by a clean-room `npx` install |
| Release | [`v1.0.4`](https://github.com/seziro-team/agentsean/releases/tag/v1.0.4) | notes, install matrix, known issues |
| Site | `seziro-team.github.io/agentsean` | GitHub Pages, deploy gated on a link check |
| CI | Node 22/24 × Linux/macOS/Windows | green |
| Security | CodeQL, OSSF Scorecard, dependency review, Dependabot | 0 open Dependabot alerts |
| Supply chain | Actions pinned by SHA, workflow token read-only | branch protection on `main` |
| Cloud control plane | `apps/cloud` | builds with an empty environment; not deployed |

`npx agentsean audit https://example.com` works from a cold cache with no
account and no credentials. That is the check that gates a release — see
`packages/launch/src/packaging.test.ts` for the guards that keep it working.

## Still needs you

### 1. Rotate the credentials — do this first

The GitHub PAT and the npm token used to publish were both pasted into a chat
transcript. Treat them as compromised.

- GitHub → Settings → Developer settings → Tokens → revoke, reissue
- npm → Access Tokens → revoke, reissue → update the `NPM_TOKEN` repo secret

The npm token is stored as an encrypted GitHub Actions secret so releases can
publish with Sigstore provenance. Replacing it there is enough; nothing else
reads it.

### 2. Buy the domain

`agentsean.com`, `.dev`, `.io`, and `.ai` were all available as of 2026-09-02.
`agentsean.com` is the one the OAuth consent screen needs.

After registering:

1. `CNAME` → `seziro-team.github.io`
2. Repo → Settings → Pages → Custom domain → enforce HTTPS
3. Update `web/index.html`'s canonical link and the `homepage` field on the repo

### 3. Provision mail

`security@`, `privacy@`, `conduct@`, `sales@`, `support@`. These are referenced
by `SECURITY.md`, `CODE_OF_CONDUCT.md`, the privacy policy, and the pricing
page. Until they resolve, GitHub Security Advisories is the working channel for
vulnerabilities and Discussions for everything else.

### 4. Billing — Polar

Reasoning and the rejected alternatives are in [`billing.md`](billing.md). The
short version: Stripe Payments has been invite-only for new India-domiciled
merchants since May 2024, Polar settles INR to an Indian bank, and Polar's
Stripe Connect Express dependency is a different product that *is* available in
India.

1. Create a Polar organization and complete KYC. **Budget up to 14 days** before
   the first payout clears — start this early.
2. Create one product per plan; record the price ids.
3. Fill the `POLAR_*` variables in `apps/cloud/.env.example`.
4. Paste the webhook URL (`/api/webhooks/billing`) into the Polar dashboard and
   store the signing secret.

Paddle is implemented as a drop-in fallback behind the same interface if Polar
declines the account: set `BILLING_PROVIDER=paddle`.

### 5. Deploy the cloud app

Needs a Supabase project and a host (Vercel is the obvious one).

```bash
supabase db push          # applies supabase/migrations/0001..0003
vercel deploy             # from apps/cloud
```

Set `SUPERADMIN_EMAILS` to your address before first login — that is what
bootstraps the super-admin. Everything else degrades to a visible
"not configured" banner, so you can deploy with a partial environment and fill
it in as you go.

### 6. Google OAuth verification

Blocked on step 2 — the consent screen needs a verified domain, a homepage, and
a hosted privacy policy. Checklist in
[`oauth-verification.md`](oauth-verification.md). Observed verification times
run 33–86 days, so submit as soon as the domain resolves.

Until then, self-hosters use their own Cloud project:

```bash
sean connect google --byo --credentials ./client_secret.json
```

### 7. Tighten branch protection once the launch settles

`main` currently blocks force pushes and deletion. Required status checks and
mandatory review are deliberately off, because required checks block direct
pushes until the checks pass for that exact commit. Turn both on when you stop
pushing straight to `main`:

Settings → Branches → `main` → require a pull request, require the `CI` status
check.

### 8. Optional

- **Social preview image.** `web/assets/social.png` is generated and correct;
  GitHub's social-preview upload has no API, so set it at
  Settings → General → Social preview.
- **A dedicated org.** Transferring `seziro-team/agentsean` to an `agentsean`
  org preserves stars, issues, and forks, and GitHub serves permanent
  redirects — so clones and the `curl | sh` installer keep working. Update the
  README badges, `package.json` `repository` fields, the CLA bot's
  `path-to-document`, `packages/crawler/src/ua.ts`, and `Formula/agentsean.rb`.
- **Launch posts.** Drafts are in [`launch/`](launch/): Show HN, Reddit, social,
  and the WordPress.org directory submission.
