/**
 * Claude Code driver - run(input: TaskRunInput): Promise<RunManifest>.
 *
 * Implements the runner contract (m2-1 piece-1 in
 * `runners/contract/schema.ts`) for the Claude Code CLI on the runner
 * EC2 (m2-0 piece-2 logged the account in via Claude Max). Streams agent
 * events to s3://codearena-public-data/runs/<run_id>/live.jsonl via the
 * shared LiveStream class (m2-1 piece-5).
 *
 * Per m2-1 piece-2 design doc - see
 * `docs/codearena-v1/m2-1-drivers/piece-2-claude-driver.md`.
 *
 * STUBBED PARTS (waiting on org + PAT provisioning):
 *   - GitHub push step (runners/shared/github-bridge.ts is a stub)
 *   - Per-run Amplify app provisioning + deploy (not in this file yet)
 *
 * Until those land, a real run completes through invoke + parse + stream
 * to S3 + manifest write, with the manifest's `artifact.repo_url`
 * carrying a `stub://` scheme so the FE detail page can render a
 * "no source artifact yet" caption gracefully.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { RunManifest, TaskRunInput } from '../contract/schema';
import { LiveStream } from '../shared/live-stream';
import { UsageMeter } from '../shared/usage-meter';
import { pushRun } from '../shared/github-bridge';
import { deployRunBranch } from '../shared/amplify-deploy';
import { invokeScorer } from '../shared/invoke-scorer';
import { invokeClaude } from './invoke';
import { createParser } from './parse-output';
import { createBugDetector } from '../shared/bug-detector';

const PUBLIC_DATA_BUCKET =
  process.env.PUBLIC_DATA_BUCKET ?? `codearena-public-data-${process.env.AWS_ACCOUNT_ID ?? ''}`;
const RUNS_BUCKET =
  process.env.RUNS_BUCKET ?? `codearena-runs-${process.env.AWS_ACCOUNT_ID ?? ''}`;
const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4.7';
const RUNNER_HOME_ROOT = '/home/ec2-user/.codearena/runs';

export async function run(input: TaskRunInput): Promise<RunManifest> {
  const runDir = join(RUNNER_HOME_ROOT, input.run_id);
  const workdir = join(runDir, 'workdir');
  await mkdir(workdir, { recursive: true });

  const stream = new LiveStream({
    runId: input.run_id,
    localPath: join(runDir, 'live.jsonl'),
    s3Bucket: PUBLIC_DATA_BUCKET,
    s3Key: `runs/${input.run_id}/live.jsonl`,
  });
  await stream.start();

  const meter = new UsageMeter(CLAUDE_DEFAULT_MODEL);
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  let usageSnapshotTimer: NodeJS.Timeout | null = null;

  // Periodic usage_snapshot emission per [[project-codearena-iteration-curves]]
  usageSnapshotTimer = setInterval(() => {
    void emitUsageSnapshot(stream, meter);
  }, 60_000);

  const bugDetector = createBugDetector();
  const parseLine = createParser(CLAUDE_DEFAULT_MODEL, {
    onEvent: (event) => {
      void stream.emit(event);
      // Inspect every agent_message for self-claimed bug catches.
      // Heuristic; structured signal lands in a future driver version.
      if (event.kind === 'agent_message') {
        const bugEv = bugDetector.observe(event.text);
        if (bugEv) void stream.emit(bugEv);
      }
    },
    recordIteration: () => meter.recordIteration(),
    setTokens: (p, c) => meter.setTokens(p, c),
  });

  // Fetch the task spec into a local file for stdin redirection.
  const promptFile = join(runDir, 'prompt.md');
  const spec = await fetchSpec(input.task_spec_url);
  await writeFile(promptFile, spec, 'utf8');

  let result;
  try {
    result = await invokeClaude({
      workdir,
      promptFile,
      timeBudgetMinutes: input.time_budget_minutes,
      onLine: (line, which) => parseLine(line, which),
      env: envForRun(input),
    });
  } finally {
    if (usageSnapshotTimer) clearInterval(usageSnapshotTimer);
  }

  // Final usage snapshot just before session_end so the FE chart's last
  // data point reflects the wall-clock end.
  await emitUsageSnapshot(stream, meter);

  const snap = meter.snapshot();
  await stream.emit({
    kind: 'session_end',
    tokens_used: snap.promptTokens + snap.completionTokens,
    reason: result.budgetExceeded
      ? 'time-budget-exceeded'
      : result.exitCode === 0
        ? 'agent-signaled-complete'
        : 'driver-error',
  });
  await stream.close();

  const endedAt = new Date().toISOString();
  const wallClockMinutes = Math.max(1, Math.round((Date.now() - startedAtMs) / 60_000));

  // GitHub bridge: pushes the agent's working dir to a branch under
  // TestSprite/CodeArena-runs. Stays stubbed until codearena/github-pat
  // is populated; if the secret-scan catches anything, push is aborted
  // (returned with scanWarnings.length > 0 + stubbed: true).
  const gh = await pushRun({
    runId: input.run_id,
    agentSlug: input.agent_slug,
    workdir,
  });

  // Per-run Amplify deploy: provisions codearena-run-<id> Amplify app
  // pointed at the just-pushed branch. Skips when github-bridge was
  // stubbed or scan blocked (no source to deploy from).
  const canDeploy = !gh.stubbed && gh.scanWarnings.length === 0;
  const deploy = canDeploy
    ? await deployRunBranch({
        runId: input.run_id,
        agentSlug: input.agent_slug,
        branchName: gh.branchName,
      })
    : { appId: '', deployedUrl: '', jobStatus: 'STUBBED' as const, stubbed: true };

  // Upload the local live.jsonl + the transcript dump to the private runs
  // bucket alongside the manifest. v1 transcript is the same content as
  // the public live.jsonl; m4-0 polish may add a richer rendered MD.
  const s3 = new S3Client({ region: 'us-east-1' });
  const logsKey = `runs/${input.run_id}/logs.txt`;
  await s3.send(
    new PutObjectCommand({
      Bucket: RUNS_BUCKET,
      Key: logsKey,
      Body: result.stdoutBuffered,
      ContentType: 'text/plain',
    }),
  );

  const status: RunManifest['status'] = result.budgetExceeded
    ? 'time_budget_exceeded'
    : result.exitCode === 0
      ? 'completed'
      : 'driver_crashed';

  const manifest: RunManifest = {
    schema_version: '1',
    run_id: input.run_id,
    agent_slug: input.agent_slug,
    task_slug: input.task_slug,
    started_at: startedAt,
    ended_at: endedAt,
    status,
    artifact: {
      repo_url: gh.stubbed ? gh.repoUrl : `${gh.repoUrl}/tree/${gh.branchName}`,
      commit_sha: gh.commitSha,
      deployed_app_url: deploy.deployedUrl,
    },
    logs_url: `s3://${RUNS_BUCKET}/${logsKey}`,
    transcript_url: `s3://${PUBLIC_DATA_BUCKET}/runs/${input.run_id}/live.jsonl`,
    driver_metadata: {
      driver: 'claude_code_session',
      model_id: CLAUDE_DEFAULT_MODEL,
      prompt_tokens: snap.promptTokens,
      completion_tokens: snap.completionTokens,
      tool_calls: snap.iterations,
      bugs_caught_this_task: bugDetector.count(),
      notes: [
        gh.stubbed ? 'github-bridge stubbed (PAT pending)' : null,
        gh.scanWarnings.length > 0
          ? `secret-scan blocked push: ${gh.scanWarnings.length} finding(s)`
          : null,
        deploy.stubbed
          ? 'amplify-deploy stubbed (no PAT)'
          : deploy.jobStatus !== 'SUCCEED'
            ? `amplify-deploy ${deploy.jobStatus.toLowerCase()}`
            : null,
        `imputed_cost_usd=${snap.usdImputed.toFixed(4)}`,
        `wall_clock_minutes=${wallClockMinutes}`,
      ]
        .filter(Boolean)
        .join('; '),
    },
  };

  const manifestKey = `runs/${input.run_id}/manifest.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket: RUNS_BUCKET,
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }),
  );

  return manifest;
}

async function fetchSpec(url: string): Promise<string> {
  if (url.startsWith('file://')) {
    const { readFile } = await import('node:fs/promises');
    return await readFile(url.replace('file://', ''), 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`task spec fetch ${url} -> ${res.status}`);
  return await res.text();
}

function envForRun(input: TaskRunInput): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.environment.secrets)) {
    env[k] = String(v);
  }
  return env;
}

async function emitUsageSnapshot(
  stream: LiveStream,
  meter: UsageMeter,
): Promise<void> {
  const snap = meter.snapshot();
  await stream.emit({
    kind: 'usage_snapshot',
    prompt_tokens: snap.promptTokens,
    completion_tokens: snap.completionTokens,
    iterations: snap.iterations,
    usd_imputed: snap.usdImputed,
  });
}

// Allow `node --import tsx runners/claude_code/driver.ts <path-to-input.json>`
// as a manual smoke-test entry point. Driver-orchestrator infra in m4-1
// will invoke run() directly with TaskRunInput from DDB.
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    // eslint-disable-next-line no-console
    console.error(
      'usage: tsx runners/claude_code/driver.ts <task-run-input.json>',
    );
    process.exit(2);
  }
  void (async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(inputPath, 'utf8');
    const input = JSON.parse(raw) as TaskRunInput;
    if (!input.run_id) input.run_id = randomUUID();
    const manifest = await run(input);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(manifest, null, 2));
  })();
}
