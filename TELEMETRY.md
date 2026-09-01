# Telemetry

Opt-out, with a first-run consent screen that prints the exact JSON payload.
Silent telemetry is how GitHub CLI earned a 419-point HN thread in April 2026.
Sean does not do that.

## How to turn it off

```bash
sean telemetry off
# or
export DO_NOT_TRACK=1
export SEAN_TELEMETRY=0
```

Dashboard: Settings → Privacy.

Nothing is sent until you answer the onboard question or run `sean telemetry on`.
Non-interactive `--json` defaults to **off**.

## What we send

Only these fields, defined in `packages/launch/src/telemetry.ts` as `TelemetryPayload`:

| Field | Example |
| --- | --- |
| event | `first_run` · `command_used` · `feature_used` · `error_class` · `cms_type` · `service_installed` |
| version | `2026.9.0` |
| os | `linux` |
| arch | `x64` |
| node | `22.19.0` |
| installMethod | `npx` · `curl` · `homebrew` · `docker` · `source` |
| cmsType | `wordpress` · `shopify` · `git` · `cloudflare` · `other` · `null` |
| command | `doctor` (never argv) |
| feature | `apply` |
| errorClass | `TokenStrengthError` (the class name, not the message) |

There is a single write path: `recordEvent`. Grep that.

Events are appended to `~/.sean/telemetry.log` so you can read them. They are POSTed only if `SEAN_TELEMETRY_URL` is set.

## What we never send

Domain names, URLs, page content, GSC queries, API keys, tokens, IPs, email, refresh tokens.

Preview:

```bash
sean telemetry status --json
```
