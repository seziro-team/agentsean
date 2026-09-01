# Agent Sean — Cloud Control Plane

`@agentsean/cloud` is the hosted control plane for **Agent Sean**, the
open-source, self-hosted autonomous SEO agent. Agent Sean itself runs as a
single daemon on the customer's own machine, bound to `127.0.0.1` — it never
opens an inbound port. This app is the multi-tenant web surface that sits in
front of that daemon: sign-in, billing, per-tenant dashboards, a super-admin
console, and a browser terminal that attaches to a customer's daemon through an
outbound relay.

It is a **Next.js 15** (App Router, React 19, TypeScript strict) application,
styled with **Tailwind CSS v4**, backed by **Supabase** (Postgres + Auth), with
a **provider-agnostic billing** layer (Polar.sh primary, Paddle fallback — not
Stripe).

> The public marketing site is a separate static project. This app owns
> everything behind `/login`, `/dashboard`, and `/admin`.

---

## What it does

| Area | Route | Notes |
| --- | --- | --- |
| Auth | `/login`, `/auth/*` | Supabase magic-link + GitHub OAuth, cookie sessions |
| Dashboard | `/dashboard` | Overview, sites, activity (change log + revert), terminal, billing, settings |
| Terminal | `/dashboard/terminal` | xterm.js attached to the daemon via an outbound relay; **read-only by default** |
| Super-admin | `/admin` | KPIs, users, subscriptions, connect payment account, custom payment-link invites, audit log |
| Billing webhook | `/api/webhooks/billing` | Raw-body signature verify, idempotent |

Everything degrades gracefully: **the app builds and boots with zero
credentials**. Each unconfigured integration renders a clearly-labelled "not
configured" banner instead of crashing, and data surfaces with no daemon feed
render explicit empty states — never fabricated metrics.

---

## Prerequisites

- Node **>= 22.19** (the repo standard; the app also builds on Node 20).
- pnpm **10** (via `corepack enable`).
- A Supabase project (free tier is fine) for auth + database.

---

## Quick start (local)

```bash
# from the monorepo root
corepack pnpm install
cp apps/cloud/.env.example apps/cloud/.env.local   # fill in what you need
corepack pnpm --filter @agentsean/cloud dev        # http://localhost:3000
```

With an empty `.env.local` the app still runs — sign-in, billing, and the
terminal show setup banners. Fill in `NEXT_PUBLIC_SUPABASE_*` to enable auth.

### Environment variables

Every variable is documented in [`.env.example`](./.env.example). Summary:

| Variable | Required for | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + DB | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + DB | same |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin console, webhooks | same (service_role — **server only**) |
| `SUPERADMIN_EMAILS` | Bootstrapping the operator | comma-separated emails you own |
| `ADMIN_SECRET_KEY` | Encrypting saved billing creds | `openssl rand -hex 32` |
| `BILLING_PROVIDER` | Billing | `polar` (default) or `paddle` |
| `POLAR_ACCESS_TOKEN` / `POLAR_WEBHOOK_SECRET` | Polar billing | Polar dashboard → Settings |
| `PADDLE_API_KEY` / `PADDLE_WEBHOOK_SECRET` | Paddle billing | Paddle dashboard → Developer Tools |
| `RESEND_API_KEY` / `EMAIL_FROM` | Emailing invites | resend.com (optional; no-ops if unset) |
| `TERMINAL_RELAY_URL` | External WS relay | your relay deployment (optional) |
| `NEXT_PUBLIC_APP_URL` | Absolute callback/webhook URLs | your deployed origin |

No secret is ever committed. `.env.local` is gitignored; only the template is
tracked.

---

## Database (`supabase db push`)

The schema lives in [`../../supabase/migrations`](../../supabase/migrations):

- `0001_init.sql` — `profiles`, `tenants`, `tenant_members`, `sites`,
  `subscriptions`, `billing_events`, `payment_invites`, `daemon_pairings`,
  `terminal_sessions`, `audit_log`, `admin_settings`. **Row Level Security is
  enabled on every table**, with a `is_superadmin()` SQL helper; users see only
  their own tenant's rows, superadmins see all, and the service-role key bypasses
  RLS for trusted server code and webhooks.
- `0002_seed_plans.sql` — plan **metadata** only (a `plan_catalogue` reference
  table), mirroring the locked packaging in `packages/hosted/src/plans.ts`. No
  fake users.

Apply them with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Optionally bootstrap superadmins at the database level (in addition to the
`SUPERADMIN_EMAILS` env var, which promotes on first login):

```sql
alter database postgres set app.superadmin_emails = 'you@example.com';
```

### Enabling auth providers

In the Supabase dashboard → **Authentication → Providers**:

- **Email**: enable "Email" with magic links.
- **GitHub**: enable GitHub, set the OAuth app's callback to
  `https://<your-app>/auth/callback` (and `http://localhost:3000/auth/callback`
  for local).

---

## Pointing it at Polar sandbox

Polar.sh is the default provider. To test end-to-end against the sandbox:

1. Create a **sandbox** organization at <https://sandbox.polar.sh>.
2. Create products for the plans you want to sell; note each `product_id`.
3. Create an **Organization Access Token** (`polar_oat_...`).
4. Create a **webhook endpoint** pointing at
   `https://<your-app>/api/webhooks/billing`; copy its signing secret.
5. Configure either via env or the admin UI:
   - **Env**: set `BILLING_PROVIDER=polar`, `POLAR_ACCESS_TOKEN`,
     `POLAR_WEBHOOK_SECRET`, `POLAR_SANDBOX=true`, and
     `POLAR_PRODUCTS_JSON={"cloud_starter":"prod_...","cloud_pro":"prod_..."}`.
   - **Admin UI**: go to `/admin/billing`, paste the token, secret, product ids,
     and toggle sandbox. Credentials are stored **encrypted at rest**
     (AES-256-GCM under `ADMIN_SECRET_KEY`). The page shows the exact webhook URL
     to paste into Polar and a "send test webhook" button.

Webhooks follow the **Standard Webhooks** spec: headers `webhook-id`,
`webhook-timestamp`, `webhook-signature`; HMAC-SHA256 over
`{id}.{timestamp}.{body}`, base64, timing-safe, with a 5-minute timestamp
tolerance. The route reads the **raw body and verifies the signature before
parsing**, and is idempotent via the `billing_events` table keyed on the
provider event id.

Paddle Billing is a drop-in fallback (`BILLING_PROVIDER=paddle`), using the
`Paddle-Signature` (`ts=<unix>;h1=<hex>`) scheme.

---

## Deploying to Vercel

1. Import the repo into Vercel and set the **Root Directory** to `apps/cloud`.
2. Framework preset: **Next.js**. Build command and output are auto-detected.
3. Add the environment variables from the table above in
   **Project Settings → Environment Variables**.
4. Set `NEXT_PUBLIC_APP_URL` to the deployed origin so callback and webhook
   URLs are absolute.
5. Add your production webhook endpoint in the billing provider's dashboard
   pointing at `https://<your-app>/api/webhooks/billing`.

The app runs on Node serverless functions; nothing requires a persistent
server **except** a native WebSocket relay (see below).

---

## How the terminal relay works

The daemon binds `127.0.0.1` and must never open an inbound port
(`ARCHITECTURE.md` §1/§3). So the browser cannot connect to the daemon directly.
Instead:

```
 daemon  ──dials OUT (WS)──▶  relay  ◀──attaches (WS/SSE)──  browser
```

1. In `/dashboard/terminal`, the user creates a session. `POST /api/terminal/pair`
   mints a **short-lived, single-use pairing code** stored (hashed) in
   `daemon_pairings`.
2. On the customer's machine, `sean connect --cloud <pairing-code>` redeems the
   code for a **long-lived session token**; the daemon then opens an **outbound**
   WebSocket to the relay and streams its terminal output.
3. The browser attaches to the same `sessionId` and renders the stream with
   **xterm.js**.

**Read-only by default — this is a security boundary, not a feature flag.** The
attached process may hold write credentials to a live site. Keystrokes
(browser → daemon) are forwarded **only** when the session is explicitly marked
interactive **and** the user's plan carries the terminal-input entitlement
(`src/lib/terminal/protocol.ts` → `canForwardInput`). A read-only session is
structurally incapable of injecting input; the relay drops inbound `data`
frames rather than trusting the client to disable its own keyboard.

**Transport.** A real WebSocket relay is preferred. Vercel's serverless runtime
cannot host a long-lived WebSocket server, so this app also ships an **SSE
(output) + POST (input) fallback** at `/api/terminal/[sessionId]`, selected
automatically when no `TERMINAL_RELAY_URL` is set. For production interactive
terminals, run the relay as a separate always-on service and point
`TERMINAL_RELAY_URL` at it. See the code comments in
`src/lib/terminal/protocol.ts` and `app/api/terminal/[sessionId]/route.ts`.

---

## Project layout

```
apps/cloud/
  src/
    app/
      login/                 sign-in (magic link + GitHub)
      auth/                  callback route + server actions
      dashboard/             overview, sites, activity, terminal, billing, settings
      admin/                 super-admin console (guarded 404 for non-admins)
      api/
        webhooks/billing/    provider webhook (raw body, verify, idempotent)
        terminal/            pair + attach (SSE fallback) routes
    components/
      ui/                    hand-rolled primitives (button, card, table, …)
      app-shell.tsx          the two-column dashboard/admin shell
    lib/
      env.ts                 typed, lazy env with not-configured signals
      plans.ts               plan catalogue (mirrors packages/hosted)
      auth.ts                session + profile + superadmin resolution
      api.ts / admin-api.ts  Supabase data access (empty states, no fake data)
      billing/               provider interface + polar + paddle + selector
      terminal/protocol.ts   relay message protocol + input authorization
      crypto/envelope.ts     AES-256-GCM secret encryption (admin creds)
      supabase/              server / client / admin / middleware clients
  supabase/migrations/       (repo root) 0001_init.sql, 0002_seed_plans.sql
```

## Verifying

```bash
corepack pnpm --filter @agentsean/cloud build   # succeeds with empty env
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format
```
