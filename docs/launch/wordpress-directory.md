# WordPress.org plugin directory

The companion plugin is `plugins/wordpress` (GPL-2.0-or-later). It does **not** run an agent. It exposes REST endpoints authenticated with Application Passwords.

Directory listing copy lives in `plugins/wordpress/readme.txt`. Notes for review:

- No phone-home
- No service install as a side effect of activating the plugin
- Application Passwords, not a custom auth scheme
- Sean the daemon is AGPL and is **not** shipped inside the plugin zip
- Tested up to current WP; Requires PHP 8.1; Requires at least 6.4

Submission is its own discovery channel. Do not bundle Node or the daemon in the zip — that fails guideline 9 (using the user's server without permission) and "run any background services not required for the purpose of the app."
