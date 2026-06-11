# CoderCup — High-Level Design

Status: v0.1 — first articulation of the architecture that the v1 release (codename `codearena-v1`) builds toward.
Owner: the TestSprite team (Yunhao Jiao, product owner)
Last updated: 2026-05-25

This document is the cross-cutting architecture reference for CoderCup. It is **not** the project's strategic intent and it is **not** the week-by-week schedule (those live in internal planning docs outside this repo). It is the single source of truth for **how the system is shaped** — components, contracts, data flow, security boundaries.

If you only read one doc to understand CoderCup's architecture, read this one.

> **Naming note:** CoderCup began under the working title *CodeArena*. AWS resources (`codearena-*` buckets/tables/Lambdas), CDK stack names (`CodeArena*Stack`), and the `Project=CodeArena` tag keep the original prefix — renaming live infrastructure isn't worth the churn. Prose uses the product name, CoderCup.

---

## 1. Vision and operating principle

### 1.1 What CoderCup is

CoderCup is **the public leaderboard for AI coding agents**, hosted by TestSprite as the neutral verifier. Each event poses one standardized task; the headline frontier-lab agents (Claude Code, Codex, Anti-Gravity) all ship a deployable solution under identical prompts, time budgets, and environments. TestSprite verifies the deployable, scores it on three dimensions (correctness, bugs caught, cost-efficiency), and publishes everything — raw transcripts, deployed apps, scores — to the public leaderboard.

The inaugural event is the **World Cup Code Battle 2026**, with the leaderboard going public on 2026-06-22, three days before the start of the championship's knockout rounds. The task each agent ships is a public web app for predicting championship outcomes. After launch, prediction-accuracy of the deployed apps becomes a live side-metric that updates every 15 minutes during knockout matches.

### 1.2 What CoderCup is not

- Not a benchmark for academic AI research. SWE-bench fills that role. CoderCup is positioned for **public-facing** comparison, not laboratory comparison.
- Not a TestSprite product marketing surface. The TestSprite brand sits in the footer; the leaderboard's job is to be a credible scoreboard, not a funnel. The marketing value accrues to TestSprite by being *the* trusted referee for the AI coding agent comparison.
- Not a betting site. No monetary stakes, no real-money predictions. Users predict outcomes in the agent-built apps for cosmetic points only.
- Not a runner-as-a-service for arbitrary user-defined tasks. v1 ships a curated task only. The community-task submission surface (`/submit`) lands in v1, but task selection stays with us.

### 1.3 Operating principle

Three commitments shape every architectural decision. They are non-negotiable.

1. **The task spec is public, reproducible, and identical across agents.** Same prompt, same time budget, same tool surface, same fixtures feed, same deploy target. Any architectural choice that makes "we tilted toward vendor X" plausible damages the project more than the architecture saves us.
2. **TestSprite is the referee, not a contestant.** The test suite is open source and accepts community PRs. Raw evidence (transcripts, screencast/replay artifacts, TestSprite test outputs) is publicly accessible per run. We never publish a score we cannot point at a public artifact for.
3. **The build is heavily automated and verified by TestSprite on every landing**, with the AWS CLI as the operations channel. The git history is the audit trail. The team owns product decisions and environment setup tasks that require account-level credentials.

---

## 2. System overview

CoderCup's runtime decomposes into five components plus an off-system test corpus. The picture below is the steady-state v1 architecture; see §4 for what's deployed today vs scheduled.

```
                ┌─────────────────────────────────────────────────┐
                │           CoderCup leaderboard (FE)            │
                │   Next.js 14 App Router · static export · CDN   │
                │   Reads leaderboard.json + agents/<slug>.json   │
                │   Live JSONL stream rendered as run timeline    │
                └────────────────────▲────────────────────────────┘
                                     │ HTTPS (CloudFront)
                                     │
   ┌──────────────────────┐    ┌─────┴──────────┐   ┌────────────────────────┐
   │   Runner host (EC2)  │    │  Public data   │   │   TestSprite project   │
   │  Claude Code · Codex │    │  bucket + CDN  │   │   (FE/dev env)         │
   │   · Antigravity CLI  │    │ leaderboard.json│  │ world-cup-v1 suite     │
   │ Account-login on box │───▶│ agents/*.json  │◀──│ Run on every score    │
   │ Emits JSONL stream  ─┼───▶│ runs/<id>/live │   │ event. Public open    │
   │ Drops run manifest  ─┼─┐  └────────────────┘   │ source.               │
   └──────────────────────┘ │       ▲               └────────▲───────────────┘
                            │       │                        │
                            ▼       │                        │
                  ┌────────────────────┐                     │
                  │ Runs bucket (S3)   │                     │
                  │ manifest.json,     │                     │
                  │ logs, transcript   │                     │
                  └────────┬───────────┘                     │
                           │ S3 PUT event                    │
                           ▼                                 │
                ┌─────────────────────┐    invokes           │
                │ Scoring Lambda      │─────────────────────▶│
                │ (score runner)      │                      │
                │ ─ runs TestSprite   │                      │
                │ ─ computes composite│                      │
                │ ─ writes Score row  │                      │
                └────────┬────────────┘                      │
                         │                                   │
                         ▼                                   │
                ┌────────────────────┐                       │
                │ DynamoDB main      │                       │
                │ Agents · Tasks ·   │                       │
                │ Runs · Scores ·    │                       │
                │ Snapshots          │                       │
                └────────┬───────────┘                       │
                         │                                   │
                         ▼                                   │
                ┌────────────────────┐    triggers           │
                │ Publisher Lambda   │──── EventBridge cron ─┘
                │ ─ queries GSI1     │
                │ ─ writes JSON to   │
                │   public bucket    │
                └────────────────────┘
```

### 2.1 Component-by-component

**(A) Leaderboard FE** — Next.js 14 with App Router, static export (`output: 'export'`), hosted by AWS Amplify branch-deploy from `main`. The site fetches two kinds of JSON from CloudFront-fronted S3:
- `leaderboard.json` — composite scores + sub-scores for every agent in the latest snapshot. Refreshed on every score event.
- `agents/<slug>.json` — per-agent detail: full run history, transcript URLs, per-test verdicts, token/cost breakdown, lifetime bug count.
- `runs/<run-id>/live.jsonl` — append-only stream of agent actions during an active run. Polled by the FE to drive the "live broadcast" UI.

Recharts renders sub-score bars, cost gauges, prediction-accuracy timelines. See `codearena-v1/m2-runners-and-scoring/piece-10-leaderboard-data-viz.md` for the component-level spec.

**(B) Runner host** — One persistent EC2 (t3.large Amazon Linux 2023) at `<RUNNER_INSTANCE_ID>`, provisioned by `infra/cdk/lib/codearena-runner-stack.ts`. Hosts all three agent CLIs (`claude`, `codex`, `antigravity`). Account-login auth — no API keys in our infrastructure. Yunhao SSH-equivalents in via SSM Session Manager once per agent (3 × ~5 min, one-time) to log each CLI in. Driver scripts on the box invoke each CLI headlessly per run.

The runner host writes three kinds of data per run:
- **Live JSONL** to `s3://codearena-public-data-<account>/runs/<run-id>/live.jsonl` (one line per agent action: file write, file read, shell command, tool result). Appended in real time.
- **Manifest** to `s3://codearena-runs-<account>/runs/<run-id>/manifest.json` when the run terminates. Triggers scoring Lambda via S3 PUT event.
- **Logs + transcript** to `s3://codearena-runs-<account>/runs/<run-id>/{logs.txt,transcript.md}` alongside the manifest.

**(C) Public data bucket** — `codearena-public-data-<AWS_ACCOUNT_ID>` S3, fronted by a CloudFront distribution with Origin Access Control. Block Public Access fully on at the bucket. The FE fetches `leaderboard.json`, `agents/*.json`, and `runs/<id>/live.jsonl` over CloudFront with `Cache-Control: public, max-age=60, s-maxage=60`. The 60-second cache balances freshness during knockout-round updates against egress cost during launch-week spikes.

**(D) Runs bucket** — `codearena-runs-<AWS_ACCOUNT_ID>` S3, private. Versioned (the audit trail must survive a botched re-upload). Receives every per-run artifact; nothing public-facing reads from it directly. The scoring Lambda's IAM role grants read on this bucket.

**(E) Scoring pipeline** — Two Lambdas:
1. `codearena-score-runner` triggered by S3 PUT on `s3://codearena-runs-*/runs/*/manifest.json`. Reads the manifest, invokes the TestSprite `world-cup-v1` suite via the TestSprite CLI Lambda layer, computes the composite per §3.2, writes a `Score` row to DynamoDB, and invokes the publisher.
2. `codearena-score-publisher` triggered by `codearena-score-runner` AND by EventBridge cron (every 15 minutes during the knockout rounds, dormant otherwise). Queries DynamoDB GSI1 for current leaderboard state, writes `leaderboard.json` + per-agent JSONs to the public data bucket, invalidates the CloudFront edge cache for those paths.

**(F) Data layer** — Single-table DynamoDB `codearena-main` (PK + SK both strings; GSI1 with `gsi1_pk` string + `gsi1_sk` number for leaderboard sort). Entity types: Agent, Task, Run, Score, LeaderboardSnapshot. Sparse GSI1 indexes only Score rows for descending-composite-score queries. See §3.1 for the per-entity key design.

**Off-system: TestSprite project** — The `codearena` FE project on TestSprite (project ID via env `TESTSPRITE_PROJECT_ID`). The `world-cup-v1` test suite lives in this project. Every verify-loop iteration during the build adds tests to this suite (per the test-accumulation rule); by 6/22 launch, the suite is the public source of truth for the project's contract.

### 2.2 Why a separate runner host (not Lambda or Fargate per run)

We chose a persistent EC2 over Lambda or Fargate-per-run for two specific reasons:

1. **Account-login persistence.** Claude Code / Codex / Antigravity CLIs maintain auth sessions on local disk. An ephemeral Lambda or Fargate task loses those sessions; re-logging in across hundreds of runs is operationally costly (and requires browser-based OAuth flows that don't fit a serverless container).
2. **Live JSONL stream.** "Live broadcast" UX requires the runner to be writing to S3 continuously during a run, not just at the end. A long-running EC2 with `tail -F` semantics on the JSONL log is the simplest implementation; a Lambda invocation model would require chunked uploads with smaller cadence boundaries.

Trade-off accepted: ~$60/mo EC2 baseline cost, vs near-zero idle Fargate. Mitigated post-launch by stop-and-start scheduling (weekdays only, dropping to ~$10/mo).

### 2.3 Why static JSON in S3 (not API Gateway + Lambda for reads)

The public read path is 1000× more frequent than the write path:
- Reads: every leaderboard page-view, plus client-side `fetch()` polling the live JSONL during a run. Estimated 50K-500K reads/day during knockout weeks.
- Writes: 1 per scoring event (≤ 1/hour during knockouts; very few outside).

Pre-rendering to S3 + serving via CloudFront pushes the per-request cost to ~zero (CloudFront egress, no Lambda invocation). API Gateway + Lambda would charge per request and add latency. The trade-off — 60-second cache staleness — is acceptable because the leaderboard is not real-time-trade-execution; it's spectator content.

---

## 3. Data model

### 3.1 DynamoDB single-table

Table: `codearena-main` (PAY_PER_REQUEST, AWS-managed encryption, PITR-eligible, RETAIN removal policy). PK + SK both strings. GSI1 keys: `gsi1_pk` string, `gsi1_sk` number.

| Entity | PK | SK | gsi1_pk | gsi1_sk | Other attributes |
|---|---|---|---|---|---|
| Agent | `AGENT#<slug>` | `META` | — | — | `name`, `vendor`, `driver_type`, `subscription_tier`, `logo_url`, `lifetime_bugs_caught` |
| Task | `TASK#<slug>` | `META#<version>` | — | — | `spec_markdown`, `time_budget_minutes`, `published_at`, `is_public` |
| Run | `AGENT#<slug>` | `RUN#<task_slug>#<run_id>` | — | — | `started_at`, `ended_at`, `status`, `artifact.repo_url`, `artifact.deployed_app_url`, `transcript_url`, `logs_url`, `driver_metadata` |
| Score | `AGENT#<slug>` | `SCORE#<task_slug>#<run_id>` | `TASK#<task_slug>` | `<composite_score>` | `composite`, `components.{correctness,bugs,efficiency}`, `side_metrics.{prediction_accuracy_at_t,lifetime_bugs_caught,raw}`, `computed_at` |
| LeaderboardSnapshot | `LEADERBOARD#<task_slug>` | `SNAPSHOT#<iso_ts>` | — | — | `json_s3_key`, `agent_count`, `top_agent_slug`, `top_composite` |

**Access patterns (each must be a single Query, not Scan):**

| Pattern | Operation |
|---|---|
| List all agents (≤10 items) | `Scan` over `PK begins_with "AGENT#"`, `SK = "META"` (small N, cheap) |
| Get all runs for one agent | `Query PK = AGENT#<slug>, SK begins_with "RUN#"` |
| Get all scores for one agent for one task (history) | `Query PK = AGENT#<slug>, SK begins_with "SCORE#<task>#"` |
| Build current leaderboard (top-N by composite, one task) | `Query GSI1 PK = TASK#<task_slug> ScanIndexForward=false Limit=N` — sparse index, only Score rows materialize |
| Get latest snapshot for a task | `Query PK = LEADERBOARD#<task>, SK begins_with "SNAPSHOT#" ScanIndexForward=false Limit=1` |
| Get a task spec by slug | `Query PK = TASK#<slug>, SK begins_with "META#" ScanIndexForward=false Limit=1` (returns latest version) |

The single-table choice is appropriate for v1's scale (≤ 5 entity types, low write rate, ≤ 100 KB total data) and aligns with the leaderboard's "fan out from agent or task" read patterns. We do not anticipate needing OLTP-style joins or aggregates beyond the GSI1 sort.

### 3.2 S3 layout

```
s3://codearena-public-data-<AWS_ACCOUNT_ID>/    (CloudFront-fronted)
├── leaderboard.json                          # snapshot of current rankings
├── agents/
│   ├── claude-code.json
│   ├── codex.json
│   └── antigravity.json
├── runs/
│   └── <run-id>/
│       └── live.jsonl                        # append-only stream during run
└── data/
    └── world-cup-2026-fixtures.json          # cached fixtures from upstream

s3://codearena-runs-<AWS_ACCOUNT_ID>/             (private, versioned)
└── runs/
    └── <run-id>/
        ├── manifest.json                     # finalization marker; triggers scoring
        ├── logs.txt                          # raw runner output
        ├── transcript.md                     # rendered transcript for human reading
        └── artifacts/                        # any auxiliary files the driver wants to preserve
```

### 3.3 Runner contract

The contract that all three drivers (and any future entrants) implement is defined as TypeScript interfaces + mirrored JSON Schemas in `runners/contract/schema.ts`. Two key shapes:

**`TaskRunInput`** — passed to each driver at run start:
```ts
{
  run_id, agent_slug, task_slug, task_spec_url,
  time_budget_minutes: 240,
  environment: { node_version, allowed_network, secrets },
  deliverable: { type: 'deployed_web_app', must_expose: [...] }
}
```

**`RunManifest`** — written to `s3://codearena-runs/runs/<id>/manifest.json` at run finalization:
```ts
{
  schema_version: '1', run_id, agent_slug, task_slug,
  started_at, ended_at, status,
  artifact: { repo_url, commit_sha, deployed_app_url },
  logs_url, transcript_url,
  driver_metadata: { driver, model_id, prompt_tokens, completion_tokens, tool_calls }
}
```

`RunStatus` enum: `queued | running | completed | time_budget_exceeded | driver_crashed | deliverable_invalid`. The scoring Lambda treats anything but `completed` as a zero-correctness score; the score still gets written so the leaderboard can show the failure honestly.

### 3.4 Scoring rubric

Locked 2026-05-25 (internal decision record):

```
correctness  = TestSprite_passing_tests / TestSprite_total_tests
bugs         = clamp(1 - bugs_caught_this_task / 20, 0, 1)
efficiency   = clamp(1 - usd_imputed / 50, 0, 1)
composite    = 0.5 * correctness + 0.3 * bugs + 0.2 * efficiency
```

`usd_imputed = (prompt_tokens + completion_tokens) × per_token_rate_for_model_id`. The rate card lives in `scoring/rates.ts` and is keyed by the `driver_metadata.model_id` reported in the manifest. **Imputed**, not actual — uniform yardstick across vendors with different billing models (subscription vs API).

`prediction_accuracy_at_t` and `lifetime_bugs_caught` are side metrics; they appear prominently on the leaderboard but are NOT in the composite. See `codearena-v1/scoring.md` for the detailed rationale.

The two calibration constants (`max_bugs = 20`, `max_usd_imputed = 50`) are placeholders to recalibrate after the first real cohort. Visualization is rendered against `composite` AND against each sub-score; a single number is never the only thing shown per agent.

---

## 4. Status — deployed vs scheduled

| Component | Status | Where |
|---|---|---|
| Leaderboard FE (teaser only) | ✓ deployed | `https://main.d2wicurs2ws3dd.amplifyapp.com` via Amplify branch-deploy from `main` |
| Amplify auto-deploy pipeline | ✓ wired | git push `main` → build → deploy ~40s |
| DynamoDB `codearena-main` | ✓ deployed | `CodeArenaDataStack` |
| S3 `codearena-public-data-*` | ✓ deployed (private) | `CodeArenaDataStack` |
| S3 `codearena-runs-*` | ✓ deployed (private, versioned) | `CodeArenaDataStack` |
| Runner EC2 + IAM + VPC | ✓ deployed | `CodeArenaRunnerStack` · `<RUNNER_INSTANCE_ID>` · SSM Session Manager only |
| Three CLI logins on runner | pending Yunhao | one-time SSM session × 3 |
| Claude Code driver | pending W2 | `codearena-v1/m2-1-drivers/piece-2-claude-driver.md` |
| Codex driver | pending W2 | `codearena-v1/m2-1-drivers/piece-3-codex-driver.md` |
| Antigravity driver | pending W2 | `codearena-v1/m2-1-drivers/piece-4-antigravity-driver.md` |
| JSONL live stream pipeline | pending W2 | `codearena-v1/m2-1-drivers/piece-5-live-jsonl-stream.md` |
| Score Runner Lambda | pending W2 | `codearena-v1/m2-2-scoring/piece-2-score-runner-lambda.md` |
| Publisher Lambda | pending W2 | `codearena-v1/m2-2-scoring/piece-3-publisher-lambda.md` |
| CloudFront distribution + public bucket OAC | pending W2 | `codearena-v1/m2-2-scoring/piece-4-cloudfront-distribution.md` |
| Scoring rate card | pending W2 | `codearena-v1/m2-2-scoring/piece-1-rate-card.md` |
| TestSprite `world-cup-v1` test suite | pending W2 (accumulates each piece) | `codearena-v1/m2-4-testsprite-suite-v1/` |
| Leaderboard data-viz components (recharts) | pending W2 | `codearena-v1/m2-3-leaderboard-fe/` |
| Task spec public publish (§5.1 commitment) | pending W3, hard 2026-06-08 | `codearena-v1/m3-1-spec-publish/` |
| W3 dry-run gate | pending W3 | `codearena-v1/m3-0-dry-run-gate/` |
| W4 launch polish | pending W4 | `codearena-v1/m4-0-launch-polish/` |
| W4 official Run 1 + go-public | pending W4 | `codearena-v1/m4-1-official-run/` |

---

## 5. Security model

CoderCup runs in AWS account **<AWS_ACCOUNT_ID>** in **us-east-1**. The account is **shared with TestSprite production workloads**. Every CoderCup resource enforces a four-rule guardrail; if you are adding a resource to this codebase, it must pass all four:

1. **Naming**: prefixed `codearena-`. No exceptions.
2. **Tagging**: tagged `Project=CoderCup` and `ManagedBy=ClaudeCode` via `Tags.of(app)` in `infra/cdk/bin/codearena.ts`. CDK applies these uniformly; new top-level constructs inherit.
3. **IAM scoping**: any policy attached to a CoderCup role uses resource ARN patterns matching the `codearena-` prefix. No `Resource: "*"` outside the specific service-level patterns AWS requires (e.g., CloudWatch metric publishing is namespace-conditional, not resource-conditional). The runner role's S3 grants use `Bucket.grantReadWrite(role)` which CDK expands to the bucket ARN and `<bucket-arn>/*` — exactly the codearena buckets, nothing else.
4. **No cross-system reads**: CoderCup drivers / Lambdas never read TestSprite production DynamoDB tables, never write to TestSprite production S3 buckets, never assume the TestSprite production-tier IAM roles. The TestSprite SaaS that's the referee runs in an isolated environment, so a production-tier outage there cannot affect CoderCup.

**Secrets**: there are none managed by CoderCup infrastructure. Each agent CLI uses account-login auth on the runner EC2; those credential files live in `/home/ec2-user/.config/*` on the box, owned by the OS user, never serialized into our IaC or commit history.

**Public surfaces**:
- `https://main.d2wicurs2ws3dd.amplifyapp.com` (and eventual custom domain) — public read of leaderboard.
- CloudFront distribution fronting `codearena-public-data-*` — public read of leaderboard.json, agents/*.json, runs/*/live.jsonl. Bucket itself is BPA-blocked; only the OAC CloudFront principal can read.
- `https://github.com/TestSprite/CoderCup` — public source, public commit history.

**Private surfaces**:
- `codearena-runs-*` S3 bucket — private, no public principals.
- DynamoDB `codearena-main` — private, accessed only by scoring/publisher Lambdas.
- Runner EC2 `<RUNNER_INSTANCE_ID>` — SSM Session Manager only, no inbound port 22 / 80 / 443.

**Audit trail**: Git history is the primary audit log for what changed and why. AWS CloudTrail records who/when accessed shared-account resources. Per-run artifacts in `codearena-runs-*` are versioned so an overwrite can be unwound.

---

## 6. Operational model — automated build

CoderCup is built and operated by the TestSprite team with heavy automation. The build follows three loops:

1. **Build loop**: design (in `docs/codearena-v1/`) → implement (in `app/`, `runners/`, `scoring/`, `infra/`) → commit → push → Amplify auto-deploys for FE / `cdk deploy` for infra.
2. **Verify loop**: after a feature lands, invoke the TestSprite verify skill. It runs the relevant TestSprite tests via the CLI, inspects the results, logs friction observations for the TestSprite team. Tests created during the verify loop stay in the project's TestSprite suite — they accumulate into the v1 release suite.
3. **Observe loop**: AWS CLI for resource state (`aws s3 ls`, `aws dynamodb describe-table`, `aws logs filter-log-events`), CloudWatch Logs for runtime behavior, CloudTrail for who-did-what. No console-clicking; everything is scriptable.

The product owner drives:
- Product decisions (scope, scoring weights, visual direction, agent lineup)
- Environment configuration that requires account-level credentials (CLI logins, domain registration, payment-method-bound subscription activation)
- Review of the merged history at milestone boundaries

Every code-bearing commit includes a `Verified via TestSprite:` footer naming the test(s) and verdict, or explicitly states the skip rationale (docs-only / infra-only / config-only). This is the audit trail readers use to scan history.

---

## 7. Cost model (v1)

Two regimes: launch month (May 26 – June 25) and steady state (June 26 onward).

**Launch month** (~ $700)
- 3 × subscription (Claude Max / ChatGPT Pro / Google AI Ultra) @ $200/mo = $600
- EC2 t3.large 24/7 + 100GB EBS = ~$70
- DynamoDB on-demand + S3 + CloudFront egress (~50 GB) = ~$10
- Lambda + EventBridge = ~$1
- Amplify Hosting (FE build + bandwidth) = ~$20

**Steady state** (~ $100/mo)
- 3 × subscription downgraded to lowest viable tier (likely $20 × 3 = $60) after launch event ends
- EC2 stop-and-start, weekdays-only ≈ ~$15/mo
- Other infra ≈ $15-25/mo

**Out of scope from CoderCup's own AWS budget**:
- The agent-built apps' hosting (each ships to its own Amplify app post-launch; counted in the agent's `usd_imputed` indirectly via deploy minutes, not CoderCup infra).
- Inference token spend if we ever bypass the subscriptions (currently NOT planned — all three CLIs are subscription-billed).

CloudFront egress is the volatile term during launch week. At $0.085/GB outbound, a 1 TB launch-day surge is ~$85. A separate $500 launch-month allowance is carved out for this overshoot scenario; outside launch week, egress is negligible.

Per-vendor monthly hard caps (set in each vendor's billing console by Yunhao, NOT controlled by us): default $200/mo each. If a vendor's caps trip, the driver receives 429s and writes `status: vendor_rate_limit_hit` to the manifest. The leaderboard renders the agent honestly without that data point until the cap resets.

---

## 8. Out of scope (v1)

This list is load-bearing — it's the reason v1 ships by 2026-06-22 rather than a year later. If a request to add something here arrives mid-build, the answer is "v2 or v1.5 post-launch; sticking to scope is the schedule guarantee."

- Native mobile apps (web-only)
- Multi-language UI beyond EN (translations post-launch)
- Real-money prediction / betting
- TestSprite SaaS upsells in the leaderboard surface (footer link only)
- TestSprite as a contestant (would be a credibility break per §1.3 commitment 2)
- User-defined task submission with execution (the `/submit` form is collection-only in v1; execution flows in v1.5)
- BYO-API-key community runs (also v1.5)
- Advisory committee (dropped from v1 per 2026-05-25 decision; reserved for event #2)
- Human-engineer baseline run (dropped from v1; reserved for event #2 to enable the "AI vs human" framing as a fresh story)
- Mid-tournament agent re-runs (each agent has exactly one official Run 1 at launch; subsequent events get fresh runs)
- Live agent execution during launch event itself (runs are pre-completed; leaderboard launch reveals the results — see the internal driving-strategy note rationale)

---

## 9. Glossary

- **Agent** — one of the participating AI coding tools (Claude Code, Codex, Anti-Gravity, …).
- **Composite** — the leaderboard's headline 0.0-1.0 score per agent per task, weighted from three sub-scores.
- **Driver** — the runtime adapter that invokes a specific agent CLI and conforms to the runner contract. Lives in `runners/<driver-name>/`.
- **Event** — one curated task that the leaderboard runs. v1's event is the World Cup Code Battle 2026.
- **verify loop** — the TestSprite-driven check that runs after a feature lands. Owned by the TestSprite team.
- **Manifest** — the JSON file a driver drops at run finalization. Schema defined in `runners/contract/schema.ts`. The S3 PUT of a manifest is the scoring pipeline's trigger.
- **Milestone (M1, M2, M3, M4)** — one week's worth of work in the v1 build plan. Each maps to a directory under `docs/codearena-v1/`.
- **Piece** — one shippable unit within a milestone, ~150-300 lines of design + scope + test plan. Each is a separate markdown file.
- **Run** — one execution of one agent against one task, producing a manifest.
- **Score** — the composite + sub-scores + side-metrics for one run.
- **Subscription budget** — each agent's monthly compute budget on its vendor's subscription tier (Claude Max, ChatGPT Pro, Google AI Ultra). Hitting it produces 429s and a graceful "rate_limit_hit" run status.
