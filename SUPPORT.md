# Support

Agent Sean writes to live websites. When something looks wrong, the fastest path
to a fix is the right channel plus a `sean doctor --json` dump. This page routes
each kind of request.

## First, before anything else

Run the diagnostic. It reports version, bind address, provider config, migration
state, and the health of every connection, and it never prints a secret or a
domain.

```bash
sean doctor --json
```

If Sean did something to a site that you did not expect, stop all writes across
every site immediately. This survives a restart.

```bash
sean freeze
```

`sean freeze` is the global kill switch. It halts the executor before any
further change lands. Nothing writes again until you lift it. Use it first and
ask questions second — a queued action can always be re-approved, but an
unwanted write costs a revert.

## Where to ask

| You have | Go to |
| --- | --- |
| A question, a "how do I", a "should I" | [GitHub Discussions](https://github.com/seziro-team/agentsean/discussions) |
| A reproducible bug | [Bug report](https://github.com/seziro-team/agentsean/issues/new?template=01-bug.yml) |
| A feature request | [Feature request](https://github.com/seziro-team/agentsean/issues/new?template=02-feature.yml) |
| A new CMS/platform adapter request | [Adapter request](https://github.com/seziro-team/agentsean/issues/new?template=03-adapter.yml) |
| A security vulnerability | [Private security advisory](https://github.com/seziro-team/agentsean/security/advisories/new) |

Discussions is the default. Most "is this expected" and "how should I configure
this" questions are answered there, and the answer helps the next person.
Reserve Issues for something a maintainer can act on: a bug with steps, a
concrete feature, or an adapter with a named platform.

## Filing a good bug

Bugs that write to a site, bypass an auth check, or leak a secret are treated as
incidents. For everything else, the [bug template](https://github.com/seziro-team/agentsean/issues/new?template=01-bug.yml)
asks for what we need. Include:

- the output of `sean doctor --json` (scrub nothing — it carries no secrets or
  URLs by design)
- the exact command or dashboard action that triggered it
- the CMS or surface involved (WordPress, Shopify, Git, Cloudflare edge, …)
- what you expected versus what happened

Never paste an API key, a refresh token, a Google response, or a full URL into a
public issue. If a report needs any of those to reproduce, open a private
advisory instead.

## "Sean did something bad"

1. `sean freeze` — stop all writes.
2. Open **Activity** in the dashboard. Every change carries a before/after diff,
   the rationale bullets, and a one-click **Revert**. Revert the change.
3. If the change should never have been proposed, that is a bug — file it with
   the finding IDs and the action kind. If an action passed the validator that
   should not have, it is a security issue: open a private advisory.

Every change stores a full before-snapshot in the shadow ledger, so revert does
not depend on the platform having a restore API.

## Security

Do not open a public issue for a vulnerability. Use a
[private GitHub security advisory](https://github.com/seziro-team/agentsean/security/advisories/new).
A secondary channel, `security@agentsean.dev`, is being provisioned. Full policy
and the classes of bug we care about most are in
[`SECURITY.md`](SECURITY.md).

## Out of scope for free community support

The community channels are best-effort, staffed by maintainers and other users.
The following are not covered by free support:

- SEO strategy consulting — what to rank for, whether the traffic is worth
  having, or how to price client work. Sean executes; it does not argue
  strategy. See the "What it does not do" section of the [README](README.md).
- Writing or debugging your own private forks and downstream modifications.
- Guaranteed response times or a support SLA.
- Recovering a site that was changed with the validator, kill switch, or observe
  period deliberately disabled against the documented guidance.
- Operating the daemon exposed to the public internet by binding off-loopback.
  Remote access is Tailscale Serve or a Cloudflare Tunnel; see
  [`SECURITY.md`](SECURITY.md).

## Paid support

The hosted tier includes support, and it is tiered by plan. Cloud plans get
email support; the Business and Agency tiers get priority handling and a faster
queue. Self-host is free and unlimited, and its support is the community
channels above. Pricing and plan contents are in
[`docs/hosted.md`](docs/hosted.md).
