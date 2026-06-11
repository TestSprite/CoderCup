import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the SDK before importing the module under test so the cached
// fetch in testsprite-client picks up our stubs.
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = vi.fn().mockResolvedValue({ SecretString: 'test-key' });
  },
  GetSecretValueCommand: class {},
}));

// Pin the suite allow-list via env so the test doesn't depend on which
// testIds happen to be registered in production. Must be set before the
// module under test is imported (it reads the env at module scope).
process.env.SUITE_TEST_IDS =
  'test-001,test-002,test-003,test-004,test-005';

interface FetchCall {
  url: string;
  method?: string;
}

let calls: FetchCall[] = [];
let runStartsToVerdict: Map<string, 'passed' | 'failed' | 'inconclusive'> =
  new Map();

beforeEach(() => {
  calls = [];
  runStartsToVerdict = new Map();
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? 'GET' });

    // /tests?projectId=… → list-tests response shape
    if (u.endsWith('/tests?projectId=' + encodeURIComponent('proj-x'))) {
      return new Response(
        JSON.stringify({
          items: [
            { id: 'test-001', name: 'plan A' },
            { id: 'test-002', name: 'plan B' },
            { id: 'test-003', name: 'plan C' },
            { id: 'unrelated-not-in-suite', name: 'plan UNRELATED' },
            { id: 'test-004', name: 'plan D' },
            { id: 'test-005', name: 'plan E' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    // POST /tests/<id>/runs → return a runId
    const startMatch = u.match(/\/tests\/([^/]+)\/runs$/);
    if (startMatch && init?.method === 'POST') {
      const testId = startMatch[1];
      const runId = `run-of-${testId}`;
      runStartsToVerdict.set(runId, 'passed');
      return new Response(JSON.stringify({ runId }), { status: 200 });
    }

    // GET /runs/<runId> → return the canned verdict immediately
    const runMatch = u.match(/\/runs\/([^/]+)$/);
    if (runMatch) {
      const runId = runMatch[1];
      const verdict = runStartsToVerdict.get(runId) ?? 'passed';
      const status =
        verdict === 'passed'
          ? 'passed'
          : verdict === 'failed'
            ? 'failed'
            : 'running';
      return new Response(JSON.stringify({ status }), { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runWorldCupSuite', () => {
  it('filters to suite-index testIds only (drops unrelated plans)', { timeout: 30_000 }, async () => {
    const { runWorldCupSuite } = await import('./testsprite-client');
    const verdict = await runWorldCupSuite('proj-x', 'https://target.example');

    // 5 suite plans in index, 6 returned by list-tests (one unrelated).
    // Verdict should cover only the 5 suite plans.
    expect(verdict.total).toBe(5);
    expect(verdict.perTest.map((t) => t.test_id).sort()).toEqual([
      'test-001',
      'test-002',
      'test-003',
      'test-004',
      'test-005',
    ]);
    // No 'unrelated-not-in-suite' should appear.
    expect(
      verdict.perTest.find((t) => t.test_id === 'unrelated-not-in-suite'),
    ).toBeUndefined();
  });

  it('polls the run-specific /runs/<runId> endpoint (not /tests/<id>/result)', { timeout: 30_000 }, async () => {
    const { runWorldCupSuite } = await import('./testsprite-client');
    await runWorldCupSuite('proj-x', 'https://target.example');

    const pollCalls = calls.filter(
      (c) => c.method === 'GET' && c.url.includes('/runs/'),
    );
    expect(pollCalls.length).toBeGreaterThan(0);
    // None of the polls should go through the alias-prone per-test endpoint.
    const aliasPolls = calls.filter(
      (c) => c.method === 'GET' && /\/tests\/[^/]+\/result/.test(c.url),
    );
    expect(aliasPolls.length).toBe(0);
  });

  it('counts passed/failed verdicts in the aggregate', { timeout: 30_000 }, async () => {
    runStartsToVerdict = new Map();
    // After list-tests returns, our stub builds runIds as run-of-<testId>;
    // override the default 'passed' for two of them.
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/tests?projectId=proj-x')) {
        return new Response(
          JSON.stringify({
            items: [
              { id: 'test-001', name: 'a' },
              { id: 'test-002', name: 'b' },
              { id: 'test-003', name: 'c' },
              { id: 'test-004', name: 'd' },
              { id: 'test-005', name: 'e' },
            ],
          }),
          { status: 200 },
        );
      }
      const m = u.match(/\/tests\/([^/]+)\/runs$/);
      if (m && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ runId: `run-of-${m[1]}` }),
          { status: 200 },
        );
      }
      const r = u.match(/\/runs\/(.+)$/);
      if (r) {
        // Fail test-002 and test-004; pass the rest.
        const failing = new Set(['run-of-test-002', 'run-of-test-004']);
        const status = failing.has(r[1]) ? 'failed' : 'passed';
        return new Response(JSON.stringify({ status }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const { runWorldCupSuite } = await import('./testsprite-client');
    const verdict = await runWorldCupSuite('proj-x', 'https://target.example');
    expect(verdict.passed).toBe(3);
    expect(verdict.failed).toBe(2);
    expect(verdict.total).toBe(5);
  });
});
