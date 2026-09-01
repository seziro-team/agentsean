# 12 — Open-Source Distribution, Packaging, Licensing & Monetization Playbook

**Research date:** 2026-08-31 / 2026-09-01
**Purpose:** Define how our self-hostable, autonomous SEO-engineer agent should ship, license, and monetize, by copying what demonstrably works in the 2025–2026 OSS AI agent market.
**Freshness policy:** Everything below is 2025–2026 unless explicitly marked `[STALE-RISK: pre-2025]`.

---

## 0. TL;DR — The Opinionated Recommendation (details in §8)

| Decision | Recommendation | Why |
|---|---|---|
| **License (core)** | **AGPL-3.0-only + a Contributor License Agreement (CLA) that grants us relicensing rights**, with a `packages/ee/` directory under a separate commercial license | OSI-approved (keeps "real open source" credibility, unlike SSPL/Dify-style). **Be precise about what AGPL does and does not do:** it contains *no* anti-reselling clause — §4 expressly permits charging any price, and a competitor may host a modified fork commercially provided they offer the corresponding source to their remote users. The real moat is the `packages/ee/` tier + trademark; AGPL complements it, it does not provide it. CLA preserves our right to dual-license and to move to FSL later. Exact pattern used by Metabase, Grafana, Windmill, and (until Apr 2026) Cal.com. |
| **License (fallback if we want maximum anti-compete)** | FSL-1.1-Apache-2.0 (Sentry's license) | 2-year non-compete then auto-converts to Apache-2.0. **This is the only option on the table that actually bars a competing hosted service** — but you lose "open source" as a word and get HN friction. If the requirement is literally "a competitor may not offer this as a competing hosted service," AGPL does not deliver it and FSL does. |
| **Primary install** | `curl -fsSL https://get.<ourdomain>/install.sh \| sh` (+ PowerShell one-liner + `npm i -g` + Docker) — **bundle our own Node runtime; never require the user to have the right Node** | OpenClaw's exact stack, and it produced 3.37M npm downloads/week and 388k stars. |
| **Dashboard binding** | `127.0.0.1:` fixed port, **auth required by default, fail-closed**, token auto-generated at onboarding, Tailscale Serve as the blessed remote path | Direct lesson from the 2026 OpenClaw exposure crisis (§3) and Langflow CVE-2025-3248 (CISA KEV). |
| **Telemetry** | **Opt-out but with an explicit first-run consent screen and a printed payload preview**; honor `DO_NOT_TRACK=1` | AnythingLLM's model works and is uncontroversial; GitHub CLI's silent opt-out in Apr 2026 caused a 419-point HN pile-on (§6.5). |
| **Price ladder** | Free self-host → **$8/mo Solo (1 site)** → $29/mo Pro (5 sites, agency-lite) → $99+/mo Agency/Team → Enterprise (SSO/audit) | $8 is below every comparable OSS-cloud entry point (Plausible $9, Umami/Dify/n8n all higher). It buys land-grab but see §5.4 — model for **~0.02–1% self-host→paid conversion**, not the 1–3% SaaS free-trial band (self-host installs have no signup, no telemetry-linked identity and no payment rail; GitLab converts ~0.02% of registered users to >$5k-ARR customers). |
| **Versioning** | **CalVer `YYYY.M.PATCH`** with `latest` / `beta` / `extended-stable` npm dist-tags | Exactly OpenClaw's scheme; signals fast movement and avoids SemVer-major anxiety in a product that changes weekly. |

---

## 1. The Landscape — Hard Numbers (GitHub REST API, accessed 2026-08-31)

All figures pulled directly from `https://api.github.com/repos/{owner}/{repo}` on 2026-08-31, not from blogs.

| Project | Stars | Forks | License (SPDX / actual) | Repo created | Last push |
|---|---:|---:|---|---|---|
| `openclaw/openclaw` | **388,258** | 81,512 | MIT (LICENSE file verbatim: "MIT License / Copyright (c) 2026 OpenClaw Foundation") | 2025-11-24 | 2026-08-31 |
| `anomalyco/opencode` (was `sst/opencode`) | 202,789 | 26,382 | MIT | 2025-04-30 | — |
| `n8n-io/n8n` | **202,959** | 60,472 | **Sustainable Use License** (`SEE LICENSE IN LICENSE.md`) | 2019-06-22 | 2026-08-31 |
| `firecrawl/firecrawl` | 174,758 | 9,605 | AGPL-3.0 | 2024-04-15 | — |
| `langgenius/dify` | 154,013 | 24,336 | "Dify Open Source License" (**modified Apache-2.0** — bars multi-tenant operation + logo removal only; commercial use otherwise permitted) | 2023-04-12 | 2026-08-31 |
| `langflow-ai/langflow` | 153,983 | 9,981 | MIT | 2023-02-08 | 2026-08-31 |
| `browser-use/browser-use` | 111,840 | 12,276 | MIT | 2024-10-31 | 2026-08-31 |
| `supabase/supabase` | 108,648 | 13,685 | Apache-2.0 | 2019-10-12 | 2026-08-31 |
| `OpenHands/OpenHands` | 85,757 | 11,239 | MIT | 2024-03-13 | — |
| `grafana/grafana` | 76,535 | 14,675 | AGPL-3.0 | 2013-12-11 | 2026-08-31 |
| `cline/cline` | 67,232 | 7,261 | Apache-2.0 | 2024-07-06 | 2026-08-31 |
| `Mintplex-Labs/anything-llm` | 65,431 | 7,225 | MIT | 2023-06-04 | 2026-08-31 |
| `FlowiseAI/Flowise` | 55,400 | 24,970 | Apache-2.0 + commercial `packages/server/src/enterprise/` | 2023-03-31 | 2026-08-13 |
| `aaif-goose/goose` (was `block/goose`) | 53,747 | 6,156 | Apache-2.0 | 2024-08-23 | — |
| `metabase/metabase` | 49,021 | 6,777 | AGPL + Metabase Commercial License (`enterprise/`) | 2015-02-02 | 2026-08-31 |
| `Aider-AI/aider` | 48,628 | 4,908 | Apache-2.0 | 2023-05-09 | **2026-05-22** (stalled ~3mo) |
| `calcom/cal.diy` (was `calcom/cal.com`) | 48,052 | 14,966 | **MIT** (relicensed Apr 2026, see §4.6) | 2021-03-22 | — |
| `getsentry/sentry` | 44,693 | 4,831 | **FSL-1.1-Apache-2.0** | 2010-08-30 | 2026-08-31 |
| `danny-avila/LibreChat` | 42,662 | 8,832 | MIT | 2023-02-12 | 2026-08-31 |
| `PostHog/posthog` | 39,498 | 3,322 | MIT + `ee/` commercial | 2020-01-23 | 2026-08-31 |
| `umami-software/umami` | 38,471 | 7,900 | MIT | 2020-07-17 | 2026-08-27 |
| `continuedev/continue` | 35,713 | 5,314 | Apache-2.0 | 2023-05-24 | 2026-08-31 |
| `plausible/analytics` | 28,814 | 1,828 | AGPL-3.0 | 2018-12-04 | 2026-08-31 |
| `RooCodeInc/Roo-Code` | 24,319 | 3,412 | Apache-2.0 | 2024-10-31 | — |
| `activepieces/activepieces` | 24,149 | 4,120 | MIT + `packages/ee/` commercial | 2022-12-03 | 2026-08-31 |
| `windmill-labs/windmill` | 17,738 | 1,090 | AGPL-3.0 + Apache-2.0 + proprietary EE | 2022-05-05 | 2026-08-31 |

**npm weekly downloads (npm registry API, week of 2026-08-23 → 2026-08-29):**

| Package | Downloads/week |
|---|---:|
| `openclaw` | **3,373,959** |
| `n8n` | 94,686 |
| `flowise` | 2,728 |
| `langflow` | 10 (PyPI is its real channel) |

**Read this table for signal, not vanity:**
1. **Stars ≠ usage.** n8n has 203k stars but 95k npm downloads/week — because its real distribution is Docker + cloud. OpenClaw has 388k stars and 3.37M npm downloads/week — because npm *is* its install path. **Whatever channel your one-liner uses becomes your measurable adoption metric.** Pick one and instrument it.
2. **Forks/stars ratio is a "did people actually deploy this" proxy.** Flowise 0.45, n8n 0.30, cal.diy 0.31, OpenClaw 0.21 (fork-to-deploy), vs Plausible 0.06, Windmill 0.06. High fork ratio = template/self-host culture. We should expect and design for a high fork ratio (people will fork to add their CMS).
3. **Restrictive licenses did not stop adoption — but this is a weak, n=2 observation, not a finding.** The two biggest non-coding-agent projects in the table (n8n at 203k stars, Dify at 154k) both use *non-OSI* licenses. **Do not read them as two instances of the same policy:** n8n's SUL bans commercial use outright except internal business purposes and permits distribution only free of charge for non-commercial purposes; Dify's license is a modified Apache-2.0 that bars only multi-tenant hosting and logo removal, and permits commercial use, single-tenant commercial deployment, paid redistribution and embedding. They sit at opposite ends of the restriction spectrum. Also note the internal refutation: n8n's licence has been fixed since 2022-03-17, yet it added ~17,000 stars in 2024 and >112,000 in 2025 — a ~6.5× swing with the licence held constant, which means the licence explains essentially none of the variance (the inflection tracks the AI-agent-node releases and the 2025 hype cycle). And the controlled natural experiments run the other way: Terraform MPL→BUSL (2023-08-10) produced OpenTofu within weeks; Redis BSD→RSALv2/SSPL (Mar 2024) produced Valkey on 2024-04-01 under the Linux Foundation with AWS/Google/Oracle backing, and Redis capitulated by adding AGPLv3 in Redis 8.0 (May 2025); Elasticsearch→OpenSearch is the same pattern. **The operative risk variable is not licence restrictiveness — it is whether an actor with the motive and capital to fund a credible fork exists.** n8n and Dify survived because no hyperscaler wanted their category. Stars are also a bookmarking signal, not adoption; forks largely reflect self-host/template copying.

---

## 2. Install UX Patterns — What Actually Converts

### 2.1 The four archetypes

| Pattern | Exemplars | Conversion characteristics | Failure modes |
|---|---|---|---|
| **`curl \| sh` installer script** | OpenClaw (`curl -fsSL https://openclaw.ai/install.sh \| bash`), Goose, Homebrew itself | **Highest conversion.** One line, no prerequisites, installer provisions its own runtime. | Security purists object; must be auditable and idempotent; Windows needs a separate PowerShell line. |
| **`npm i -g` / `npx`** | `npm install -g openclaw@latest`, `npx n8n` | Good for JS devs; instantly measurable via npm download API. | **Node version hell** (see §2.3); global install permission errors; postinstall-script blocking in npm 12+. |
| **Docker / Docker Compose** | n8n, Dify, LibreChat (`docker compose up -d` → `localhost:3080`), Flowise, Supabase, OpenHands | Best reproducibility; the default for "server-ish" tools. | Requires Docker Desktop on Mac/Win (a 700MB+ prerequisite); **Docker-socket mounting** (OpenHands mounts `/var/run/docker.sock`) is a hard security and DX cliff. |
| **Native desktop app** | AnythingLLM (Mac/Win/Linux download), OpenClaw "Windows Hub" app | Converts non-developers. Necessary for local-business/e-commerce SEO buyers who are not engineers. | Code-signing/notarization cost; two codebases to keep in sync. |

### 2.2 OpenClaw's install matrix — the reference implementation (docs.openclaw.ai/install, accessed 2026-08-31)

```bash
# macOS / Linux / WSL2 — recommended
curl -fsSL https://openclaw.ai/install.sh | bash
# same, skipping the interactive wizard
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
# local-prefix variant (keeps everything in ~/.openclaw)
curl -fsSL https://openclaw.ai/install-cli.sh | bash

# Windows PowerShell
iwr -useb https://openclaw.ai/install.ps1 | iex

# Package managers
npm  install -g openclaw@latest --allow-scripts=openclaw    # npm 12+
pnpm add    -g --allow-build=openclaw openclaw@latest
bun  add    -g --trust openclaw@latest

# From source
git clone … && corepack enable && pnpm install && pnpm build && pnpm ui:build
```

Post-install lifecycle commands worth cloning verbatim:

```bash
openclaw onboard --install-daemon   # wizard + install as a service
openclaw gateway install            # service only
openclaw dashboard                  # open the local web UI
openclaw --version
openclaw doctor                     # <-- self-diagnostic; huge support-cost reducer
openclaw gateway status
openclaw update --channel stable    # or --channel dev
openclaw security audit --deep      # <-- security self-check; see §3
```

Service installation is OS-native: **macOS LaunchAgent, Linux/WSL2 systemd *user* service, Windows Scheduled Task with a Startup-folder fallback.** For a "24/7 autonomous" product like ours this is non-optional — the daemon *is* the product.

### 2.3 Node version handling — the concrete trap

OpenClaw's published npm `engines` field (registry.npmjs.org/openclaw, latest `2026.8.1`, accessed 2026-08-31):

```json
"engines": { "node": ">=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0" }
```

This is an *allowlist of patched minors*, not `>=22`. n8n's latest (`2.36.9`) simply pins `"node": ">=24.0.0"`.

**Lessons:**
- Pinning to security-patched minors is now normal for agents that execute untrusted content. Do the same.
- **Do not make the user solve this.** OpenClaw's installers "automatically provision Node if missing." Ship either (a) a bundled Node in the installer, or (b) a single-file binary (Bun `--compile`, Node SEA, or Deno compile). A user who has to `nvm install 24` before they can try your product is a lost user.
- npm ≥12 blocks postinstall scripts by default; OpenClaw's documented command carries `--allow-scripts=openclaw`. If your package needs a postinstall (native deps, browser download), **you must document the flag or you will silently break installs.** Better: avoid postinstall entirely; download native assets lazily on first run.

### 2.4 Native deps & Windows

- Our tool needs a headless browser for crawling/rendering. Playwright/Chromium is ~150–400MB and is the #1 source of install failures. **Download it lazily, on first crawl, with a visible progress bar in the dashboard — not during `npm install`.**
- Windows: three supported paths, ranked — (1) native desktop app / tray, (2) PowerShell one-liner CLI, (3) WSL2. OpenClaw ships all three. For our audience (many are marketers on Windows) **the tray app matters more than for a coding agent.**
- Avoid `node-gyp`-dependent modules (better-sqlite3 native builds, canvas). Prefer WASM builds or pure-JS. If you need SQLite, use `node:sqlite` (built-in on modern Node) or a WASM build.

### 2.5 Auto-update

- OpenClaw: `openclaw update --channel stable|dev`, plus npm dist-tags `latest`, `beta`, `alpha`, and **`extended-stable`** (currently `2026.6.34` while `latest` is `2026.8.1`). The `extended-stable` channel is a smart pattern: it gives risk-averse self-hosters a slow lane without forking.
- **249 published versions between 2026-01-29 and 2026-08-31** — roughly one release per day. That cadence is a growth weapon (every release is a changelog post, a Discord ping, and a reason to re-star) but only survivable with strong CI.
- **Recommendation:** auto-update ON by default for patch releases, with `--channel stable|extended-stable|dev`, an in-dashboard "update available" banner, and a hard rule that **auto-update never runs while an autonomous action is mid-flight.**

### 2.6 Concrete install-UX checklist (implementable)

- [ ] One canonical command on the README line 1, above the fold, above the demo GIF.
- [ ] `install.sh` is idempotent, prints every step, supports `--no-onboard`, `--version=`, `--prefix=`, and exits non-zero on failure.
- [ ] `install.ps1` for Windows with the identical flag surface.
- [ ] Runtime is bundled or auto-provisioned. Zero prerequisites documented.
- [ ] `<tool> doctor` checks: runtime version, port availability, disk, write perms, browser binary, credentials validity, GSC/GA4 token freshness, outbound network.
- [ ] `<tool> --version` and `<tool> update` exist from v0.0.1.
- [ ] Service install for launchd/systemd-user/Scheduled Task in the same wizard.
- [ ] Docker Compose file in-repo that works with `docker compose up -d` and zero edits (secrets prompted in the UI, not in `.env`).
- [ ] Uninstall command that removes the daemon, not just the binary.

---

## 3. Local Dashboard Patterns & the 2026 Security Reckoning

This section is the most load-bearing for us: **our product holds Google Search Console + GA4 + CMS write credentials.** An exposed dashboard is a site-defacement and ranking-destruction event, not just a data leak.

### 3.1 What actually happened (2026) — the OpenClaw exposure crisis

- OpenClaw went from ~9,000 to >200,000 GitHub stars in weeks (Jan–Feb 2026); people deployed it on VPSes and exposed it to the internet. Its security model assumed loopback-only.
- **Censys** tracked growth from ~1,000 to **21,639 publicly exposed instances between 25 and 31 January 2026** (Censys later confirmed **63,070 live instances by 31 March 2026** via application-layer fingerprinting). **Bitsight** reported **30,000+ distinct exposed instances** over a 27 Jan – 8 Feb 2026 scan window. Higher figures (SecurityScorecard's 40,000+ then 135,000; Penligent/dev.to's 220,000+) are methodology-inflated aggregates — **do not quote a single authoritative "exposed count"; the number is method-dependent and has ranged 21K–220K.** The Jan/Feb figures are a snapshot, not a current count.
- **CVE-2026-25253 (CVSS 8.8), disclosed 2026-02-03:** WebSocket origin-validation gap → one-click RCE — if the agent visits an attacker-controlled URL, the attacker gains full admin control of the gateway.
- **Correction to the popular narrative: the exposure was *not* caused by an unauthenticated-by-default gateway, and not by the container auto-bind.** The gateway hard-refuses to bind non-loopback without auth (startup aborts with "refusing to bind gateway … without auth"), so the container `auto` switch alone cannot produce an open dashboard. Bitsight attributes the real cause to users **explicitly selecting the all-interfaces bind mode during interactive onboarding despite warnings**, compounded by (i) **no enforced password/token complexity policy** — Bitsight demonstrated that a single-character token `a` is accepted, making instances brute-forceable — and (ii) CVE-2026-25253. Read "21,639 exposed" as "reachable on 18789," not "unauthenticated."
- Early reporting that authentication was **disabled/absent by default** should be treated as unreliable. The documented posture (docs.openclaw.ai/security, accessed 2026-08-31) is:
  > "Gateway auth is required by default - with no valid auth path configured, the Gateway refuses WebSocket connections (fail-closed)."
- Additional 2026 incidents: a third-party skill performing undetected data exfiltration + prompt injection (Cisco AI security team, 2026-01-28); the "MoltMatch" incident where an agent autonomously created dating profiles; and Chinese authorities restricting state agencies and banks from running OpenClaw (March 2026).

### 3.2 The hardened OpenClaw baseline (copy this)

Default bind: **loopback**, port **18789**. Documented minimal secure config:

```json5
{
  gateway: {
    mode: "local",
    bind: "loopback",
    auth: { mode: "token", token: "your-long-random-token" }
  }
}
```

Rules from their docs, verbatim in substance:
- Onboarding **auto-generates a bearer token even for loopback** — local clients must authenticate.
- **"Never expose unauthenticated to `0.0.0.0`."**
- **Prefer Tailscale Serve** over direct LAN binds; it keeps the gateway on loopback while Tailscale does access control. `gateway.auth.allowTailscale` accepts the `tailscale-user-login` identity header (default-on for Serve deployments).
- If binding to LAN, **restrict source IPs** rather than port-forwarding broadly.
- Set `gateway.trustedProxies` behind a reverse proxy to prevent forged client headers.
- Control-UI origins are allowlisted: `gateway.controlUi.allowedOrigins` must explicitly include remote HTTPS proxy URLs.
- **Container caveat worth stealing:** the Gateway runbook (docs.openclaw.ai/gateway, and /gateway/security — *not* /security/, which only carries the loopback + fail-closed language) states verbatim: "Inside a detected container environment the effective default is `auto` (resolves to `0.0.0.0` for port-forwarding), unless Tailscale serve/funnel is active, which always forces `loopback`." Precedence is CLI/override → `gateway.bind` → `loopback` (or `auto` in containers). **⚠️ Caveat: this auto-detection has shipped unreliably and the official Docker path differs from the runbook.** docs.openclaw.ai/install/docker says `scripts/docker/setup.sh` defaults `OPENCLAW_GATEWAY_BIND=lan` (explicitly `lan`, not `auto`) and auto-generates a gateway token into `.env`; the configuration reference simultaneously tells Docker-bridge users that the loopback default makes the gateway unreachable and to set `bind: "lan"` or `--network host`. GitHub issue openclaw/openclaw#61779 (v2026.4.5/main) reported the gateway actually binding 127.0.0.1 inside a container, contradicting the documented auto-detection (closed via PR #61818); #44101 flags the docs/CLI conflict.
- **This code path is *not*, on its own, what produced mass exposure** (see §3.1) — OpenClaw already refuses to bind non-loopback without auth, and that is why the container default was not itself catastrophic. Our Docker image must do the same: **refuse to start without an auth token set.** The two controls that actually mattered and are easy to miss: **enforce token entropy/length** (a 1-character token was accepted in the wild) and **validate WebSocket `Origin` headers** (the CVE-2026-25253 class).
- Incident response is a documented, scripted flow: rotate `gateway.auth.token`, rotate remote tokens, rotate all provider credentials, re-run `openclaw security audit --deep`.

### 3.3 Langflow CVE-2025-3248 — the "it's on CISA KEV" case

- Unauthenticated RCE via **`POST /api/v1/validate/code`** in all Langflow versions **< 1.3.0**; abuses Python decorators and default arguments. **CVSS 9.8.**
- Added to the **CISA Known Exploited Vulnerabilities catalog on 2025-05-05**; used to deploy the **Flodrix botnet** (Trend Micro, June 2025).
- ~1,050 exposed Langflow instances visible on Shodan at time of reporting.
- Root cause: an endpoint that *by design* executes user-supplied code, reachable without auth, on a service people bind publicly.

**Direct read-across:** our product will have endpoints that execute code/write to a CMS. Any such endpoint must be (a) behind auth, (b) rate-limited, (c) never reachable pre-auth, and (d) covered by a fuzz/abuse test in CI.

### 3.4 Plugin/skill marketplace risk — ClawHub

- ClawHub is OpenClaw's registry for `SKILL.md`-based skills (markdown + YAML frontmatter) with **broad local system access**.
- **Koi Security documented 341 malicious skills** in its "ClawHavoc" disclosure; other reporting cites **1,103 of 14,706 skills (7.5%) confirmed malicious**, and an early-testing figure of ~17%. **The 341 figure is the best-sourced; treat the 1,184 / 7.5% / 17% figures as lower-confidence vendor claims.**
- Observed techniques (Unit 42, Feb–May 2026): macOS infostealers with C2, **22MB file padding to exceed scanner size thresholds**, runtime affiliate injection, and front-running schemes across agent networks.
- Mitigations ClawHub adopted: **VirusTotal + ClawScan integration** (Feb 2026), code-level semantic analysis for instruction hijacking, publisher verification, mandatory behavior documentation, and an NVIDIA screening partnership (announced 2026-06-01).

**Read-across for our "SEO recipes / templates" marketplace:** if we let the community publish agent skills that touch a customer's live website, we inherit this exact threat model. **Do not launch an open marketplace in v1.** Ship a curated, first-party recipe library; open it later behind signing + review + a capability manifest.

### 3.5 The dashboard-auth pattern menu

| Pattern | Who uses it | Verdict for us |
|---|---|---|
| Token in URL (`http://127.0.0.1:PORT/?token=…`) | Jupyter-style; OpenClaw prints a local URL | **Good default.** Zero-friction, no password to invent. But tokens leak via shell history, browser history, and `Referer`. Mitigate: single-use exchange — the `?token=` is swapped for an HttpOnly cookie on first load, then stripped from the URL via `history.replaceState`. |
| Bearer token in config, fail-closed | OpenClaw current | **Adopt.** Refuse to serve if no auth path is configured. |
| Local password + session cookie | n8n, LibreChat, Dify | Fine for multi-user; overkill for single-user local. Required for our hosted tier. |
| Tailscale / WireGuard identity | OpenClaw blessed path | **Adopt as the documented remote-access story.** Do not build our own tunnel in v1. |
| Cloudflare Tunnel / ngrok | Common in blogs | Support but do not recommend by default; it is the fastest path to accidental public exposure. |

### 3.6 Security checklist we must implement (turn into tickets)

- [ ] Default bind `127.0.0.1`. **Use named bind modes (`loopback` / `lan` / `tailnet` / `custom`), not raw host aliases** — current OpenClaw (2026.3.8+) *rejects* `--bind 0.0.0.0` with `Invalid --bind (use "loopback", "lan", "tailnet", "auto", or "custom")`, and a `--unsafe-bind-all` flag that accepts a raw address diverges from that model. Whatever the flag is named, non-loopback **requires** a configured auth token, else the process exits non-zero with a printed explanation.
- [ ] Docker image: entrypoint refuses to start if `AUTH_TOKEN` is unset **and** bind is not loopback. Prefer the setup-script pattern OpenClaw moved to (script pre-generates a strong token into `.env`); **never ship a bare `docker run -p 18789:18789`-style README example without a pre-generated token.**
- [ ] Auth token auto-generated at onboarding, 256-bit, stored `0600`. **Enforce minimum token entropy/length and reject weak tokens** — OpenClaw had "no enforced policy around password or token complexity" and accepted a 1-character token, which is a direct cause of the 2026 mass compromise.
- [ ] **Validate the WebSocket `Origin` header on every upgrade** (the CVE-2026-25253 failure class).
- [ ] `?token=` → HttpOnly `SameSite=Strict` cookie exchange + `history.replaceState` URL scrub.
- [ ] CSRF token on every state-changing route; strict `Origin`/`Host` allowlist (`controlUi.allowedOrigins` equivalent).
- [ ] `trustedProxies` config; never trust `X-Forwarded-For` by default.
- [ ] `seoagent security audit` command + a security banner in the dashboard when exposed.
- [ ] Prompt-injection containment: content fetched from crawled pages is **data, never instructions**; all write actions require a signed plan object from the planner, not free-text tool calls.
- [ ] Kill switch: `seoagent pause` halts all autonomous writes instantly; also a big red button in the UI.
- [ ] Credential storage encrypted at rest (OS keychain where available); GSC/GA4 refresh tokens never in plaintext `.env`.
- [ ] Published `SECURITY.md` + a real disclosure email + GitHub private vulnerability reporting enabled from day 1. (OpenClaw's crisis was worsened by having no process at 200k stars.)
- [ ] Publish an npm provenance/attestation (`npm publish --provenance`) so users can verify the tarball came from our CI.

---

## 4. Licensing Analysis

### 4.1 The option set, precisely

| License | OSI-approved? | Can a competitor host it as a paid SaaS? | Must they publish their changes? | Notes |
|---|---|---|---|---|
| **MIT** | Yes | **Yes, freely** | No | Zero protection. OpenClaw, LibreChat, AnythingLLM, Langflow, Umami, cal.diy, browser-use, opencode. |
| **Apache-2.0** | Yes | **Yes, freely** | No | Adds an express patent grant + patent-retaliation. Supabase, Continue, Aider, Goose, Cline, Roo-Code. |
| **AGPL-3.0** | **Yes** (approved 2008-03-03) | **Yes, freely** — §4 expressly permits charging any price; AGPL has **no** anti-reselling provision. They must additionally offer the corresponding source of their *modified* version to their remote users | **Only if they modify it** (§13) | Grafana, Plausible, Metabase (core), Windmill (core), Firecrawl. **Not** the strongest OSI network copyleft — see §4.1a. |
| **OSL-3.0** | Yes | Yes, but its "External Deployment" clause treats *any* network availability as a distribution — **it triggers on unmodified deployment, which AGPL §13 does not** | Yes, broader than AGPL | Rarely used, poor ecosystem familiarity, GPL-incompatible. Listed for completeness: it refutes "AGPL is the strongest." EUPL-1.2 is likewise OSI-approved with network-provision language. |
| **SSPL** | **No** | Practically, no | Yes, plus all service-management software | Redis abandoned it in 2025 as a failure (§4.5). **Do not use.** |
| **BUSL / BSL 1.1** | No | No, until the Change Date (typically **4 years**) → then converts to an open license | n/a | HashiCorp's choice; triggered the OpenTofu fork. Complex. |
| **FSL-1.1-ALv2 / FSL-1.1-MIT** | No ("Fair Source") | **No** — "Competing Use" is barred | n/a | Auto-converts to Apache-2.0/MIT on the **second anniversary** of each release. Sentry, Codecov, GitButler, Keygen, PowerSync, CodeCrafters, Typebot, Qlty, Pythagora, Ayon, Chartbrew, Sourcebot, Tuist, Liquibase (Sep 2025). |
| **Elastic License 2.0** | No | No (bars managed-service offering + circumventing license keys) | n/a | Elastic itself re-added AGPL in Aug 2024. |
| **n8n Sustainable Use License** | No | **No** | No | See §4.3. |
| **Dify Open Source License** | No | **No** (bars multi-tenant operation) | No | See §4.4. |

### 4.1a What AGPL-3.0 §13 actually says — and its four hard limits

Exact text of §13 ("Remote Network Interaction"):

> "Notwithstanding any other provision of this License, if you modify the Program, your modified version must prominently offer all users interacting with it remotely through a computer network (if your version supports such interaction) an opportunity to receive the Corresponding Source of your version by providing access to the Corresponding Source from a network server at no charge, through some standard or customary means of facilitating copying of software."

Four limits that are routinely elided, and that materially weaken AGPL as a competitive moat:

1. **It triggers only on modification.** A competitor hosting our agent *unmodified* owes nothing under §13.
2. **The duty runs only to "users interacting with it remotely"** — not to us, and not to the public.
3. **"Corresponding Source of your version" does not reach a separate proprietary control plane**, billing, orchestration, or prompt/model layer that is not a derivative work.
4. **Compliance costs the competitor roughly one CI job** — a source download link at no charge.

**Therefore: AGPL-3.0 contains zero anti-reselling provision.** Nothing in the text prohibits commercial use, selling, or operating the software as a paid service. A competitor may take our AGPL SEO agent, modify it, host it, charge $10k/month, keep 100% of revenue, and comply fully by publishing a tarball. AGPL is a **source-availability mandate, not a competition restraint**. It is also not even the strongest OSI-approved network copyleft (OSL-3.0's External Deployment clause is strictly broader — see §4.1). If our actual requirement is "a competitor may not offer this as a competing hosted service," only a source-available licence (FSL, SUL, BUSL) delivers it, at the cost of the "open source" label. **The claim that AGPL gets you both is the error to avoid.**

### 4.2 FSL — exact operative language (from `FSL-1.1-ALv2.template.md`, getsentry/fsl.software)

"Competing Use" = making the Software available commercially where it:
1. "substitutes for the Software"
2. "substitutes for any other product or service we offer using the Software that exists as of the date we make the Software available"
3. "offers the same or substantially similar functionality as the Software"

Permitted Purposes explicitly include **internal deployment, non-commercial education, non-commercial research, and professional services for compliant licensees.**

Conversion clause: the licensor "irrevocably grant[s] you an additional license to use the Software under the Apache License, Version 2.0 that is effective on the **second anniversary** of the date we make the Software available."

Note the practical subtlety: **conversion is per-release, rolling.** Today's release is Apache-2.0 in two years; there is never a moment when the current version is free-to-compete-with.

### 4.3 n8n Sustainable Use License — exact operative language (LICENSE.md, n8n-io/n8n)

> "You may use or modify the software only for your own **internal business purposes** or for non-commercial or personal use."
> "You may distribute the software or provide it to others only if you do so **free of charge for non-commercial purposes**."
> "You may not alter, remove, or obscure any licensing, copyright, or other notices of the licensor in the software."

Plus: patent-claim termination is immediate; violations terminate the license with a **30-day cure period**, and repeat violations terminate permanently. Files/directories containing **`.ee.`** in the filename or **`.ee`** in the directory name are under a **separate Enterprise License** and are *not* covered by the SUL.

n8n frames this as **"fair-code"**: source-available, free to use and extend, commercially restricted by the authors — explicitly designed so "hyperscale cloud providers" can't resell it. (The "prevents hyperscalers" framing comes from n8n's own blog — company marketing, but the license text does support the claim.)

**Empirical outcome:** 202,959 stars, 60,472 forks, ~86,000 Discord members, **11,741 templates in the official library as of Aug 2026** (up from ~8,300 in early 2026), **5,834 indexed community nodes as of 2026-01-20** (from 1,075 at first crawl 2025-02-04 — +13.6 nodes/day), 230k+ active users (June 2025), €250M valuation post-Series B (March 2025). *(Template/node/Discord counts are aggregated from community trackers and blogs, not n8n's own API — medium confidence.)*

**Conclusion, stated carefully: a non-OSI, anti-compete licence is *compatible* with very large star counts, and there is no evidence it caps popularity for a project without a well-resourced adversary.** It does *not* follow that the licence "cost n8n nothing" — n8n's licence has been constant since 2022-03-17 while its star growth swung ~6.5× between 2024 and 2025, so this dataset cannot isolate a licensing effect in either direction (see §1, note 3). And where licensing *was* the only variable changed — Terraform, Redis, Elasticsearch — restriction demonstrably triggered forks and enterprise flight. Treat n8n as evidence against dogmatism about OSI approval, not as evidence that restriction is free.

### 4.4 Dify Open Source License

**Note: this is a *modified Apache-2.0*, and is far closer to permissive than to n8n's SUL. Do not cite it as precedent for a strict licence.** Commercial use, single-tenant commercial deployment, embedding in a paid product, redistribution for a fee and paid consulting are all permitted; everything outside the two carve-outs below reverts to standard Apache-2.0.

Apache-2.0 **plus** two additional conditions:
1. **No multi-tenant operation** without written authorization from Dify ("one tenant corresponds to one workspace").
2. **No removing/modifying the LOGO or copyright** in the Dify console/apps (inapplicable if you don't use its frontend).

Explicitly permitted: running Dify as a backend for your own applications; internal enterprise app-dev platform.
Community friction: GitHub issue **#18502 "Please rename the 'Dify Open Source License'"** — the objection is that it isn't open source by the OSI definition and calling it one is misleading. **Lesson: you can restrict, but don't call it "open source" if it isn't.** Call it "fair-code" or "source-available."

### 4.5 The relicensing wars — outcomes that matter

| Event | Date | Outcome |
|---|---|---|
| Elastic re-adds AGPL alongside ELv2/SSPL | Aug 2024 | Widely seen as the best-executed reversal; resolved the AWS conflict without killing the commercial product. **[borderline stale — 2024]** |
| Redis: BSD → RSALv2/SSPL | Mar 2024 | Triggered the **Valkey** fork (Linux Foundation, BSD-3). **[2024]** |
| **Redis 8 adds AGPLv3** | **2025-05-01** | Founder Salvatore Sanfilippo: "SSPL, in practical terms, failed to be accepted by the community. The OSI wouldn't accept it, nor would the software community regard the SSPL as an open license." |
| Valkey vs Redis after the reversal | 2025–2026 | Reporting cites **~83% enterprise adoption for Valkey and ~2× Redis's PR rate** — i.e. **the reversal came too late.** *(These adoption figures come from analyst/vendor blogs — medium confidence.)* |
| HashiCorp Terraform → BUSL | 2023 | **OpenTofu** fork; **10M+ downloads**; IBM acquired HashiCorp for **$6.4B** before the outcome settled. **[STALE-RISK: 2023 event]** |
| Grafana Apache-2.0 → AGPLv3 | 2021-04-20 | Chose AGPL over SSPL **because AGPL is OSI-approved and SSPL is not — i.e. Grafana knowingly accepted *weaker* protection to keep the "open source" label.** Their own announcement: *"While AGPL doesn't 'protect' us to the same degree as other licenses (such as the SSPL)…"*; CEO Raj Dutt: *"We believe in open source and are not in the business of trying to redefine what that means."* **Do not cite Grafana to support "AGPL = strongest protection" — the source says the reverse.** Grafana, Loki and Tempo moved to AGPLv3; plugins/agents/certain libraries stayed Apache-2.0; adopted a CLA "based on the CLA set forth by The Apache Software Foundation." **Result: no significant hard fork, 76.5k stars today — but the fork resistance is misattributed to §13.** AWS did not fork because AWS was *already a paying partner*: Amazon Managed Service for Grafana was announced **2020-12-15, four months before the relicense**, with AWS contributing licensing revenue and reselling proprietary Grafana Enterprise; Dutt confirmed "AWS is a strategic partner … AWS and their AMG customers are not impacted by this change." The moat was the commercial contract, the trademark and the proprietary Enterprise tier. Dutt himself says successful forks need "a community, adoption, brand awareness (e.g., trademarks), and commitment." Note also that the market response was **substitution, not forking** (e.g. Perses, Apache-2.0, CNCF Sandbox Aug 2024) — an outcome AGPL cannot prevent at all. Counter-precedent: **MongoDB was AGPL from 2009 and abandoned it for SSPL on 2018-10-16 precisely because AGPL was judged insufficient against cloud resellers.** **[STALE-RISK: 2021 event, but the repo state and licence are verified today]** |
| Sentry → FSL | Nov 2023 announced, "Sentry is now Fair Source" Aug 2024 | Mixed HN reaction; criticism that Sentry benefits from free software (Python/Django) while fighting "free-riding." Sentry counter-programmed with the **Open Source Pledge** (launched 2024-10-08, $2,000/FTE-dev/year): 2025 report cites **$750k committed / $4.5M paid by Pledge members**. No fork materialized. |
| **Cal.com → closed core + `cal.diy` MIT** | **2026-04-15/17** | See §4.6 — the freshest and most instructive case. |

**Pattern across all three successful hostile forks (OpenTofu, Valkey, OpenSearch): cloud-provider backing at launch + a neutral foundation + a permissive license.** A fork of *our* project would require someone to fund continuous SEO-algorithm adaptation — a much higher ongoing cost than forking a database. **Our fork risk is low. Our "AWS resells it" risk is also low.** The realistic threat is a small competitor wrapping our repo in a $19/mo SaaS — **and AGPL does not stop that.** It only forces them to publish their diff, and only if they modify the code at all (§4.1a). **FSL is the only option here that actually bars it.** If we ship AGPL, the deterrent against the $19/mo copycat is the `packages/ee/` tier plus the trademark, not §13 — price the plan accordingly.

### 4.6 The Cal.com case (April 2026) — read this twice

- **2026-04-15/17:** Cal.com moved its production codebase into a **private repository**, relicensed the public repo from **AGPL-3.0 to MIT**, renamed it **`cal.diy`**, and stripped the enterprise features out.
- Stated reason, from the v6.4 changelog: *"AI coding assistants have drastically changed the way engineers write code, but it also made finding vulnerabilities in software much easier, especially publicly available code."* Co-founder Bailey Pumfleet: *"AI has changed what it takes to exploit an application."* They also admitted *"the production codebase had already been drifting away from what was publicly available"* around core auth and data handling.
- `cal.diy` **includes**: event types, calendar integrations, video conferencing, webhooks, API access. **Omits**: Teams, Organizations, SAML SSO, SCIM, Workflows, Routing Forms, Insights Dashboard. Marked "only for self-hosting and use at your own risk."
- Community reaction: skeptical. It's FOSS's read that AI-security was possibly *"the perfect scapegoat for a closed-source transition."*

**Three lessons for us:**
1. **AI-assisted vulnerability discovery is now a stated, mainstream reason companies pull code private.** Our repo will be scanned by automated agents within hours of launch. Budget for it: private security advisories, a bug bounty (even $100–$500 bounties), and never ship auth logic that only works because it's obscure.
2. **The public repo drifting from production is the silent killer of open-core credibility.** Decide up front: our OSS repo must be the *same code* that runs our cloud, with the cloud differences confined to a clearly-labelled `ee/` directory and an infra layer. Otherwise we end up at Cal.com's fork in the road.
3. Even a beloved, 48k-star AGPL project ended up going private. **Design the license so we never *need* to.** AGPL + CLA is what preserves that optionality: with a CLA we can relicense to FSL later; without one, we cannot.

### 4.7 License verdict for our tool

**Threat model:** (a) a competing SEO SaaS forks us and sells hosting; (b) an agency deploys 200 instances for clients and never pays; (c) a hyperscaler resells us (very unlikely).

- **MIT/Apache-2.0** — rejected. (a) and (b) are wide open. OpenClaw can afford MIT because it is a foundation-backed non-commercial project whose creator went to OpenAI; we cannot.
- **SSPL** — rejected. Redis's own founder called it a failure.
- **BUSL** — rejected. Too complex, 4-year lag, fork-magnet reputation.
- **AGPL-3.0-only + CLA + `packages/ee/`** — **recommended, but for a narrower reason than "it blocks resellers."** OSI-approved (we keep the words "open source," which matters enormously for HN/Reddit launch and for SEO/dev-tool credibility). Network copyleft means a competitor hosting a *modified* fork must offer their modifications to their remote users — **a friction tax, not a bar; it does not prevent them charging for the service, and it does not apply at all if they run us unmodified** (§4.1a). **The actual anti-resale moat is the `ee/` tier + trademark.** `ee/` holds multi-tenant orchestration, billing, SSO, audit logs, white-label reporting — exactly the Metabase/PostHog/Activepieces/Windmill pattern. The CLA (ASF-model, like Grafana's) keeps relicensing optionality.
  - Use **AGPL-3.0-**only**, not `-or-later`** — you keep control of what a future FSF license says.
  - Add a `LICENSING.md` with a plain-English FAQ: "Can I use this for my agency's clients?" → yes, that's internal use, and you don't distribute. "Can I resell hosted SEOAgent?" → **yes, AGPL permits it, including for money** — but if you modified the core you must offer your users the corresponding source, and the `ee/` features require a commercial licence. **Do not write "you may not resell this" into `LICENSING.md`; it would misstate AGPL.**
- **FSL-1.1-Apache-2.0** — the alternative if we decide anti-compete beats openness, and **the only option here that genuinely bars a competing hosted service** ("Competing Use" is barred; each release converts to Apache-2.0 on its second anniversary). Choose this **only** if we expect a well-funded copycat. Cost: FSL is **not OSI-approved and is not open source** — it is "Fair Source"; expect an HN thread arguing about it; some enterprises' OSS policies auto-reject non-OSI licenses. That is the genuine trade-off: openness vs. anti-compete. There is no licence that gives both.

**Do not** name it "The SEOAgent Open Source License." Dify issue #18502 is the cautionary tale.

---

## 5. Monetization

### 5.1 The four models observed

| Model | Exemplars | Mechanics |
|---|---|---|
| **Open-core (`ee/` directory)** | PostHog, Metabase, Activepieces, Flowise, Windmill, GitLab, (formerly) Cal.com | Core free; SSO/RBAC/audit/multi-tenancy/white-label gated by a license key. `LICENSE` file names the gated directory explicitly. |
| **Same code, hosted convenience** | Plausible, Umami, Supabase, n8n Cloud | Identical features; you pay to not run it. Highest ethical standing, lowest gate. |
| **Fair-code / anti-compete + cloud** | n8n, Dify, Sentry | Core is free for internal use; hosting it for others requires a commercial deal. |
| **Usage-metered credits** | Dify (message credits), n8n (executions), PostHog (events) | Aligns price with cost; also the natural model when LLM tokens dominate COGS. |

### 5.2 Real price ladders (official pricing pages, accessed 2026-08-31)

**n8n** (n8n.io/pricing): Starter **€20/mo** (2.5K executions, 1 project, 5 concurrent, 2,300 AI credits) → Pro **€50/mo** (10K executions, 3 projects, 20 concurrent, up to 13,700 AI credits) → Business **€667/mo** (40K executions, 6 projects, SSO/SAML/LDAP, Git version control, self-host with license key) → Enterprise custom (unlimited projects, 200+ concurrent, SLA). Annual saves 17%. **All plans include unlimited users & workflows and every integration.** Billing metric is **executions, not steps.**

**Dify** (dify.ai/pricing): Sandbox **$0** (200 message credits, 5 apps) → Professional **$590/yr ≈ $49.17/mo** (5,000 credits/mo, 50 apps) → Team **$1,590/yr ≈ $132.50/mo** (10,000 credits/mo, 200 apps) → self-hosted Community free (single workspace) → Enterprise custom.

**Plausible** (plausible.io): Starter **$9/mo** (10k pageviews, 1 site, 3yr retention) → Growth **$14/mo** (3 sites, 3 team members) → Business **$19/mo** (10 sites, 10 members, 5yr retention, custom properties, **Stats API at 600 req/hour**, funnels, revenue attribution) → Enterprise custom (higher API limits, SSO, managed proxy, raw exports). **30-day free trial, no credit card.**

**Windmill** (windmill.dev/pricing): Free self-hosted (unlimited executions, ≤50 users, ≤3 workspaces, max 4 permission groups) → Enterprise self-hosted **from $120/mo**; seats **$20/mo/developer**, **$10/mo/operator**; compute **2 CU = $100/mo**, **$50/worker/mo** per 2GB, native subworkers 8 for $50/mo.

**PostHog** (posthog.com/pricing): generous per-product free tiers that reset monthly — **1M analytics events, 5K session replays, 1M feature-flag requests, 100K error-tracking exceptions, 1,500 survey responses, 1M data-warehouse rows, 10K pipeline events, 100K AI-observability events, 10GB logs**, plus 500 PostHog-AI credits / 2,500 Replay-Vision credits / 2,000 Desktop credits. Then pure usage-based ("you only pay for what you use").

**Cal.com**: managed cloud from ~$15/user/mo; Organizations ~$37/user/mo (SSO, org settings, audit logs). *(Third-party pricing guides — medium confidence.)*

**OpenHands / All Hands AI:** MIT self-host free; OpenHands Cloud free tier; Enterprise quote-only. Company raised a $5M seed (Menlo Ventures, Sep 2024) and an **$18.8M Series A**. *(Star count 85,757 verified via API; funding via secondary sources.)*

### 5.3 Where **$8/mo** sits

$8/mo would be **the cheapest entry point in this entire comparison set** — below Plausible's $9 and far below n8n's €20 and Dify's $49. That's a deliberate land-grab price and it's defensible *only* if:
- **The user brings their own LLM key on the entry tier** (otherwise token COGS eat you alive; an SEO agent doing continuous crawl+analyze+write is a heavy token consumer).
- Crawl budget is metered (pages/month), because crawling is our real infra cost.
- There is a clear upgrade path — **$8 must not be where an agency lands.**

**Proposed ladder:**

| Tier | Price | Included | Gate |
|---|---|---|---|
| Self-host | $0 | Everything in core, unlimited sites | AGPL; you run it |
| **Solo (Cloud)** | **$8/mo** | 1 site, 5k pages crawled/mo, daily runs, BYO LLM key | — |
| Pro (Cloud) | $29/mo | 5 sites, 50k pages/mo, hourly runs, managed LLM credits included | — |
| Agency | $99/mo | 25 sites, white-label PDF/HTML reports, client sub-accounts | `ee/` |
| Enterprise / self-host license key | from $500/mo | SSO/SAML, RBAC, audit log, SLA, multi-tenant self-host | `ee/` |

Note the n8n insight: **bill on a metric the user can predict and that maps to your cost.** For us that's **pages crawled + autonomous actions executed**, not "seats." Never bill per seat for a tool one person installs.

### 5.4 Conversion rates — the sober numbers

- The commonly-cited open-source free→paid band is **0.5–3%** vs 2–5% for traditional SaaS, with Elastic at "about 1% of its user base" and Confluent at "<1% of their overall community." *(Source: Monetizely, published 2025-11-07 — a pricing-consultancy marketing page that cites no study, no methodology and no date; it gestures at "OpenView Partners" without a citation. Quote it as directional folklore, not data.)*
- **The "2–5% traditional SaaS" baseline is understated, which inflates the contrast.** Primary benchmark data is higher. **ChartMogul SaaS Conversion Report** (fielded Jan 2026, n=200 B2B software products, typical respondent $1–10M ARR / $50–249 ARPU): **median free→paid across all products is 8%**, bimodal (20% of no-CC free-trial products convert <2.5%; 23% convert >25%). Guidance: free trial without card — good 4–6%, great 10–15%; freemium — good 3–5%, great 8–12%. **Lenny Rachitsky / Kyle Poyar (OpenView) / Pendo** (Aug 2023, n=1,000+ B2B products): freemium self-serve good 3–5%; freemium sales-assist good 5–7% / great 10–15%; free trial good 8–12% / great 15–25% — and notably **"the median conversion rate for developer-focused companies was 5%; this was half that of companies that do not sell to developers."** The honest contrast is therefore **open source ~1–3% vs a developer-tools median of ~5% and an all-B2B median of ~8%.**
- **The "31.4% vs 8.9%" credit-card-trial pair is fabricated — do not use it.** It appears in no primary source; it circulates on SEO/AI-generated blogs attributed to "a 2026 ChartMogul study of 200 products," but ChartMogul's published report contains neither figure. What ChartMogul actually says, verbatim: **"Free trials that require a credit card see 30% free-to-paid conversion – more than 5x ones that don't require one,"** with good = 25–35% and great = 50–60% for CC-required. "More than 5×" against 30% implies roughly **5–6%** for opt-in, not 8.9%; the 8% figure in the report is the all-products median, which the blogs appear to have conflated and then decorated with spurious decimals. **Directionally the ~5× effect is real; the decimals are not.** It is also confounded, not causal: requiring a card filters out tire-kickers, changing the denominator — adding a card field does not multiply revenue 5×.
- **Do not apply any of these benchmarks to self-host installs — that is a category error.** They measure signed-up users inside a hosted product with identity, telemetry, a paywall and payment rails. A self-host install has none of these: no signup, no email, no billing path, and you cannot require a credit card for a `docker pull`. Observed open-core ratios are an order of magnitude worse than 1–3%: **GitLab** (investor relations, primary) grew registered users from ~30M (FY2024) to >50M (FY2025) while Base Customers (>$5,000 ARR) went 8,602 → 9,893 → 10,682 (FY2026) — roughly **0.02% of registered users**, ~1,291 net new customers against ~20M net new users. **Elastic's 2018 S-1** reported over 5,500 customers against a community measured in hundreds of thousands of deployments.

**Implication (corrected):** on observed open-core ratios of **~0.02–1%**, 100,000 *self-host installs* at $8/mo plausibly yields **hundreds to low thousands of dollars MRR** — not the $8k–$24k a naive 1–3% SaaS band suggests. (That naive figure was also internally inconsistent: 100,000 × $8 gives $4k at 0.5%, $8k at 1%, $24k at 3% — the stated range corresponded to 1–3%, not 0.5–3%.) $8k–$24k is only reachable if the 100,000 are *hosted-cloud signups with a payment path*. **The strategic conclusion is unchanged and in fact strengthened: the $8 tier cannot be the business at any realistic install count — it is a funnel.** Revenue must come from the Agency tier and the self-host Enterprise license key. Plan the `ee/` boundary accordingly from commit #1. **Do not cite 31.4%/8.9% or $8k–$24k in any investor or planning document; neither survives scrutiny.**

**Also:** a credit-card-required trial on the *cloud* tier is still the right call — the effect is real and large (~5×, ChartMogul: 30% CC-required vs ~5–6% opt-in) — but treat it as a filtering effect, not a revenue multiplier, and keep self-host frictionless forever.

**⚠️ unverified — must be confirmed during implementation:** ChartMogul's n=200 sample is self-reported survey data skewed to $1–10M ARR B2B, not instrumented telemetry. GitLab/Elastic "customers" are organizations, not seats, so per-user conversion is not directly comparable to per-install. **No primary, methodologically transparent study of open-source self-host install→paid conversion appears to exist as of 2026-09-01** — every number in this space traces to vendor blogs or anecdote. Our own funnel instrumentation is the only reliable source; build it before committing to a revenue model.

---

## 6. Growth Playbook

### 6.1 Launch mechanics — what the data says

From *"Launch-Day Diffusion: Tracking Hacker News Impact on GitHub Stars for AI Tools"* (arXiv 2511.04453v1; Obada Kraishan, Texas Tech; submitted 2025-11-06, still v1 as of 2026-09; 7 pages; **accepted to the AAAI-26 *Demonstration* track, not a peer-reviewed research track**) — 138 HN→GitHub repo pairs collected 2024–2025 (137 valid series; 58 "Show HN" / 80 regular), event-study + Elastic Net / Gradient Boosting, 80/20 split, 5-fold CV, OLS with HC1 robust SEs:

| Window | **Mean** stars gained |
|---|---:|
| 24h | **121.1** |
| 48h | **188.7** |
| 7d | **288.5** |

**⚠️ These are NOT "front-page" numbers.** The paper's sampling was an Algolia HN Search API keyword query (`llm`, `gpt`, `rag`, `transformers`, `langchain`, `agents`) with **`min_score: 10`** and no front-page filter, deduplicated to the earliest mention per repo. Mean in-sample HN score is 187; mean baseline stars 1,247. So 121/189/289 are means across *all* AI/LLM-keyword posts scoring ≥10 — most of which never reached the front page — measured on already-established repos, **with no counterfactual baseline subtracted for organic growth**. The paper's own Limitations section: *"our observational design does not allow us to establish causation."* Its domain is AI/LLM tools during a hype cycle, which the author says "may limit the generalizability of our findings to other domains."

- **"the median values run much lower"** is asserted in prose but **no median is reported anywhere in the paper** — Table 1 contains only counts (138 pairs, 137 valid series, 58 Show HN, mean baseline 1,247 stars, mean HN score 187), with no median, SD, min or max for any star delta. The direction is the author's assertion; the magnitude does not exist in the source. Still: plan on a right-skewed distribution, not the mean.
- **Timing: drop the "12:00–17:00 UTC ≈ +200 stars" rule.** The paper labels it "Hour bins (unadjusted): ~200" with **no standard error and no p-value** — a descriptive group difference across 24 hourly bins at ~6 posts per bin, not a regression coefficient. It is contradicted by a far larger independent analysis of **188,085 Show HN posts (Jan 2012 – Apr 2026)**, which finds the best slot is **Monday 00:00 UTC** (10.8% of posts reach 50+ points), then Sunday 02:00 UTC (9.8%) and Saturday 19:00 UTC (9.2%), with Thursday 06:00 UTC worst (2.6%). 12:00–17:00 UTC is not identified as optimal there.
- Weekend vs weekday: **negligible (β=+10.2, SE=43.0, p=0.81)**.
- **"Show HN" at 48h: β=−119.2, SE=138.3, p=0.39 — this is an underpowered null, not evidence of no effect.** The 95% CI is roughly **−390 to +152 stars**; n=138 with 58 Show HN posts cannot detect an effect of this size. It neither supports nor refutes a Show HN benefit. Do not treat "Show HN doesn't help" as a finding.
- Prediction: **R²=0.77** (MAE 30.5, RMSE 60.1) for 48h *with day-0 momentum*; **R²=0.48** (MAE 92.5, RMSE 182.0) for 7d using pre-launch data only; dominant predictors = HN score, baseline stars, posting hour.

**Better calibration for an actual front-page hit (independent, larger dataset — a well-documented personal-blog analysis, not peer-reviewed):** across 491 repos all scoring 258+, roughly **1.4 GitHub stars per HN point** in the 48h window, with diminishing returns (1.77 stars/point at 258–350, falling to 0.79 at 700+). That implies a genuine front-page post (258+ points) yields roughly **360–620 stars at 48h — about 2–3× the paper's 189 figure.** Same source: HN score explains only ~8% of star variance (r=0.29, p<0.001); comments are a weak predictor (r=0.10); the bump has a ~24h half-life and **92% of star-getting is over by 48 hours**; median Show HN score is 2 points, mean 13.5, 90th pct 24, 99th pct 263; ~200 Show HN posts now compete daily vs ~30 a decade ago (28,302 submissions in 2025). A separate study (arXiv:2506.12643; 2,195 HN stories / 1,814 repos, May 2022 – May 2024) confirms statistically significant post-HN increases in stars (p=0.001), forks (p=0.004) and contributors (p=0.021), but publishes no per-post magnitudes.

**Read: a single HN front page is worth a few hundred stars — a defensible planning band is ~150–600 at 48h, heavily right-skewed with the median well below the mean — not a few thousand.** The 100k-star outcomes (OpenClaw, Hermes Agent) are driven by sustained multi-channel virality, not one post. **Do not chain stars to install or MRR targets without a separate, explicit conversion assumption** — the paper itself flags stars as "only one aspect of project success," and the sole HN commenter on it called "GitHub stars are a useful metric" a "dangerous claim."

Other 2026 launch datapoints (secondary sources — treat as directional): OpenClaw launched on Product Hunt in Feb 2026 and became "the fastest ever growing project on GitHub"; **Hermes Agent (Nous Research)**, launched 2026-02-25, hit **160,175 stars in 12 weeks**, growing faster per-week than OpenClaw at the same age; Sweep's April 2026 PH launch hit **#2 Product of the Day with 300+ comments** and the maker **answered 50+ questions in the first 6 hours** — founder presence in the comments is the controllable variable.

### 6.2 README / landing-page patterns that recur

Observed across OpenClaw, AnythingLLM, n8n, LibreChat, Dify:
1. **Logo + one-sentence positioning** in an HTML `<p align="center">` block.
2. **Badge row:** license, Discord, docs, Trendshift/star-history. AnythingLLM embeds a Trendshift badge (`trendshift.io/repositories/2415`) and an inline base64 Discord SVG.
3. **Demo GIF/MP4 above the fold**, hosted on a GitHub Release asset (AnythingLLM: `releases/download/v1.11.2/AnythingLLM720p.gif`) — not a third-party CDN, so it never rots.
4. **Install command within the first screen.**
5. **A feature list where every bullet links into the docs site**, not to an anchor in the README. This is a docs-SEO engine: AnythingLLM's README links `docs.anythingllm.com/...` ~15 times.
6. **An explicit "Telemetry & Privacy" section in the README**, in a `<details>` block (see §6.5).
7. Supported-providers matrix (drives long-tail search: "AnythingLLM + Ollama", "n8n + Notion"). **For us: a supported-CMS/provider matrix — WordPress, Webflow, Shopify, Ghost, Next.js/MDX, Sanity, Contentful, Framer — is our equivalent long-tail SEO surface.**

### 6.3 Templates / marketplace as a growth engine

n8n's numbers are the proof: **11,741 workflow templates (Aug 2026)**, of which **8,002 are AI-category**; **5,834 community nodes indexed (Jan 2026)**, growing at **13.6/day**; **500+ community node packages on npm**; **~86,211 Discord members**. Third-party template collections (e.g. `enescingoz/awesome-n8n-templates`, 280+ templates) rank for "n8n templates" and feed the funnel.

**Templates are the best SEO asset an OSS tool has** — they generate thousands of long-tail pages that the community writes for you. Given our product *is* an SEO tool, shipping a public, indexable **"SEO Recipes" gallery** (each recipe = a page: "Fix orphaned pages on a Shopify store", "Auto-generate FAQ schema from GSC queries") is a self-demonstrating growth loop. Ship it with the v1 site, not later.

### 6.4 Release cadence & versioning

- OpenClaw: **249 npm versions in ~7 months** (2026-01-29 → 2026-08-31), CalVer `2026.8.1`, dist-tags `latest` / `beta` (`2026.9.1-beta.1`) / `alpha` / **`extended-stable`** (`2026.6.34`).
- n8n: SemVer `2.36.9` with dist-tags `latest` / `stable` / `beta` / `rc` / `next`; `engines.node >= 24.0.0`; `license: "SEE LICENSE IN LICENSE.md"`.
- OpenHands: **102 releases**, v1.7.0 on 2026-05-01. *(secondary source)*
- **Warning sign to avoid:** `Aider-AI/aider` last push **2026-05-22** — over three months stale at 48.6k stars. Perceived abandonment is fatal for a tool that holds production credentials. **Commit visibly, weekly.**

### 6.5 Telemetry — the exact norms and the exact backlash

**The gold-standard implementation is AnythingLLM's** (README, verbatim structure):
- Opt-out via `DISABLE_TELEMETRY=true` **or** in-app: sidebar → **Privacy** → toggle off.
- Explicitly enumerated events: install type (Docker or Desktop); document added/removed (**event only, nothing about the document**); vector DB type; LLM provider & model tag; chat sent (**event only**).
- "You can verify these claims by finding all locations `Telemetry.sendTelemetry` is called."
- Events are **written to the output log so users can see exactly what was sent.**
- "**No IP or other identifying information is collected.**" Provider is PostHog.
- They even document the *non-telemetry* outbound connections that remain: `cdn.anythingllm.com` (model mirror), `github/githubusercontent.com` (flat files).

**n8n** (docs.n8n.io/deploy/host-n8n/configure-n8n/security/control-telemetry): *"n8n enables telemetry collection by default."* Opt out with:
```bash
export N8N_DIAGNOSTICS_ENABLED=false
export N8N_VERSION_NOTIFICATIONS_ENABLED=false
# also commonly cited (secondary sources, verify against current docs):
export N8N_TEMPLATES_ENABLED=false
export EXTERNAL_FRONTEND_HOOKS_URLS=
```

**The backlash case — GitHub CLI, 2026-04-22:** GitHub shipped **opt-out** pseudonymous telemetry in **`gh` v2.91.0** with only a changelog entry and no consent prompt. Collected: subcommand usage, flag usage, command frequency. Opt-out: `GH_TELEMETRY=false`, `DO_NOT_TRACK=true`, or `gh config set telemetry disabled` (env vars take precedence); `GH_TELEMETRY=log` previews payloads. Reaction: **419 points / 302 comments on Hacker News within 24 hours**, framed as a consent violation. *(Historical precedent: Audacity reversed its telemetry plans after a user revolt — **[STALE-RISK: 2021]**.)*

**Also note the maintainer's dilemma, stated plainly in the ecosystem:** opt-in telemetry typically sees **~3% participation**, which is not statistically useful. *(Cited by 1984 Ventures' founder handbook — a VC blog, medium confidence.)*

**Our policy (write this into the README before launch):**
- Opt-**out**, but with a **first-run consent screen** in the onboarding wizard (not a buried changelog) that shows the exact JSON payload.
- Honor `DO_NOT_TRACK=1` and `SEOAGENT_TELEMETRY=0`; also an in-dashboard toggle.
- `seoagent telemetry log` prints every event that would be sent.
- **Never send:** domain names, URLs, page content, GSC query data, API keys, IPs. Send only: install method, OS, version, CMS *type*, feature-used events, error class names.
- Publish a `TELEMETRY.md` enumerating every event, and a grep-able single call site.

### 6.6 Community & contributor infra

- **Discord over Slack** — n8n's community migrated to Discord and now has ~86k members. Discord is indexable-ish, free, and has voice/office-hours.
- **GitHub Discussions** for Q&A (Supabase runs its self-hosting feedback threads there — e.g. Discussions #39820, #37903, #17876 — and they're a public, searchable roadmap signal).
- **CLA bot from day one.** Grafana adopted an ASF-model CLA when relicensing. Without one you can never change your license. Use `cla-assistant` or DCO+CLA hybrid.
- **`good first issue` labeling + a `CONTRIBUTING.md` with a 5-minute dev-env setup** (`pnpm i && pnpm dev`).
- **CI:** lint + typecheck + unit + a **smoke test that actually runs the installer on macOS/Ubuntu/Windows runners**. Also: `npm publish --provenance`, Dependabot/Renovate, CodeQL, and a scheduled job that re-runs the install one-liner daily against `latest` (install rot is the #1 silent conversion killer).
- **Release notes as marketing:** every release gets a GitHub Release with a GIF. OpenClaw's ~1 release/day cadence is a content machine.

---

## 7. Comparative Cheat-Sheet: Local-Dashboard Defaults

| Project | Default URL | Auth default | Remote-access story |
|---|---|---|---|
| OpenClaw | `http://127.0.0.1:18789/` | **Token required, fail-closed**; auto-generated at onboarding | Tailscale Serve (blessed); trusted-proxy mode; explicit `controlUi.allowedOrigins` |
| LibreChat | `http://localhost:3080` | Account signup | Reverse proxy |
| n8n | `http://localhost:5678` | Owner account setup on first run | n8n Cloud or reverse proxy |
| Langflow | `http://localhost:7860` | **Historically none** — the cause of CVE-2025-3248 | Fixed in 1.3.0 |
| Flowise | `http://localhost:3000` | Optional username/password env vars | Reverse proxy |
| Dify | `http://localhost/` (nginx) | Admin account on first run | Docker + proxy |
| **Ours (proposed)** | `http://127.0.0.1:7331/?token=…` | **Token required, fail-closed, cookie-exchanged** | Tailscale Serve documented; hosted tier for everyone else |

---

## 8. Direct Implications for Our Tool — Build Recommendations

### 8.1 License decision (final)

```
LICENSE              -> AGPL-3.0-only  (core: crawler, planner, executors, dashboard, CLI)
packages/ee/LICENSE  -> "SEOAgent Commercial License" (multi-tenant orchestration,
                        billing, SSO/SAML, RBAC, audit log, white-label reporting,
                        client sub-accounts, license-key verification)
LICENSING.md         -> plain-English FAQ + "Can I …?" table
CLA.md + cla-assistant bot on every PR (ASF-model, grants us relicensing rights)
```
- Header every `ee/` file with a copyright notice; gate at build time so the OSS build simply doesn't contain them (Metabase's model), rather than shipping crippled code behind a flag.
- Register the trademark for the product name and keep trademark rights **out** of the license grant (n8n's SUL explicitly bars removing notices; AGPL doesn't cover trademarks, so state it separately in `TRADEMARK.md`).
- **Reserve the FSL escape hatch:** with the CLA in place we can relicense new versions to FSL-1.1-Apache-2.0 if a funded copycat appears. Document internally that this is Plan B, and never publicly promise "MIT forever."

### 8.2 Install command (final)

```bash
# macOS / Linux / WSL2
curl -fsSL https://get.seoagent.dev/install.sh | sh

# Windows
iwr -useb https://get.seoagent.dev/install.ps1 | iex

# Node users who insist
npm install -g seoagent@latest

# Docker (must set AUTH_TOKEN or it refuses to start)
docker run -d --name seoagent -p 127.0.0.1:7331:7331 \
  -e SEOAGENT_AUTH_TOKEN="$(openssl rand -hex 32)" \
  -v seoagent:/data ghcr.io/seoagent/seoagent:latest
```
Then: `seoagent onboard --install-daemon` → wizard connects GSC/GA4/CMS → prints `http://127.0.0.1:7331/?token=…` → opens browser.

Bundle the runtime. Lazily fetch Chromium on first crawl. Ship `seoagent doctor`, `seoagent update --channel stable|extended-stable|dev`, `seoagent security audit`, `seoagent pause`.

### 8.3 Repo structure

```
seoagent/
├── README.md                 # logo, badges, 1-liner, GIF, install, provider matrix
├── LICENSE                   # AGPL-3.0-only
├── LICENSING.md  TRADEMARK.md  SECURITY.md  TELEMETRY.md  CONTRIBUTING.md  CLA.md
├── apps/
│   ├── cli/                  # `seoagent` binary: onboard, doctor, update, audit, pause
│   ├── gateway/              # daemon: scheduler, job queue, HTTP+WS API, auth
│   └── dashboard/            # local web UI (served by gateway, same origin)
├── packages/
│   ├── core/                 # planner, decision engine, autonomy policy
│   ├── crawler/              # fetch, render, parse, diff
│   ├── connectors/           # gsc, ga4, sitemap, wordpress, webflow, shopify, ghost, …
│   ├── actions/              # schema, internal-links, meta, redirects, content
│   ├── recipes/              # first-party curated recipe library (NOT a marketplace in v1)
│   └── ee/                   # commercial: multi-tenant, billing, SSO, RBAC, audit, white-label
├── docker/  docker-compose.yml
├── install/ install.sh install.ps1
└── .github/workflows/        # ci, release, provenance-publish, install-smoke (cron daily)
```

- Monorepo, pnpm workspaces, Turborepo. One `pnpm dev` for contributors.
- **Connectors are the contribution surface.** Make `packages/connectors/` have a 100-line template and a `CONTRIBUTING-CONNECTOR.md`. This is n8n's node ecosystem strategy applied to CMSes.

### 8.4 First-90-days growth plan

**Days −30 → 0 (pre-launch)**
- Docs site live at `docs.seoagent.dev` with 25+ pages; every README bullet deep-links into it.
- 30 first-party recipes published as indexable pages (our own dogfood SEO surface).
- `install-smoke` CI green on macOS/Ubuntu/Windows.
- `SECURITY.md`, private vulnerability reporting enabled, a $250 bounty page.
- 60-second demo video: real site → agent finds 40 issues → fixes 12 → GSC impressions chart moves. **Host it as a GitHub Release asset.**
- Seed a Discord; recruit 20 design partners from r/SEO, r/juststart, Indie Hackers; give them free Pro.

**Day 0 — launch week**
- HN post on a weekday (weekday/weekend genuinely is irrelevant: β=+10.2, p=0.81). **The 12:00–17:00 UTC timing rule is withdrawn** — it came from an unadjusted, p-value-free group difference at ~6 posts per hourly bin, and the largest available dataset (188,085 Show HN posts, 2012–2026) points at Monday 00:00 UTC / Sunday 02:00 UTC / Saturday 19:00 UTC instead. **Don't over-engineer the hour; ship when the post and the founder are both ready to sit in the thread.** Likewise **the "skip Show HN" rule is withdrawn** — β=−119.2 with a 95% CI of roughly −390 to +152 is an underpowered null, not evidence against the tag. Use "Show HN" if the launch genuinely is a show-and-tell.
- Product Hunt the same week; **founder answers every comment for the first 6 hours** (Sweep's #2-of-the-day playbook).
- Simultaneous: r/SEO, r/bigseo, r/selfhosted, r/webdev, Indie Hackers, X thread with the demo GIF.
- Base case: **a non-front-page HN post is worth ~120 stars in 24h / ~290 in 7d; a genuine front-page hit (258+ points) is worth roughly 150–600 at 48h**, right-skewed with the median well below the mean. **92% of the effect lands within 48 hours** and it contributes essentially nothing after day 7. Anything above is compounding, not the HN post.

**Days 1–30**
- **Ship daily.** Release notes with a GIF each time. This is what turns a spike into a slope.
- Publish "SEOAgent vs <tool>" comparison pages and "SEOAgent + WordPress / Webflow / Shopify / Ghost" integration pages — the long-tail matrix.
- Weekly office hours in Discord.
- Publish an anonymized "what the agent found across 500 sites" data post — original data is the highest-leverage OSS content.

**Days 31–60**
- Open the cloud tier. **$8 Solo with a credit-card-required 14-day trial** — ChartMogul (Jan 2026, n=200) reports CC-required trials at ~30% free→paid, "more than 5×" opt-in (implying ~5–6% for opt-in). Treat this as a tire-kicker filter that changes the denominator, not as a 5× revenue multiplier. *(The widely-circulated "31.4% vs 8.9%" pair is not in any primary source — do not use it.)*
- Launch the public Recipes gallery with community submissions **reviewed by us** (no open marketplace — see ClawHub, §3.4).
- Reach out to 10 SEO YouTubers/newsletter writers with free Agency accounts.
- First security audit + a published pen-test summary. Given Cal.com's April 2026 rationale, "we are open source *and* we were audited" is now a differentiator.

**Days 61–90**
- Agency tier + white-label reports (`ee/`).
- `awesome-seoagent` repo; encourage third-party recipe collections (n8n's community-template flywheel).
- Publish transparent metrics (installs, sites managed, actions executed) — the Plausible/PostHog "build in public" move.
- **Target (revised down on the corrected conversion math):** 8,000–15,000 stars, 25,000+ installs, and **50–250 paying cloud users**. The old "300–500 paying users (~1–3% of installs)" applied a *hosted-SaaS free-trial* band to *self-host installs*, which is a category error — observed open-core self-host ratios are **~0.02–1%** (GitLab converts ~0.02% of registered users to >$5k-ARR customers). At 25,000 installs, 1% is 250 users, and 0.1% is 25. Expect **$0.5–2k MRR from the cloud tier at 90 days**, not $3–6k. Treat MRR purely as validation, not the business; the Agency tier and self-host licence keys are where 90 days sets up month 6. **The paying-user number is driven by cloud *signups*, not installs — instrument the two separately from day 1, because the install count will not convert.**

### 8.5 Things to explicitly NOT do

1. **Do not ship an open plugin/skill marketplace in v1.** ClawHub: 341+ documented malicious skills, infostealers, 22MB padding to evade scanners. Our plugins would have write access to customers' live websites.
2. **Do not default-bind to `0.0.0.0`, ever, including in Docker.** 21,639 (Censys, 31 Jan 2026) → 30,000+ (Bitsight, 8 Feb 2026) exposed OpenClaw instances in two weeks. **But note the cause:** it was users *explicitly* choosing the all-interfaces mode at onboarding plus a 1-character-token being accepted — not an unauthenticated default. So the two rules that matter most are **(2a) enforce token entropy — reject short/weak tokens** and **(2b) validate WebSocket `Origin` headers** (CVE-2026-25253).
3. **Do not call a restricted license "open source."** (Dify #18502.)
4. **Do not use SSPL.** Redis's founder publicly called it a failure in 2025.
5. **Do not add telemetry silently.** (GitHub CLI, Apr 2026, 419-point HN thread.)
6. **Do not let the OSS repo drift from the production code.** That drift is what Cal.com cited when it went private.
7. **Do not bill per seat.** Bill on pages crawled + actions executed.
8. **Do not require the user to install Node/Docker/Chromium before trying it.**
9. **Do not go quiet.** Aider at 48.6k stars with no push since 2026-05-22 is what decay looks like.

---

## 9. Confidence & Staleness Flags

**High confidence (primary, machine-read 2026-08-31):** all GitHub star/fork/license/date figures (GitHub REST API); npm download counts and `openclaw`/`n8n` package metadata (npm registry API); verbatim license text for OpenClaw (MIT), Activepieces, Windmill, PostHog, Metabase, Flowise, Sentry (FSL-1.1-Apache-2.0), n8n SUL, FSL-1.1-ALv2, cal.diy (MIT).

**High confidence (official docs/pricing pages, accessed 2026-08-31):** OpenClaw install/gateway/security docs; n8n pricing and telemetry docs; Plausible, Dify, Windmill, PostHog pricing; GitHub CLI telemetry changelog; Cal.com v6.4 changelog; fair.io company list.

**Medium confidence (reputable secondary / vendor research):** Censys 21,639 and Bitsight 30,000+ exposed-instance counts; Koi Security 341 malicious skills; Unit 42 attack techniques; CVE-2025-3248 CISA KEV listing (2025-05-05) and Flodrix botnet; ChartMogul SaaS Conversion Report (self-reported survey, n=200, skewed $1–10M ARR B2B); the 1.4-stars-per-HN-point calibration (well-documented personal-blog analysis of 188,085 Show HN posts, not peer-reviewed).

**Low confidence — flagged in-text (marketing/analyst blogs, unverified):** 135,000 / 220,000+ exposed OpenClaw instances; "1,184 malicious skills" and "17% malicious"; Valkey 83% enterprise adoption (Percona, Sept 2024); n8n template/node/Discord counts; the open-source free→paid 0.5–3% conversion band (Monetizely, uncited); Cal.com per-seat prices; OpenHands funding amounts; Hermes Agent star trajectory.

**Refuted / removed — do not reintroduce:** "31.4% vs 8.9% CC-required vs opt-in trial conversion" (appears in no primary source; ChartMogul's actual figure is ~30% vs "more than 5×" lower); "$8k–$24k MRR from 100,000 self-host installs" (category error + internally inconsistent arithmetic); "AGPL is the strongest anti-reselling protection" (AGPL has no anti-reselling clause, and OSL-3.0 is a broader OSI network copyleft); "Grafana chose AGPL over SSPL because it is stronger" (Grafana says the opposite); "121/189/289 stars from an HN *front page*" (the sample was `min_score:10`, not front page); "12:00–17:00 UTC is worth ~200 stars" (unadjusted, no SE/p, contradicted by a 188k-post dataset); "Show HN confers no advantage" (underpowered null, CI −390 to +152); "the container auto-bind caused the OpenClaw mass exposure" (the gateway refuses to bind non-loopback without auth).

**⚠️ unverified — must be confirmed during implementation:**
- OpenClaw's container bind auto-detection is documented but has shipped inconsistently (issues #61779, #44101; the official Docker setup script sets `lan`, not `auto`). Verify against the version we actually benchmark against before copying the behaviour.
- Whether AGPL §13 has ever been successfully enforced against a SaaS competitor in this segment — no known case. Our AGPL deterrent is untested in court.
- Whether "Corresponding Source" would reach our own hosted control plane if we ever operate a modified fork of our own core — get counsel before splitting the codebase.
- Self-host install→paid conversion: no primary, methodologically transparent study exists as of 2026-09-01. Our own funnel instrumentation is the only reliable source; build it before committing to a revenue model.
- Star→install and install→signup conversion for our category — assumed, never measured. Do not chain star targets to MRR targets without measuring these.

**Explicitly stale (pre-2025) — re-verify before relying on:** Grafana AGPLv3 relicensing (2021-04-20) and its CLA reasoning (the CLA point stands and is verified; the "AGPL is why they weren't forked" reading does not — see §4.5); MongoDB AGPL→SSPL (2018-10-16); HashiCorp BUSL → OpenTofu (2023); Redis SSPL move and Valkey fork (2024); Elastic AGPL re-add (Aug 2024); Sentry FSL introduction (Nov 2023) and "Sentry is now Fair Source" (Aug 2024); Open Source Pledge launch (Oct 2024); Audacity telemetry reversal (2021); Cal.com's original AGPLv3 switch (2022).

**Known gaps / open questions:** exact self-host→paid conversion for n8n/Plausible/PostHog (none publish it); Umami Cloud pricing (page did not render); LibreChat's monetization (appears to be pure MIT + sponsorships, unconfirmed); whether AGPL has ever actually been *enforced* against a SaaS competitor in this segment; whether Google's API terms constrain what we can offer on a paid hosted tier (out of scope here — see the GSC/GA4 dossier).

---

## 10. Sources

All accessed **2026-08-31** unless noted.

**Primary — APIs**
- GitHub REST API, `https://api.github.com/repos/{owner}/{repo}` for all 26 repos in §1
- GitHub REST API, `https://api.github.com/repos/{owner}/{repo}/license`
- npm downloads API, `https://api.npmjs.org/downloads/point/last-week/{pkg}`
- npm registry, `https://registry.npmjs.org/openclaw`, `https://registry.npmjs.org/n8n`

**Primary — license texts (raw)**
- https://raw.githubusercontent.com/openclaw/openclaw/main/LICENSE (MIT)
- https://github.com/n8n-io/n8n/blob/master/LICENSE.md (Sustainable Use License)
- https://raw.githubusercontent.com/getsentry/sentry/master/LICENSE.md (FSL-1.1-Apache-2.0)
- https://raw.githubusercontent.com/getsentry/fsl.software/main/FSL-1.1-ALv2.template.md
- https://raw.githubusercontent.com/activepieces/activepieces/main/LICENSE
- https://raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE
- https://raw.githubusercontent.com/PostHog/posthog/master/LICENSE
- https://raw.githubusercontent.com/metabase/metabase/master/LICENSE.txt
- https://raw.githubusercontent.com/FlowiseAI/Flowise/main/LICENSE.md
- https://raw.githubusercontent.com/calcom/cal.diy/main/LICENSE (MIT)
- https://raw.githubusercontent.com/Mintplex-Labs/anything-llm/master/README.md (telemetry section)

**Primary — official docs & pricing**
- https://docs.openclaw.ai/ , /install/ , /gateway/ , /security/
- https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/control-telemetry
- https://n8n.io/pricing/
- https://dify.ai/pricing
- https://plausible.io/#pricing
- https://www.windmill.dev/pricing
- https://posthog.com/pricing
- https://github.blog/changelog/2026-04-22-github-cli-opt-out-usage-telemetry/
- https://cal.com/blog/calcom-v6-4
- https://cal.com/blog/changing-to-agplv3-and-introducing-enterprise-edition (2022, stale)
- https://grafana.com/blog/grafana-loki-tempo-relicensing-to-agplv3/ (2021, stale)
- https://fair.io/licenses/ , https://fair.io/companies/ , https://fsl.software/
- https://github.com/langgenius/dify/issues/18502
- https://github.com/openclaw/clawhub

**Secondary — security research**
- https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/
- https://horizon3.ai/attack-research/vulnerabilities/cve-2025-3248/
- https://www.recordedfuture.com/blog/langflow-cve-2025-3248
- https://www.bleepingcomputer.com/news/security/cisa-orders-feds-to-patch-actively-exploited-langflow-rce-flaw/
- https://www.trendmicro.com/en_us/research/25/f/langflow-vulnerability-flodric-botnet.html
- https://www.helpnetsecurity.com/2025/05/06/langflow-cve-2025-3248-exploited/
- https://www.infosecurity-magazine.com/news/researchers-six-new-openclaw/
- https://conscia.com/blog/the-openclaw-security-crisis/

**Secondary — research, news, analysis**
- https://arxiv.org/html/2511.04453v1 (HN → GitHub stars event study)
- https://en.wikipedia.org/wiki/OpenClaw
- https://itsfoss.com/news/cal-com-goes-proprietary/
- https://www.infoworld.com/article/3975620/redis-bets-big-on-an-open-source-return
- https://www.infoq.com/news/2025/05/redis-agpl-license
- https://blog.sentry.io/sentry-is-now-fair-source/ ; https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/
- https://news.ycombinator.com/item?id=41171665 (Sentry FSL reaction)
- https://www.theregister.com/2026/04/22/github_opts_all_cli_users/
- https://www.getmonetizely.com/articles/whats-the-optimal-conversion-rate-from-free-to-paid-in-open-source-saas
- https://chartmogul.com/reports/saas-conversion-report/
- https://1984.vc/docs/founders-handbook/eng/open-source-telemetry
- https://www.librechat.ai/docs/local/docker
- https://github.com/orgs/supabase/discussions/39820
- https://www.activepieces.com/open-source

---

## Fact-check log

External fact-check pass completed **2026-09-01**. Six load-bearing claims were checked; one was CONFIRMED, five came back PARTIALLY_TRUE and have been corrected in place in the sections listed. Numbers below replace anything to the contrary elsewhere in this document.

### FC-1 — AGPL-3.0 as anti-reselling protection, and the Grafana precedent
**Claim as originally written:** "AGPL-3.0 is OSI-approved and its network clause requires anyone offering a modified version as a network service to make the complete corresponding source available to those users — making it the strongest anti-reselling protection that still legitimately counts as 'open source'. Grafana explicitly chose AGPLv3 over SSPL for exactly this reason and suffered no fork."
**Verdict: PARTIALLY_TRUE.** Corrected in §0, §4.1, **new §4.1a**, §4.5, §4.7.
**Correction:**
- OSI approval — **confirmed** (AGPL-3.0 published 2007-11-19, OSI-approved 2008-03-03, still listed; SSPL is not).
- §13 — **confirmed but far narrower than implied.** Four limits: it triggers only on *modification*; the duty runs only to remote users; "Corresponding Source of your version" does not reach a separate proprietary control plane/billing/orchestration layer; compliance costs about one CI job.
- "Strongest anti-reselling protection" — **refuted twice.** (a) AGPL has **zero** anti-reselling provision; §4 expressly permits charging any price. A competitor may modify, host, charge $10k/mo, keep all revenue and comply by publishing a tarball. (b) It is not even the strongest OSI network copyleft — **OSL-3.0's "External Deployment" clause triggers on *unmodified* network deployment**, which AGPL §13 does not; EUPL-1.2 also has network-provision language.
- Grafana's motive — **stated backwards.** Grafana's own announcement: *"While AGPL doesn't 'protect' us to the same degree as other licenses (such as the SSPL)…"*; Raj Dutt: *"We believe in open source and are not in the business of trying to redefine what that means."* They knowingly took **weaker** protection to keep the OSI label. Counter-precedent: MongoDB was AGPL from 2009 and left for SSPL on 2018-10-16 because AGPL was judged insufficient against cloud resellers.
- "Suffered no fork" — **true but causally misattributed.** No significant hard fork after the 2021-04-20 relicense, but AWS was already a paying partner (Amazon Managed Service for Grafana announced 2020-12-15, four months earlier, reselling proprietary Grafana Enterprise). The moat was the commercial contract, the trademark and the Enterprise tier. The market response was **substitution, not forking** (Perses, Apache-2.0, CNCF Sandbox Aug 2024) — something AGPL cannot prevent.
- **Recommendation impact:** §0 and §4.7 rewritten. AGPL + CLA + `packages/ee/` remains the recommendation, but the stated rationale changed from "network copyleft blocks a competitor" to "OSI label + the `ee/` tier and trademark are the moat; AGPL is a friction tax, not a bar." `LICENSING.md` guidance corrected — it must **not** say "you may not resell this." FSL is now correctly described as the only option that actually bars a competing hosted service, and as **not open source**.
**Sources:** https://grafana.com/blog/grafana-loki-tempo-relicensing-to-agplv3/ · https://grafana.com/blog/2021/04/20/qa-with-our-ceo-on-relicensing/ · https://grafana.com/licensing/ · https://opensource.org/license/agpl-v3 · https://opensource.org/licenses · https://opensource.org/license/osl-3.0 · https://www.gnu.org/licenses/agpl-3.0.en.html · https://github.com/grafana/grafana/blob/main/LICENSE · https://fsl.software/ · https://grafana.com/blog/2020/12/15/announcing-amazon-managed-service-for-grafana/

### FC-2 — "A non-OSI anti-compete license does not suppress adoption" (n8n / Dify)
**Verdict: PARTIALLY_TRUE.** Corrected in §1 (table + note 3), §4.3, §4.4.
**Correction:** The raw numbers and the SUL quote are **exactly right** — n8n 202,959 stars / 60,472 forks, licence "Other"/NOASSERTION, verified via authenticated `gh api` on 2026-08-31. Dify corrected **154,011 → 154,013 stars** and **24,335 → 24,336 forks** (immaterial live-counter drift). Four errors in the reasoning:
1. **"Dify's similarly restricted license" is a mischaracterization.** Dify is a *modified Apache-2.0* barring only (a) multi-tenant operation and (b) logo/copyright removal in the console frontend; commercial use, single-tenant commercial deployment, paid embedding, paid redistribution and consulting are all permitted. n8n's SUL bans commercial use outright except internal business purposes. Opposite ends of the spectrum — the two datapoints do not support one generalization.
2. **Category error.** Both are SPDX NOASSERTION; neither *is* open source, so "does not suppress open-source adoption" measures nothing. Stars are a bookmarking signal; forks largely reflect self-host/template copying.
3. **Survivorship bias at n=2, refuted internally by n8n's own history.** Licence constant since 2022-03-17, yet ~17,000 stars added in 2024 vs >112,000 in 2025 — a ~6.5× swing with the licence fixed, tracking the AI-agent-node releases, not the licence.
4. **The controlled natural experiments cut the other way.** Terraform MPL→BUSL (2023-08-10) → OpenTofu within weeks (100+ companies, Linux Foundation Sept 2023). Redis BSD→RSALv2/SSPL (Mar 2024) → Valkey (2024-04-01, Linux Foundation, AWS/Google/Oracle); Percona (Sept 2024) reported 83% of large enterprises adopted or exploring Valkey; AWS ElastiCache shipped Valkey Oct 2024; Redis capitulated with AGPLv3 in 8.0 (May 2025). Elasticsearch→OpenSearch likewise.
**Operative lesson now in the doc:** the risk variable is not licence restrictiveness but **whether an actor with motive and capital to fund a credible fork exists**. Also: https://docs.n8n.io/sustainable-use-license/ now 404s; cite the repo LICENSE.md.
**Sources:** https://github.com/n8n-io/n8n/blob/master/LICENSE.md · https://api.github.com/repos/n8n-io/n8n · https://api.github.com/repos/langgenius/dify · https://raw.githubusercontent.com/langgenius/dify/main/LICENSE · https://blog.n8n.io/announcing-new-sustainable-use-license/ · https://socket.dev/blog/n8n-tops-2025-javascript-rising-stars · https://opentofu.org/manifesto/ · https://opentofu.org/blog/opentofu-announces-fork-of-terraform/ · https://spacelift.io/blog/terraform-license-change · https://redisvsmemcached.com/redis-license-timeline/ · https://www.softwareseni.com/the-redis-valkey-fork-how-enterprises-rapidly-migrated-after-the-sspl-license-change/

### FC-3 — OpenClaw gateway defaults and the 2026 exposure numbers
**Verdict: PARTIALLY_TRUE.** Corrected in §3.1, §3.2, §3.6, §8.5.
**Correction:** Every technical default and every number is **verbatim correct** — port 18789; default bind `loopback`; fail-closed auth quote exact; the container `auto`→`0.0.0.0`-unless-Tailscale sentence exact; Censys 21,639 exposed as of 2026-01-31 (from ~1,000 on 25 Jan); Bitsight 30,000+ over 27 Jan – 8 Feb 2026. What fails is **the causal clause "this exposure pattern produced"**:
- The gateway **hard-refuses to bind non-loopback without auth** ("refusing to bind gateway … without auth"), so the container `auto` switch alone cannot produce an open dashboard. Bitsight attributes the cause to users **explicitly** choosing all-interfaces bind at onboarding despite warnings, plus **no enforced token-complexity policy** (a 1-character token `a` was accepted → brute-forceable) and **CVE-2026-25253** (CVSS 8.8, WebSocket origin-validation gap, disclosed 2026-02-03). "21,639 exposed" means *reachable on 18789*, not *unauthenticated*.
- **Source URL corrected:** the container/Tailscale clause lives on the Gateway runbook (docs.openclaw.ai/gateway, /gateway/security), not /security/.
- **Container default is inconsistent in practice:** docs.openclaw.ai/install/docker says `scripts/docker/setup.sh` defaults `OPENCLAW_GATEWAY_BIND=lan` (not `auto`) and generates a token into `.env`; issue #61779 (v2026.4.5) reported the gateway binding 127.0.0.1 inside a container contra the docs (closed via PR #61818); #44101 flags the docs/CLI conflict. Flagged **⚠️ unverified** in §3.2 and §9.
- **Our planned `--unsafe-bind-all` flag diverges from OpenClaw's model** — 2026.3.8+ rejects raw host aliases (`Invalid --bind (use "loopback", "lan", "tailnet", "auto", or "custom")`). §3.6 rewritten to use named bind modes.
- **Numbers are a Jan/Feb snapshot, not current:** Censys confirmed 63,070 live instances by 2026-03-31; SecurityScorecard 40,000+ then 135,000; third-party 220,000+ figures are methodology-inflated. §3.1 now says not to quote a single authoritative count (range 21K–220K, method-dependent).
- **Recommendation impact:** two new checklist items added to §3.6 — **enforce token entropy/length** and **validate WebSocket `Origin` headers** — and a rule against shipping a bare `docker run -p 18789:18789` README example without a pre-generated token. §8.5 item 2 rewritten.
**Sources:** https://docs.openclaw.ai/security/ · https://docs.openclaw.ai/gateway/security · https://docs.openclaw.ai/gateway · https://docs.openclaw.ai/gateway/configuration-reference · https://docs.openclaw.ai/install/docker · https://censys.com/blog/openclaw-in-the-wild-mapping-the-public-exposure-of-a-viral-ai-assistant/ · https://www.bitsight.com/blog/openclaw-ai-security-risks-exposed-instances · https://github.com/openclaw/openclaw/issues/61779 · https://github.com/openclaw/openclaw/issues/44101 · https://blog.cyberdesserts.com/openclaw-exposure-numbers-explained/ · https://www.infosecurity-magazine.com/news/researchers-40000-exposed-openclaw/

### FC-4 — Langflow CVE-2025-3248
**Claim:** unauthenticated RCE at `POST /api/v1/validate/code`, all versions < 1.3.0, CVSS 9.8, CISA KEV 2025-05-05, exploited to deploy the Flodrix botnet.
**Verdict: CONFIRMED.** No change required (§3.3).

### FC-5 — Free-to-paid conversion rates and the $8/mo MRR model
**Verdict: PARTIALLY_TRUE.** Corrected in §0, §5.4, §8.4 (Days 31–60, Days 61–90).
**Correction:**
- **0.5–3% is quoted accurately but is not primary data** — Monetizely (2025-11-07) is a pricing-consultancy marketing page citing no study, no methodology, and gesturing at "OpenView Partners" without a citation.
- **The "2–5% traditional SaaS" baseline is understated, inflating the contrast.** ChartMogul (fielded Jan 2026, n=200 B2B products): **median free→paid is 8%**, bimodal. Lenny Rachitsky / Kyle Poyar / Pendo (Aug 2023, n=1,000+): **developer-focused median 5% — half that of non-developer companies.** Honest contrast: open source ~1–3% vs dev-tools ~5% vs all-B2B ~8%.
- **"31.4% vs 8.9%" is REFUTED and has been deleted.** It is in no primary source; it circulates on AI-generated SEO blogs misattributed to ChartMogul. ChartMogul actually says: *"Free trials that require a credit card see 30% free-to-paid conversion – more than 5x ones that don't require one"* (good 25–35%, great 50–60%). That implies ~5–6% opt-in, not 8.9%; the 8% figure is the all-products median, conflated and given spurious decimals. The ~5× effect is real and directional but **confounded, not causal** — requiring a card changes the denominator.
- **The MRR model was the real error, and it was optimistic.** The arithmetic was internally inconsistent (100,000 × $8 = $4k at 0.5%, $8k at 1%, $24k at 3% — the range given was 1–3%, not 0.5–3%). More fundamentally, applying hosted-SaaS free-trial benchmarks to **self-host installs** is a category error: no signup, no identity, no billing path, and you cannot require a card for a `docker pull`. Observed open-core ratios are an order of magnitude worse: **GitLab** grew registered users ~30M (FY2024) → >50M (FY2025) while Base Customers (>$5k ARR) went 8,602 → 9,893 → 10,682 (FY2026) ≈ **0.02%**; **Elastic's 2018 S-1** showed 5,500+ customers against hundreds of thousands of deployments. Realistic yield from 100,000 self-host installs at $8/mo: **hundreds to low thousands of dollars MRR**, not $8k–$24k.
- **Recommendation impact:** §0 conversion band changed to **~0.02–1%**. §8.4 90-day target revised from "300–500 paying cloud users, $3–6k MRR" to **"50–250 paying cloud users, $0.5–2k MRR,"** with an instruction to instrument cloud signups and self-host installs as separate funnels. The strategic conclusion (the $8 tier is a funnel; build the `packages/ee/` boundary from commit #1; revenue comes from Agency + self-host licence keys) is **unchanged and strengthened**. Explicit instruction added not to cite 31.4%/8.9% or $8k–$24k in investor or planning documents.
- **⚠️ unverified:** ChartMogul's n=200 is self-reported survey data skewed to $1–10M ARR B2B; GitLab/Elastic "customers" are organizations, not seats; **no primary, methodologically transparent study of self-host install→paid conversion exists as of 2026-09-01.** The Elastic S-1 on sec.gov returned HTTP 403 to automated fetch, so its figures come from search-surfaced excerpts, not direct retrieval.
**Sources:** https://www.getmonetizely.com/articles/whats-the-optimal-conversion-rate-from-free-to-paid-in-open-source-saas · https://chartmogul.com/reports/saas-conversion-report/ · https://chartmogul.com/reports/saas-conversion-report-2/ · https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion · https://www.growthunhinged.com/p/free-to-paid-conversion-report · https://www.saastr.com/learnings-free-trials-tomasz · https://ir.gitlab.com/news/news-details/2026/GitLab-Reports-Fourth-Quarter-and-Full-Year-Fiscal-Year-2026-Financial-Results-Board-of-Directors-Authorizes-400-million-for-Share-Repurchase-Program/default.aspx · https://ir.gitlab.com/news/news-details/2025/GitLab-Reports-Fourth-Quarter-and-Full-Fiscal-Year-2025-Financial-Results/default.aspx · https://www.sec.gov/Archives/edgar/data/1707753/000119312518266861/d588632ds1.htm

### FC-6 — Hacker News launch statistics
**Verdict: PARTIALLY_TRUE.** Corrected in §6.1 and §8.4 (Day 0).
**Correction:** The four headline numbers are quoted accurately from arXiv:2511.04453v1 (Obada Kraishan, Texas Tech, submitted 2025-11-06, still v1; **accepted to the AAAI-26 Demonstration track, not a peer-reviewed research track**): mean Δ24h = 121.1, Δ48h = 188.7, Δ7d = 288.5 over 138 pairs; Show HN β=−119.2, SE=138.3, p=0.39; weekend β=+10.2, SE=43.0, p=0.81; R²=0.77 at 48h with day-0 momentum, R²=0.48 at 7d pre-launch-only. Four framing errors:
1. **"Front-page appearance" is not the paper's condition.** Sampling was an Algolia keyword query (`llm`, `gpt`, `rag`, `transformers`, `langchain`, `agents`) with `min_score: 10` — **no front-page filter**, mean in-sample score 187, mean baseline stars 1,247, and **no counterfactual baseline for organic growth**. The paper states it "does not allow us to establish causation."
2. **"~200 extra stars for 12:00–17:00 UTC" is explicitly unadjusted**, with no SE and no p-value — a descriptive difference across 24 bins at ~6 posts each. Contradicted by an analysis of **188,085 Show HN posts (Jan 2012 – Apr 2026)** finding Monday 00:00 UTC best (10.8% reach 50+ points), then Sunday 02:00 (9.8%) and Saturday 19:00 (9.2%), worst Thursday 06:00 (2.6%).
3. **"Show HN confers no significant advantage" misreads an underpowered null** — 95% CI ≈ **−390 to +152 stars**; n=138 with 58 Show HN posts cannot detect an effect this size.
4. **"(medians substantially lower)" is not a reportable number** — the paper asserts it in prose but **reports no median anywhere**; Table 1 has counts only.
**Better calibration added:** ~**1.4 stars per HN point** at 48h across 491 repos scoring 258+ (1.77/point at 258–350 falling to 0.79 at 700+), implying a genuine front-page hit is worth **~360–620 stars at 48h**, i.e. 2–3× the paper's figure. Same source: HN score explains only ~8% of star variance (r=0.29); **92% of star-getting is over by 48h**; median Show HN score is 2 points; ~200 Show HN posts compete daily now vs ~30 a decade ago. arXiv:2506.12643 (2,195 stories / 1,814 repos) confirms significant post-HN increases in stars (p=0.001), forks (p=0.004), contributors (p=0.021) but no magnitudes.
- **Recommendation impact:** §8.4 Day 0 rewritten — **the "post at 13:00–15:00 UTC" rule and the "skip Show HN" rule are both withdrawn**; the base case is now stated as ~120/24h and ~290/7d for a non-front-page post vs **~150–600 at 48h for a real front-page hit**. Added a standing instruction not to chain stars to install/MRR targets without a separate conversion assumption. The strategic conclusion (one HN hit is worth hundreds, not thousands; weight the compounding channels) is unchanged and better supported by the independent data than by the cited paper.
**Sources:** https://arxiv.org/html/2511.04453v1 · https://arxiv.org/abs/2511.04453 · https://arxiv.org/pdf/2511.04453 · https://github.com/obadaKraishan/Launch-Day-Diffusion · https://danfking.github.io/blog/2026/04/23/show-hn-by-the-numbers/ · https://arxiv.org/html/2506.12643v1 · https://news.ycombinator.com/item?id=46121770 · https://www.themoonlight.io/en/review/launch-day-diffusion-tracking-hacker-news-impact-on-github-stars-for-ai-tools
