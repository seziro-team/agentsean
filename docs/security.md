# Security middleware (written in Phase 0, tested in Phase 0)

This is the Phase 4 hardening spec, implemented before the first dashboard
screen. Two named 2025–2026 CVEs (Vite, MCP SDK) are exactly this bug. The
cautionary tale is OpenClaw: a `0.0.0.0` default bind and plaintext credentials
produced CVE-2026-25253 (CVSS 8.8, one-click RCE) and tens of thousands of
exposed instances.

## Rules

1. **Bind `127.0.0.1` only** by default, port `7777`.
2. **Refuse to start** if the bind address is not loopback and auth is not
   enabled. `--no-auth` is rejected off-loopback. Remote access is documented
   via Tailscale Serve / Cloudflare Tunnel, never by binding `0.0.0.0`.
3. **`Host` header allowlist:** `127.0.0.1:<port>`, `localhost:<port>`,
   `[::1]:<port>`. Anything else, including `Host: evil.com`, is **403**.
4. **`Origin` validation.** If the header is present, its host must be on the
   same allowlist. Malformed Origin is 403.
5. **`Sec-Fetch-Site`.** `cross-site` is 403. Missing is allowed (non-browser
   clients: the CLI, curl).
6. **Custom header on every mutating request:** `X-Sean-Csrf: 1`. GET/HEAD are
   exempt. Missing header is 403.
7. **Random token, fail-closed.** Generated on first boot, stored via
   `@agentsean/credentials` (OS keychain, encrypted-file fallback). Mutating
   requests must present it as `Authorization: Bearer <token>`, `X-Sean-Token`,
   or a `sean_token` cookie. Missing/wrong token is **401**. There is no
   "insecure mode" that ships on.
8. **Cookies:** `sean_token` is `HttpOnly; SameSite=Strict; Path=/; Secure` is
   *not* set, because the origin is `http://127.0.0.1` — Secure would make the
   cookie unusable on loopback HTTP. SameSite=Strict is the CSRF brake.
9. **No CORS, ever.** No `Access-Control-Allow-Origin`. No `cors` plugin. A PR
   that adds either is a security bug.
10. **DNS-rebinding test in CI:** send `Host: evil.com` to a live loopback
    server, assert 403.

## What the health endpoint does

`GET /api/health` is Host-checked (so rebinding still 403s) and does **not**
require a token. That is so `sean status` works without printing secrets. It
returns process liveness only — never credentials, never site data.

## Kill switch (stub in Phase 0)

`~/.sean/HALT` (or `SEAN_HALT=1`) is reserved. Phase 4 wires it to halt all
writes. The path is defined now so later code has one place to look.
