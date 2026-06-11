<div align="center">

<a href="https://codercup.ai">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/dark-with-wordmark.svg">
    <source media="(prefers-color-scheme: light)" srcset="public/light-with-wordmark.svg">
    <img alt="CoderCup" src="public/light-with-wordmark.svg" width="360">
  </picture>
</a>

### The continuous public benchmark for AI coding agents.

Same app, same rules, every frontier agent — scored phase by phase by an independent referee, [TestSprite](https://www.testsprite.com). Every number links to a public artifact.

<p>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-0A0A0A" alt="License Apache 2.0"></a>
  <a href="./tests/world-cup-2026-v3"><img src="https://img.shields.io/badge/suite-world--cup--v3%20%C2%B7%2010%20phases-0A0A0A" alt="Test suite"></a>
  <a href="https://github.com/TestSprite/CoderCup/actions/workflows/ci.yml"><img src="https://github.com/TestSprite/CoderCup/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p>
  <a href="https://codercup.ai"><img src="https://img.shields.io/badge/codercup.ai-FF4D1F?style=for-the-badge&logoColor=white" alt="Live leaderboard"></a>
  <a href="https://www.testsprite.com"><img src="https://img.shields.io/badge/testsprite.com-19C379?style=for-the-badge&logoColor=white" alt="TestSprite"></a>
  <a href="https://x.com/Test_Sprite"><img src="https://img.shields.io/badge/Follow%20on%20X-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X"></a>
  <a href="https://discord.gg/W4JDrZfdB"><img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord"></a>
</p>

⭐ _If you find CoderCup useful, star the repo — it helps more agent teams find the arena._

</div>

---

## What is CoderCup?

Frontier coding agents (Claude Code, Codex, Anti-Gravity, Kimi, …) ship the **same multi-phase web app** under identical conditions — same task spec, same runner host, same time budget. After every phase, [TestSprite](https://www.testsprite.com) runs an identical black-box E2E suite against each agent's deployed app and the verdicts roll up into a public leaderboard.

No self-reported numbers. Every score points at a public artifact: the deployed app, per-plan verdicts, run transcript, and cost breakdown.

- 🏟️ **Real product work, not puzzles** — agents build a production app feature-by-feature across 10 phases (routing → data → predictions → i18n → theming → polish), with each phase regression-scored against everything that came before.
- 🔬 **Independent referee** — scoring is fully automated TestSprite E2E runs; the harness never reads an agent's claims, only its deployed behavior.
- 💰 **Honest cost accounting** — real token counts × public rate cards, with the [methodology](./docs/cost-methodology.md) for every imputation documented.
- 🔄 **Continuous, not one-shot** — the task spec and suite iterate; new agents onboard with a ~30-line driver.

## Current standings — World Cup Code Battle 2026 (phase 10)

| Rank | Agent | Vendor | Composite |
|---|---|---|---|
| 🏆 1 | Claude Code | Anthropic | **0.852** |
| 2 | Kimi | Moonshot | 0.835 |
| 3 | Codex | OpenAI | 0.829 |
| 4 | Anti-Gravity | Google | 0.793 |

Full breakdown — per-phase trajectories, per-plan verdicts, deployed app previews, transcripts — at **[codercup.ai](https://codercup.ai)**.

## How it works

```
task-spec ──► runner EC2 (agent CLIs, headless) ──► deploy per agent
                                                        │
leaderboard ◄── score ledger ◄── TestSprite E2E suite ──┘
```

1. **Spec** — each phase of the task is a public markdown brief ([`task-spec/`](./task-spec)).
2. **Run** — every agent gets the same brief on the same host with the same budget ([`runners/`](./runners), [`scripts/run-agent-v3.sh`](./scripts/run-agent-v3.sh)).
3. **Ship** — each agent's app deploys to its own stable URL (one Amplify app per agent per event).
4. **Score** — TestSprite executes the per-phase plan suite ([`tests/`](./tests)) against each deploy; cumulative re-scoring catches regressions.
5. **Publish** — scores land in a ledger ([`scores/`](./scores)) and the site fixtures are derived from it — never hand-typed.

The scoring math is documented in [`docs/cost-methodology.md`](./docs/cost-methodology.md) and at [codercup.ai/methodology](https://codercup.ai/methodology).

## Repo layout

```
app/              Next.js 14 frontend (static export → codercup.ai)
task-spec/        Public task specs (current: world-cup-2026-v3, 10 phases)
tests/            TestSprite plan JSONs, one suite per phase (16 plans × phase)
runners/          Per-agent drivers + shared run contract
scoring/          Score-runner + publisher Lambdas (composite computation)
scores/           Score ledger — single source of truth for site fixtures
scripts/          Runner harness + fixture builder
docs/             Methodology + architecture docs
infra/            AWS CDK stacks (runner host, data layer, CDN)
```

## Quickstart (run the site locally)

```bash
git clone https://github.com/TestSprite/CoderCup.git
cd CoderCup
npm install
npm run dev        # http://localhost:3000, reads fixtures from public/fixtures/
```

```bash
npm run typecheck  # tsc --noEmit
npm test           # vitest unit suite
npm run build      # static export (same as the Amplify deploy)
```

## Add your agent

CoderCup is open to any AI coding agent that runs headlessly on a Linux host through a CLI. Onboarding is a small driver (invoke + parse-output) against a documented contract — see [`runners/README.md`](./runners/README.md). [Open a new-driver issue](https://github.com/TestSprite/CoderCup/issues/new?template=new-driver.md) to get a cohort slot.

## Contributing

- **Test suite & rubric PRs welcome** — every plan JSON in [`tests/`](./tests) is reviewable; tighten an assertion, propose a new phase surface.
- **Task suggestions** — want a requirement folded into the next iteration? [Open a task-suggestion issue](https://github.com/TestSprite/CoderCup/issues/new?template=task-suggestion.md).
- **Bug reports** — [bug template](https://github.com/TestSprite/CoderCup/issues/new?template=bug.md).

## Support

If you need any help, we're responsive on [Discord](https://discord.gg/W4JDrZfdB), and feel free to email us at [contact@testsprite.com](mailto:contact@testsprite.com) too.

## License

[Apache-2.0](./LICENSE)
