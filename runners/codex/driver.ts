/**
 * Codex driver - run(input: TaskRunInput): Promise<RunManifest>.
 *
 * Structurally mirrors runners/claude_code/driver.ts; deltas vs Claude
 * captured in docs/codearena-v1/m2-1-drivers/piece-3-codex-driver.md.
 * The shared utilities (LiveStream, UsageMeter, time-budget, github-
 * bridge stub) compose identically; the only Codex-specific code is
 * invoke.ts (different CLI invocation) + parse-output.ts (different
 * output format).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { RunManifest, TaskRunInput } from '../contract/schema';
import { LiveStream } from '../shared/live-stream';
import { UsageMeter } from '../shared/usage-meter';
import { pushRun } from '../shared/github-bridge';
import { deployRunBranch } from '../shared/amplify-deploy';
import { invokeScorer } from '../shared/invoke-scorer';
import { invokeCodex } from './invoke';
import { createCodexParser } from './parse-output';
import { createBugDetector } from '../shared/bug-detector';

const PUBLIC_DATA_BUCKET =
  process.env.PUBLIC_DATA_BUCKET ?? `codearena-public-data-${process.env.AWS_ACCOUNT_ID ?? ''}`;
const RUNS_BUCKET =
  process.env.RUNS_BUCKET ?? `codearena-runs-${process.env.AWS_ACCOUNT_ID ?? ''}`;
const CODEX_DEFAULT_MODEL = 'gpt-5.5';
const RUNNER_HOME_ROOT = '/home/ec2-user/.codearena/runs';

export async function run(input: TaskRunInput): Promise<RunManifest> {
  const runDir = join(RUNNER_HOME_ROOT, input.run_id);
  const workdir = join(runDir, 'workdir');
  await mkdir(workdir, { recursive: true });

  // Codex requires the workdir to either be inside a git repo or have
  // --skip-git-repo-check passed. invoke.ts passes the flag; we also
  // `git init` defensively so the production-spawn path matches the
  // pinned `--skip` smoke-test path.
  const { execSync } = await import('node:child_process');
  try {
    execSync('git init', { cwd: workdir, stdio: 'ignore' });
  } catch {
    /* git init failures are non-fatal - --skip-git-repo-check covers us */
  }

  const stream = new LiveStream({
    runId: input.run_id,
    localPath: join(runDir, 'live.jsonl'),
    s3Bucket: PUBLIC_DATA_BUCKET,
    s3Key: `runs/${input.run_id}/live.jsonl`,
  });
  await stream.start();

  const meter = new UsageMeter(CODEX_DEFAULT_MODEL);
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  const usageSnapshotTimer = setInterval(() => {
    void emitUsageSnapshot(stream, meter);
  }, 60_000);

  const bugDetector = createBugDetector();
  const parseLine = createCodexParser({
    onEvent: (event) => {
      void stream.emit(event);
      if (event.kind === 'agent_message') {
        const bugEv = bugDetector.observe(event.text);
        if (bugEv) void stream.emit(bugEv);
      }
    },
    setTokens: (p, c) => meter.setTokens(p, c),
  });

  const promptFile = join(runDir, 'prompt.md');
  const spec = await fetchSpec(input.task_spec_url);
  await writeFile(promptFile, spec, 'utf8');

  let result;
  try {
    result = await invokeCodex({
      workdir,
      promptFile,
      timeBudgetMinutes: input.time_budget_minutes,
      onLine: (line, which) => parseLine(line, which),
      env: envForRun(input),
    });
  } finally {
    clearInterval(usageSnapshotTimer);
  }

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
  const wallClockMinutes = Math.max(
    1,
    Math.round((Date.now() - startedAtMs) / 60_000),
  );

  const gh = await pushRun({
    runId: input.run_id,
    agentSlug: input.agent_slug,
    workdir,
  });

  const canDeploy = !gh.stubbed && gh.scanWarnings.length === 0;
  const deploy = canDeploy
    ? await deployRunBranch({
        runId: input.run_id,
        agentSlug: input.agent_slug,
        branchName: gh.branchName,
      })
    : { appId: '', deployedUrl: '', jobStatus: 'STUBBED' as const, stubbed: true };

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
      driver: 'codex_cli',
      model_id: CODEX_DEFAULT_MODEL,
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
        'tokens estimated via 60/40 in/out split (Codex --exec total only)',
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

  // Explicitly invoke score-runner (S3 PUT trigger removed due to
  // cyclic CFN reference between Data + Compute stacks).
  await invokeScorer(input.run_id);

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
