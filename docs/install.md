# Install

> **`npx agentsean` runs the package once and does *not* put `sean` on your
> PATH.** That is npx working as designed — it resolves the package into a temp
> directory, runs it, and leaves nothing behind. For a persistent `sean`
> command use `npm install -g agentsean`, the curl installer, or Homebrew.
> Otherwise prefix everything: `npx agentsean doctor`.

Phase 11. The growth lever is the one-liner, not the license.

```bash
npx agentsean
```

That is the canonical command. It provisions on **first run**, not at `npm install`. npm v12 (~2026-07-08) disables `preinstall` / `install` / `postinstall` by default; a postinstall-based installer silently breaks.

Other paths:

```bash
# curl | sh (macOS / Linux / WSL2) — read install/install.sh first
curl -fsSL https://raw.githubusercontent.com/seziro-team/agentsean/main/install/install.sh | sh

# Windows
irm https://raw.githubusercontent.com/seziro-team/agentsean/main/install/install.ps1 | iex

# Homebrew (from this repo until bottled)
brew install --build-from-source ./Formula/agentsean.rb

# Docker — token required, published on loopback only
SEAN_AUTH_TOKEN="$(openssl rand -base64 32)" docker compose up
```

Requires **Node.js ≥ 22.19** if you skip the curl installer. The curl/PowerShell installers download an official Node tarball into `~/.sean/runtime` when PATH is too old.

## First run

```bash
sean                  # onboard: URL, CMS, Google?, telemetry?
sean doctor           # runtime, port, token entropy, Google grant, Playwright
sean service install  # opt-in. Prints the exact unit file it will write.
sean uninstall        # stop + remove the unit. --purge deletes ~/.sean
sean update           # dist-tags latest / extended-stable / beta
```

Service install is **never** a side effect of npm or onboard. That is both a trust issue and the WordPress/Wix marketplace rule against undeclared background services.

Chromium is **not** downloaded at install. The crawler fetches Playwright lazily on the first JS-heavy page.

## Docker rules

The image binds `0.0.0.0` *inside* the container so `-p` works. `docker-compose.yml` publishes `127.0.0.1:7777:7777`. The entrypoint **exits 1** if `SEAN_AUTH_TOKEN` is missing or shorter than 32 characters. A one-character token is how OpenClaw instances became brute-forceable in 2026.

## npm 12

`package.json` has no `preinstall` / `install` / `postinstall`. You do **not** need `--allow-scripts=agentsean`. If a future native dep requires a build, document `--allow-scripts=agentsean` — do not add a silent postinstall.
