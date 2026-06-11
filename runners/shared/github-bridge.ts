/**
 * GitHub bridge - pushes the agent's working directory to a unique
 * branch in https://github.com/TestSprite/CodeArena-runs. Single repo,
 * one branch per run (named after the run_id). Branches are orthogonal
 * so concurrent runs never collide.
 *
 * Authenticated via an SSH **deploy key** scoped to this one repo (set
 * up 2026-05-25 after the PAT routes hit org-policy / bot-account dead
 * ends). The private half lives in AWS Secrets Manager at
 * `codearena/github-deploy-key`; the public half is registered at
 * https://github.com/TestSprite/CodeArena-runs/settings/keys with
 * "Allow write access" checked.
 *
 * Blast radius: deploy keys are repo-scoped at GitHub's enforcement
 * layer. Even if the private key leaks, the attacker can only act on
 * CodeArena-runs (not the TestSprite org, not personal accounts).
 *
 * Repo home (decided 2026-05-25): https://github.com/TestSprite/CodeArena-runs.
 * Single-repo branch model means renaming is a settings change, not a
 * data migration.
 *
 * The module STAYS in stub mode if the secret is unset, so this code
 * runs safely in dev / partial-deploy scenarios.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readSecret } from './secrets';

const REPO_HTTPS = 'https://github.com/TestSprite/CodeArena-runs';
const REPO_SSH = 'git@github.com:TestSprite/CodeArena-runs.git';
const DEPLOY_KEY_SECRET_ID = 'codearena/github-deploy-key';

export interface GithubBridgeOutput {
  repoUrl: string;
  branchName: string;
  commitSha: string;
  stubbed: boolean;
  scanWarnings: SecretScanFinding[];
}

export interface GithubBridgeOptions {
  runId: string;
  agentSlug: string;
  workdir: string;
}

export async function pushRun(
  opts: GithubBridgeOptions,
): Promise<GithubBridgeOutput> {
  // Defense-in-depth: scan workdir before push. Public repo = anything
  // pushed is world-readable.
  const findings = await scanForSecrets(opts.workdir);
  if (findings.length > 0) {
    return {
      repoUrl: REPO_HTTPS,
      branchName: opts.runId,
      commitSha: '0'.repeat(40),
      stubbed: true,
      scanWarnings: findings,
    };
  }

  const privateKey = await readSecret(DEPLOY_KEY_SECRET_ID);
  if (!privateKey) {
    return {
      repoUrl: REPO_HTTPS,
      branchName: opts.runId,
      commitSha: '0'.repeat(40),
      stubbed: true,
      scanWarnings: [],
    };
  }

  return await pushReal(opts, privateKey);
}

/**
 * Real push via SSH deploy key. Writes the private key to a 0600 temp
 * file inside the run's local-only key dir, configures GIT_SSH_COMMAND
 * to use it (-i + IdentitiesOnly + StrictHostKeyChecking=accept-new so
 * the first push doesn't fail on the github.com host key), pushes the
 * branch, then deletes the key file.
 *
 * The key file lives OUTSIDE the workdir so it never enters the
 * agent's working tree (the secret-scan would catch it but better to
 * not put it there at all).
 */
async function pushReal(
  opts: GithubBridgeOptions,
  privateKey: string,
): Promise<GithubBridgeOutput> {
  const cwd = opts.workdir;
  const keyDir = `/home/ec2-user/.codearena/keys/${opts.runId}`;
  const keyPath = `${keyDir}/deploy-key`;

  await mkdir(keyDir, { recursive: true, mode: 0o700 });
  const keyBody = privateKey.endsWith('\n') ? privateKey : `${privateKey}\n`;
  await writeFile(keyPath, keyBody, { mode: 0o600 });

  const sshCmd = `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null`;
  const env = { ...process.env, GIT_SSH_COMMAND: sshCmd };

  try {
    exec(cwd, 'git', ['init'], env);
    exec(cwd, 'git', ['config', 'user.email', 'runner@codearena.dev'], env);
    exec(cwd, 'git', ['config', 'user.name', 'CoderCup Runner'], env);

    exec(cwd, 'git', ['add', '-A'], env);
    exec(
      cwd,
      'git',
      [
        'commit',
        '--allow-empty',
        '-m',
        `CoderCup run ${opts.runId} (${opts.agentSlug})`,
      ],
      env,
    );

    try {
      exec(cwd, 'git', ['remote', 'remove', 'origin'], env);
    } catch {
      /* fresh repo - origin didn't exist */
    }
    exec(cwd, 'git', ['remote', 'add', 'origin', REPO_SSH], env);

    exec(
      cwd,
      'git',
      ['push', '--force-with-lease', 'origin', `HEAD:${opts.runId}`],
      env,
    );

    const sha = exec(cwd, 'git', ['rev-parse', 'HEAD'], env).trim();

    return {
      repoUrl: REPO_HTTPS,
      branchName: opts.runId,
      commitSha: sha,
      stubbed: false,
      scanWarnings: [],
    };
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

function exec(
  cwd: string,
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
}

// ----------------------------------------------------------------------
// Secret scan
// ----------------------------------------------------------------------

export interface SecretScanFinding {
  /** Type label - "api-key-anthropic", "api-key-openai", etc. */
  kind: string;
  /** Path relative to workdir. */
  path: string;
  /** Approximate line number (1-indexed). */
  line: number;
}

/**
 * Patterns crafted to be specific enough to catch real keys without
 * tripping on random base64. NOT exhaustive - defense in depth, not a
 * primary security boundary. A dedicated scanner (gitleaks, trufflehog)
 * is the v1.5 upgrade.
 */
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['api-key-anthropic-or-openai', /\bsk-[A-Za-z0-9_-]{30,}\b/],
  ['api-key-github-pat-fine', /\bgithub_pat_[A-Za-z0-9_]{22,}\b/],
  ['api-key-github-classic', /\bghp_[A-Za-z0-9]{36}\b/],
  ['api-key-aws-access', /\bAKIA[A-Z0-9]{16}\b/],
  ['api-key-google', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['api-key-stripe', /\bsk_(live|test)_[A-Za-z0-9]{24,}\b/],
];

const SKIP_PATHS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  '.codearena',
]);

export async function scanForSecrets(
  workdir: string,
): Promise<SecretScanFinding[]> {
  const findings: SecretScanFinding[] = [];
  await walk(workdir, '', findings);
  return findings;
}

async function walk(
  root: string,
  rel: string,
  acc: SecretScanFinding[],
): Promise<void> {
  const dir = rel ? join(root, rel) : root;
  let entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }>;
  try {
    const raw = await readdir(dir, { withFileTypes: true });
    entries = raw.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  } catch {
    return;
  }
  for (const entry of entries) {
    const childRel = rel ? join(rel, entry.name) : entry.name;
    if (entry.isDirectory) {
      if (SKIP_PATHS.has(entry.name)) continue;
      await walk(root, childRel, acc);
      continue;
    }
    if (!entry.isFile) continue;
    const abs = join(root, childRel);
    try {
      const st = await stat(abs);
      if (st.size > 1_000_000) continue;
      const content = await readFile(abs, 'utf8');
      scanContent(content, relative(root, abs), acc);
    } catch {
      /* unreadable - skip */
    }
  }
}

function scanContent(
  text: string,
  pathRel: string,
  acc: SecretScanFinding[],
): void {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const [kind, re] of SECRET_PATTERNS) {
      if (re.test(lines[i])) {
        acc.push({ kind, path: pathRel, line: i + 1 });
      }
    }
  }
}
