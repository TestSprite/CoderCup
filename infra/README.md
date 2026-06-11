# /infra — AWS CDK stacks for CoderCup

Deploys to **us-east-1**. The AWS account may be shared with other workloads; every resource must be prefixed `codearena-` and tagged `Project=CodeArena ManagedBy=ClaudeCode`. See `/docs/design.md` for the rules.

## Subprojects

- `cdk/` — TypeScript CDK app. W1 ships the data layer only (DynamoDB + two S3 buckets).

## W1 — data layer (this directory)

Stack: `CodeArenaDataStack`.

Resources provisioned:
- DynamoDB `codearena-main` — single-table design, PK/SK string, GSI1 `(gsi1_pk: string, gsi1_sk: number)` for leaderboard sort. PITR on, AWS-managed encryption, `RETAIN` removal policy.
- S3 `codearena-public-data-<account>` — eventual leaderboard JSON home, fronted by CloudFront in W2. Block Public Access ON; CORS allows the Amplify domain + localhost.
- S3 `codearena-runs-<account>` — per-run manifests, logs, transcripts. Block Public Access ON; versioned.

## Operating the stack

```sh
cd infra/cdk
npm install
npx cdk bootstrap aws://<AWS_ACCOUNT_ID>/us-east-1   # one-time per account/region
npx cdk diff                                       # preview
npx cdk deploy                                     # apply
```

Bootstrap is idempotent — safe to re-run if the toolkit stack already exists.

## What's NOT here yet (and where it lands)

- Lambda functions (scoring runner + leaderboard publisher) — **W2**
- CloudFront distribution in front of `codearena-public-data` — **W2** (when leaderboard.json starts flowing)
- IAM roles for driver containers — **W2**
- EventBridge cron for prediction-accuracy polling — **W4**

If you add a new stack here, register it in `cdk/bin/codearena.ts` and add the `Project` + `ManagedBy` tags via `Tags.of(app)` so the shared-account guardrails stay enforced.
