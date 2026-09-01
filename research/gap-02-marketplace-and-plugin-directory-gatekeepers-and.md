# Gap 02 — Marketplace & Plugin-Directory Gatekeepers, and the AGPL/GPLv2 Question

**Research date:** 2026-09-01
**Scope:** Distribution gates standing between an open-source, self-hosted SEO agent and its users on WordPress.org, Shopify, Wix, Webflow, Duda, Squarespace, BigCommerce, plus the developer-distribution channels (npm, Homebrew, Docker Hub, Chrome Web Store).
**Headline:** The feared AGPL↔WordPress.org blocker **does not exist**. The real blockers are (a) Shopify's `write_themes` exemption, which was denied in June 2026 for an app doing exactly what we want to do, (b) Squarespace having no write API at all, and (c) npm v12 silently killing postinstall-based installers as of July 2026.

---

## 0. Executive summary — what actually blocks us

| Rank | Gate | Verdict |
|---|---|---|
| 1 | **Shopify `write_themes` protected-scope exemption** | **HIGH RISK — likely denial.** Denied June 2026 for a near-identical "merchant-approved single-file theme edit" app. Shopify's own alternatives table routes "meta descriptions, keywords, social media tags" to theme app embeds, i.e. *not* exemption-eligible. Apply day one to get the answer early. |
| 2 | **Squarespace** | **HARD BLOCK.** No pages/SEO write API exists. Commerce-only APIs. Read-only/advisory channel forever (until Squarespace ships one). |
| 3 | **npm v12 install scripts** | **SILENT BREAKAGE.** Since ~July 2026, `preinstall`/`install`/`postinstall` do not run by default; `--allow-git` and `--allow-remote` default to `none`. A postinstall-based provisioner will no-op for most users. |
| 4 | **WordPress.org review queue** | **SLOW, NOT BLOCKED.** 14 business-day documented target; real queue on 2026-08-24 was 5,127 with 4,223 >7 days old. ~68% approval rate in that window. |
| 5 | **Webflow private apps** | **REVIEWED ANYWAY.** "Private apps undergo the same rigorous review process as public apps." 10–15 business days. `custom_code:*` is OAuth-app-only — Site Tokens cannot touch it. |
| 6 | **WordPress.org AGPL license** | **NOT A BLOCKER.** See §1. AGPLv3 plugins are live in the directory today. |
| 7 | **Wix** | **NO GATE.** Unlisted apps install via link with zero review; App Market review is now an automated AI check returning "within minutes." |
| 8 | **BigCommerce** | **NO GATE for self-host.** Merchant self-creates a Store-level API account with `store_v2_content` + `store_v2_products`. |
| 9 | **Homebrew core** | **GATED ON POPULARITY** (75 stars / 30 forks / 30 watchers). Ship our own tap on day one. |
| 10 | **Docker Hub** | **THROTTLED.** 100 pulls/6h anonymous per IPv4 or IPv6 /64. Use GHCR as primary. |

---

## 1. THE LICENSE QUESTION (highest priority) — resolved: no conflict

### 1.1 The premise is right; the conclusion is wrong

The corpus's worry rests on a true statement of license theory. The FSF's own license list says, verbatim, of the **GNU Affero General Public License v3**:

> "This is a free software, copyleft license. Its terms effectively consist of the terms of GPLv3, with an additional paragraph in section 13 to allow users who interact with the licensed software over a network to receive the source for that program. We recommend that developers consider using the GNU AGPL for any software which will commonly be run over a network.
>
> **Please note that the GNU AGPL is not compatible with GPLv2.** It is also technically not compatible with GPLv3 in a strict sense: you cannot take code released under the GNU AGPL and convey or modify it however you like under the terms of GPLv3, or vice versa. However, **you are allowed to combine separate modules or source files released under both of those licenses in a single project**, which will provide many programmers with all the permission they need to make the programs they want. See section 13 of both licenses for details."
> — https://www.gnu.org/licenses/license-list.html (accessed 2026-09-01)

And of **GPLv3**:

> "Please note that GPLv3 is not compatible with GPLv2 by itself. **However, most software released under GPLv2 allows you to use the terms of later versions of the GPL as well. When this is the case, you can use the code under GPLv3 to make the desired combination.**"
> — same page

### 1.2 Why the chain closes for WordPress

1. WordPress core is **GPLv2 *or later***, not GPLv2-only. (https://wordpress.org/about/license/)
2. "or later" means a recipient may elect to take WordPress under **GPLv3**.
3. AGPLv3 §13 and GPLv3 §13 **explicitly permit combining separate modules** under the two licenses in one project.
4. Therefore: `AGPLv3 plugin + (WordPress-as-GPLv3) = a permitted combination`. The chain never touches "GPLv2-only".

This is precisely the reasoning under which WordPress.org **has accepted GPLv3 plugins since May 2012** ("the updated guidelines now permit code licensed under version 3 of the GPL and compatible licenses… GPLv2 only, GPLv3, Apache 2.0" — https://make.wordpress.org/plugins/2012/05/11/cross-posted-from-the-main-development-blog-the/).

### 1.3 What the Plugin Review Team actually does

Detailed Plugin Guidelines, **Guideline 1** (page last updated **2026-03-11**), verbatim:

> "**1. Plugins must be compatible with the GNU General Public License**
> Although any GPL-compatible license is acceptable, using the same license as WordPress — 'GPLv2 or later' — is strongly recommended. All code, data, and images — anything stored in the plugin directory hosted on WordPress.org — must comply with the GPL or a GPL-Compatible license. Included third-party libraries, code, images, or otherwise, must be compatible. **For a specific list of compatible licenses, please read the GPL-Compatible license list on gnu.org.**"

**AGPLv3 appears on that exact list, inside the section headed "GPL-Compatible Free Software Licenses."** The plugins team explicitly does not keep its own list:

> "We're not making a list… that list on gnu.org is fairly extensive and covers the vast majority of licenses out there." … "Any others we can evaluate on a case by case basis."
> — https://make.wordpress.org/plugins/2012/12/20/gpl-and-the-repository/

The `readme.txt` header spec says only: "**License** – The GPLV2 (or later) compatible license used for the plugin." (https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/). There is no allowlist of literal license strings and no automated license validator that rejects "AGPLv3".

### 1.4 Empirical proof — AGPL plugins are live in the directory right now

| Plugin | Directory license string | Version | Last updated | Installs |
|---|---|---|---|---|
| **Hexabot Chat Widget** — https://wordpress.org/plugins/hexabot-chat-widget/ | "This plugin is licensed under the AGPLv3" (links to gnu.org/licenses/agpl-3.0.html) | 3.2.3 | ~3 months ago | 10+ |
| **Wireservice** — https://wordpress.org/plugins/wireservice/ | "AGPL 3.0" | 1.2.0 | ~5 months ago | <10 |
| **Media Picker for Immich** — https://wordpress.org/plugins/media-picker-for-immich/ | "Immich license (AGPL-3.0)" | — | — | — |
| **Fleet Agent Site Manager** — https://wordpress.org/plugins/fleet-agent-site-manager/ | **plugin: "GPLv2 or later"; dashboard: "AGPL-3.0"** | 0.61.146 | ~5 days ago | 10+ |

**GPLv3-only would also be accepted** (explicitly named in the 2012 policy post). So neither AGPLv3 nor GPLv3-only is a rejection trigger.

### 1.5 The Fleet Agent precedent is the template we should copy

`Fleet Agent Site Manager` is the single most useful artifact found in this research. It is:
- a WordPress.org-listed plugin,
- **licensed GPLv2-or-later while its control-plane dashboard is AGPL-3.0**,
- an *agent* that receives **Ed25519-signed commands** from an external dashboard,
- restricted to "a closed, named list [of actions] compiled into the plugin", with "**no eval, no remote include and no remote PHP execution of any kind**",
- **dormant until the user explicitly connects it** ("no data is sent anywhere" by default),
- carrying a long, explicit **External services** disclosure in its readme (control plane, HIBP, object storage, ipify, Cloudflare, Google Fonts, Gravatar, email providers).

That is, essentially exactly our architecture, already approved, still actively updated as of ~2026-08-27.

### 1.6 RECOMMENDED LICENSE STRUCTURE

| Component | License | Rationale |
|---|---|---|
| **Core daemon / agent / crawler / dashboard** | **AGPL-3.0-or-later** | Keeps the network-copyleft moat against a hosted-SaaS fork. Unchanged from the corpus recommendation. |
| **Companion WordPress plugin** (`seoe-bridge`) | **GPL-2.0-or-later** | Same license as WP core. Zero reviewer discretion, zero ecosystem friction (hosts, agencies, WP resellers all understand it). Exactly what Fleet Agent does. |
| **Shopify / Wix / Webflow / BigCommerce connector apps** | **Apache-2.0 or MIT** | These are thin OAuth shims running on our infrastructure; permissive avoids any argument with marketplace legal review and lets partners embed them. |
| **Wire protocol spec + client SDKs** | **Apache-2.0** | Encourages third-party CMS adapters without pulling them into AGPL. |
| **Contributor agreement** | **DCO + explicit "project may relicense connectors permissively"** clause, or a lightweight CLA | You need unambiguous authority to license the plugin GPLv2+ separately from the AGPL core. Do this from commit #1 — retrofitting is expensive. |

**Why GPLv2+ for the plugin is safe and does not leak the moat:**
- The plugin is a *client*. It ships no daemon code, no daemon logic, and no daemon binary. It speaks HTTP/REST to `127.0.0.1` (or the user's chosen host) over a documented, versioned protocol. Arm's-length process separation over a public protocol is the canonical "separate work" case — the same posture as any GPL'd HTTP client talking to an AGPL server.
- **AGPL §13 does not reach the plugin.** §13 obliges *the operator of the AGPL'd program* to offer Corresponding Source to *that program's* remote users. Our daemon is run by the user on their own machine, so §13 is a no-op for self-hosters; for the ~$8/mo hosted tier, §13 obliges *us* to offer the daemon's source — which we intend to do anyway. It never converts the WordPress plugin into a derivative work.
- The moat is in the daemon (crawl engine, decision loop, prompt/agent scaffolding, hosted control plane), not in a ~2,000-line REST bridge that anyone could reimplement in a weekend.

**Do not** license the plugin GPLv3-only or AGPLv3 "because the project is AGPL." It buys nothing, and it invites the one thing you cannot control: reviewer discretion under **Guideline 18** ("we reserve the right… to disable or remove any plugin from the directory, even for reasons not explicitly covered by the guidelines").

**Confidence:** High on the license-compatibility analysis and on the directory precedent. Not legal advice — get a 1-hour opinion from an OSS counsel before the first public release, specifically on the CLA/relicensing authority.

---

## 2. WordPress.org — the guidelines that actually constrain an agent bridge

All quotes below are verbatim from https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/ (page footer: "First published April 9, 2015 · **Last updated March 11, 2026**"), accessed 2026-09-01.

### 2.1 Guideline 8 — the one that both threatens and blesses our architecture

> "**8. Plugins may not send executable code via third-party systems.**
> Externally loading code from documented services is permitted, however all communication must be made as securely as possible. Executing outside code within a plugin when not acting as a service is not allowed, for example:
> - Serving updates or otherwise installing plugins, themes, or add-ons from servers other than WordPress.org's
> - Installing premium versions of the same plugin
> - Calling third party CDNs for reasons other than font inclusions; all non-service related JavaScript and CSS must be included locally
> - Using third party services to manage regularly updated lists of data, when not explicitly permitted in the service's terms of use
> - **Using iframes to connect admin pages; APIs should be used to minimize security risks**
>
> **Management services that interact with and push software down to a site *are* permitted, provided the service handles the interaction on it's own domain and not within the WordPress dashboard.**"

That final sentence is our licence to operate — and it dictates the UX: **the agent dashboard must live in the daemon's own local web app, never iframed into wp-admin.** The wp-admin surface must be a thin pairing/status/consent screen only.

### 2.2 Guideline 7 — phoning home

> "**7. Plugins may not track users without their consent.**
> In the interest of protecting user privacy, plugins may not contact external servers without *explicit* and authorized consent. This is commonly done via an 'opt in' method, requiring registration with a service or a checkbox within the plugin settings. Documentation on how any user data is collected, and used, should be included in the plugin's readme, preferably with a clearly stated privacy policy.
> Some examples of prohibited tracking include: Automated collection of user data without explicit confirmation from the user. … Offloading assets (including images and scripts) that are unrelated to a service. Undocumented (or poorly documented) use of external data…
> An exception to this policy is Software as a Service … By installing, activating, registering, and configuring plugins that utilize those services, consent is granted for those systems."

### 2.3 Guideline 6 — SaaS is permitted (our daemon qualifies)

> "**6. Software as a Service is permitted.** Plugins that act as an interface to some external third party service (e.g. a video hosting site) are allowed, even for paid services. The service itself must provide functionality of substance and be clearly documented in the readme file submitted with the plugin, preferably with a link to the service's Terms of Use.
> Services and functionality *not* allowed include: **A service that exists for the sole purpose of validating licenses or keys while all functional aspects of the plugin are included locally is not permitted.** Creation of a service by moving arbitrary code out of the plugin so that the service may falsely appear to provide supplemented functionality is prohibited. Storefronts that are not services…"

Our daemon does real work (crawl, analyse, generate, decide), so this is satisfied — but keep the bridge plugin genuinely thin so nobody can argue the service is a fig leaf.

### 2.4 Guideline 5 — no trialware; upsell rules

> "**5. Trialware is not permitted.** Plugins may not contain functionality that is restricted or locked, only to be made available by payment or upgrade. Functionality may not be disabled after a trial period or quota is met. In addition, plugins that provide sandbox only access to APIs and services are also trial, or test, plugins and not permitted.
> Paid functionality in services *is* permitted (see guideline 6: serviceware), provided all the code inside a plugin is fully available. … Attempting to upsell the user on ad-hoc products and features *is* acceptable, provided it falls within bounds of guideline 11 (hijacking the admin experience)."

→ The plugin must be **100% functional against a free self-hosted daemon**. No plan checks, no license keys, no feature flags in the plugin. Upsell to the $8/mo hosted tier may exist only as a dismissible notice on our own settings page (Guideline 11: "Upgrade prompts, notices, alerts, and the like must be limited in scope and used sparingly, be that contextually or only on the plugin's setting page. Site wide notices or embedded dashboard widgets *must* be dismissible or self-dismiss when resolved.").

### 2.5 Guideline 9 — the SEO-specific landmine

> "**9. Developers and their plugins must not do anything illegal, dishonest, or morally offensive.** … This includes (but is not restricted to) the following examples:
> - **Artificially manipulating search results via keyword stuffing, black hat SEO, or otherwise**
> - **Offering to drive more traffic to sites that use the plugin**
> - … Implying users must pay to unlock included features
> - **Implying that a plugin can create, provide, automate, or guarantee legal compliance**
> - Utilizing the user's server or resources without permission, such as part of a botnet or crypto-mining"

This is a real rejection risk for an *SEO* plugin whose whole pitch is traffic. The readme must never say "increase your traffic," "rank #1," "guaranteed rankings," or similar. Adopt the phrasing style the Compliance Disclaimers page prescribes for compliance plugins — "**assist**" rather than "achieve" (e.g. "will help make your website more ADA compliant" not "will make your website ADA compliant"; https://developer.wordpress.org/plugins/wordpress-org/compliance-disclaimers/).

### 2.6 Guideline 4 — code readability, and no bundled binaries

> "**4. Code must be (mostly) human readable.** Obscuring code by hiding it with techniques or systems similar to `p,a,c,k,e,r`'s obfuscate feature, uglify's mangle, or unclear naming conventions such as `$z12sdf813d`, is not permitted…
> We require developers to provide public, maintained access to their source code and any build tools in one of the following ways: Include the source code in the deployed plugin / A link in the readme to the development location."

Plus, from the Common Issues page (https://developer.wordpress.org/plugins/wordpress-org/common-issues/): "Remove unnecessary folders (development tools, node_modules, tests, demos)… **No non-standard file types permitted**… Include non-compressed versions of minified JS/CSS… Document build tools used (npm, webpack, composer, etc.)… Include `composer.json` if using Composer dependencies."

→ **Never ship the daemon binary (Go/Node/Python bundle) inside the plugin ZIP.** That is a same-day rejection and, if it looked like an installer, a Guideline 8 violation on top.

### 2.7 Other guidelines that bite

| # | Rule | Our exposure |
|---|---|---|
| 2 | "they must comply to the terms of use for all third party services and APIs utilized by their plugins. If there is no way to validate the licensing of a library or the terms of an API, then they cannot be used." | Google Search Console / GA4 API ToS must be linked and honoured. |
| 3 | "A stable version of a plugin must be available from its WordPress Plugin Directory page… Distributing code via alternate methods, while not keeping the code hosted here up to date, may result in a plugin being removed." | Our GitHub release and the SVN tag must not drift. |
| 10 | No "Powered By"/credit links on the public site without opt-in, defaulting to off. | Do not inject an attribution comment into rendered HTML. |
| 12 | Readmes must not spam: "**use of over 5 tags total**", no competitor tags, no keyword stuffing, affiliate links must be disclosed and direct. | **Cannot tag `yoast` or `rank-math`.** Max 5 tags. Ironic for an SEO plugin — write the readme for humans. |
| 13 | "plugins may not include those libraries in their own code. Instead plugins must use the versions of those libraries packaged with WordPress." | Use bundled jQuery/PHPMailer; use the WordPress HTTP API, not raw cURL. |
| 14/15 | SVN is a release repo, not a dev repo; increment version on every release. | CI must not push per-commit. |
| 17 | Slug may not begin with another product's term; "wordpress" in a domain name is a trademark violation. | Slug like `seoe-bridge` or `ai-seo-agent-bridge`, never `wp-seoe` or `yoast-*`. |

### 2.8 Review timing and queue reality (2026)

- **Documented target:** "Once a plugin is queued for review, we will review the code for any issues within **14 business days**." — https://developer.wordpress.org/plugins/wordpress-org/planning-submitting-and-maintaining-plugins/
- **Actual queue, Plugins Team report of 2026-08-24** (https://make.wordpress.org/updates/2026/08/24/plugins-team-24-aug-2026/):
  - Approved **632** · Rejected **292** · Closed **76** · Requested **827** (⇒ ~**68% approval rate** in that window)
  - Plugins in queue (new + pending): **5,127**; over 7 days old: **4,223**; unprocessed: **267**; awaiting author response: **4,151**; awaiting reviewer action: **482**
  - Support: 2,205 conversations, ~275/day
  - Comparison 2026-07-27: 590 approved, 4,991 in queue, 4,247 >7 days old
- **Plan for 4–10 calendar weeks and 1–3 rounds of reviewer correspondence.** Note guideline: "Auto-replies and emails that route to a support system are not permitted" — the contact address must be a human inbox.

### 2.9 "Protect The Shire" — post-approval release latency (new, June 2026)

Official announcement (https://wordpress.org/news/2026/06/pts/, published 2026-06-05):

> "each new plugin release will wait **up to 24 hours** before being distributed through auto-updates"

Scope: "78K plugins and themes" with "over 400M installs". AI-assisted review is paired with the hold ("a depth of review that seemed unimaginable before is now a matter of time and tokens"), and the post signals the window may shrink to minutes.

Secondary reporting (flag: **not primary**) says the cooldown was later reduced from 24h to **6 hours**, communicated on WordPress Slack rather than by public post (wp-content.co). Treat 24h as the contractual worst case.

**Implication:** the plugin page/zip flips immediately, but auto-update delivery lags. Do not design a protocol where a same-day plugin release is required to keep the daemon working. **The daemon must negotiate protocol versions with the plugin and degrade gracefully across at least 2 minor versions.**

### 2.10 Is "a plugin that authenticates a remote agent to write post meta" acceptable at all?

**Yes** — Guideline 8's management-services carve-out plus the live Fleet Agent precedent settle it. But it is acceptable *only* in this shape:

**Checklist — WordPress plugin design constraints (turn into tests):**
- [ ] Plugin registers a **fixed, compile-time allowlist** of operations (e.g. `seoe/v1/post-meta`, `seoe/v1/redirect`, `seoe/v1/schema`). No dynamic dispatch, no `call_user_func` on a request field.
- [ ] **Zero** `eval()`, `create_function`, `include`/`require` of a remote path, `unserialize()` of request data, or `wp_remote_get` → `eval`.
- [ ] Plugin **never installs or updates plugins/themes/code** from any server. (Guideline 8, bullet 1.)
- [ ] Plugin **never iframes** the daemon UI into wp-admin. (Guideline 8, bullet 5.)
- [ ] **Dormant by default.** No outbound request on activation. Pairing requires an explicit user action + a checkbox consenting to the data flow.
- [ ] Pairing uses an **asymmetric signature** (Ed25519 over a canonical request, with nonce + timestamp + replay window), not a bearer secret in a header — mirrors the approved Fleet Agent pattern and survives security review.
- [ ] Every write goes through `current_user_can()` on a dedicated capability, sanitises input, escapes output, uses nonces where a browser is in the loop, `if ( ! defined( 'ABSPATH' ) ) exit;` at the top of every PHP file.
- [ ] All HTTP via **WordPress HTTP API** (`wp_remote_*`), never raw cURL.
- [ ] Every function/class/option/constant prefixed with the plugin slug prefix (not `wp_`, not `__`, not a single underscore).
- [ ] `readme.txt` contains an **External services** section naming every host contacted, why, what data leaves, and links to ToS + privacy policy for each (our daemon, our hosted control plane if used, Google APIs, any LLM provider).
- [ ] `readme.txt` contains **no traffic or ranking promises**, ≤5 tags, no competitor names in tags.
- [ ] No `node_modules`, no tests, no build tooling, no binaries in the ZIP; unminified sources included or a repo link in the readme; `composer.json` included if Composer is used.
- [ ] Full functionality with a free self-hosted daemon; hosted-tier upsell limited to one dismissible notice on our own settings page.

---

## 3. Shopify — the hardest gate

### 3.1 `write_themes` is a protected scope and the exemption is being denied for our use case

Primary doc: https://shopify.dev/docs/apps/build/online-store/asset-legacy (accessed 2026-09-01):

> "Starting with Admin API 2023-04, Asset resource `PUT` or `DEL` requests are restricted using the `write_themes` access scope. **If an app that's distributed in the Shopify App Store needs to use Asset resource `PUT` or `DEL` requests, then it needs to be granted an exemption by Shopify to use the `write_themes` access scope.** … You can still use the Asset resource to read theme files without an exemption."

**Eligible exemption categories (verbatim):**
- **Page builders**: "Your app adds or replaces all layouts or templates files with the purpose of providing an alternative theme customization experience. This exemption won't be granted to apps that modify only a few pages…"
- **Backups**: "Your app backs up all theme files and restores files from a backup as the primary app functionality."
- **Adding Liquid to repeating blocks**: "Your app adds elements such as ratings, buttons, or badges to recurring resource lists like products."
- **Other platform functionality**: "**Your app primarily provides search engine optimization, content locking, or developer tooling and testing functionality.**"

So yes — **"SEO" is still a named eligible category in current docs.** But the *same page* undercuts it in the "Recommended alternatives for use cases that are **not** eligible for exemption" table:

| Use case | Recommended alternative |
|---|---|
| "**Adding custom metadata to a store, such as meta descriptions, keywords, or social media tags**" | **Theme app embeds** |

And: "Note: As alternative APIs and resources that address these use cases become available, app developers will be required to transition to suggested alternatives."

**Process & timeline (verbatim):** "If you think that your app is eligible for an exemption, then you can submit an exception request. Exemptions are valid for both accessing the protected scope and qualifying for Built for Shopify status. **After you submit your request, the Shopify app review team will review your submission and be in touch with you within two weeks.**"

The current GraphQL doc is blunter — https://shopify.dev/docs/api/admin-graphql/latest/mutations/themefilesupsert lists the access requirement as: **"`write_themes` and an exemption from Shopify to modify theme files."**

### 3.2 The June 2026 denial — read this before architecting anything

Thread: https://community.shopify.dev/t/theme-api-write-exemption-denied-is-single-file-per-change-merchant-approved-writing-ever-approvable-or-is-app-embeds-the-only-path/35406

- Developer (Velyr_io) built an analytics tool that detects conversion problems and proposes **targeted theme-file fixes that the merchant reviews and explicitly approves, one change at a time**.
- **2026-06-20:** `write_themes` Protected Scope Exemption request (ticket 68049335) **rejected** — "does not fit the exemption requirements."
- **2026-06-22, Paige-Shopify (staff):**
  1. "**No. A merchant-approved write to an existing theme file still requires approved access to `write_themes`**" — and such exemptions are not granted for this use case.
  2. There is **no app-embed pattern for rewriting existing theme code**. App embeds add CSS/JS overlays; they cannot modify existing Liquid markup.
  3. Suggested alternative: flag issues for the merchant and request **collaborator access** so the merchant's own team applies the change.

This is the closest analogue to our product that exists in public, and it was denied. **Assume denial as the base case.**

### 3.3 Exemption form logistics

- Form name: "Online Store Protected Scope Exemption Request" (Google Form linked from the asset-legacy doc).
- The form asks for a **Shopify App Store URL**. For unlisted/pre-submission apps, staff have twice confirmed a placeholder is fine:
  - Liam (Shopify), **2026-03-10**: "You can still use this form and in the 'Shopify App Store URL' field, you can use a placeholder or note that the app is not yet submitted." (https://community.shopify.dev/t/requesting-write-themes-themefilesupsert-exemption-for-app-in-development-phase/31997)
  - Alan_G (Shopify), **2026-06-18**: placeholder "is usually okay"; and — importantly — "**There isn't currently a public status page or confirmation email flow for these exemption requests.**" (request submitted 2026-06-14, acknowledged 2026-06-18) (https://community.shopify.dev/t/write-themes-exemption-no-confirmation-received-unlisted-app-app-store-url-required/35275)

### 3.4 Can a merchant-created custom app dodge the exemption?

**Do not architect around this.**
- Legacy admin-created custom apps: **"Starting January 1, 2026, you can no longer create new custom apps in the Shopify admin."** New custom apps must be built in the **Dev Dashboard** and then installed on the store. "Existing custom apps aren't affected and will continue to work." (https://changelog.shopify.com/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026)
- The `themeFilesUpsert` reference states the requirement as "`write_themes` **and an exemption from Shopify**" with no custom-app carve-out. The asset-legacy prose scopes the requirement to App Store apps, but the platform emits `"[API] This action requires merchant approval for write_themes scope."` and strips `write_themes` from granted tokens in practice (https://community.shopify.com/t/editing-theme-via-api-this-action-requires-merchant-approval-for-write-themes-scope/363858).
- **Open question flagged for verification** (§9): whether a 2026 Dev-Dashboard custom app installed on a single store still receives a usable `write_themes` grant. Test this empirically on a dev store before assuming either way.

### 3.5 What we can do on Shopify *without* `write_themes`

This is the mitigation and it covers most of the value:

| SEO operation | Path without `write_themes` |
|---|---|
| Page title / meta description on products, collections, pages, blog articles | Resource-level SEO fields (GraphQL `seo { title description }` on Product/Collection/Page/Article; equivalently the `global.title_tag` / `global.description_tag` metafields). Needs `write_products` / `write_content` / online-store page write scopes — **no exemption**. ⚠️ verify exact scope names against the current Admin API version before coding. |
| URL redirects (301s) | `urlRedirectCreate` / `urlRedirectUpdate` — no exemption. |
| Product/collection copy, alt text, handles | Standard product/content write scopes. |
| Structured data (JSON-LD), canonical/hreflang injection, `robots.txt.liquid` | **Requires `write_themes` (exemption) OR a theme app embed** the merchant toggles on in the theme editor. The embed can inject JSON-LD and head tags at render time. |
| Sitewide head-tag changes | Theme app embed. |

**Architectural verdict for Shopify:** ship a **theme app extension with an app embed block** that renders our schema/meta/head output at request time from data we store in metafields. This needs **no exemption at all**, is the path Shopify explicitly recommends, and is the only route that survives the June 2026 precedent. Treat `write_themes` as a stretch goal, applied for on day one purely to get an early answer.

### 3.6 App Store review + commercial terms

- **Distribution choice is permanent:** "You can't change the distribution method after you select it." Public (App Store) = approval required; Custom = approval not required but "Installed on a single Shopify store, on multiple stores that belong to the same Plus organization, or on transfer-disabled development stores." (https://shopify.dev/docs/apps/launch/distribution)
- **Embedding:** "Use Shopify App Bridge to ensure OAuth redirects to your app… **Use session tokens for authentication and avoid third-party cookies or local storage**… Ensure your app functions in Chrome's incognito mode." (App Store requirement 2.2)
- **Billing:** "Use **Shopify App Pricing** to charge for your app. It bills merchants through the same system that's used for their Shopify subscription… Your app should allow merchants to upgrade and downgrade their pricing plan without having to contact your support team or having to reinstall the app." (App Store requirement 1.2)
- **API currency:** "apps using APIs that will be deprecated within 90 days can't be submitted."
- **Listing assets:** 3–6 desktop screenshots at **1600×900 (16:9)**, alt text, no PII, "don't include pricing, reviews, or outcome guarantees."
- **Scope creep is re-review:** "Apps that no longer reflect the original core functionality submitted to the App Store will be re-evaluated and will need to be resubmitted for a full App review."
- **Review duration:** Shopify's own docs give statuses (Draft → Submitted → Reviewed → Published; "Paused" when blocking issues are found) but **no published SLA**. Community consensus (⚠️ **not primary**): 7–14 business days typical, 1–2 days for trivial apps, 3+ weeks not unusual. Budget 3–6 weeks including one rejection round.

**Revenue share (primary — https://shopify.dev/changelog/update-to-shopifys-app-developer-revenue-share):**
> "Developers will continue to enjoy a revshare exemption on the first **$1 million USD of *lifetime* revenue, and a 15% share on amounts above that**." · "Earnings before January 1, 2025 do not count toward the $1 million threshold." · "Earnings are aggregated at the partner level, including apps developed under associated developer accounts." · "Updates to Shopify's Partner Program Agreement will go into effect **June 16, 2025**."

→ At $8–$29/mo, **an $8/mo tier through Shopify nets 100% until cumulative lifetime revenue crosses $1M** (~10,400 subscriber-years at $8). Shopify revenue share is **not** a reason to avoid the channel. (Separately, the partner *referral* program changed 2026-08-10 to 20% of subscription revenue + 0.1% of eligible online GMV for four years — different program, don't conflate.)

---

## 4. Wix — the easiest gate, and it got easier in 2026

### 4.1 The scope exists and is named

`Set Item SEO Tags` — https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/set-item-seo-tags (append `.md` to any dev.wix.com URL for a clean markdown render — very useful for our own docs ingestion):

> **Permission Scopes:** `Manage SEO Settings: SCOPE.PROMOTE.MANAGE-SEO`

Same scope governs `Bulk Set Item Seo Tags`, `Reset Item Seo Tags To Default`, and the Site SEO Tags / SEO Patterns APIs.

### 4.2 Can a self-installed app get it without App Market review? **Yes.**

https://dev.wix.com/docs/build-apps/launch-your-app/app-distribution/about-app-distribution.md:

> "- Apps that should be listed on the Wix App Market are submitted to a review process… **The review is an automated AI process that runs when you submit and publish your app, so your app can go from submission to published in minutes.**
> - **Apps that should be shared directly with users should be distributed using an install link, or installed directly on a site within your account from the app dashboard, without going through a review process.**"

And on the AI review: "When you submit your app and publish it, Wix runs an automated AI review that checks your app against the App Market requirements. **Results are typically available within minutes.** If your app passes, it's published… If your app doesn't pass, blockers appear in your dashboard describing what you need to fix… If you disagree with a blocker, you can contact Wix support to appeal."

Permissions are granted by the site owner during the standard OAuth install flow: "In the app dashboard you specify the permission scopes your app requires from site owners… Upon installing your app, site owners are prompted to grant these permissions." (https://dev.wix.com/docs/build-apps/develop-your-app/access/authorization/about-permissions.md)

⚠️ **Stale-figure warning:** older sources (and some 2026 blog summaries) still cite "up to 15 business days for first submission, 7 days for updates." That predates the automated AI review described in the current doc. Trust the current doc; verify empirically on first submission.

### 4.3 App Market guidelines that constrain us (from `app-market-guidelines.md`)

- "**All apps that collect money for any purpose (including donations) must implement the Wix Billing System**, unless we have notified you that we are willing to make an exception."
- "Apps may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than the Wix Billing System."
- "**Don't use your own mechanisms to unlock content or functionality, such as license keys, QR codes, etc.**"
- "Your app's pricing must accurately reflect the total cost to the user. If integration is free but a service costs money, the price listing must list the service's price."
- "Never ask for more permissions than the ones required for your app to function as intended." Also: don't request a scope already contained in a broader one you request.
- "If your app has an external dashboard, it must also include an interface for users to interact with. Once users authenticate the app through OAuth or approve app changes, direct them to this interface."
- Immediate rejection: apps that "run any background services not required for the purpose of the app or use users' websites or resources without permission (e.g., as part of botnet or crypto-mining)."
- "Submissions promoting special offers (like a free tutorial, free guidebooks, try before you buy, etc.) will be rejected."

**Revenue share (primary — https://dev.wix.com/docs/build-apps/launch-your-app/pricing-and-billing/about-monetizing-your-app.md):**
> "**In your first year, you receive 100% of all sales revenue. After that, you keep 80%. Revenue is calculated after a 2.5% transaction fee and applicable sales tax.**" · "We pay out your revenue share on a **net 30 EOM** basis."

→ Selling the $8/mo tier through the Wix App Market costs 0% in year 1, then 20% + 2.5%. **Meaningfully worse than Shopify's 0%-to-$1M.** Prefer the unlisted-install-link path plus off-platform billing for self-hosters; use App Market listing purely as a discovery channel with its own pricing.

### 4.4 Wix API behaviour notes that affect our writer (from the SEO API introduction)

- "**Changes take effect on the live site without a site publish**, with one exception: a static page keeps a draft separately from the published page, so tags written for one are saved to the draft unless you ask for them to be published." (`publish` param, default `false`.)
- "**A write replaces what it targets in full.** Retrieve the current tags or pattern first and send back the complete set you want, rather than only what changed."
- "**There's no revision checking. The last write wins**, and a Wix user editing SEO settings in the dashboard writes to the same data. When someone may be editing at the same time, read immediately before writing." → **we must implement read-immediately-before-write + a change-detection/rollback log.**
- Three-level resolution (Site tags → Wix pattern → user pattern → page tags → item tags), most specific wins; `resolvedTags` on the Item API is the only place all three are reported together. Guidance: "Work at the level that matches the change" — use SEO Patterns for page-type-wide conventions rather than writing the same title onto a thousand items.
- **Site-wide JSON-LD is impossible:** "Site SEO Tags rejects `script` (e.g. for site-wide structured data) unconditionally. **There is currently no way to set site-wide, every-page structured data through any of these APIs — write a per-page `script` tag through the Item SEO Tags API instead.**"
- `focusKeywords` is capped at **maxItems 5** and is not rendered on the page.
- Item types are gated by installed business solutions ("A page type or item type provided by a Wix business solution is only available on sites where that business solution is installed") — enumerate from the API's error list, don't hard-code.

---

## 5. Webflow, Duda, Squarespace, BigCommerce

### 5.1 Webflow

| Question | Answer |
|---|---|
| Scope for SEO metadata | `pages:write` (Update Page Settings — meta title/description, OG fields). Also `sites:write`, `cms:write`, `custom_code:write`. |
| Can an individual site owner get credentials without a marketplace listing? | **Yes, partially** — a **Site Token** generated by the site owner works against the Data API. **But:** "The `custom_code:read` and `custom_code:write` scopes are available only to **Data Client apps**. **Site tokens cannot access custom code endpoints.**" (https://developers.webflow.com/data/reference/scopes) → JSON-LD / head-script injection is unavailable on the token path. |
| Is a listing required for an OAuth app? | Effectively yes for external users. "New apps are available only to users in your app's workspace"; external users can't install until approved. |
| Private/unlisted apps | Exist, but **"Private apps undergo the same rigorous review process as public apps."** On approval: "You'll receive a unique Install URL… Only users with the Install URL can access and install your app." (https://developers.webflow.com/data/docs/private-apps) |
| Review timeline | "Our goal is to provide a prompt decision, **ideally within 10-15 business days**." |
| Submission assets | 900×900 logomark, English description, **3–5 screenshots at 1280×846**, a **2–5 minute demo video**, source code for Designer Extensions, and a published `.webflow.io` test site with the app installed. |
| Auth constraints | OAuth 2.0 only. "**Do not collect Webflow credentials manually or implement workarounds that bypass the OAuth authorization flow.**" All endpoints HTTPS; "Every URL embedded in your App must point to a production environment"; "Credential-bearing headers… must never be forwarded to non-Webflow domains." |
| Scope discipline | "every scope you request must be required for your App's declared functionality and invoked by a documented API endpoint your App calls"; reviewers verify scopes match the listing. |
| Ads | "Do not display ads to users." |
| Revenue share | Not addressed in the marketplace guidelines. **Open question.** |

**Webflow strategy:** day-one support the **Site Token** path (works instantly, no gate, covers page metadata + CMS) and treat the OAuth Data Client app (needed for `custom_code:*`) as a Phase-2 submission with a 10–15 business-day lead.

### 5.2 Duda

- **SEO writes exist:** an `seo` object on the Pages API updates title, meta description, OG image and index status.
- **Credentials are not self-serve for everyone:** API access is granted per-account; credentials appear under **Business Tools > API Access** (username/password, HTTP Basic). Secondary sources say API access requires a paid/custom plan and a request to support. ⚠️ Duda's plan tiers and prices found in this pass came only from third-party aggregators (Basic ~$19, Team ~$29, Agency ~$52, White Label ~$149/mo) — **treat as unverified**; confirm on duda.co directly.
- **App Store requirements** (https://developer.duda.co/docs/app-technical-requirements): "**No part of your app or the profile should show or reference Duda.** Your app might be opened in a white label context, so you should not reference Duda anywhere." · "Your app must accurately list the API permissions it uses. It should use no more permissions than absolutely necessary." · "Selected apps are put through rigorous testing, QA and development."
- **Verdict:** Duda is an **agency/reseller** channel, not a DIY-site-owner channel. Low priority; a lot of white-label branding work for a small addressable base. Request API credentials early (manual grant = unknown lead time) if we pursue it.

### 5.3 Squarespace — **hard block**

- Available API families per https://developers.squarespace.com/commerce-apis/authentication-and-permissions: Forms, Inventory, Orders, Products, Contacts, Discounts, Webhook Subscriptions, Profiles, Transactions, Analytics, Websites.
- **There is no API for editing site pages, SEO titles/descriptions, or site content.** Scopes are commerce-shaped (`website.inventory`, `website.orders`, `website.products`, …).
- API key generation requires the **Commerce Advanced** plan.
- OAuth app registration became **self-service** at https://account.squarespace.com/developer-apps; the old request form is **decommissioned 2026-09-30**.
- **Verdict:** Squarespace can only ever be a **read/advise** channel for us — crawl the public site, produce a prioritised change list, and hand the user copy-paste instructions (or a browser extension that drives the UI, which is its own gate). Do not promise write automation on Squarespace. This should be stated plainly in our marketing to avoid churn.

### 5.4 BigCommerce — **no gate for self-hosters**

- **Merchant self-creates credentials:** Store-level API accounts at **Settings > Store-level API accounts**, producing a `client_id`, `client_secret` and a static `access_token` that "do not expire based on time and cannot be manually invalidated". **No App Marketplace approval required.** (https://docs.bigcommerce.com/docs/start/authentication/api-accounts)
- **Relevant scopes:** `store_v2_content` / `store_v2_content_read_only` — "store content" including **pages, blog posts, redirects, and widgets**; `store_v2_products` / `_read_only`; `store_sites` / `store_sites_read_only` (sites and routes, external storefronts); `store_themes_manage` / `store_themes_read_only`.
- **App Marketplace listing** (only needed for discovery/monetisation): manual review by the Marketplace team; single-click OAuth, HTTPS callbacks, branded iframe load experience, **multi-user enabled**, all listing fields completed. Community/analyst reporting puts it at "weeks." Contact: appstore@bigcommerce.com.
- **Verdict:** ship BigCommerce support on day one via store-level API accounts. Marketplace listing is optional and can wait.

---

## 6. Developer-distribution channels (installer path)

### 6.1 npm — **breaking change, act on this**

Per the official GitHub announcement (https://github.com/orgs/community/discussions/198547) and npm docs:

> "`preinstall`, `install`, and `postinstall` from dependencies **won't run unless explicitly allowed**." · "`--allow-git` defaults to `none`. Git dependencies (direct or transitive) won't resolve unless allowed." · "`--allow-remote` defaults to `none`. Remote URL dependencies (e.g. https tarballs) won't resolve unless allowed."

- npm **v12** shipped ~**2026-07-08**; the behaviour was available for opt-in from **npm 11.16.0**.
- Allowlist lives in `package.json` under **`allowScripts`**; `npm approve-scripts <pkg>` writes it; `npm approve-scripts --all` bulk-approves; approvals are pinned to installed versions by default (`--no-allow-scripts-pin` for name-only).
- This also blocks **implicit `node-gyp` builds** for any package containing `binding.gyp`, even with no declared install script.

**Implications for our installer (hard requirements):**
- [ ] **Do all provisioning in a `bin` entrypoint on first run, never in `postinstall`.** `npx seoe` → the CLI itself downloads the runtime/binary, verifies a checksum, and offers to install the service.
- [ ] Ship **prebuilt platform binaries** or pure-JS; no native modules requiring `node-gyp`.
- [ ] No git or remote-tarball dependencies in the published package.
- [ ] Document the npm-12 behaviour in install docs; expect a wave of "it installed but nothing happened" issues from anyone still relying on the old model.
- Consider making the primary install a **single static binary via `curl | sh`** (with a signed checksum + a non-piped alternative), with npm as a convenience wrapper.

### 6.2 Homebrew

Per https://docs.brew.sh/Package-Acceptance-Policy and https://docs.brew.sh/Acceptable-Formulae:
- Notability for a GitHub project: "**at least 30 forks, 30 watchers or 75 stars**" — or "**at least 90 forks, 90 watchers or 225 stars for a self-submission by the repository owner**."
- "A code repository **less than 30 days old** is normally not eligible."
- homebrew/core formulae must be **open source with a DFSG license**, built from source or produce cross-platform binaries; binary-only → homebrew/cask.
- "Formulae in the core repository must have a **stable version tagged by the upstream project**"; "Install steps must not fetch code from a moving default branch or an unversioned, unchecksummed archive"; downloads **verified with SHA-256**.
- "**Software that can upgrade itself does not integrate well with Homebrew formulae's own upgrade functionality, and self-update functionality should be disabled.** This is fine and well-supported for Casks."

**Plan:** publish `brew tap <org>/tap` on day one (no gate whatsoever). Apply to homebrew-core only after crossing 225 stars (self-submission threshold) or getting a third party to submit at 75. Gate self-update behind a build flag so the Homebrew build ships with it off.

### 6.3 Docker Hub

https://docs.docker.com/docker-hub/usage/:
- **Unauthenticated: 100 pulls per 6 hours per IPv4 address or IPv6 /64 subnet.**
- **Docker Personal: 200 pulls per 6 hours.**
- **Pro / Team / Business: unlimited.**
- Docker Personal: "Up to 1" private repository.
- Docker stated it did not enforce the April 2025 changes and will announce future enforcement at least 6 months in advance.

**Plan:** publish the primary image to **GHCR** (`ghcr.io/<org>/seoe`) which has no comparable anonymous pull ceiling, and mirror to Docker Hub for discovery. Any `docker compose` quickstart that pulls 4–6 images will burn a meaningful fraction of an office/NAT'd user's 100-pull budget — keep the image count to 1–2.

### 6.4 Chrome Web Store (only if we ship a browser extension)

https://developer.chrome.com/docs/webstore/program-policies/policies:
- **Remotely hosted code is banned in MV3:** "the full functionality of an extension must be easily discernible from its submitted code." Remote resources may supply data, not logic (narrow exceptions for the Debugger and User Scripts APIs).
- Policy language exists prohibiting products that "Require a local executable, other than the Chrome runtime, to run." ⚠️ Historically this clause targeted packaged/hosted *apps*; Native Messaging is a supported extension API. **Flagged as an open question** — do not make the extension a *required* component of the product.
- **Single purpose:** "An extension must have a single purpose that is narrow and easy to understand."
- **User data:** "If your Product handles any user data, then you must post an accurate and up to date privacy policy," and prior to installation you must "Prominently disclose what user data will be collected and how it will be used. Obtain the user's affirmative and informed consent." Limited-use principle applies.

**Plan:** if a companion extension ships (e.g. to drive the Squarespace UI or capture SERP data), it must be **fully self-contained, single-purpose, optional**, and must not be the mechanism by which the daemon is installed.

---

## 7. Per-channel gate table

| Channel | Gate | Requirement | Lead time | Blocking risk | Mitigation |
|---|---|---|---|---|---|
| **WordPress.org** | Plugin Directory review | GPLv2+-compatible license (AGPLv3 qualifies); 18 detailed guidelines; complete ZIP at submission; human contact email | **14 business days** documented; realistically **4–10 weeks** with 5,127 in queue (2026-08-24) | **Medium** — ~68% approval rate; likely 1–3 correction rounds | License the *plugin* GPL-2.0-or-later; copy Fleet Agent's signed-command + closed-allowlist pattern; no binaries; dormant-by-default; readme with External services section and zero traffic promises |
| **WordPress.org** | "Protect The Shire" release hold | Every release held up to 24h (reportedly reduced to ~6h) before auto-update distribution; AI-assisted code review | Per-release, ongoing since 2026-06-05 | **Low** but operationally real | Protocol version negotiation; daemon must support N and N-1 plugin versions; never require same-day plugin releases |
| **Shopify** | `write_themes` protected-scope exemption | Google Form "Online Store Protected Scope Exemption Request"; App Store URL field (placeholder OK); must fit a named category | Docs: **"within two weeks."** No status page, no confirmation email | **HIGH — denial precedent June 2026** for merchant-approved single-file theme writes | **Architect for theme app embeds from day one.** Store SEO data in metafields; render JSON-LD/head tags via an app-embed block. Apply for the exemption anyway on day one to get the answer early |
| **Shopify** | App Store review | App Bridge embed + session tokens; Shopify App Pricing for billing; no API deprecating within 90 days; 1600×900 screenshots; no outcome guarantees in listing | No published SLA; community 7–14 business days, up to 3–4 weeks | **Medium** | Submit only after the embed architecture works without `write_themes`; distribution method is **irreversible** — choose Public deliberately |
| **Shopify** | Revenue share | 0% on first **$1M lifetime** (from 2025-01-01), **15%** above; aggregated at partner level | n/a | **Low** | $8/mo tier is fully viable through Shopify |
| **Wix** | App Market listing | Automated **AI review**, "results typically available within minutes"; Wix Billing System mandatory for any money; least-privilege scopes | **Minutes** (⚠️ older "15 business days" figure is likely stale) | **Very low** | List it; appeal blockers via support |
| **Wix** | Unlisted / install link | **No review at all.** Site owner grants `SCOPE.PROMOTE.MANAGE-SEO` in the standard OAuth install flow | **0 days** | **None** | Primary day-one path for self-hosters |
| **Wix** | Revenue share | 100% year 1, then **80%** after a 2.5% transaction fee + tax; payout net 30 EOM | n/a | Low-medium | Keep self-host billing off-platform; treat App Market as discovery |
| **Webflow** | Marketplace review (public **and** private apps) | OAuth 2.0 only; least-privilege scopes matching the listing; 900×900 logo, 3–5× 1280×846 screenshots, 2–5 min demo video, `.webflow.io` test site | "ideally within **10–15 business days**" | **Medium** | Ship the **Site Token** path first (no gate, covers `pages:write`/CMS); OAuth app is Phase 2 and the only route to `custom_code:*` |
| **Duda** | API access grant + App Store | Credentials granted per account (Business Tools > API Access); apps must be white-labeled with no Duda references; accurate minimal permissions | Manual grant, unknown; app QA "rigorous" | **Medium**, small TAM | Deprioritise to Phase 3; request credentials early since the grant is manual |
| **Squarespace** | — | **No pages/SEO write API exists.** Commerce APIs only; API keys need Commerce Advanced | n/a | **HARD BLOCK on writes** | Read/advise mode only. Say so explicitly in docs and marketing |
| **BigCommerce** | Store-level API account | Merchant self-creates in **Settings > Store-level API accounts**; scopes `store_v2_content`, `store_v2_products`, `store_sites`, `store_themes_manage` | **0 days** | **None** for self-host | Ship day one |
| **BigCommerce** | App Marketplace listing | Manual review; single-click OAuth; HTTPS callbacks; **multi-user enabled**; branded iframe | "weeks" (⚠️ not primary) | Low (optional) | Defer |
| **npm** | npm v12 install-script policy | `preinstall`/`install`/`postinstall` off by default; `--allow-git` / `--allow-remote` default `none`; `allowScripts` in package.json | Immediate (shipped ~2026-07-08) | **HIGH — silent failure** | Provision in a `bin` entrypoint on first run, never postinstall; no native modules; prebuilt binaries |
| **Homebrew core** | Notability + policy | ≥75 stars / 30 forks / 30 watchers (≥225/90/90 self-submitted); repo ≥30 days; DFSG license; SHA-256 pinned versioned tarball; self-update disabled | Weeks after eligibility | Medium (popularity-gated) | Own tap day one; core later |
| **Docker Hub** | Pull rate limits | 100 pulls/6h anonymous per IPv4 or IPv6 /64; 200/6h Docker Personal; unlimited paid | n/a | Medium (bad first-run UX behind NAT) | GHCR primary, Docker Hub mirror; minimise image count |
| **Chrome Web Store** | Extension review | No remotely hosted code (MV3); single narrow purpose; privacy policy + prominent disclosure + affirmative consent before install | Days to weeks | Medium **if** the extension is load-bearing | Extension must be optional, self-contained, and never the daemon installer |

---

## 8. Direct implications for our tool

### 8.1 License decisions — do this now

1. **Keep the core daemon AGPL-3.0-or-later.** The WordPress fear was unfounded.
2. **License the companion WordPress plugin GPL-2.0-or-later** in both `readme.txt` (`License: GPLv2 or later` / `License URI: https://www.gnu.org/licenses/gpl-2.0.html`) and the main plugin file header. Zero friction, matches core, mirrors the approved Fleet Agent precedent.
3. **License the Shopify / Wix / Webflow / BigCommerce connectors Apache-2.0.**
4. **Adopt DCO + an explicit relicensing clause from commit #1** so we retain authority to license connectors separately. Retrofitting a CLA across contributors is one of the few genuinely irreversible mistakes available here.
5. **Do not bundle any GPLv2-only code** anywhere in the tree — that is the one combination that would actually break the chain.

### 8.2 Architecture decisions forced by the gates

6. **WordPress:** the plugin is a *signed-command receiver with a closed, compile-time allowlist*, not a generic RPC endpoint. Ed25519 signatures, nonce + timestamp + replay window, per-operation capability checks, zero dynamic code paths. **The agent dashboard renders in the daemon's own local web app; the wp-admin surface is pairing + status + an audit log only** (Guideline 8's iframe prohibition and management-service carve-out both point the same way).
7. **Shopify:** design the SEO writer around **resource-level SEO fields + metafields + a theme app embed** that renders schema/head tags at request time. Treat `write_themes` as an optional accelerator that we assume we will not get. Do not build a product that requires editing `robots.txt.liquid`.
8. **Wix:** implement **read-immediately-before-write** on every SEO tag mutation (no revision checking, last-write-wins, and the site owner is editing the same data in their dashboard). Full-replacement semantics mean we must snapshot prior state for rollback. Use SEO Patterns for page-type-wide changes rather than fanning out per-item writes. Accept that site-wide JSON-LD is impossible — emit per-page `script` tags.
9. **Webflow:** two auth modes. **Site Token** (instant, no gate, no custom code) and **OAuth Data Client** (gated, unlocks `custom_code:write`). Ship mode 1 first; feature-flag anything needing custom code.
10. **Squarespace:** ship an explicit "advisory mode" product surface — prioritised change list, exact copy to paste, deep links into the Squarespace SEO panel. Never imply automation. This is a documentation and expectation-management problem, not an engineering one.
11. **BigCommerce:** ship on day one against store-level API accounts. Cheapest full-write channel available to us.
12. **Installer:** first-run provisioning in the CLI entrypoint, not `postinstall`. Primary distribution = signed static binary + own Homebrew tap + GHCR image. npm and Docker Hub are convenience mirrors.
13. **Service installation** (systemd user unit / LaunchAgent / Scheduled Task) must be an **explicit, separate, opt-in command** (`seoe service install`) with a printed summary of exactly what will be written where — not a side effect of installation. This is both a trust issue and the thing that keeps us clear of "run any background services not required for the purpose of the app" (Wix) and "Utilizing the user's server or resources without permission" (WordPress Guideline 9).

### 8.3 Copy and positioning constraints (cheap to get right, expensive to get wrong)

14. **Ban these phrases from the WordPress readme, the Shopify listing, and the Wix listing:** "increase your traffic", "rank #1", "guaranteed rankings", "drive more traffic", "SEO on autopilot… results guaranteed". WordPress Guideline 9 names "Offering to drive more traffic to sites that use the plugin" as a prohibited act, and Shopify's listing rules forbid "outcome guarantees" in screenshots. Use the compliance-disclaimer style: the tool **assists** with SEO work.
15. **WordPress readme:** ≤5 tags, none of them competitor names (`yoast`, `rank-math`, `aioseo` are all off-limits), plus a mandatory **External services** section enumerating every host contacted with links to ToS and privacy policy.
16. **Wix/Shopify listings** must show real prices including any external service cost; Wix explicitly requires that "If integration is free but a service costs money, the price listing must list the service's price."

---

## 9. Ordered list of approvals to start on day one (by lead time and risk)

| Order | Action | Why now | Expected latency |
|---|---|---|---|
| **1** | **Submit the Shopify "Online Store Protected Scope Exemption Request"** for `write_themes`, framed strictly as "app primarily provides search engine optimization" | Highest-risk unknown on the board; June 2026 precedent suggests denial. We need the *no* early enough to have already built the theme-app-embed path. Placeholder App Store URL is accepted. No status page — set our own 15-business-day follow-up reminder. | "within two weeks" per docs; in practice indefinite |
| **2** | **Register the WordPress.org plugin slug and submit the first complete ZIP** | Longest predictable queue (5,127 pending, 4,223 >7 days old) and it sits on the largest channel. Every week of delay is a week of no WP distribution. | 14 business days nominal; 4–10 weeks realistic |
| **3** | **Request Duda API credentials** (Business Tools > API Access / support request) | Manual, human-gated grant with no published SLA; costs nothing to start. | Unknown |
| **4** | **Submit the Webflow app for Marketplace review** (public or private — both are reviewed) | 10–15 business days, and it's the only route to `custom_code:write`. Requires the 2–5 min demo video and a live `.webflow.io` test site, so start asset production in week 1. | 10–15 business days |
| **5** | **Publish our own Homebrew tap + GHCR image + signed release binaries** | No gate; establishes the install path immediately and starts the 30-day repo-age clock and the star count for homebrew-core eligibility. | Same day |
| **6** | **Ship the Wix app as an unlisted install link** (scope `SCOPE.PROMOTE.MANAGE-SEO`) | Zero gate. Fastest real distribution win available. | Same day |
| **7** | **Ship BigCommerce support via store-level API accounts** | Zero gate. | Same day |
| **8** | **Submit the Wix App Market listing** | Automated AI review returns in minutes; do it once the app is production-ready and billing is configured. | Minutes to days |
| **9** | **Submit the Shopify App Store listing** | Only after the no-`write_themes` architecture works end-to-end. Distribution method is irreversible. | 7–14 business days + rejection rounds |
| **10** | **BigCommerce App Marketplace listing** | Optional; discovery only. | Weeks |
| **11** | **homebrew-core formula** | Blocked until ≥225 stars (self-submission) or a third-party submission at ≥75. | After eligibility |
| **12** | **Chrome Web Store** (only if an extension ships) | Keep off the critical path; extension must be optional. | Days–weeks |

---

## 10. Open questions / things to verify before committing code

1. **Does a 2026 Dev-Dashboard Shopify custom app, installed on a single store, receive a usable `write_themes` grant without an exemption?** Docs conflict (asset-legacy scopes the requirement to App Store apps; `themeFilesUpsert` states it flatly). **Test empirically on a dev store.** If yes, a "bring your own custom app" path exists for advanced Shopify merchants.
2. **Exact Shopify scope names for resource-level SEO fields** (`seo.title`/`seo.description` on Product/Collection/Page/Article, and `global.title_tag`/`global.description_tag` metafields) in the current Admin API version. Asserted here from general knowledge; **not verified against a primary doc in this pass.**
3. **Is the WordPress "Protect The Shire" cooldown currently 24h or 6h?** Only secondary reporting says 6h, and it was communicated on Slack rather than in a public post.
4. **Chrome Web Store:** does the "Require a local executable, other than the Chrome runtime, to run" clause apply to MV3 extensions using Native Messaging, or only to legacy packaged/hosted apps?
5. **Webflow revenue share** for paid Marketplace apps — not stated in the marketplace guidelines.
6. **Duda plan tiers, prices, and the exact eligibility rule for API access** — only third-party aggregator data found.
7. **BigCommerce App Marketplace review SLA** — no primary figure located; "weeks" is analyst commentary.
8. **Whether the WordPress plugin review team has ever removed an AGPL plugin post-approval on license grounds.** No evidence found either way; the three live AGPL plugins are all low-install, so a high-profile AGPL plugin has not stress-tested reviewer discretion.
9. **Wix App Market:** does the automated AI review apply to *first* submissions as well as updates, and is there any human escalation tier? The doc implies fully automated; the older 15-business-day figure may still apply in some paths.
10. **Whether our hosted tier sold *outside* the Shopify/Wix billing systems to a merchant who also installed our marketplace app violates either platform's anti-circumvention rules.** Wix's wording ("Apps may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than the Wix Billing System") is the stricter one and needs a careful read before we design cross-channel pricing.

---

## Sources

All accessed **2026-09-01** unless otherwise noted.

**License**
- FSF, "Various Licenses and Comments about Them" — https://www.gnu.org/licenses/license-list.html (AGPLv3 and GPLv3 entries, "GPL-Compatible Free Software Licenses" section)
- FSF, GNU Licenses FAQ — https://www.gnu.org/licenses/gpl-faq.html ("In what ways can I link or combine AGPLv3-covered and GPLv3-covered code?")
- WordPress.org License — https://wordpress.org/about/license/
- Make/Plugins, "Plugin licensing: GPLv3 is now accepted" (2012-05-11) — https://make.wordpress.org/plugins/2012/05/11/cross-posted-from-the-main-development-blog-the/ ⚠️ 2012, but still the operative policy
- Make/Plugins, "GPL and the Repository" (2012-12-20) — https://make.wordpress.org/plugins/2012/12/20/gpl-and-the-repository/ ⚠️ 2012
- Live AGPL plugins: https://wordpress.org/plugins/hexabot-chat-widget/ · https://wordpress.org/plugins/wireservice/ · https://wordpress.org/plugins/media-picker-for-immich/
- Dual-license precedent: https://wordpress.org/plugins/fleet-agent-site-manager/ (plugin GPLv2+, dashboard AGPL-3.0)

**WordPress.org**
- Detailed Plugin Guidelines (last updated **2026-03-11**) — https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/
- Planning, Submitting, and Maintaining Plugins ("within 14 business days") — https://developer.wordpress.org/plugins/wordpress-org/planning-submitting-and-maintaining-plugins/
- Common Issues — https://developer.wordpress.org/plugins/wordpress-org/common-issues/
- Plugin Readmes — https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/
- Compliance Disclaimers — https://developer.wordpress.org/plugins/wordpress-org/compliance-disclaimers/
- Plugins Team status, **2026-08-24** — https://make.wordpress.org/updates/2026/08/24/plugins-team-24-aug-2026/
- Plugins Team status, 2026-07-27 — https://make.wordpress.org/updates/2026/07/27/plugins-team-27-jul-2026/
- "Protect The Shire", WordPress News, **2026-06-05** — https://wordpress.org/news/2026/06/pts/
- ⚠️ *secondary*: cooldown reduced to 6h — https://wp-content.co/protect-the-shire-initiatives-cooldown-period-reduced-to-six-hours-developers-call-out-lack-of-notice/

**Shopify**
- The Asset API resource (legacy) — exemption categories, process, "within two weeks" — https://shopify.dev/docs/apps/build/online-store/asset-legacy
- `themeFilesUpsert` — "write_themes and an exemption from Shopify" — https://shopify.dev/docs/api/admin-graphql/latest/mutations/themefilesupsert
- API access scopes — https://shopify.dev/docs/api/usage/access-scopes
- App distribution (public vs custom, irreversible choice) — https://shopify.dev/docs/apps/launch/distribution
- App requirements checklist (App Bridge, session tokens, Shopify App Pricing, 90-day API rule, 1600×900 screenshots) — https://shopify.dev/docs/apps/launch/app-requirements-checklist
- App Store review statuses — https://shopify.dev/docs/apps/launch/app-store-review/review-process
- Revenue share changelog (0% to $1M lifetime, 15% above, PPA 2025-06-16) — https://shopify.dev/changelog/update-to-shopifys-app-developer-revenue-share
- Legacy custom apps end 2026-01-01 — https://changelog.shopify.com/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026
- **Exemption denial thread (2026-06-20/22)** — https://community.shopify.dev/t/theme-api-write-exemption-denied-is-single-file-per-change-merchant-approved-writing-ever-approvable-or-is-app-embeds-the-only-path/35406
- Exemption form / no status page (2026-06-18) — https://community.shopify.dev/t/write-themes-exemption-no-confirmation-received-unlisted-app-app-store-url-required/35275
- Exemption during development (2026-03-10) — https://community.shopify.dev/t/requesting-write-themes-themefilesupsert-exemption-for-app-in-development-phase/31997
- `write_themes` merchant-approval error — https://community.shopify.com/t/editing-theme-via-api-this-action-requires-merchant-approval-for-write-themes-scope/363858

**Wix**
- About App Distribution (AI review "in minutes"; unlisted apps need no review) — https://dev.wix.com/docs/build-apps/launch-your-app/app-distribution/about-app-distribution.md
- About App Installation (standard/external install flows) — https://dev.wix.com/docs/build-apps/launch-your-app/app-distribution/install-your-app/about-app-installation.md
- About Permissions — https://dev.wix.com/docs/build-apps/develop-your-app/access/authorization/about-permissions.md
- Configure Permissions for Your App — https://dev.wix.com/docs/build-apps/develop-your-app/access/authorization/configure-permissions-for-your-app.md
- **Set Item SEO Tags — `SCOPE.PROMOTE.MANAGE-SEO`** — https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/set-item-seo-tags.md
- About the SEO APIs (resolution order, full-replacement writes, no revision checking, no site-wide JSON-LD) — https://dev.wix.com/docs/api-reference/business-management/seo/introduction.md
- App Market Guidelines (billing, pricing, permissions, background services) — https://dev.wix.com/docs/build-apps/launch-your-app/app-distribution/app-market-guidelines.md
- Monetize your app (100% year 1, then 80%, 2.5% txn fee, net 30 EOM) — https://dev.wix.com/docs/build-apps/launch-your-app/pricing-and-billing/about-monetizing-your-app.md
- (Tip: append `.md` to any `dev.wix.com/docs/` URL for clean markdown; index at https://dev.wix.com/docs/llms.txt)

**Webflow**
- Marketplace Guidelines (10–15 business days, OAuth-only, asset specs) — https://developers.webflow.com/apps/docs/marketplace-guidelines
- Scopes (`pages:write`; `custom_code:*` is Data-Client-only) — https://developers.webflow.com/data/reference/scopes
- Private Apps ("same rigorous review process as public apps") — https://developers.webflow.com/data/docs/private-apps
- Update Page Settings — https://developers.webflow.com/data/reference/pages-and-components/pages/update-page-settings

**Duda**
- Technical Requirements (white-label, minimal permissions) — https://developer.duda.co/docs/app-technical-requirements
- White Labeling Apps — https://developer.duda.co/docs/white-labing-apps
- Partner API introduction — https://developer.duda.co/docs/partner-api-introduction
- ⚠️ *secondary*: plan pricing — trustradius/g2/capterra aggregators; **unverified**

**Squarespace**
- Authentication and permissions (API families; no pages/SEO API) — https://developers.squarespace.com/commerce-apis/authentication-and-permissions
- OAuth — https://developers.squarespace.com/commerce-apis/oauth
- Squarespace API keys (Commerce Advanced) — https://support.squarespace.com/hc/en-us/articles/236297987-Squarespace-API-keys

**BigCommerce**
- API accounts (store-level, scope names) — https://docs.bigcommerce.com/docs/start/authentication/api-accounts
- App Store Approval Requirements — https://developer.bigcommerce.com/api-docs/apps/guide/requirements

**Developer distribution**
- npm v12 announcement (`allowScripts`, `--allow-git`, `--allow-remote`) — https://github.com/orgs/community/discussions/198547
- `npm approve-scripts` — https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/
- Homebrew Package Acceptance Policy (75/30/30, 225/90/90, 30-day rule) — https://docs.brew.sh/Package-Acceptance-Policy
- Homebrew Acceptable Formulae (DFSG, SHA-256, disable self-update) — https://docs.brew.sh/Acceptable-Formulae
- Docker Hub usage and limits (100/6h anon, 200/6h Personal) — https://docs.docker.com/docker-hub/usage/
- Docker, "Revisiting Docker Hub Policies" — https://www.docker.com/blog/revisiting-docker-hub-policies-prioritizing-developer-experience/
- Chrome Web Store Program Policies — https://developer.chrome.com/docs/webstore/program-policies/policies
- Chrome, remote-hosted code migration — https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code

**Staleness flags**
- WordPress GPLv3/AGPL license policy posts date from **2012**; they remain the operative statements and are corroborated by the 2026-03-11 guidelines text and by live AGPL listings, but no 2025/2026 restatement was found.
- Shopify's asset-legacy exemption page still references a **March 31, 2024** migration deadline; the exemption categories and the two-week SLA on that page are still the current process per 2026 staff replies, but the page itself is dated.
- Wix's "15 business days" review figure appears in 2026 blog summaries and older docs but is contradicted by the current, authoritative "AI review… within minutes" doc.
- Shopify App Store review duration figures are **community/blog only** — Shopify publishes no SLA.
- Duda pricing/plan-gating for API access is **aggregator-sourced only**.
