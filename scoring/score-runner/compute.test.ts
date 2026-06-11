import { describe, expect, it } from 'vitest';
import { computeScore } from './compute';
import type { RunManifest } from '../../runners/contract/schema';
import type { TestSpriteVerdict } from './testsprite-client';

function baseManifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    schema_version: '1',
    run_id: 'r-1',
    agent_slug: 'claude-code',
    task_slug: 'world-cup-2026',
    started_at: '2026-06-22T16:00:00Z',
    ended_at: '2026-06-22T19:00:00Z', // 180 min wall clock
    status: 'completed',
    artifact: {
      repo_url: 'https://github.com/x/y',
      commit_sha: 'a'.repeat(40),
      deployed_app_url: 'https://example.amplifyapp.com',
    },
    logs_url: 'https://example.com/logs',
    transcript_url: 'https://example.com/transcript',
    driver_metadata: {
      driver: 'claude_code_session',
      model_id: 'sonnet-4-5',
      prompt_tokens: 100_000,
      completion_tokens: 50_000,
      tool_calls: 42,
      bugs_caught_this_task: 5,
    },
    ...overrides,
  };
}

function verdict(passed: number, failed: number): TestSpriteVerdict {
  const perTest: TestSpriteVerdict['perTest'] = [];
  for (let i = 0; i < passed; i += 1) {
    perTest.push({ test_id: `p-${i}`, name: `pass-${i}`, verdict: 'passed' });
  }
  for (let i = 0; i < failed; i += 1) {
    perTest.push({ test_id: `f-${i}`, name: `fail-${i}`, verdict: 'failed' });
  }
  return { total: passed + failed, passed, failed, perTest };
}

describe('computeScore', () => {
  it('blends correctness with wall-clock and cost when both are captured', () => {
    const score = computeScore({
      manifest: baseManifest(), // driver_metadata.bugs_caught_this_task = 5
      verdict: verdict(45, 5), // correctness = 0.9 (45/(45+5))
      lifetimeBugsBefore: 10,
    });
    expect(score.components.correctness).toBeCloseTo(0.9, 5);
    // The simplified composite blends correctness (0.7) with wall-clock
    // (0.15) and cost (0.15) sub-scores when telemetry is present. With a
    // 180-min wall clock and non-trivial token spend, both penalties hit.
    // We don't pin the exact composite here — the rate card may evolve —
    // but it must stay in [0, 1] and react to correctness.
    expect(score.composite).toBeGreaterThan(0);
    expect(score.composite).toBeLessThanOrEqual(1);
  });

  it('zeros correctness when run did not complete', () => {
    const score = computeScore({
      manifest: baseManifest({ status: 'time_budget_exceeded' }),
      verdict: verdict(45, 5),
      lifetimeBugsBefore: 0,
    });
    expect(score.components.correctness).toBe(0);
    // Composite still reflects wall-clock + cost penalties (correctness=0).
    expect(score.composite).toBeGreaterThanOrEqual(0);
    expect(score.composite).toBeLessThanOrEqual(1);
  });

  it('excludes inconclusive verdicts from the correctness denominator', () => {
    // 15 passed + 2 failed + 1 inconclusive: correctness must be 15/17,
    // not 15/18. Inconclusive verdicts are upstream environment failures
    // (TestSprite timeout, rate limit, network) — penalising the agent
    // for them is a scoring bug.
    const passed = 15;
    const failed = 2;
    const inconclusive = 1;
    const perTest: TestSpriteVerdict['perTest'] = [];
    for (let i = 0; i < passed; i += 1)
      perTest.push({ test_id: `p-${i}`, name: '', verdict: 'passed' });
    for (let i = 0; i < failed; i += 1)
      perTest.push({ test_id: `f-${i}`, name: '', verdict: 'failed' });
    for (let i = 0; i < inconclusive; i += 1)
      perTest.push({ test_id: `i-${i}`, name: '', verdict: 'inconclusive' });
    const v: TestSpriteVerdict = {
      total: passed + failed + inconclusive,
      passed,
      failed,
      perTest,
    };
    const score = computeScore({
      manifest: baseManifest(),
      verdict: v,
      lifetimeBugsBefore: 0,
    });
    expect(score.components.correctness).toBeCloseTo(15 / 17, 5);
  });

  it('handles a verdict with zero tests gracefully', () => {
    const score = computeScore({
      manifest: baseManifest({
        driver_metadata: {
          driver: 'claude_code_session',
          model_id: 'sonnet-4-5',
          prompt_tokens: 100_000,
          completion_tokens: 50_000,
          tool_calls: 42,
          bugs_caught_this_task: 0, // caught nothing
        },
      }),
      verdict: verdict(0, 0),
      lifetimeBugsBefore: 0,
    });
    expect(score.components.correctness).toBe(0);
    // Bugs caught is a raw side-metric only; not in components anymore.
    expect(score.side_metrics.raw.bugs_caught_this_task).toBe(0);
    expect(Number.isFinite(score.composite)).toBe(true);
  });

  it('rolls bugs_caught_this_task into lifetime_bugs_caught as a side-metric', () => {
    const score = computeScore({
      manifest: baseManifest({
        driver_metadata: {
          driver: 'claude_code_session',
          model_id: 'sonnet-4-5',
          prompt_tokens: 100_000,
          completion_tokens: 50_000,
          tool_calls: 42,
          bugs_caught_this_task: 25,
        },
      }),
      verdict: verdict(40, 5),
      lifetimeBugsBefore: 5,
    });
    // No longer a component; tracked only as raw + lifetime.
    expect(score.side_metrics.raw.bugs_caught_this_task).toBe(25);
    expect(score.side_metrics.lifetime_bugs_caught).toBe(5 + 25);
  });

  it('treats a missing bugs_caught_this_task as 0', () => {
    const score = computeScore({
      manifest: baseManifest({
        driver_metadata: {
          driver: 'claude_code_session',
          model_id: 'sonnet-4-5',
          prompt_tokens: 100_000,
          completion_tokens: 50_000,
          tool_calls: 42,
          // bugs_caught_this_task omitted
        },
      }),
      verdict: verdict(50, 0),
      lifetimeBugsBefore: 0,
    });
    expect(score.side_metrics.raw.bugs_caught_this_task).toBe(0);
  });

  it('rounds wall clock minutes from manifest timestamps', () => {
    const score = computeScore({
      manifest: baseManifest({
        started_at: '2026-06-22T10:00:00Z',
        ended_at: '2026-06-22T10:30:30Z', // 30.5 min → 31 rounded
      }),
      verdict: verdict(10, 0),
      lifetimeBugsBefore: 0,
    });
    expect(score.side_metrics.raw.wall_clock_minutes).toBe(31);
  });

  it('clamps wall clock minutes to a minimum of 1 to avoid divide-by-zero downstream', () => {
    const score = computeScore({
      manifest: baseManifest({
        started_at: '2026-06-22T10:00:00Z',
        ended_at: '2026-06-22T10:00:05Z', // 5 sec → rounds to 0
      }),
      verdict: verdict(10, 0),
      lifetimeBugsBefore: 0,
    });
    expect(score.side_metrics.raw.wall_clock_minutes).toBe(1);
  });

  it('accumulates lifetime_bugs_caught from the manifest self-report', () => {
    const score = computeScore({
      manifest: baseManifest({
        driver_metadata: {
          driver: 'claude_code_session',
          model_id: 'sonnet-4-5',
          prompt_tokens: 1,
          completion_tokens: 1,
          tool_calls: 1,
          bugs_caught_this_task: 3,
        },
      }),
      verdict: verdict(40, 3),
      lifetimeBugsBefore: 14,
    });
    expect(score.side_metrics.lifetime_bugs_caught).toBe(14 + 3);
  });

  it('rounds usd_spent to two decimal places', () => {
    const score = computeScore({
      manifest: baseManifest({
        driver_metadata: {
          driver: 'claude_code_session',
          model_id: 'sonnet-4-5',
          prompt_tokens: 100_001,
          completion_tokens: 50_003,
          tool_calls: 1,
        },
      }),
      verdict: verdict(50, 0),
      lifetimeBugsBefore: 0,
    });
    // We don't pin the exact number — the rate card might evolve — but
    // the value must be roundable to 2 decimals (i.e. integer * 0.01).
    const usd = score.side_metrics.raw.usd_spent_this_task;
    expect(Math.round(usd * 100) / 100).toBe(usd);
  });

  it('keeps composite in [0, 1] for any reasonable input', () => {
    const cases: Array<{ pass: number; fail: number; bugs: number }> = [
      { pass: 0, fail: 0, bugs: 0 },
      { pass: 50, fail: 0, bugs: 20 },
      { pass: 0, fail: 50, bugs: 50 }, // bug-farming clamp
      { pass: 25, fail: 25, bugs: 10 },
    ];
    for (const c of cases) {
      const score = computeScore({
        manifest: baseManifest({
          driver_metadata: {
            driver: 'claude_code_session',
            model_id: 'sonnet-4-5',
            prompt_tokens: 100_000,
            completion_tokens: 50_000,
            tool_calls: 42,
            bugs_caught_this_task: c.bugs,
          },
        }),
        verdict: verdict(c.pass, c.fail),
        lifetimeBugsBefore: 0,
      });
      expect(score.composite).toBeGreaterThanOrEqual(0);
      expect(score.composite).toBeLessThanOrEqual(1);
    }
  });

  it('includes the agent + task identity fields verbatim', () => {
    const score = computeScore({
      manifest: baseManifest({
        run_id: 'unique-run-xyz',
        agent_slug: 'codex',
        task_slug: 'world-cup-2026',
      }),
      verdict: verdict(10, 0),
      lifetimeBugsBefore: 0,
    });
    expect(score.agent_slug).toBe('codex');
    expect(score.task_slug).toBe('world-cup-2026');
    expect(score.run_id).toBe('unique-run-xyz');
  });
});
