# Show HN: Agent Sean — an SEO engineer that writes reversible diffs to your actual site

**Post when you can sit in the comments.** Weekday vs weekend is noise. The 12:00–17:00 UTC rule does not survive a larger Show HN dataset.

Suggested title:

> Show HN: Agent Sean – self-hosted SEO agent that fixes your site and can revert it

Body:

Every SEO tool tells you what's wrong. Agent Sean fixes it — in WordPress, Shopify, a Git repo, or at the edge — as a diff you can read and revert.

```
npx agentsean
```

It binds 127.0.0.1:7777 only. `sean freeze` halts every write. Hosted never stores CMS write credentials.

OpenSEO (MIT, analyzes and reports) proved an open-source SEO platform could work. Sean is the execution layer, not a fork.

Repo: https://github.com/seziro-team/agentsean

What it does *not* do, on purpose: stakeholder negotiation, strategy arguments, or deciding whether you should want the traffic.
