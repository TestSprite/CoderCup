/**
 * DynamoDB writes for the score-runner Lambda. Single-table design per
 * design.md §3.1.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { RunManifest, ScoreRow } from '../../runners/contract/schema';

const TABLE = process.env.DDB_TABLE ?? 'codearena-main';
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
);

export interface DdbScoreItem extends ScoreRow {
  pk: string;
  sk: string;
  gsi1_pk: string;
  gsi1_sk: number;
  /** Copy of the manifest's artifact block so the publisher Lambda
   * can build leaderboard.json without a second DDB roundtrip. */
  artifact: RunManifest['artifact'];
}

export async function writeScore(
  score: ScoreRow,
  artifact: RunManifest['artifact'],
): Promise<void> {
  const item: DdbScoreItem = {
    ...score,
    pk: `AGENT#${score.agent_slug}`,
    sk: `SCORE#${score.task_slug}#${score.run_id}`,
    gsi1_pk: `TASK#${score.task_slug}`,
    gsi1_sk: score.composite,
    artifact,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: item,
      // Idempotency - if a duplicate S3 trigger arrives, don't double-write.
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

/**
 * Returns the cumulative bugs_caught_this_task across all prior runs for
 * this agent across all tasks (not just the current task). v1 has only
 * one task; this will become meaningful at event #2 onward.
 */
export async function getLifetimeBugsBefore(
  agentSlug: string,
): Promise<number> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `AGENT#${agentSlug}`,
        ':prefix': 'SCORE#',
      },
    }),
  );
  let sum = 0;
  for (const item of res.Items ?? []) {
    const row = item as DdbScoreItem;
    sum += row.side_metrics?.raw?.bugs_caught_this_task ?? 0;
  }
  return sum;
}
