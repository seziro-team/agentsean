# Gap 01 — The Onboarding Cliff: Google OAuth, GCP Projects, and GSC Property Verification for a Self-Hosted SEO Agent

**Research date:** 2026-08-31 / 2026-09-01
**Scope:** First-run auth + onboarding for (a) an OSS terminal-installed daemon with a local dashboard on `127.0.0.1`, and (b) a paid multi-tenant hosted tier (~$8/mo). Data sources in play: Google Search Console (Search Analytics + URL Inspection + Sitemaps), GA4, optionally Google Business Profile and Merchant Center.

---

## 0. TL;DR — the decisions

| Decision | Verdict | Confidence |
|---|---|---|
| Ship one `client_id` + `client_secret` inside the public OSS repo | **No.** Google APIs ToS §4(b) says verbatim: *"Developer credentials may not be embedded in open source projects."* OAuth 2.0 Policies say verbatim: *"You must never commit client credentials into publicly available code repositories."* | High — both are primary-source, current |
| Can we avoid the secret entirely with PKCE (public client)? | **No.** Google's token endpoint still demands `client_secret` for installed-app clients; PKCE is additive, not a substitute. Multiple 2024–2025 reports of `client_secret is missing` errors when omitting it. | High |
| Primary strategy | **Operate a first-party OAuth broker** (`auth.<ourdomain>`) that holds the secret server-side, completes the code exchange, and hands the refresh token down to the local daemon over a one-time loopback handoff. This is exactly the architecture Google itself ships for WordPress (Site Kit's `sitekit.withgoogle.com` proxy). | High |
| Escape hatch | **BYO OAuth client** (advanced users, air-gapped, privacy-maximalists, anyone who doesn't want our broker in the loop). ~9 console steps / 8–15 min for a technical user. Must be supported but must NOT be the default. | High |
| Is there a per-project user ceiling after verification? | **Yes, there still is one.** The documented 100-new-user lifetime cap applies to apps that show the unverified screen, but a Google community moderator confirmed (2024-12-25) that *"apps that use OAuth and Cloud Identity have certain quota restrictions based on the risk level of the OAuth scopes an app uses"* — a verified app hit a user cap. Plan to file a **user-cap increase request** as a standing operational task. | Medium-high |
| Can GSC property verification be automated? | **YES — and this is the single biggest under-appreciated finding.** The **Site Verification API** (`siteVerification/v1`) can mint a token (`POST /token`) and trigger Google's check (`POST /webResource?verificationMethod=...`). Combined with CMS write access or registrar DNS APIs, we can verify a property end-to-end with zero user console visits. | High |
| GSC BigQuery bulk export | **UI-only, permanently.** Requires a billing-enabled GCP project, two API enablements, and two IAM grants to `search-console-data-export@system.gserviceaccount.com`. **Defer to power-user opt-in.** The Search Analytics API (25,000 rows/request, 1,200 QPM/site) is sufficient for day one. | High |
| GBP / Merchant Center | **Defer.** GBP needs a manual "Application for Basic API Access" (quota is literally **0 QPM** until approved), requires a **verified & active profile for 60+ days**, stated ~14-day review, real-world reports of 10+ business days with no response. | High |

**Target: time-to-first-insight ≤ 5 minutes** is achievable for the hosted tier and for self-hosters using the broker, **only if** GSC property verification is automated or already done. It is not achievable on the BYO-GCP-project path.

---

## 1. The Google OAuth constraint stack (primary sources, verbatim)

### 1.1 Publishing status: Testing vs In production

From **Manage App Audience** (support.google.com/cloud/answer/15549945):

- *"Projects configured with a publishing status of **Testing** are limited to up to 100 test users listed in the OAuth consent screen."*
- *"Projects configured with a publishing status of **In production** are available to any user with a Google Account."*
- *"Authorizations by a test user will expire seven days from the time of consent. If your OAuth client requests an `offline` access type and receives a refresh token, that token will also expire."*

**Implication:** a 24/7 daemon on a Testing-mode client dies silently every 7 days with `invalid_grant`. This is the #1 support-ticket generator for every self-hosted Google integration (Home Assistant's docs literally warn: *"Otherwise, your credentials will expire every 7 days."*).

### 1.2 The 100-new-user lifetime cap

Same page:

- Unverified apps that *"present the unverified app screen to users"* have a quota of *"100 new users in total, after the app presents the unverified app screen."*
- *"The user cap applies over the entire lifetime of the project, and it cannot be reset or changed."*

**Implication:** a single shipped `client_id` on an unverified project is dead at user 101 — permanently. You cannot fix it by making a new OAuth client inside the same project; the cap is at the *project* level.

### 1.3 There is still a cap AFTER verification

Google Developer forums thread *"OAuth user cap reached limit although our application already verified"* — moderator `ruthseki`, 2024-12-25:

> *"To protect users and Google systems from abuse, apps that use OAuth and Cloud Identity have certain quota restrictions based on the risk level of the OAuth scopes an app uses."*

The remedy offered was: (a) file a formal **quota/user-cap increase request** describing the app and use case, or (b) drop to lower-risk scopes.

**Flag:** this is a moderator statement on a forum, not a published quota table. Google does not publish the post-verification user cap number. **Treat "verified = unlimited users" as false.** Budget for a cap-increase request before we cross a few thousand connected accounts.

### 1.4 When verification is NOT needed

From **When is verification not needed** (support.google.com/cloud/answer/13464323):

1. *"If the app is for your personal use (fewer than 100 users), you and your limited number of users can continue using the app without going through verification"*
2. *"Apps in development/testing/staging mode are not subject to verification"*
3. App *"only accesses its own data (using a Service Account), and not user data"*
4. *"The app is only used by people in your Google Workspace or Cloud Identity organization"* (= **Internal** user type)
5. Workspace admin-trusted / admin-installed Marketplace apps

Notably, **there is no "desktop app" or "locally-run binary" exemption**. The doc does not exempt native apps from verification.

### 1.5 "Internal" is not available to a gmail.com user

`Internal` user type requires a Google Workspace or Cloud Identity organization. A personal `@gmail.com` Cloud project can only choose **External**. External + Testing ⇒ 7-day token expiry. External + In production + sensitive scopes ⇒ unverified-app screen + 100-user lifetime cap until verified.

> You can move External → Internal? **No.** You can go Internal → External, not the reverse.

**Implication:** for the BYO path, a gmail.com self-hoster *must* click "Publish app" (moving to In production) to avoid the 7-day expiry, which then shows them the scary "Google hasn't verified this app" interstitial — but as the sole user of their own project they are inside the 100-user allowance forever. **The 7-day expiry CAN be avoided without verification** — publish to production and accept the unverified warning. That is the correct instruction to give BYO users.

### 1.6 Installed apps cannot keep secrets — but you still need one

From **OAuth 2.0 for iOS & Desktop Apps** (developers.google.com/identity/protocols/oauth2/native-app):

- *"Installed apps are distributed to individual devices, and it is assumed that these apps cannot keep secrets."*
- *"Google supports the Proof Key for Code Exchange (PKCE) protocol to make the installed app flow more secure."*
- Redirect options: **loopback IP** `http://127.0.0.1:<port>` or `http://[::1]:<port>` (recommended for macOS/Linux/Windows desktop); **custom URI schemes** *"are no longer supported due to the risk of app impersonation"*; **OOB / manual copy-paste is no longer supported.**
- *"incremental authorization with installed apps is not supported due to the fact that the client cannot keep the `client_secret` confidential."* ← **this kills incremental scope-granting on a Desktop-app client type.**

Despite the "cannot keep secrets" framing, Google's implementation **requires** the secret at the token endpoint. Google Developer forums thread *"Authorization Code Flow without client secret"*: a Google staffer (`mcbsalceda`, 2024-10-01) claimed PKCE *"conveniently skips the need for a client secret"*, but this was contradicted by users on 2024-11-21, 2025-05-12, and 2025-05-17, all of whom got **`client_secret is missing`** errors with a valid `code_verifier`.

**Verdict: PKCE-only public-client flow does not work against Google as of mid-2025. Assume you need a secret.**

### 1.7 The two hard prohibitions on shipping the secret

- **Google APIs Terms of Service §4(b)** (last updated 2021-11-09, still current):
  > *"Developer credentials (such as passwords, keys, and client IDs) are intended to be used by you and identify your API Client. You will keep your credentials confidential and make reasonable efforts to prevent and discourage other API Clients from using your credentials. **Developer credentials may not be embedded in open source projects.**"*
- **OAuth 2.0 Policies** (developers.google.com/identity/protocols/oauth2/policies):
  > *"You must never commit client credentials into publicly available code repositories."*
  > *"You must create a separate OAuth client for each platform on which your app will run."*
- **Manage OAuth Clients** (support.google.com/cloud/answer/15549257):
  > *"Never add client secrets directly in your code or check them into version control systems such as Git or Subversion."*
  > Since June 2025: *"Client secrets for OAuth 2.0 clients are only visible and downloadable from the Google Cloud Console at the time of their creation"* — afterwards only the last four characters are shown.

This is the crux. **rclone ships a Drive client_id/secret and it works in practice**, and the community-consensus reading (google-auth-library-nodejs issue #959, opened 2020-05-12, closed "not planned", never answered by Google) is that RFC 8252 makes a native-app secret non-confidential anyway. But the *written* ToS is unambiguous, and we are building a commercial hosted tier on the same Google relationship. **Do not bet the company's Google account on the rclone precedent.**

### 1.8 Unused OAuth clients are now deleted

OAuth 2.0 Policies changelog, **2025-10-27 — "Added policy for unused client deletion"**:

> *"Google reserves the right to delete unused OAuth clients if the client is inactive for at least 6 months. Unused clients are clients that have not been used in token exchanges or had their configuration edited for at least 6 months. Deleted clients can be restored in the Google Cloud Console for 30 days following deletion."*

Announced in the Google Developers Blog post *"Usability and safety updates to Google Auth Platform"* (2025-04-28), effective from June 2025.

**Implication for BYO path:** a self-hoster who pauses the daemon for 6 months loses their OAuth client. Our daemon should detect `invalid_client` / `deleted_client` and tell them they have 30 days to restore it in the console.

### 1.9 Everything that revokes a refresh token (the daemon MUST handle all of these)

Per Nango's `invalid_grant` teardown (2026-04-01) cross-checked against Google docs:

1. Publishing status = Testing → **7 days**
2. User revoked access in their Google Account
3. **Refresh token unused for 6 consecutive months** → auto-invalidated
4. Password reset (applies when Gmail scopes are held)
5. **>100 live refresh tokens per user per OAuth client** → oldest silently invalidated
6. Workspace admin scope restriction / time-bound access
7. Undocumented Google security heuristics

Nango observes ~1%/month revocation is normal in production. **Design for token loss as a routine event, not an exception.**

---

## 2. Q1 — Can we ship one pre-registered client in the repo?

### 2.1 The interaction matrix

| Config | Users allowed | Refresh token life | Consent screen | Verdict for us |
|---|---|---|---|---|
| External + **Testing** | ≤100 allowlisted test users (emails we must add manually) | **7 days** | Unverified warning | **Unusable.** Manual allowlisting + weekly death. |
| External + **In production**, unverified, sensitive scopes | **100 new users, lifetime of the project, non-resettable** | Indefinite (subject to §1.9) | "Google hasn't verified this app" interstitial | Dead at user 101. Permanent. |
| External + **In production**, **verified** | Large but **not documented as unlimited**; a cap tied to scope risk level still exists and requires a manual increase request | Indefinite | Clean, branded | **Viable** — but the secret must not be in the repo. |
| **Internal** (Workspace org) | Org members only | Indefinite | Clean | Irrelevant — our users are not in our org. |

### 2.2 "Do their tokens transit our consent screen but never our servers?"

If we ship the client_id/secret in the binary and the user runs a pure loopback flow: **yes** — the browser hits `accounts.google.com` with *our* client_id, Google redirects to `http://127.0.0.1:<port>`, and the local daemon does the code→token exchange directly with `oauth2.googleapis.com`. Nothing touches our infra. Our consent screen brand ("Continue to <Product>") is shown; our verification and our privacy policy are what Google evaluated.

**Is that permitted?** Two problems:

1. **ToS §4(b)** — the credentials are embedded in an open-source project. Direct violation of written terms.
2. **Brand/accountability mismatch.** Google verified *our* app against *our* privacy policy and *our* declared data handling. Every self-hoster's daemon is then operating under our identity, on infrastructure we do not control, with data flows we cannot attest to. If any of them abuses a scope, our client gets suspended and **every** user of the product loses access at once. Single point of catastrophic failure.

Additionally, a shipped client means **shared per-project quota**. GSC Search Analytics per-project ceiling is 40,000 QPM / 30,000,000 QPD and URL Inspection is 15,000 QPM / 10,000,000 QPD — generous, but rclone's forum is full of users hitting rate limits on the shared default client. At scale, one abusive self-hoster degrades everyone.

### 2.3 Recommended strategy: the OAuth broker (a.k.a. "Connect Service")

**This is what Google itself does for the exact same problem.** Site Kit for WordPress is an OSS plugin (`github.com/google/site-kit-wp`) installed on millions of self-hosted WordPress sites. It does **not** ship a client secret. Instead:

- The plugin redirects the admin to `https://sitekit.withgoogle.com/site-management/setup/` with `nonce`, `name`, `url`, `rest_root`, `admin_root`.
- The proxy registers the *site* as an entity, returns a `site_id` + `site_secret` over a REST callback, validated against the nonce.
- Proxy-issued credentials are identified by `client_id` containing `.apps.sitekit.withgoogle.com`.
- The proxy runs the Google OAuth grant **and** the Search Console site-ownership verification.

**Our version:**

```
┌── user's machine (127.0.0.1:7777) ──┐        ┌── auth.ourdomain.com ──┐      ┌── Google ──┐
│ daemon starts local callback server │        │ holds client_secret     │      │            │
│ opens browser →────────────────────────────► │ /start?state=&pkce=&cb= │ ───► │ consent    │
│                                     │        │ /callback (registered   │ ◄─── │ code       │
│ ◄─── 302 to http://127.0.0.1:7777/  │ ◄───── │  redirect_uri)          │      │            │
│      #refresh_token=... (fragment)  │        │ exchanges code→tokens   │ ───► │ /token     │
│ stores token in ~/.config/<app>/    │        │ DOES NOT PERSIST tokens │      │            │
└─────────────────────────────────────┘        └─────────────────────────┘      └────────────┘
```

Properties:
- Secret never leaves our server. ToS-compliant.
- One verified client, one consent screen, one privacy policy — the thing Google actually reviewed.
- **Tokens can be made non-persistent server-side.** Publish this as a documented, auditable guarantee ("your broker exchange is stateless; we log only a hashed install ID and a timestamp"). The refresh token is written only to the user's disk.
- We can revoke a single abusive install without nuking the client.
- Hosted tier uses the same client, with tokens stored (encrypted) server-side.

Costs/risks:
- The broker is a hard dependency for offline/air-gapped installs → **must** ship the BYO escape hatch.
- **Security precedent to learn from:** Wordfence disclosed a critical Site Kit vulnerability in 2020 (CVE-2020-9337) where the proxy-issued setup URL/nonce leaked and let an attacker gain **Search Console owner access**. Our nonce/state must be: 256-bit CSPRNG, single-use, ≤5-minute TTL, bound to the local daemon's ephemeral public key, and never rendered into any page readable by a lower-privileged user. Deliver the token back **encrypted to a daemon-generated ephemeral X25519 key**, not in plaintext.
- Redirect URI: because the broker is a **Web application** client, we register one exact HTTPS redirect (`https://auth.ourdomain.com/oauth/callback`). Web-app clients require *exact* redirect URI matches — you cannot register a wildcard loopback port. (Only the **Desktop app** client type gets automatic any-port loopback, which is why the BYO path should tell users to pick "Desktop app".)

---

## 3. Q2 — The BYO Google Cloud project path, step by step

This is the path we must document but must not default to. Reference implementation to copy: Home Assistant's Google Calendar docs (home-assistant.io/integrations/google/), which is the most battle-tested consumer-facing version of this instruction set.

### 3.1 Exact steps (2026 "Google Auth Platform" console layout)

The OAuth config pages moved out of "APIs & Services" into a dedicated **Google Auth Platform** section in April 2025.

| # | Page | Action | Failure mode |
|---|---|---|---|
| 1 | console.cloud.google.com | Create project (name it) | Requires accepting GCP ToS on first-ever use; org-managed accounts may be blocked from creating projects |
| 2 | API Library | Enable **Google Search Console API** (`searchconsole.googleapis.com` / `webmasters.googleapis.com`) | Wrong project selected |
| 3 | API Library | Enable **Google Analytics Data API** (`analyticsdata.googleapis.com`) | — |
| 4 | API Library | Enable **Google Analytics Admin API** (`analyticsadmin.googleapis.com`) — needed for `accountSummaries.list` to discover properties | Users skip it, then property picker is empty |
| 5 | API Library | Enable **Site Verification API** (`siteverification.googleapis.com`) — needed for auto-verify | — |
| 6 | Google Auth Platform → Branding | App name, user support email, **External** audience, developer contact email, accept policy | Support email dropdown often empty for fresh accounts |
| 7 | Google Auth Platform → **Audience** | Click **Publish app** (Testing → In production) | **If skipped: 7-day token death.** This is the single highest-value instruction on the page. |
| 8 | Google Auth Platform → Data Access | Add scopes: `webmasters.readonly` (or `webmasters`), `analytics.readonly`, `siteverification` | Scope picker only lists scopes for *enabled* APIs → ordering matters |
| 9 | Google Auth Platform → Clients | Create client, type = **Desktop app** | HA tells users "Web application" + a fixed redirect; for a `127.0.0.1` daemon, **Desktop app** is correct (arbitrary loopback port) |
| 10 | — | Copy Client ID + **Client Secret** | Since June 2025 the secret is **shown once only** and thereafter masked to last-4. Users who close the dialog must create a new client. |
| 11 | Our dashboard | Paste both into the local UI | Whitespace/paste errors |
| 12 | Browser | Complete consent, click through **"Google hasn't verified this app" → Advanced → Go to <app> (unsafe)** | Highest psychological drop-off point |

Google's own note: *"activation may take up to five hours in some circumstances"* after enabling APIs — so a user who does everything right can still see `SERVICE_DISABLED` errors.

### 3.2 Time and drop-off (estimates, not sourced data)

| Cohort | Realistic time | Estimated completion |
|---|---|---|
| Developer, has used GCP before | 6–10 min | ~85% |
| Technical marketer / agency, first GCP project | 15–25 min | ~45% |
| SMB owner (the "local business" persona) | 30–45 min, or never | ~10–15% |

> **These percentages are my estimates from the structure of the flow (12 pages, one irreversible one-shot secret, one scary security interstitial, one silent 7-day time bomb), not from a published study. Flag as unsourced.** The directional signal is corroborated: n8n does not offer managed OAuth to self-hosted users and their community is full of "how do I set up Google OAuth for self-hosted n8n" posts; Home Assistant's Google Calendar setup has been a perennial top support topic (see `home-assistant/core` issue #90147).

### 3.3 Can the 7-day expiry be avoided without verification? — **Yes**

**Publish the app (Audience → Publish app / "In production") while remaining unverified.** The user then:
- gets indefinite refresh tokens,
- sees the unverified-app interstitial once,
- consumes 1 of their own project's 100 lifetime new-user slots (irrelevant for a single-operator project).

Do **not** tell BYO users to stay in Testing and add themselves as a test user. That is the wrong advice and it is what most third-party tutorials say.

> Some Home Assistant community guidance says to pick application type **"TVs and Limited Input devices"** to avoid the 7-day expiry. The current official HA doc says "Web Application" and attributes the 7-day expiry to publishing status, not client type. **The client-type theory is folklore; the publishing-status cause is documented by Google.** Use publishing status.

---

## 4. Q3 — Verification for the hosted tier / the shared broker client

### 4.1 Requirements (developers.google.com/.../sensitive-scope-verification + support.google.com/cloud/answer/13464321)

**Brand verification (all apps that want their name/logo on the consent screen):**
- Homepage *"publicly accessible, and not just accessible to your site's logged-in users"*, clearly relevant to the app, **not** a Play Store or Facebook link, and **not** just a login page. It must describe the app's functionality and link to the privacy policy.
- Privacy policy *"visible to users, hosted within the same domain as your application's home page"*, linked from both the homepage and the OAuth consent screen, and disclosing *"the manner in which your application accesses, uses, stores, or shares Google user data."*
- **Domain ownership verified in Google Search Console** by *"an account listed as a project owner or editor on your GCP account."* (Nicely recursive: to get GSC API access we must first verify our own domain in GSC.)
- Google branding guidelines on any "Sign in with Google" button.
- Up-to-date contact info.

**Sensitive scope verification (additional):**
- Per-scope written justification.
- A **demo video**, English, unlisted on YouTube, showing: the **end-to-end** flow of the app, the **complete OAuth consent screen**, that *"the OAuth consent screen correctly displays the App Name"*, and that *"the browser address bar of the OAuth consent screen correctly includes your app's OAuth client ID"*, plus how each sensitive scope's data is used in a user-facing feature.
- Narrowest-scope principle; no third-party data transfer without consent.
- Restricted scopes additionally require a **CASA security assessment** — we should avoid restricted scopes entirely (none of GSC/GA4/GBP/Merchant are restricted).

### 4.2 Stated vs real turnaround (2026 evidence)

Google states: *"The sensitive scope verification process typically takes 3-5 business days"* and the Verification Center says *"Expect the first email from our Trust and Safety team within 3-5 days."*

Reality, from Google Developer Forums, all 2026 unless noted:

| Thread | Scopes | Submitted | Elapsed at time of post |
|---|---|---|---|
| "OAuth Verification Stuck for ~12 Weeks" | `spreadsheets` (sensitive) + `drive.file` | 2026-05-28 | **86+ days**, stuck on "Privacy Policy Requirements", zero Trust & Safety contact |
| "OAuth verification under review since July 22, 2026" | `calendar.events` (sensitive) | 2026-07-22 | **33 days**, all 5 criteria passed, no T&S email ever received |
| "OAuth data access verification stuck under review for 8+ weeks" | `spreadsheets` only | — | 8+ weeks vs a referenced "4–6 week review window" |
| "OAuth Verification for Workspace Add-on Stuck for 8+ Weeks" | Workspace add-on | — | 8+ weeks |
| "OAuth Verification stuck on Privacy Policy phase for over 5 weeks" | — | — | 5+ weeks |
| Rejection example, July 2026 | — | — | Rejected because *the app name on the consent screen did not match the app name on the homepage* |

**Plan for 6–12 weeks, not 3–5 days. Start verification on day 1 of the project, before the product exists.** The homepage + privacy policy + a verified domain are the long pole; build them first, point the consent screen at them, and submit while still coding.

### 4.3 Is an open-source project with a public client_secret accepted?

No primary source addresses this directly. But:
- ToS §4(b) prohibits it outright, so submitting an app whose secret is in a public repo is submitting an app in known breach of terms.
- google-auth-library-nodejs#959 asked exactly this in 2020 and Google never answered; issue closed "not planned."

**Conclusion: don't test it. The broker architecture sidesteps the question entirely** — our submitted app is a hosted web app with a private secret, which is a completely normal thing to verify. The fact that a self-hosted OSS client talks to it is not something the verification reviewer needs to (or can) object to, provided the demo video and privacy policy describe the real architecture.

### 4.4 Will a demo video of a localhost dashboard be accepted?

The requirements demand the reviewer see the consent screen with the app name and the client_id visible in the address bar, and see each scope's data used in a user-facing feature. Nothing requires a public URL for the *app itself* — only the **homepage** and **privacy policy** must be publicly hosted. A screen recording that shows:

1. `https://ourdomain.com` homepage (public, on the verified domain),
2. clicking Connect → the `accounts.google.com` consent screen with app name + `client_id` in the URL bar,
3. redirect landing on `http://127.0.0.1:7777/...`,
4. the dashboard rendering GSC clicks/impressions and GA4 sessions,

should satisfy it. **Risk mitigation: record the video against the HOSTED tier at `app.ourdomain.com`, not localhost.** It removes an entire category of reviewer confusion, and the hosted tier is a real product we're shipping anyway. **Verify the hosted app; the self-hosted client just reuses the verified client via the broker.**

### 4.5 Re-verification when adding scopes later

From **Changes to approved app** (support.google.com/cloud/answer/13464018):

> *"You can add new sensitive or restricted scopes in the Cloud Console OAuth consent screen configuration page any time. However, your app needs to be verified and approved for these scopes before your app can start to call these APIs."*
> If you deploy new scopes before approval, *"your users will start to see an unverified app warning pop-up"* and the app faces the 100-user cap restriction.

And for cosmetic changes (name, logo, redirect URI, homepage link, privacy policy link): brand verification must be redone, but *"These changes will not be visible to the users till the app is reverified. These changes do not trigger the unverified app screen or the 100-user cap."*

The video must show *"the same exact scopes you are requesting (or you have already been verified for) when you submit your app for re-verification."*

**Architectural consequence — this is important:**
- **Declare the full scope set up front** in the first verification submission, including `business.manage` and `content`, even if we don't ship those features for 6 months. Adding them later means another 6–12 week review and, if we ship early, an unverified-app screen + a **100-user lifetime cap that would then apply to our production client**. That would be catastrophic.
- Counter-pressure: the "request the narrowest scopes" rule means over-declaring risks rejection. **Compromise: declare the scopes for features that will exist within ~2 quarters, with real justifications, and be prepared to demo each one in the video.** Do not declare `business.manage` unless the GBP feature is genuinely built, because you cannot demo it without GBP API access, which itself needs a separate 14-day approval.
- **Never rename the app or change the logo casually** once verified.

### 4.6 Scope sensitivity — an unresolved but load-bearing question

I could **not** find a primary Google source that states the sensitivity classification of the specific scopes we need. Google's position is that classification is shown *in the Cloud Console* Data Access page, not in published docs:

> *"scope categories (non-sensitive, sensitive, or restricted) are indicated automatically in the Google Cloud Console."*

Working assumptions (must be confirmed by opening the Data Access page in a real project — a 2-minute check):

| Scope | Assumed class | Note |
|---|---|---|
| `.../auth/webmasters.readonly` | Possibly **non-sensitive** | A non-primary blog (gscdump.com) claims Google reclassified this as non-sensitive in 2024. **Unverified, and the claim itself is 2024-vintage — treat as possibly stale.** |
| `.../auth/webmasters` (read/write: sitemaps, sites.add) | Likely **sensitive** | Write access to a user's Search Console |
| `.../auth/analytics.readonly` | Likely **sensitive** | |
| `.../auth/siteverification` | Likely **sensitive** | Grants ability to claim ownership of sites |
| `.../auth/siteverification.verify_only` | Lower risk than full | *"Ability to verify new sites, no read access for existing verified sites"* — **prefer this one** |
| `.../auth/business.manage` | **Sensitive** + separate GBP access approval | |
| `.../auth/content` (Merchant) | **Sensitive** — Merchant docs say verification *"usually takes 3-5 business days"* | |
| None | **Restricted** | Good — no CASA assessment needed |

**Action item: before writing any code, create a throwaway GCP project, add all candidate scopes on the Data Access page, and screenshot the sensitivity labels.** The entire verification timeline hinges on this.

---

## 5. Q4 — Google Search Console property verification (the real onboarding blocker)

### 5.1 How many SMB sites are already verified? — no good data exists

I could not find a credible, primary survey of GSC verification rates among small businesses. What exists:

- BuiltWith/aggregator-derived claims of *"~20 million websites"* using Search Console (secondary, mycodelesswebsite.com, unsourced; the page 403'd on direct fetch).
- Birdeye's *State of Google Business Profile 2026*: **76% of businesses verified in 2025, up from 71% in 2024** — but that is **Google Business Profile** verification among *"the largest global brands across 30+ industries"*, NOT Search Console, and NOT SMBs. **Do not cite this as a GSC number.**
- Clutch *State of Small Business Websites 2025* exists but I could not extract a GSC-specific figure.

**Treat "a large share of SMB sites are not verified in GSC" as a plausible but unquantified assumption.** Design as if **30–60% of inbound self-serve signups will arrive with no verified GSC property.** The product must handle this gracefully or it loses that entire cohort at step one. Recommend running our own instrumented measurement post-launch (count of `sites.list` returning zero or `siteUrl` with `permissionLevel: siteUnverifiedUser`).

### 5.2 There IS a programmatic verification path: the Site Verification API

This is the highest-leverage finding in this dossier and it appears to be under-used by SEO tooling.

**API:** `https://www.googleapis.com/siteVerification/v1/`
**Scopes:** `https://www.googleapis.com/auth/siteverification` (full) or `https://www.googleapis.com/auth/siteverification.verify_only` (verify new sites, no read of existing).

**Two-call flow:**

1. **Mint the token**
   `POST https://www.googleapis.com/siteVerification/v1/token`
   ```json
   { "site": { "type": "SITE", "identifier": "https://example.com/" },
     "verificationMethod": "FILE" }
   ```
   → `{ "method": "FILE", "token": "google1a2b3c4d5e6f.html" }`

   `site.type` ∈ `SITE` | `INET_DOMAIN` | `ANDROID_APP`
   `verificationMethod` ∈ `ANALYTICS` (sites only) · `DNS_CNAME` (domains only) · `DNS_TXT` (domains only) · `FILE` (sites only) · `META` (sites only) · `TAG_MANAGER` (sites only). (`DNS` is legacy — use `DNS_TXT`.)

2. **Place the token, then ask Google to check**
   `POST .../webResource?verificationMethod=FILE` with the same site body. Google fetches and, on success, adds the web resource to the authenticated user's verified collection.

Other methods: `webResource.list` (*"complete listing of all the web resources that belong to the authenticated user"*), `webResource.get`, `webResource.delete` (un-own).

**This means: yes, there is a fully programmatic verification path — provided we can place the token.**

### 5.3 What our agent can actually automate

| Method | Property type | What we need | Automatable by us? |
|---|---|---|---|
| `FILE` (HTML file at root) | URL-prefix | CMS/FTP/S3 write, or a WordPress plugin, or a "serve this file" reverse-proxy snippet | **Yes**, if we already have CMS write creds (which we need anyway for the "execute SEO work" thesis) |
| `META` (tag in `<head>`) | URL-prefix | CMS theme/header write | **Yes** — same |
| `DNS_TXT` / `DNS_CNAME` | **Domain property** (the only way) | Registrar/DNS API: Cloudflare, Route53, Namecheap, GoDaddy, DNSimple, Porkbun, Vercel, Netlify | **Yes with an API token**; otherwise a copy-paste wizard |
| `ANALYTICS` | URL-prefix | **"edit" rights on the Analytics account**, same Google Account, and `analytics.js`/`gtag.js` already in `<head>` | **Yes, and this is the killer shortcut** — if they connect GA4 first and their site already has gtag, verification can be a single API call with zero site changes |
| `TAG_MANAGER` | URL-prefix | "Publish or Admin" on the GTM container; `<noscript>` immediately after `<body>` | Yes if GTM connected |
| Google Sites / Blogger | both | — | *"verified automatically"* when the same Google Account is used |

**Design consequence: connect GA4 BEFORE Search Console.** If the user has GA4 with edit rights and gtag on the homepage, we can verify GSC via `ANALYTICS` with zero manual steps. That flips the worst step in onboarding into a no-op for a meaningful share of users.

**Verification is not permanent:** *"Verification lasts as long as Search Console can confirm the presence and validity of your verification token."* Google *"periodically checks"*; a theme update that strips the meta tag eventually revokes ownership. **The daemon must re-assert verification on a schedule (weekly `webResource.list`) and re-place the token if it disappears.**

### 5.4 `sites.add` — what it actually does

`PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}` — scope `https://www.googleapis.com/auth/webmasters`, empty request body, empty success response. `siteUrl` is either `http://www.example.com/` (trailing slash mandatory) or `sc-domain:example.com`.

The reference page documents **no** verification requirement and **no** error semantics. Search Console Help confirms the underlying behaviour: *"data collection for a property starts as soon as anyone adds the property to their Search Console account, even before verification"*, and to finish you *"select the saved (but unverified) property in the property selector and select Verify."*

**So: `sites.add` creates an unverified/saved property. It is a prerequisite for verification, not verification itself.** Correct sequence:

```
sites.add(siteUrl)                       # creates unverified property, starts data collection
→ siteVerification.token(...)            # mint
→ place token (CMS write / DNS API / already-present gtag)
→ siteVerification.webResource.insert(...)  # Google checks
→ sites.list() → confirm permissionLevel == siteOwner / siteFullUser
```

Site Kit does effectively this: *"If your site does not already have an associated Search Console property, Site Kit creates a URL-prefix property and connects it to your site"*, and it *"attempts verification through a virtual HTML file upload method, and if that fails due to hosting or other restrictions, it tries to verify site ownership with an HTML tag."* **Copy this fallback chain verbatim.**

Site Kit's precedence rule is also worth copying: domain properties are auto-connected only if the site URL is at root level, and *"not connected if you also have a URL-prefix property that has been manually verified, as that takes precedence."*

### 5.5 Data-collection nuance that makes early verification urgent

GSC does not backfill. A property added today starts collecting today (and gets ~16 months of history only if the property already existed). **Message to show any unverified user: "Every day you wait is a day of history you can never recover." That's the activation lever.**

---

## 6. Q5 — GSC BigQuery bulk export

### 6.1 Confirmed: enablement is UI-only

From **Start a new bulk data export** (support.google.com/webmasters/answer/12917675), the full sequence:

1. Google Cloud Console → select project
2. APIs & Services → enable **BigQuery API**
3. …and **BigQuery Storage API**
4. IAM & Admin → **+ GRANT ACCESS**
5. Principal: `search-console-data-export@system.gserviceaccount.com`
6. Roles: **BigQuery Job User** *and* **BigQuery Data Editor**
7. Search Console → **Settings → Bulk data export**
8. Enter the Cloud **project ID** (not project number)
9. Dataset name (default `searchconsole`; custom names *"must begin with `searchconsole`"*)
10. Choose dataset location (**effectively immutable afterwards**)
11. Continue

*"The first export will happen up to 48 hours after your successful configuration."* Retries the next day on error.

There is **no Search Console API method to enable, configure, or query the state of bulk export.** It is a Settings-page-only feature. Nothing in the 2025–2026 docs suggests this is changing.

Tables produced (support.google.com/webmasters/answer/12917991):
- `searchdata_site_impression` — `data_date, site_url, query, is_anonymized_query, country, search_type, device, impressions, clicks, sum_top_position`
- `searchdata_url_impression` — adds `url`, `is_anonymized_discover`, `sum_position`, plus boolean search-appearance flags
- `ExportLog` — `agenda, namespace, data_date, epoch_version, publish_time`

Coverage: *"all the performance data available to Search Console for your property, with the exception of anonymized queries."* Cost: BigQuery-side only (Google's free tier is 10 GB storage + 1 TiB queries/month; **a billing account is still required**).

### 6.2 Is the Search Analytics API enough for day one? — Yes

| | Search Analytics API | BigQuery export |
|---|---|---|
| Enablement | OAuth only | 11 manual steps + billing account |
| Rows | 25,000 per request (paginate with `startRow`) | unlimited |
| Dimensions | `query, page, country, device, searchAppearance, date, hour` | same, plus per-row granularity |
| Quota | 1,200 QPM/site, 1,200 QPM/user; 40,000 QPM & 30,000,000 QPD per project | n/a |
| Row sampling | *"does not guarantee to return all data rows but rather top ones"* | complete (ex-anonymized) |
| Freshness | `dataState` = `final` \| `all` \| `hourly_all`; response carries `first_incomplete_date`/`first_incomplete_hour` | ~48h initial, then daily |
| Time to first data | seconds | up to 48 hours |

**Decision: BigQuery is a power-user opt-in surfaced in Settings after week one, never in onboarding.** Justify it to users on exactly one axis — *"query × page joined rows, which the API cannot give you in bulk"* — and gate it behind a "Advanced: unlock long-tail query→URL mapping" card. Ship a copy-pasteable checklist and a one-click "test my export" button that runs a `bq` job against `ExportLog`.

If we ever need it at scale for hosted customers, note the export is keyed to *their* GCP project, so hosted-tier BigQuery means asking a $8/mo customer to open a Cloud billing account. **That will not happen. Do not build hosted-tier features that assume BigQuery.**

---

## 7. Q6 — The recommended onboarding sequence (target: first insight < 5 min)

### 7.1 Phase 0 — install (0:00–1:00)

```
npx <tool>@latest        # or: curl -fsSL get.<tool>.sh | sh   /   docker run
```
Daemon boots, binds `127.0.0.1:7777`, prints the URL, opens the browser. Generates an ephemeral X25519 keypair for the token handoff. Asks exactly one question: **"What's your website?"** (a URL). Nothing else.

### 7.2 Phase 1 — start crawling IMMEDIATELY, before any auth (1:00, background)

**Do not gate the first crawl on Google auth.** The moment we have a URL:
- fetch `robots.txt`, discover sitemaps, crawl up to N pages,
- run the full technical audit (titles, meta, headings, canonicals, hreflang, schema, Core Web Vitals via PSI API — which needs only an API key, not OAuth, or none at all at low volume),
- render the dashboard with real findings.

**This is what makes <5 minutes possible.** Time-to-first-insight becomes ~90 seconds and is decoupled entirely from the Google OAuth cliff. GSC/GA4 then upgrade the insights rather than unlocking them.

### 7.3 Phase 2 — one Google connect (1:00–2:30)

A single button: **"Connect Google"**. One consent screen, one grant, incremental where possible.

Scopes requested at this step (minimum viable):
- `https://www.googleapis.com/auth/webmasters.readonly`
- `https://www.googleapis.com/auth/analytics.readonly`
- `https://www.googleapis.com/auth/siteverification.verify_only`
- `openid email` (for install identity)

Deferred to just-in-time incremental consent:
- `https://www.googleapis.com/auth/webmasters` (write — only when we're about to submit a sitemap)
- `https://www.googleapis.com/auth/business.manage` (only when GBP feature is enabled AND our project has GBP Basic Access)
- `https://www.googleapis.com/auth/content` (Merchant, only for e-commerce users)

> **Caveat:** incremental authorization *"is not supported"* on Desktop-app client types because they can't keep the secret. Our broker uses a **Web application** client, so incremental auth works — another argument for the broker.

Flow: browser → `auth.ourdomain.com/start` → Google consent → broker exchange → 302 back to `http://127.0.0.1:7777/oauth/done#enc=<sealed_box>` → daemon decrypts with its ephemeral key → writes to `~/.config/<tool>/credentials.json` (0600).

### 7.4 Phase 3 — property resolution & auto-verification (2:30–4:00)

```
sites.list()
  ├─ exact match, permissionLevel ∈ {siteOwner, siteFullUser}       → DONE (majority path)
  ├─ sc-domain:<apex> present                                        → prefer it, DONE
  ├─ match exists but permissionLevel == siteUnverifiedUser          → run verification chain
  └─ no match                                                        → sites.add() then verification chain

verification chain (stop at first success):
  1. ANALYTICS      — if GA4 connected w/ edit rights AND gtag detected on homepage during Phase-1 crawl
  2. TAG_MANAGER    — if GTM container detected AND user has publish/admin
  3. FILE           — if CMS write creds present (WordPress/Webflow/Ghost/Shopify/static-repo)
  4. META           — same, theme header
  5. DNS_TXT        — if registrar/DNS API token present (Cloudflare et al.) → also unlocks a DOMAIN property
  6. MANUAL         — render a copy-paste card with the exact token + a "Check now" button that polls
                      siteVerification.webResource.insert
```

Because we crawled the homepage in Phase 1, we already know whether gtag/GTM is present — the chain is decided instantly, not by trial and error.

### 7.5 Phase 4 — first GSC pull & merged insight (4:00–5:00)

`searchAnalytics.query` with `dataState: "all"`, `dimensions: ["query","page"]`, `rowLimit: 25000`, last 28 days + prior 28 days for deltas. Merge with the Phase-1 crawl → the money screen: *"12 pages ranking positions 11–20 with X impressions and no click-through, and here's the title-tag fix for each."*

### 7.6 Explicitly deferred (never in onboarding)

| Item | Why deferred | Where it lives |
|---|---|---|
| **GBP / `business.manage`** | Requires **verified profile active 60+ days**, a website on the profile, a manual "Application for Basic API Access" form, quota is **0 QPM** until approved, ~14-day review (real reports: 10+ business days with no reply) | Settings → Local SEO → "Request access (2 weeks)" |
| **Merchant Center / `content`** | E-commerce only; separate verification | Settings → E-commerce |
| **BigQuery bulk export** | 11 manual steps, billing account, 48h to first data | Settings → Advanced Data |
| **CMS write credentials** | Needed only for *execution*, not analysis. Ask on the first "Apply fix" click, not at install. | Just-in-time |
| **Indexing API** | *"can only be used to crawl pages with either `JobPosting` or `BroadcastEvent` embedded in a `VideoObject`"* — **useless for general SEO.** Default 200-request onboarding quota. Do not build this; do not promise it. | Never |
| **BYO OAuth client** | Advanced/offline only | Settings → Advanced → "Use my own Google Cloud project" |

---

## 8. Blocking approvals and lead times

| Approval | Prerequisite | Stated | Realistic (2026 evidence) | Start when |
|---|---|---|---|---|
| Domain verified in GSC (ours) | own the domain | minutes | minutes | **Day 0** |
| Public homepage + privacy policy on same domain | — | — | days of writing | **Day 0** |
| **Brand verification** | homepage, policy, logo, domain in GSC | — | days–weeks | **Day 0** |
| **Sensitive scope verification** | brand verification + demo video + justifications | *"3-5 business days"* | **4–12+ weeks**; multiple 2026 threads at 33–86 days with zero Trust & Safety contact | **Day 0** |
| OAuth user-cap increase | verified app, real usage | undocumented | file a formal request; unknown | Before ~1,000 connected accounts |
| **GBP Basic API Access** | GBP verified & active **60+ days**, website on profile, project number, request from an owner/manager email | *"reviewed within 14 days"* | 10+ business days with no response reported (2026-07) | Only when GBP feature is ~2 months out |
| Merchant API verification | `content` scope | *"3-5 business days"* | assume weeks | Only for e-commerce tier |
| GBP quota increase above 300 QPM | ≥50% sustained utilisation of current QPM, evenly distributed | — | denied if usage <50% or spiky | Later |

**Critical path: brand + sensitive scope verification. It gates the entire hosted tier AND the broker used by self-hosters. Nothing else on this list is close. Submit before you have a product.**

---

## 9. Failure modes the daemon must detect and surface

| Signal | Cause | UI copy / auto-remediation |
|---|---|---|
| `invalid_grant` + `Token has been expired or revoked` | Testing-mode 7-day expiry (BYO users) | Detect that the token is ~7 days old and the client is BYO → *"Your Google Cloud app is in Testing mode. Open Google Auth Platform → Audience → Publish app."* Deep-link them. |
| `invalid_grant`, token unused ≥6 months | 6-month refresh-token inactivity rule | Re-consent prompt |
| `invalid_grant` right after user changed password | password reset | Re-consent |
| `invalid_grant`, sporadic, ~1%/month | user revoke / Google heuristics | Re-consent; never crash the daemon, degrade to crawl-only mode |
| `invalid_client` / `deleted_client` | **OAuth client auto-deleted after 6 months inactive** (policy added 2025-10-27) | *"Your OAuth client was deleted for inactivity. You have 30 days to restore it in the Cloud Console."* |
| `403 SERVICE_DISABLED` naming an API | user skipped an API enablement, or the *"up to five hours"* activation lag | Parse the API name out of the error, deep-link to the exact enable URL, retry with backoff for 5h |
| `403` *"User does not have sufficient permission for site X"* | property exists but `permissionLevel: siteUnverifiedUser`, or ownership was revoked because the token vanished | Kick off the verification chain again automatically |
| `sites.list` returns `[]` | no GSC property at all | The "you have no Search Console" onboarding branch — the biggest cohort risk |
| GBP calls return quota **0 QPM** / `RESOURCE_EXHAUSTED` at 0 | Basic API Access not granted | *"Google hasn't approved your Business Profile API access yet (typically 14 days)."* Never present as an error. |
| `429 rateLimitExceeded` on URL Inspection | **2,000 QPD and 600 QPM per site** | Hard-budget the inspection crawler at <2,000 URLs/property/day; queue and spread |
| `429` on Search Analytics | 1,200 QPM per site *and* per user | Token-bucket at ~15 QPS with jitter |
| GA4 `RESOURCE_EXHAUSTED` | Core tokens: 200,000/property/day, 40,000/property/hour, **14,000/project/property/hour**, 10 concurrent | Cache aggressively; the per-project-per-property hourly bucket is the one that bites a multi-tenant host |
| GSC verification silently lost | Google *"periodically checks"* the token; theme update removed the meta tag | Weekly `webResource.list` reconciliation; auto re-place the token |
| Broker unreachable | our `auth.` domain down / user offline / air-gapped | Fall back to the BYO-client wizard; never hard-fail install |
| BigQuery export configured but empty | *"first export up to 48 hours"* or missing IAM roles | Query `ExportLog`; if empty >48h, re-check the two IAM role grants |

---

## 10. Direct implications for our tool (opinionated build recommendations)

1. **Build the OAuth broker before you build the SEO agent.** `auth.<domain>` is a ~300-line stateless service. It is the difference between a 12-step onboarding and a 1-click one, and it is the only ToS-compliant way to give self-hosters a pre-registered client. Ship it with a written, testable no-token-persistence guarantee, and publish the broker's source in the same repo (the *code* is public; only the secret is not).

2. **Submit for brand + sensitive-scope verification on day 0**, using a placeholder homepage, a real privacy policy, and a demo video recorded against the hosted tier. Given 4–12 week real-world turnaround, this is the longest lead-time item in the entire project.

3. **Declare the scope set once, deliberately.** Adding `business.manage` later costs another multi-week review AND risks a 100-user lifetime cap on our production client if we ship before approval. Decide the 12-month scope surface now.

4. **Never default anyone into Testing mode.** For BYO users, the single instruction that matters is "click Publish app." Put it in bold, with a screenshot, and have the daemon detect the 7-day pattern and say so explicitly.

5. **Use the Site Verification API as a first-class product feature.** Most SEO tools make the user go verify in the GSC UI. We can do it for them. Order the chain `ANALYTICS → TAG_MANAGER → FILE → META → DNS_TXT → manual`, decided from the Phase-1 crawl. This is a genuine differentiator against Ahrefs/Semrush-style onboarding and it directly addresses the "SMB has no verified property" cohort.

6. **Connect GA4 in the same grant as GSC, and use it to verify GSC.** Ordering GA4 first turns the hardest step into a no-op for users whose site already has gtag and who have Analytics edit rights.

7. **Decouple time-to-first-insight from Google auth entirely.** Crawl on the URL alone. Show real findings in 90 seconds. Google connect becomes an *upgrade* ("see which of these 340 pages actually get impressions") rather than a *gate*. This is the single highest-leverage activation decision in the whole design.

8. **Request `siteverification.verify_only`, not the full `siteverification` scope.** It grants *"ability to verify new sites, no read access for existing verified sites"* — strictly narrower, better for the "narrowest scope" verification criterion, and better privacy optics.

9. **Prefer `sc-domain:` (Domain) properties when DNS access is available.** They cover all subdomains and protocols and avoid the www/non-www/http/https property fragmentation that wrecks data quality. But note DNS is the *only* verification method for Domain properties.

10. **Treat BigQuery as a settings-page power feature.** It is 11 manual steps and a billing account. It will never be in the onboarding funnel, and no hosted-tier feature may depend on it.

11. **Do not build anything on the Indexing API.** It is documented as `JobPosting`/`BroadcastEvent` only. Any SEO tool promising "instant indexing" via it is either abusing the API or lying.

12. **Budget engineering time for token loss as a normal event** (~1%/month baseline). A "Reconnect Google" flow that resumes exactly where it left off, with no data loss and no re-onboarding, is a core feature, not an error path.

13. **Harden the broker against the Site Kit CVE-2020-9337 class of bug.** Single-use 256-bit state, ≤5 min TTL, token sealed to a daemon-generated ephemeral public key, never in a query string that could land in a server log or a browser history shared across users of the same machine.

14. **Instrument the funnel to answer the question no one has data for:** what fraction of signups arrive with (a) zero GSC properties, (b) an unverified property, (c) a verified property. Publish it — it's a good content asset and nobody else has it.

---

## 11. Open questions / things to verify before committing

1. **Exact sensitivity labels** for `webmasters.readonly`, `webmasters`, `analytics.readonly`, `siteverification.verify_only` as shown on the Cloud Console Data Access page today. Everything about verification lead time depends on this and I could not confirm it from a primary published source.
2. **The post-verification user cap number.** Undocumented. Ask Google via the Verification Center when submitting; plan a cap-increase request.
3. Whether a **broker/proxy architecture for self-hosted OSS clients** draws any objection during verification review. Site Kit is Google's own precedent, but Google reviewing Google is not the same as Google reviewing us. Disclose the architecture explicitly in the submission rather than letting a reviewer discover it.
4. Whether `sites.add` returns a specific error code for unowned domains (docs are silent). Determine empirically.
5. Whether the `ANALYTICS` verification method works when GA4 is connected via our OAuth grant but the user's "edit" right is on a different Google Account than the one they used for GSC. (Docs say *"must use same Google Account for both services."*)
6. Real GSC-verification rate among SMB websites — no credible source found; needs our own measurement.
7. Whether Google's `dataState: "hourly_all"` (hourly dimension) has different quota treatment — not documented in the limits page.
8. Whether the GBP Basic Access approval is per-Cloud-project (so our single hosted project covers all customers) or per-business. Reading of the prereqs suggests **per-project**, requested by someone who owns *a* verified profile — meaning we request once, for our own project, and then act on customers' profiles via their OAuth grants. **This should be confirmed; it materially changes whether GBP is feasible at all for a self-serve product.**

---

## 12. Sources

All accessed 2026-08-31 / 2026-09-01 unless noted.

**Google primary — OAuth policy & verification**
- Manage App Audience (Testing vs In production, 100 test users, 7-day expiry, 100-new-user lifetime cap) — https://support.google.com/cloud/answer/15549945
- OAuth App Verification Help Center — https://support.google.com/cloud/answer/13463073
- Verification requirements (brand + sensitive) — https://support.google.com/cloud/answer/13464321
- When is verification not needed — https://support.google.com/cloud/answer/13464323
- Changes to approved app (re-verification on scope add) — https://support.google.com/cloud/answer/13464018
- Unverified apps — https://support.google.com/cloud/answer/7454865
- Manage App Data Access (scope categories) — https://support.google.com/cloud/answer/15549135
- Manage OAuth Clients (client types, June 2025 secret masking) — https://support.google.com/cloud/answer/15549257
- Sensitive scope verification — https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Restricted scope verification — https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- OAuth 2.0 Policies (no secrets in public repos; unused-client deletion, changelog 2025-10-27) — https://developers.google.com/identity/protocols/oauth2/policies
- OAuth 2.0 for iOS & Desktop Apps (loopback, PKCE, "cannot keep secrets", no incremental auth) — https://developers.google.com/identity/protocols/oauth2/native-app
- OAuth 2.0 Scopes for Google APIs — https://developers.google.com/identity/protocols/oauth2/scopes
- **Google APIs Terms of Service §4(b)** — "Developer credentials may not be embedded in open source projects" (last updated 2021-11-09) — https://developers.google.com/terms
- Usability and safety updates to Google Auth Platform (2025-04-28) — https://developers.googleblog.com/usability-and-safety-updates-to-google-auth-platform/

**Google primary — Search Console / Site Verification**
- Search Console API usage limits (1,200 QPM/site; URL Inspection 2,000 QPD & 600 QPM/site) — https://developers.google.com/webmaster-tools/limits
- searchanalytics.query (25,000 rowLimit, dataState, dimensions) — https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- sites.add — https://developers.google.com/webmaster-tools/v1/sites/add
- urlInspection.index.inspect — https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- Site Verification API getting started — https://developers.google.com/site-verification/v1/getting_started
- Site Verification API webResource.getToken — https://developers.google.com/site-verification/v1/webResource/getToken
- Verify your site ownership (all methods, persistence) — https://support.google.com/webmasters/answer/9008080
- Add a property to Search Console — https://support.google.com/webmasters/answer/34592
- Start a new bulk data export (UI-only, IAM grants, service account) — https://support.google.com/webmasters/answer/12917675
- About bulk data export — https://support.google.com/webmasters/answer/12918484
- Bulk export table reference — https://support.google.com/webmasters/answer/12917991
- Indexing API quickstart (JobPosting/BroadcastEvent only) — https://developers.google.com/search/apis/indexing-api/v3/quickstart

**Google primary — GA4 / GBP / Merchant**
- GA4 Data API quotas — https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- GBP API prerequisites (60+ days verified profile, Basic Access form, 300 QPM) — https://developers.google.com/my-business/content/prereqs
- GBP API usage limits (0 QPM = not approved) — https://developers.google.com/my-business/content/limits
- Merchant API authorization — https://developers.google.com/merchant/api/guides/authorization/access-client-accounts

**Google Developer Forums / community (2024–2026)**
- OAuth user cap reached although verified (moderator reply 2024-12-25) — https://discuss.google.dev/t/oauth-user-cap-reached-limit-although-our-application-already-verified/177012
- Authorization Code Flow without client secret (PKCE-only fails; 2024-10 → 2025-05) — https://discuss.google.dev/t/authorization-code-flow-without-client-secret/168113
- OAuth Verification Stuck for ~12 Weeks (submitted 2026-05-28, posted 2026-08-22) — https://discuss.google.dev/t/oauth-verification-stuck-for-12-weeks/391690
- OAuth verification under review since July 22, 2026 (33 days, no T&S contact) — https://discuss.google.dev/t/oauth-verification-under-review-since-july-22-2026-no-trust-safety-email-ever-received-sensitive-scopes-only/393558
- OAuth data access verification stuck 8+ weeks — https://discuss.google.dev/t/oauth-data-access-verification-stuck-under-review-for-8-weeks-sensitive-scope-only-spreadsheets-no-trust-safety-contact/375352
- OAuth verification stuck on Privacy Policy phase 5+ weeks — https://discuss.google.dev/t/oauth-verification-stuck-on-privacy-policy-phase-for-over-5-weeks/387718
- GBP Basic Access pending 10+ business days (2026-07) — https://discuss.google.dev/t/business-profile-api-reviews-endpoint-mybusiness-googleapis-com-cant-be-enabled-basic-access-pending-10-business-days/389462
- OAuth clients claimed to be inactive but not (deletion policy fallout) — https://discuss.google.dev/t/oauth-clients-claimed-to-be-inactive-but-not/190365
- Client secrets in desktop open-source apps (google-auth-library-nodejs #959, 2020-05-12, closed "not planned", unanswered) — https://github.com/googleapis/google-auth-library-nodejs/issues/959

**Comparable OSS projects**
- Site Kit by Google — Search Console module (auto-creates URL-prefix property; virtual HTML file → HTML tag verification fallback) — https://sitekit.withgoogle.com/documentation/supported-services/search-console/
- Site Kit `Google_Proxy.php` (proxy architecture, `.apps.sitekit.withgoogle.com` client IDs) — https://github.com/google/site-kit-wp/blob/develop/includes/Core/Authentication/Google_Proxy.php
- Wordfence: Site Kit vulnerability granting Search Console access (2020) — https://www.wordfence.com/blog/2020/05/vulnerability-in-google-wordpress-plugin-grants-attacker-search-console-access/
- Home Assistant Google Calendar setup (9-step GCP wizard, "Otherwise, your credentials will expire every 7 days") — https://www.home-assistant.io/integrations/google/
- Home Assistant core issue #90147 (OAuth token setup failures) — https://github.com/home-assistant/core/issues/90147
- n8n Google OAuth2 single service credentials (managed OAuth **not** available self-hosted) — https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service
- rclone Google Drive docs / forum (shared client_id rate limits) — https://rclone.org/drive/ · https://forum.rclone.org/t/google-drive-rate-limit-exceeded-with-own-api-key/12964

**Secondary / marketing-blog sources — treat with caution**
- Nango, "Google OAuth invalid_grant" (2026-04-01) — enumeration of 7 revocation causes incl. 100-refresh-tokens-per-user-per-client — https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked/
- Unipile, "Google OAuth 100 User Limit" (2026) — marketing blog, corroborates the official cap — https://www.unipile.com/google-oauth-100-user-limit/
- gscdump.com — **unverified claim** that `webmasters.readonly` was reclassified non-sensitive in 2024. Possibly stale; not corroborated by any Google source. — https://gscdump.com/learn-google-search-console/api/authentication
- Birdeye, State of Google Business Profile 2026 — 76% of (large-brand) businesses verified in 2025 vs 71% in 2024. **This is GBP, not GSC. Do not repurpose.** — https://birdeye.com/blog/state-of-google-business-profiles/
- Clutch, State of Small Business Websites 2025 — https://clutch.co/resources/state-of-small-business-websites-2025

**Explicitly flagged as possibly stale (pre-2025):** Google APIs ToS §4(b) (last updated 2021-11-09 — still the operative version); google-auth-library-nodejs #959 (2020); Wordfence Site Kit CVE writeup (2020); Site Verification API reference (undated, stable since ~2013); the gscdump scope-reclassification claim (2024).
