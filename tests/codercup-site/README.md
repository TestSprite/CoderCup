# codercup-site self-tests

End-to-end TestSprite plans that exercise `https://codercup.ai` itself.

These are distinct from `tests/world-cup-2026-v3/` (which scores agent
deployments) — the plans here cover the benchmark site surface:

- `/` — home leaderboard, hero, methodology, task block, principles
- `/agents` + `/agents/[slug]` — agent index and detail
- `/tests` + `/tests/[testId]` — test directory and detail
- `/events` + `/events/world-cup-2026` — event catalog and detail
- `/live` — live cohort stream
- `/methodology`, `/reference`, `/changelog` — supporting pages

## Files

- `plans.jsonl` — the canonical plan set, one JSON plan per line. Each plan
  narrates a user action sequence and asserts a content outcome at the end,
  not just element visibility on the starting page.

Set `projectId` in each plan to your own TestSprite project before
registering (`<your-testsprite-project-id>` placeholder ships in the file).

## Running

Fire after any commit that touches a site page, shared components, or the
fixtures they consume:

```bash
testsprite test create-batch \
  --plans tests/codercup-site/plans.jsonl \
  --run --wait \
  --target-url https://codercup.ai \
  --output json
```
