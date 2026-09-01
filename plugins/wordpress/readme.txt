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

== Changelog ==

= 0.1.0 =
* Initial REST surface: capabilities, SEO write, rollback, redirects, robots, schema, media alt, revision restore.
