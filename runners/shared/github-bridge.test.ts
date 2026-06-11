import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Mock the secrets module so unit tests don't depend on AWS creds or
// the real secret being present in Secrets Manager. The test that
// needs to exercise stub-mode keeps readSecret -> null; if we ever
// add a "real-push" unit test it would override per-test.
vi.mock('./secrets', () => ({
  readSecret: vi.fn(async () => null),
}));

import { scanForSecrets, pushRun } from './github-bridge';

let workdir = '';

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'gh-bridge-test-'));
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe('scanForSecrets', () => {
  it('returns empty for a clean workdir', async () => {
    await writeFile(join(workdir, 'README.md'), '# clean repo\n');
    const findings = await scanForSecrets(workdir);
    expect(findings).toEqual([]);
  });

  it('catches an Anthropic-style sk- token', async () => {
    await writeFile(
      join(workdir, 'leaked.env'),
      'ANTHROPIC_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789\n',
    );
    const findings = await scanForSecrets(workdir);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('api-key-anthropic-or-openai');
    expect(findings[0].path).toBe('leaked.env');
  });

  it('catches a GitHub fine-grained PAT', async () => {
    await mkdir(join(workdir, 'src'), { recursive: true });
    await writeFile(
      join(workdir, 'src', 'config.ts'),
      'const PAT = "github_pat_11AAA0000B0aaaaaaaaaaa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";',
    );
    const findings = await scanForSecrets(workdir);
    expect(findings.some((f) => f.kind === 'api-key-github-pat-fine')).toBe(
      true,
    );
  });

  it('skips node_modules', async () => {
    await mkdir(join(workdir, 'node_modules'), { recursive: true });
    await writeFile(
      join(workdir, 'node_modules', 'leak.txt'),
      'sk-abcdefghijklmnopqrstuvwxyz0123456789\n',
    );
    const findings = await scanForSecrets(workdir);
    expect(findings).toEqual([]);
  });

  it('catches multiple distinct kinds in the same scan', async () => {
    await writeFile(
      join(workdir, '.env'),
      [
        'OPENAI=sk-abcdefghijklmnopqrstuvwxyz0123456789',
        'GH=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'AWS=AKIAIOSFODNN7EXAMPLE',
      ].join('\n'),
    );
    const findings = await scanForSecrets(workdir);
    const kinds = new Set(findings.map((f) => f.kind));
    expect(kinds.has('api-key-anthropic-or-openai')).toBe(true);
    expect(kinds.has('api-key-github-classic')).toBe(true);
    expect(kinds.has('api-key-aws-access')).toBe(true);
  });
});

describe('pushRun (stub mode)', () => {
  it('returns a stubbed=true result with the TestSprite/CodeArena-runs target', async () => {
    const out = await pushRun({
      runId: 'sample-run-001',
      agentSlug: 'claude-code',
      workdir,
    });
    expect(out.stubbed).toBe(true);
    expect(out.repoUrl).toBe('https://github.com/TestSprite/CodeArena-runs');
    expect(out.branchName).toBe('sample-run-001');
    expect(out.scanWarnings).toEqual([]);
  });

  it('surfaces scan warnings even when stubbed', async () => {
    await writeFile(
      join(workdir, '.env'),
      'KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789\n',
    );
    const out = await pushRun({
      runId: 'sample-run-002',
      agentSlug: 'claude-code',
      workdir,
    });
    expect(out.scanWarnings.length).toBeGreaterThan(0);
  });
});
