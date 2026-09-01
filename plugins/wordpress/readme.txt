=== Agent Sean Bridge ===
Contributors: seanhq
Tags: seo, rest-api, yoast, rank-math, aioseo
Requires at least: 6.4
Tested up to: 6.8
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

REST bridge for Agent Sean. Registers SEO meta, normalized writes, redirects, robots.txt, JSON-LD, alt text, and revision restore.

== Description ==

Agent Sean is a local SEO daemon (AGPL). This companion plugin is GPL-2.0-or-later so it can live in the WordPress.org directory.

It does not run an agent. It exposes REST endpoints authenticated with Application Passwords so Sean can apply reviewable, revertible SEO changes on your actual site.

== Installation ==

1. Install and activate.
2. Create an Application Password for a dedicated Editor user.
3. In Sean: `sean connect wordpress --api-key USER:APP_PASSWORD` with the site origin.

== Frequently Asked Questions ==

= Does this plugin run an AI agent on my server? =

No. The plugin is a REST bridge. Agent Sean the daemon runs on a machine you control (usually your laptop or a VPS you SSH to), binds 127.0.0.1, and talks to this plugin with Application Passwords.

= Does it phone home? =

No. There is no telemetry in this plugin. The daemon's telemetry is documented in TELEMETRY.md and is off until you opt in.

= Does activating the plugin start a background service? =

No. WordPress Guideline 9. Service install is `sean service install` on the machine running the daemon, never a side effect of this plugin.

= Can it write my theme? =

It writes post meta, redirects, robots, JSON-LD, alt text, and can restore revisions. It does not replace your theme.

== Changelog ==

= 0.1.0 =
* Initial REST surface: capabilities, SEO write, rollback, redirects, robots, schema, media alt, revision restore.
