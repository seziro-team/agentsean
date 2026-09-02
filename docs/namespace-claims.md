# Namespace claims

"Sean" is a common first name, so short social handles are mostly taken by
actual Seans. `agentsean` is the consistent handle to claim everywhere.

| Surface | Target | Status (2026-09-02) |
| --- | --- | --- |
| GitHub repo | [`seziro-team/agentsean`](https://github.com/seziro-team/agentsean) | **Live.** Canonical source. |
| npm package | `agentsean` | **Claimed.** Published from CI with Sigstore provenance. |
| npm scope | `@agentsean/*` | **Claimed.** Workspace packages publish under it. |
| Domain | `agentsean.dev` | **Registered.** Primary. Used by the OAuth consent screen. |
| Subdomain | `app.agentsean.dev` | Cloud control plane. Polar webhook target. |
| Subdomain | `oauth.agentsean.dev` | First-party Google OAuth broker. |
| Website | `agentsean.dev` | **Live** on GitHub Pages via `web/CNAME`. |
| Billing | Polar org `agentsean` | **Active.** Four products, webhook live. |
| Discord | `agentsean` | Not claimed. |
| X | `@agentsean` | Not claimed. Fallbacks: `@agentseanapp`, `@seziro`. |
| WordPress.org plugin slug | `agent-sean-bridge` | Not submitted. See [`docs/launch/wordpress-directory.md`](launch/wordpress-directory.md). |

## Remaining manual steps

These need a browser session and cannot be done from CI.

1. **Point DNS at GitHub Pages.** Apex `A`/`AAAA` records plus a `www` CNAME —
   the exact values are in [`GO-LIVE.md`](GO-LIVE.md). Then Settings → Pages →
   Custom domain → *Enforce HTTPS*. `web/CNAME` is committed.
2. **Provision mail**: `support@agentsean.dev` and `noreply@agentsean.dev`, with
   SPF, DKIM and DMARC. GitHub Security Advisories remains the vulnerability
   channel regardless.
3. **Google Cloud OAuth** — see [`docs/oauth-verification.md`](oauth-verification.md).
   The consent screen requires a verified domain, a homepage, and a hosted
   privacy policy, all of which depend on step 1.
4. **Discord + X.** Optional at launch; the GitHub Discussions board is the
   primary community surface.

## Optional: move to a dedicated org

The repo currently lives on the `seziro-team` account. If you later create a
GitHub organization (`agentsean` or `seanhq`), transferring the repo preserves
stars, issues, and forks, and GitHub serves permanent redirects from the old
path — so existing clones and the `curl | sh` installer keep working. Update
afterwards: `README.md` badges, `package.json` `repository` fields, the CLA bot
`path-to-document`, the crawler user-agent in `packages/crawler/src/ua.ts`, and
`Formula/agentsean.rb`.
