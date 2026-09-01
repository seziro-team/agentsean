# Namespace claims

"Sean" is a common first name, so short social handles are mostly taken by
actual Seans. `agentsean` is the consistent handle to claim everywhere.

| Surface | Target | Status (2026-09-02) |
| --- | --- | --- |
| GitHub repo | [`seziro-team/agentsean`](https://github.com/seziro-team/agentsean) | **Live.** Canonical source. |
| npm package | `agentsean` | **Claimed.** Published from CI with Sigstore provenance. |
| npm scope | `@agentsean/*` | **Claimed.** Workspace packages publish under it. |
| Domain | `agentsean.com` | **Available.** Primary. Needed for the Google OAuth consent screen. |
| Domain | `agentsean.dev` / `.ai` / `.io` | **Available.** Defensive registrations. |
| Website | `seziro-team.github.io/agentsean` | **Live** on GitHub Pages until the domain resolves. |
| Discord | `agentsean` | Not claimed. |
| X | `@agentsean` | Not claimed. Fallbacks: `@agentseanapp`, `@seziro`. |
| WordPress.org plugin slug | `agent-sean-bridge` | Not submitted. See [`docs/launch/wordpress-directory.md`](launch/wordpress-directory.md). |

## Remaining manual steps

These need a browser session and cannot be done from CI.

1. **Register `agentsean.com`.** Point `CNAME` at `seziro-team.github.io` (or
   the app host). Add the domain in **Settings → Pages → Custom domain** and
   enable *Enforce HTTPS*. The `web/CNAME` file is already staged for this.
2. **Provision mail** on the domain: `security@`, `privacy@`, `conduct@`,
   `sales@`, `support@`. `SECURITY.md`, `CODE_OF_CONDUCT.md`, and the privacy
   policy reference these; GitHub Security Advisories is the working channel
   until they resolve.
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
