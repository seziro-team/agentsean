# Go live

Code for Phases 0–11 is on local `main`. These four steps need **your** browser. I cannot finish them from this token.

## 1. Push the repo (blocked on `workflow` scope)

```bash
gh auth refresh -h github.com -s workflow,repo,read:org,gist
git push origin main
gh release create 2026.9.0 docs/assets/demo/sean-demo.mp4 --title "2026.9.0" --notes "Agent Sean — npx agentsean. Diff, revert, freeze."
```

GitHub currently has only Phase 0 (`3e966cd`). Local `main` is 5 commits ahead, including `.github/workflows/ci.yml`.

## 2. Google OAuth verification

Blocked on `agentsean.com` (consent-screen URLs) and a Cloud project. Checklist: [`oauth-verification.md`](oauth-verification.md). Privacy and TOS pages for that screen: `web/privacy.html`, `web/tos.html`. Until Submit, self-hosters use:

```bash
sean connect google --byo --credentials ./client_secret.json
```

## 3. npm

Not logged in on this machine (`npm whoami` → ENEEDAUTH). After `npm login`:

```bash
npm org create agentsean   # if the org does not exist
# then publish workspace packages; npx agentsean needs @agentsean/* on the registry
# or wait and publish a bundled tarball
```

Do not publish until `git push` is green on CI.

## 4. Show HN / Reddit

Copy is ready in [`docs/launch/`](launch/). Post from your account after the GitHub repo shows Phase 11. Sit in the thread.

## Demo

[`docs/assets/demo/sean-demo.mp4`](assets/demo/sean-demo.mp4) — 46s, 1280×720. Finding → diff → Revert. Host as the Release asset after step 1. A live-site recording with a real revert click is still better; this is the shippable stand-in.
