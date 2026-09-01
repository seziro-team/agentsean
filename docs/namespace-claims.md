# Day-0 clock: namespace claims

Claim these before the name leaks. "Sean" is a common first name; short social
handles are taken by actual Seans. `agentsean` and `seanhq` are the consistent
pair.

| Surface | Target | Status (2026-09-01) |
| --- | --- | --- |
| GitHub repo | `github.com/seanhq/sean` | **Parked at [`vp2722/sean`](https://github.com/vp2722/sean).** Org `seanhq` does not exist yet; creating a GitHub org requires a browser session and cannot be done with the current `repo`/`read:org` token. Transfer the repo after the org is created. |
| GitHub org | `seanhq` | **Not created.** Do this in the GitHub UI. |
| npm package | `agentsean` | **Name is free** (registry 404). Needs an npmjs.com login to publish / reserve. Do not publish until Phase 0 CI is green on this commit. |
| npm org | `@agentsean/*` | **Not created.** `npm org create agentsean` after login. Packages: `@agentsean/daemon`, `@agentsean/db`, `@agentsean/credentials`, `@agentsean/ee`. |
| Domain | `agentsean.com` | **Not registered.** Needed for OAuth consent screen. |
| Domain | `agentsean.ai` | **Not registered.** |
| Domain | `seanhq.com` | **Not registered.** |
| Discord | `agentsean` / `seanhq` | **Not claimed.** |
| X | `@agentsean` / `@seanhq` | **Not claimed.** Short handles are likely taken; `agentsean` is the one to try. |

## After you have a browser session

1. Create GitHub org `seanhq` (free plan is enough). Transfer `vp2722/sean` to
   `seanhq/sean`. Update README, CLA bot `path-to-document`, and npm
   `repository` fields.
2. `npm login` → `npm org create agentsean` → publish nothing yet, or publish
   `agentsean@0.0.0` with `"private": false` and a placeholder README to hold
   the name. Prefer waiting for a real `0.0.1` that runs `npx agentsean start`.
3. Register `agentsean.com` (primary), then `agentsean.ai` and `seanhq.com`.
   Point A/AAAA at a placeholder, serve the privacy policy + TOS the OAuth
   consent screen needs.
4. Create Discord server `Agent Sean`, vanity if eligible.
5. Claim X `@agentsean`. If taken, `@seanhq` then `@agentseanapp`.

Update the table above when each row flips.
