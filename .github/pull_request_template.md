<!-- Keep this short. Delete sections that do not apply. -->

## Kind of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / internal
- [ ] Docs
- [ ] Build / CI / tooling

## What

<!-- One paragraph: what this PR does and why. -->

Closes #

## How it was tested

<!-- Commands run, manual steps, or the tests that cover it. -->

## Checklist

- [ ] `pnpm ci` passes locally (lint, build, typecheck, test)
- [ ] Added or updated tests
- [ ] Updated docs if behaviour or flags changed
- [ ] No new dependency, or the new dependency is justified above
- [ ] CLA signed (the bot will comment if it is not)
- [ ] Does not add a new T1-auto action without a corresponding validator check
- [ ] If HTTP was touched: Host-header 403 protection still holds; no CORS headers, no `0.0.0.0` default
- [ ] If schema was touched: works on both SQLite and Postgres, or N/A
