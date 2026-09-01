# Contributing to Agent Sean

Thank you. This project writes to other people's live websites, so the bar is
high: correctness, fail-closed security, and reversible changes.

## CLA

Every contributor must sign the [Contributor License Agreement](CLA.md). The
CLA bot comments on your first PR. We cannot merge without a signature. The CLA
grants relicensing rights so we can keep `packages/ee/` commercial and dual-license
if needed — the Metabase / Grafana / PostHog pattern.

## Requirements

- Node.js **≥ 22.19** (Lighthouse 13; `.nvmrc` pins 22.19)
- pnpm 10 (`corepack enable && corepack prepare pnpm@10.15.1 --activate`)

## Setup

```bash
git clone https://github.com/vp2722/sean.git
cd sean
pnpm install
pnpm test
pnpm build
node packages/cli/dist/bin.js doctor --json --home /tmp/sean-dev
node packages/cli/dist/bin.js start --foreground
```

## Layout

| Path | What |
| --- | --- |
| `packages/cli` | `npx agentsean` / `sean` |
| `packages/daemon` | Fastify, bind policy, security middleware |
| `packages/db` | Drizzle schema, dual SQLite/Postgres |
| `packages/credentials` | `@napi-rs/keyring` + encrypted-file fallback |
| `packages/ee` | commercial, different license — do not copy AGPL code into it without review |

Do not add `keytar`. It is archived.

## Rules that will get a PR rejected

1. **The LLM never holds credentials and never calls a write API.** Typed
   `Action` objects only. Deterministic code validates and applies them.
2. **No CORS configuration exists anywhere in this repo.** That absence is the
   guarantee. Do not add `cors` middleware, `Access-Control-Allow-Origin`, or a
   "just for the dashboard" exception.
3. **Default bind is `127.0.0.1`.** Binding off-loopback without auth must
   refuse to start. Remote access is Tailscale Serve / Cloudflare Tunnel.
4. **Dual-dialect schema.** Every table added to SQLite must land in Postgres in
   the same PR. `schema-parity.test.ts` is the drift guard.
5. **No `0.0.0.0` default. No plaintext secrets in the repo or logs.** Wrap
   secrets in `Secret<T>` from `@agentsean/credentials`.
6. **Do not call this project a fork of OpenSEO**, imply endorsement, or use
   their name/logo in branding. Ported files need the MIT header and an entry in
   `THIRD_PARTY_NOTICES.md`.

## Tests

```bash
pnpm test          # unit + integration (including Host: evil.com → 403)
pnpm typecheck
pnpm lint
pnpm build
```

CI runs typecheck, lint, test, and build on Node 22 and 24, on Linux, macOS,
and Windows.

## License of contributions

You license your contribution under AGPL-3.0-only, and via the CLA you grant us
the right to relicense. Code that belongs in `packages/ee/` must be new work
written against the commercial license, not copied from the AGPL tree.
