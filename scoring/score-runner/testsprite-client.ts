/**
 * Minimal HTTP client for invoking the world-cup-v1 suite against an
 * agent's deployed app URL. Bypasses the CLI — the Lambda doesn't need
 * the binary; we hit the same API endpoints the CLI hits.
 *
 * Auth via the API key stored in Secrets Manager at
 * `codearena/testsprite-api-key`. Endpoint host is configured via the
 * TESTSPRITE_API_HOST env var.
 *
 * Concurrency: tests are started in waves of CONCURRENCY (10), then each
 * wave polled to terminal verdict in parallel via the run-specific
 * `/runs/<runId>` endpoint, keeping the suite inside the Lambda's 900s
 * timeout.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const TESTSPRITE_DEV_HOST =
  process.env.TESTSPRITE_API_HOST ?? 'https://api.testsprite.com';
const SECRET_ID = 'codearena/testsprite-api-key';
const CONCURRENCY = 10;
const PER_TEST_TIMEOUT_MS = 10 * 60_000;
const POLL_INTERVAL_MS = 5_000;

// Optional allow-list of suite testIds (comma-separated env). The
// TestSprite project can contain plans that are NOT part of the scoring
// suite (FE verification plans, etc.) — when SUITE_TEST_IDS is set we
// filter to exactly that list; when unset, every plan in the project
// runs. Current cohorts are scored per-phase by scripts/run-agent-v3.sh
// + the TestSprite CLI; this Lambda path is the v1 wiring.
const SUITE_TEST_IDS = new Set(
  (process.env.SUITE_TEST_IDS ?? '').split(',').map((t) => t.trim()).filter(Boolean),
);

let cachedKey: string | null = null;
const secrets = new SecretsManagerClient({ region: 'us-east-1' });

export interface TestSpriteVerdict {
  total: number;
  passed: number;
  failed: number;
  perTest: Array<{
    test_id: string;
    name: string;
    verdict: 'passed' | 'failed' | 'inconclusive';
    summary?: string;
  }>;
}

export async function runWorldCupSuite(
  projectId: string,
  targetUrl: string,
): Promise<TestSpriteVerdict> {
  const key = await getApiKey();
  const tests = await listProjectTests(projectId, key);

  const perTest: TestSpriteVerdict['perTest'] = [];
  // Wave-based concurrency: process up to CONCURRENCY tests in parallel,
  // wait for the wave to finish, then start the next wave. Caps the
  // outstanding TestSprite runs and gives the Lambda predictable elapsed
  // time (~ceil(N / CONCURRENCY) × max-per-test minutes).
  for (let i = 0; i < tests.length; i += CONCURRENCY) {
    const wave = tests.slice(i, i + CONCURRENCY);
    const verdicts = await Promise.all(
      wave.map((t) => runOne(t.testId, t.name, targetUrl, key)),
    );
    perTest.push(...verdicts);
  }

  return {
    total: perTest.length,
    passed: perTest.filter((v) => v.verdict === 'passed').length,
    failed: perTest.filter((v) => v.verdict === 'failed').length,
    perTest,
  };
}

interface TestSummary {
  testId: string;
  name: string;
}

async function listProjectTests(
  projectId: string,
  key: string,
): Promise<TestSummary[]> {
  const url = `${TESTSPRITE_DEV_HOST}/api/cli/v1/tests?projectId=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    throw new Error(`TestSprite list-tests ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { items?: Array<{ id?: string; name?: string }> };
  return (body.items ?? [])
    .filter((t): t is { id: string; name: string } => !!t.id && !!t.name)
    .filter((t) => SUITE_TEST_IDS.size === 0 || SUITE_TEST_IDS.has(t.id))
    .map((t) => ({ testId: t.id, name: t.name }));
}

async function runOne(
  testId: string,
  name: string,
  targetUrl: string,
  key: string,
): Promise<TestSpriteVerdict['perTest'][number]> {
  // POST /api/cli/v1/tests/<id>/runs with target_url, then poll the
  // run-specific status endpoint until terminal. Polling
  // /tests/<id>/result returns the latest run for that test, which
  // would alias across concurrent agents being scored against the same
  // test — that endpoint is unsafe here.
  const startRes = await fetch(
    `${TESTSPRITE_DEV_HOST}/api/cli/v1/tests/${testId}/runs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `codearena-run-${testId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
      body: JSON.stringify({ target_url: targetUrl }),
    },
  );
  if (!startRes.ok) {
    return {
      test_id: testId,
      name,
      verdict: 'inconclusive',
      summary: `start-run ${startRes.status}: ${await startRes.text()}`,
    };
  }
  const startBody = (await startRes.json()) as { runId?: string };
  const runId = startBody.runId;
  if (!runId) {
    return {
      test_id: testId,
      name,
      verdict: 'inconclusive',
      summary: 'no runId returned',
    };
  }

  const deadline = Date.now() + PER_TEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await fetch(
      `${TESTSPRITE_DEV_HOST}/api/cli/v1/runs/${runId}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!statusRes.ok) continue;
    const statusBody = (await statusRes.json()) as {
      status?: string;
      failedStepIndex?: number | null;
      failureKind?: string | null;
    };
    const s = statusBody.status ?? 'running';
    if (s === 'passed') {
      return { test_id: testId, name, verdict: 'passed' };
    }
    if (s === 'failed' || s === 'blocked' || s === 'cancelled') {
      return {
        test_id: testId,
        name,
        verdict: 'failed',
        summary: `verdict=${s} failedStepIndex=${statusBody.failedStepIndex ?? '?'} failureKind=${statusBody.failureKind ?? '?'}`,
      };
    }
  }

  return {
    test_id: testId,
    name,
    verdict: 'inconclusive',
    summary: `timed out after ${Math.round(PER_TEST_TIMEOUT_MS / 60_000)} minutes`,
  };
}

async function getApiKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const res = await secrets.send(
    new GetSecretValueCommand({ SecretId: SECRET_ID }),
  );
  if (!res.SecretString) {
    throw new Error(
      `Secret ${SECRET_ID} has no SecretString. Populate it via aws secretsmanager update-secret.`,
    );
  }
  cachedKey = res.SecretString;
  return cachedKey;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
