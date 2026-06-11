/**
 * Per-run Amplify deploy. After github-bridge pushes the agent's
 * working dir to a branch in TestSprite/CodeArena-runs, this module
 * provisions a dedicated Amplify app pointed at that branch and waits
 * for the deploy to complete.
 *
 * One Amplify app per run, named codearena-run-<run-id>. Tagged
 * Project=CoderCup + ManagedBy=ClaudeCode + AgentSlug + RunId so
 * AWS Cost Explorer can attribute spend per-run.
 *
 * Stays in STUB MODE until codearena/github-pat secret exists - the
 * Amplify CreateApp call needs the GitHub access token to clone the
 * source repo on its end.
 *
 * Trade-offs vs alternative deploy targets (per the design review
 * 2026-05-25): Amplify chosen because the CoderCup leaderboard itself
 * runs on Amplify already, the GitHub App authorization for the
 * TestSprite org is already in place, and per-run apps preserve the
 * archival value (every historical run has a permanent reachable URL).
 * Custom domain comes later post-launch.
 */
import {
  AmplifyClient,
  CreateAppCommand,
  CreateBranchCommand,
  GetJobCommand,
  StartJobCommand,
} from '@aws-sdk/client-amplify';
import { readSecret } from './secrets';

const REGION = 'us-east-1';
const SOURCE_REPO = 'https://github.com/TestSprite/CodeArena-runs';

export interface AmplifyDeployOutput {
  appId: string;
  deployedUrl: string;
  jobStatus: 'SUCCEED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT' | 'STUBBED';
  stubbed: boolean;
}

export interface AmplifyDeployOptions {
  runId: string;
  agentSlug: string;
  branchName: string;
}

const POLL_MS = 8_000;
const MAX_POLL_MIN = 12;
const STUB_OUTPUT: AmplifyDeployOutput = {
  appId: '',
  deployedUrl: '',
  jobStatus: 'STUBBED',
  stubbed: true,
};

export async function deployRunBranch(
  opts: AmplifyDeployOptions,
): Promise<AmplifyDeployOutput> {
  const pat = await readSecret('codearena/github-pat');
  if (!pat) {
    return STUB_OUTPUT;
  }

  const amplify = new AmplifyClient({ region: REGION });

  // 1. CreateApp pointing at TestSprite/CodeArena-runs
  const created = await amplify.send(
    new CreateAppCommand({
      name: `codearena-run-${opts.runId}`,
      description: `CoderCup run artifact for ${opts.agentSlug} on branch ${opts.branchName}`,
      repository: SOURCE_REPO,
      accessToken: pat,
      platform: 'WEB',
      enableBranchAutoBuild: true,
      tags: {
        Project: 'CoderCup',
        ManagedBy: 'ClaudeCode',
        AgentSlug: opts.agentSlug,
        RunId: opts.runId,
      },
    }),
  );

  const appId = created.app?.appId;
  const defaultDomain = created.app?.defaultDomain;
  if (!appId || !defaultDomain) {
    return { ...STUB_OUTPUT, jobStatus: 'FAILED' };
  }

  // 2. CreateBranch
  await amplify.send(
    new CreateBranchCommand({
      appId,
      branchName: opts.branchName,
      enableAutoBuild: true,
    }),
  );

  // 3. StartJob (RELEASE)
  const started = await amplify.send(
    new StartJobCommand({
      appId,
      branchName: opts.branchName,
      jobType: 'RELEASE',
    }),
  );
  const jobId = started.jobSummary?.jobId;
  if (!jobId) {
    return { appId, deployedUrl: '', jobStatus: 'FAILED', stubbed: false };
  }

  // 4. Poll until terminal
  const deadline = Date.now() + MAX_POLL_MIN * 60_000;
  let terminalStatus: 'SUCCEED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT' =
    'TIMED_OUT';
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const status = await amplify.send(
      new GetJobCommand({ appId, branchName: opts.branchName, jobId }),
    );
    const s = status.job?.summary?.status;
    if (s === 'SUCCEED' || s === 'FAILED' || s === 'CANCELLED') {
      terminalStatus = s;
      break;
    }
  }

  // Amplify branch URLs follow https://<branch>.<appDefaultDomain>
  const deployedUrl = `https://${sanitizeBranchForUrl(opts.branchName)}.${defaultDomain}`;

  return {
    appId,
    deployedUrl: terminalStatus === 'SUCCEED' ? deployedUrl : '',
    jobStatus: terminalStatus,
    stubbed: false,
  };
}

function sanitizeBranchForUrl(branch: string): string {
  // Amplify lowercases the branch in the URL and replaces / with -.
  // run_id is already UUID-style lowercase alphanumeric + hyphens so
  // this is mostly a no-op; defensive for the edge case where
  // run_id has slashes.
  return branch.replace(/\//g, '-').toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
