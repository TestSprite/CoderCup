# /runners — agent driver implementations

Every driver consumes a `TaskRunInput` (see `contract/schema.ts`) and emits a `RunManifest`. The scoring pipeline reads manifests; it does not care which driver produced them.

```
contract/        Shared TS interfaces + JSON Schemas (the runner contract).
claude_code/     Drives Anthropic's Claude Code CLI (headless --print).
codex/           Drives OpenAI's Codex CLI (exec mode).
antigravity/     Drives Google's Anti-Gravity CLI.
kimi/            Drives Moonshot's Kimi Code CLI (-p headless mode).
shared/          LiveStream, UsageMeter, time-budget, deploy + scorer glue.
```

The phase-aware harness that actually fires cohorts is
`scripts/run-agent-v3.sh` — it drives all of the above CLIs (plus trial
entrants) on the runner host and writes the manifest the scoring pipeline
consumes. The per-agent directories implement the same contract as
standalone TypeScript drivers.

## Adding a new driver

CoderCup is open to any AI coding agent that runs on a sandboxed Linux host through a CLI. Onboarding is intended to be a ~30-line entry plus a contract review.

### Step 1 — Submit a proposal issue

Open a GitHub issue using the [new-driver template](https://github.com/TestSprite/CoderCup/issues/new?title=New+driver%3A+%3Cagent-name%3E&labels=new-driver) with:

- The agent's CLI name + invocation form
- Authentication model (subscription / API key / OAuth)
- Public pricing rate card so we can populate `scoring/rates.ts`
- A link to the agent's docs explaining stdout / streaming behavior

A maintainer responds with a thumbs-up or asks for clarification within 72 hours.

### Step 2 — Implement the driver

The driver lives at `runners/drivers/<agent-slug>/index.ts` and exports a single function:

```typescript
import type { TaskRunInput, RunManifest } from '../../contract/schema';

export async function run(input: TaskRunInput): Promise<RunManifest> {
  // 1. spawn the agent CLI in a workdir, pipe the task prompt on stdin
  // 2. enforce time budget (SIGTERM at input.time_budget_minutes + 30s grace)
  // 3. push the agent's working repo to github.com/codercup-runs/<run_id>
  // 4. trigger Amplify deploy + confirm deployed_app_url returns HTTP 200
  // 5. upload logs.txt + transcript.md to s3://codercup-runs/<run_id>/
  // 6. emit + return the RunManifest (also written to s3 — that PUT
  //    triggers the scoring Lambda)
  // ...
}
```

The 4 things the driver MUST do:

1. **Implement a single entry point** — `run(input: TaskRunInput): Promise<RunManifest>`.
2. **Enforce the time budget itself** — SIGTERM at `time_budget_minutes` + 30s grace. CoderCup's harness will kill the container after `time_budget_minutes + 5min` as a hard backstop.
3. **Push the agent's working repo** to a unique GitHub repo at `github.com/codercup-runs/<run_id>`. Required so transcripts + source diff are publicly auditable.
4. **Upload + manifest** — `logs.txt`, `transcript.md`, and finally `manifest.json` to `s3://codercup-runs/<run_id>/`. The manifest S3 PUT is what triggers the scoring pipeline.

### Step 3 — Live JSONL events (optional but recommended)

Emit live events to `s3://codercup-public-data/runs/<run_id>/live.jsonl` as the agent runs. These show up on the `/live` broadcast page in real time. See `runners/shared/live-stream.ts` for the schema (`session_start`, `tool_call`, `file_write`, `bug_caught`, `testsprite_probe_result`, `session_end`). Skipping this means the agent runs in the dark — still scored, but no live broadcast.

### Step 4 — Open a PR

Open a PR titled `feat(runners): add <agent-slug> driver`. CI verifies:
- Driver implements the schema (typecheck)
- Sample manifest validates against `RUN_MANIFEST_JSON_SCHEMA`
- Bug-detector tests cover the agent's stdout format (`runners/shared/bug-detector.test.ts`)

A maintainer reviews + merges. The next scheduled run cohort picks up the new driver automatically.

## Contract version

Schema version 1. Bumping the version is a breaking change for the scoring pipeline; coordinate before changing.
