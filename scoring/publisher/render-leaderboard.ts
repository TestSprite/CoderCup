/**
 * Render the leaderboard.json + per-agent JSON payloads from the
 * DynamoDB single table.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ScoreRow } from '../../runners/contract/schema';

const TABLE = process.env.DDB_TABLE ?? 'codearena-main';
const TASK_SLUG = process.env.TASK_SLUG ?? 'world-cup-2026';

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
);

export interface LeaderboardRow {
  rank: number;
  agent_slug: string;
  agent_name: string;
  vendor: string;
  composite: number;
  components: ScoreRow['components'];
  side_metrics: ScoreRow['side_metrics'];
  official_run_id: string;
  deployed_app_url: string;
  detail_url: string;
}

export interface LeaderboardJson {
  schema_version: '1';
  task_slug: string;
  task_name: string;
  last_updated_iso: string;
  rankings: LeaderboardRow[];
}

interface AgentMeta {
  agent_slug: string;
  name: string;
  vendor: string;
  driver_type: string;
}

export async function buildLeaderboard(): Promise<LeaderboardJson> {
  // Query the sparse GSI1 for all Score rows for this task, sorted by
  // composite descending. Top 10.
  const scoreQuery = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1_pk = :pk',
      ExpressionAttributeValues: { ':pk': `TASK#${TASK_SLUG}` },
      ScanIndexForward: false,
      Limit: 10,
    }),
  );

  const rankings: LeaderboardRow[] = [];
  let rank = 1;
  for (const item of scoreQuery.Items ?? []) {
    const row = item as ScoreRow & {
      pk: string;
      sk: string;
      artifact?: { deployed_app_url?: string };
    };

    const meta = await getAgentMeta(row.agent_slug);

    rankings.push({
      rank: rank++,
      agent_slug: row.agent_slug,
      agent_name: meta?.name ?? row.agent_slug,
      vendor: meta?.vendor ?? 'Unknown',
      composite: row.composite,
      components: row.components,
      side_metrics: row.side_metrics,
      official_run_id: row.run_id,
      deployed_app_url: row.artifact?.deployed_app_url ?? '',
      detail_url: `/agents/${row.agent_slug}`,
    });
  }

  return {
    schema_version: '1',
    task_slug: TASK_SLUG,
    task_name: 'Global Football Championship 2026 — Prediction App',
    last_updated_iso: new Date().toISOString(),
    rankings,
  };
}

/** Hardcoded for v1 — only 3 agents enter the event. v1.5's community-
 * task path turns this into a DDB read against AGENT#slug META rows
 * that drivers populate during registration. */
const KNOWN_AGENTS: Record<string, AgentMeta> = {
  'claude-code': {
    agent_slug: 'claude-code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    driver_type: 'cli',
  },
  codex: {
    agent_slug: 'codex',
    name: 'Codex',
    vendor: 'OpenAI',
    driver_type: 'cli',
  },
  antigravity: {
    agent_slug: 'antigravity',
    name: 'Anti-Gravity',
    vendor: 'Google',
    driver_type: 'cli',
  },
};

async function getAgentMeta(slug: string): Promise<AgentMeta | null> {
  // Prefer hardcoded v1 metadata; fall back to DDB for forward-compat.
  if (KNOWN_AGENTS[slug]) return KNOWN_AGENTS[slug];
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `AGENT#${slug}`, sk: 'META' },
    }),
  );
  if (!res.Item) return null;
  return res.Item as AgentMeta;
}
