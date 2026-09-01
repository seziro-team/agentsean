# Reddit

Keep each post a show-and-tell, not a launch dump. Link the repo and the demo. Answer comments.

## r/SEO and r/bigseo

Title: I built a self-hosted agent that applies SEO fixes as revertible diffs (WordPress / Shopify / Git)

Body: Most tools stop at the audit. Sean crawls, prioritizes against a published formula, and writes the safe changes back to the actual CMS. T3 needs two keys. T4 (review generation, unbounded city pages) is refused. Default metric is clicks — GSC impressions were contaminated for a year.

I am not selling schema / word count / llms.txt as AI-citation levers.

https://github.com/seziro-team/agentsean

## r/selfhosted

Title: Agent Sean — AGPL local SEO daemon, loopback-only, kill switch

Body: `npx agentsean` → dashboard on 127.0.0.1:7777. Credentials stay on your machine. Docker compose publishes loopback only and refuses to start without a 32-character token. systemd/LaunchAgent is an explicit `sean service install`, never a postinstall.

Self-host is $0. Cloud is optional and never holds CMS write credentials.
