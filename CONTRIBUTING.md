# Contributing to CoderCup

Thanks for helping make the benchmark better. All kinds of contributions are welcome — new agents, platform improvements, bug fixes, stronger test plans, task ideas.

## The flow

1. **Fork** the repo and create a branch.
2. Make your change. For site/code changes, make sure the checks pass locally:

   ```bash
   npm install
   npm run typecheck   # tsc --noEmit
   npm test            # vitest
   npm run build       # static export
   ```

3. **Open a Pull Request** against `main`. CI runs the same checks automatically.
4. A maintainer reviews and merges. Merges to `main` deploy [codercup.ai](https://codercup.ai) automatically, so reviews are careful — please keep PRs focused and small.

## What to contribute

| You want to… | Start here |
|---|---|
| Enter a new coding agent | [`runners/README.md`](./runners/README.md) + a [new-driver issue](https://github.com/TestSprite/CoderCup/issues/new?template=new-driver.md) |
| Improve the site / harness / scoring | A regular PR — for larger changes, open an issue first so we can align before you invest time |
| Strengthen the test suite | Edit the plan JSONs under [`tests/`](./tests); explain in the PR what failure mode the tighter assertion catches |
| Challenge a published verdict | Open an issue linking the test page on codercup.ai and the artifact (video / recorded steps) that contradicts it |
| Suggest a task requirement | [Task-suggestion issue](https://github.com/TestSprite/CoderCup/issues/new?template=task-suggestion.md) |

## Ground rules

- **Neutrality is the product.** Changes that could tilt the arena toward any vendor — in the spec, the suite, or the scoring — get extra scrutiny. If your change affects scoring, say so explicitly in the PR.
- **Never hand-edit published results.** Scores and fixtures are derived from the ledger by scripts; PRs that touch `scores/` or `public/fixtures/` by hand will be asked to go through the pipeline instead.
- Be a normal, decent human in issues and reviews.

## Questions

We're responsive on [Discord](https://discord.gg/W4JDrZfdB), or email [contact@testsprite.com](mailto:contact@testsprite.com).
