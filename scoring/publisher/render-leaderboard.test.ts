import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock send fn so tests can swap its implementation per case.
const ddbSend = vi.fn();

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class DynamoDBDocumentClient {
    static from() {
      return { send: ddbSend };
    }
  }
  class QueryCommand {
    constructor(public input: unknown) {}
  }
  class GetCommand {
    constructor(public input: unknown) {}
  }
  return { DynamoDBDocumentClient, QueryCommand, GetCommand };
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {},
}));

beforeEach(() => {
  ddbSend.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildLeaderboard', () => {
  it('renders rankings from the GSI1 query in composite-descending order', async () => {
    ddbSend.mockResolvedValueOnce({
      Items: [
        {
          pk: 'AGENT#claude-code',
          sk: 'SCORE#world-cup-2026#run-1',
          agent_slug: 'claude-code',
          task_slug: 'world-cup-2026',
          run_id: 'run-1',
          composite: 0.85,
          components: { correctness: 0.9 },
          side_metrics: {
            prediction_accuracy_at_t: 0,
            lifetime_bugs_caught: 3,
            raw: {
              bugs_caught_this_task: 3,
              usd_spent_this_task: 12.34,
              tokens_total: 145_000,
              iterations: 30,
              wall_clock_minutes: 180,
            },
          },
          artifact: {
            repo_url: 'https://github.com/TestSprite/CodeArena-runs/tree/run-1',
            commit_sha: 'a'.repeat(40),
            deployed_app_url: 'https://run-1.amplifyapp.com',
          },
        },
        {
          pk: 'AGENT#codex',
          sk: 'SCORE#world-cup-2026#run-2',
          agent_slug: 'codex',
          task_slug: 'world-cup-2026',
          run_id: 'run-2',
          composite: 0.72,
          components: { correctness: 0.8 },
          side_metrics: {
            prediction_accuracy_at_t: 0,
            lifetime_bugs_caught: 5,
            raw: {
              bugs_caught_this_task: 5,
              usd_spent_this_task: 15.0,
              tokens_total: 200_000,
              iterations: 40,
              wall_clock_minutes: 200,
            },
          },
          artifact: {
            repo_url: 'https://github.com/TestSprite/CodeArena-runs/tree/run-2',
            commit_sha: 'b'.repeat(40),
            deployed_app_url: 'https://run-2.amplifyapp.com',
          },
        },
      ],
    });

    const { buildLeaderboard } = await import('./render-leaderboard');
    const lb = await buildLeaderboard();

    expect(lb.task_slug).toBe('world-cup-2026');
    expect(lb.rankings).toHaveLength(2);
    expect(lb.rankings[0].rank).toBe(1);
    expect(lb.rankings[0].agent_slug).toBe('claude-code');
    // Hardcoded agent meta (v1) — fills in human-readable name + vendor.
    expect(lb.rankings[0].agent_name).toBe('Claude Code');
    expect(lb.rankings[0].vendor).toBe('Anthropic');
    expect(lb.rankings[0].deployed_app_url).toBe('https://run-1.amplifyapp.com');
    expect(lb.rankings[0].detail_url).toBe('/agents/claude-code');
    expect(lb.rankings[1].rank).toBe(2);
    expect(lb.rankings[1].agent_slug).toBe('codex');
    expect(lb.rankings[1].agent_name).toBe('Codex');
  });

  it('returns empty rankings when DDB has no Score rows yet', async () => {
    ddbSend.mockResolvedValueOnce({ Items: [] });
    const { buildLeaderboard } = await import('./render-leaderboard');
    const lb = await buildLeaderboard();
    expect(lb.rankings).toHaveLength(0);
    expect(lb.schema_version).toBe('1');
    expect(lb.task_slug).toBe('world-cup-2026');
  });

  it('falls back to slug + Unknown when an unknown agent slug appears in DDB', async () => {
    ddbSend
      .mockResolvedValueOnce({
        Items: [
          {
            pk: 'AGENT#mystery',
            sk: 'SCORE#world-cup-2026#run-x',
            agent_slug: 'mystery',
            task_slug: 'world-cup-2026',
            run_id: 'run-x',
            composite: 0.5,
            components: { correctness: 0.5 },
            side_metrics: {
              prediction_accuracy_at_t: 0,
              lifetime_bugs_caught: 0,
              raw: {
                bugs_caught_this_task: 0,
                usd_spent_this_task: 0,
                tokens_total: 0,
                iterations: 0,
                wall_clock_minutes: 1,
              },
            },
            artifact: {
              repo_url: '',
              commit_sha: '',
              deployed_app_url: '',
            },
          },
        ],
      })
      // Second send: getAgentMeta DDB Get returns no Item
      .mockResolvedValueOnce({ Item: undefined });
    const { buildLeaderboard } = await import('./render-leaderboard');
    const lb = await buildLeaderboard();
    expect(lb.rankings[0].agent_name).toBe('mystery');
    expect(lb.rankings[0].vendor).toBe('Unknown');
  });

  it('sets last_updated_iso to a valid ISO 8601 timestamp', async () => {
    ddbSend.mockResolvedValueOnce({ Items: [] });
    const { buildLeaderboard } = await import('./render-leaderboard');
    const lb = await buildLeaderboard();
    expect(() => new Date(lb.last_updated_iso).toISOString()).not.toThrow();
    // Must round-trip exactly.
    expect(new Date(lb.last_updated_iso).toISOString()).toBe(lb.last_updated_iso);
  });
});
