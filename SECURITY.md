# Security policy

Agent Sean holds write credentials to customer websites. Treat every issue as
if it could become a live-site incident.

## Bind and auth (non-negotiable)

- Default bind is `127.0.0.1:7777`.
- The process **refuses to start** if asked to bind off-loopback without auth.
- There is **no CORS configuration** in this repository. Do not add one.
- Mutating requests require a custom header (`X-Sean-Csrf`) and a valid token.
- `Host: evil.com` must 403. That test lives in CI.

See [`docs/security.md`](docs/security.md).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Email **security@agentsean.com** (mailbox will be live with the domain claim)
or open a private [GitHub security advisory](https://github.com/seziro-team/agentsean/security/advisories/new)
on this repository.

We will acknowledge within 3 business days and aim to ship a fix or a public
workaround within 14 days for anything that can expose the daemon or write to a
site without an approval that a human actually saw.

## Scope we care about most

1. Anything that lets a web page the daemon crawled cause a write.
2. Anything that bypasses Host / Origin / CSRF / token checks.
3. Anything that logs or returns a decrypted secret.
4. Anything that binds `0.0.0.0` or disables auth by default.
