/**
 * codearena-score-runner Lambda. Triggered by S3 PUT on
 * "s3://codearena-runs-<account>/runs/RUN-ID/manifest.json". Fetches the
 * manifest, runs the TestSprite world-cup-v1 suite against the agent's
 * deployed_app_url, computes the composite, writes the Score row to
 * DynamoDB, invokes the publisher Lambda.
 *
 * Per m2-2 piece-2 design - see
 * docs/codearena-v1/m2-2-scoring/piece-2-score-runner-lambda.md
 */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { Handler, S3Event } from 'aws-lambda';
import type { RunManifest } from '../../runners/contract/schema';
import { computeScore } from './compute';
import { runWorldCupSuite } from './testsprite-client';
import { getLifetimeBugsBefore, writeScore } from './ddb';

const s3 = new S3Client({ region: 'us-east-1' });
const lambda = new LambdaClient({ region: 'us-east-1' });

const TESTSPRITE_PROJECT_ID = process.env.TESTSPRITE_PROJECT_ID ?? '';
const PUBLISHER_FN = process.env.PUBLISHER_FN_NAME ?? 'codearena-score-publisher';

export const handler: Handler<S3Event, void> = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    if (!key.endsWith('/manifest.json')) {
      // Defensive - the S3 notification is supposed to filter this, but
      // belt-and-suspenders.
      continue;
    }

    const manifest = await fetchManifest(bucket, key);
    if (!manifest) continue;

    const verdict = await runWorldCupSuite(
      TESTSPRITE_PROJECT_ID,
      manifest.artifact.deployed_app_url,
    );

    const lifetimeBugsBefore = await getLifetimeBugsBefore(
      manifest.agent_slug,
    );

    const score = computeScore({ manifest, verdict, lifetimeBugsBefore });

    try {
      await writeScore(score, manifest.artifact);
    } catch (err) {
      const name =
        err instanceof Error && 'name' in err
          ? (err as { name?: string }).name
          : undefined;
      if (name === 'ConditionalCheckFailedException') {
        // Duplicate S3 trigger - score already written. Still invoke
        // publisher to refresh the leaderboard. Idempotent.
        // eslint-disable-next-line no-console
        console.log(`Score row already exists for run ${manifest.run_id}; skipping write`);
      } else {
        throw err;
      }
    }

    await lambda.send(
      new InvokeCommand({
        FunctionName: PUBLISHER_FN,
        InvocationType: 'Event',
        Payload: Buffer.from(
          JSON.stringify({
            mode: 'direct',
            affectedAgentSlug: manifest.agent_slug,
          }),
        ),
      }),
    );
  }
};

async function fetchManifest(
  bucket: string,
  key: string,
): Promise<RunManifest | null> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!res.Body) return null;
  const body = await res.Body.transformToString('utf8');
  return JSON.parse(body) as RunManifest;
}
