/**
 * codearena-score-publisher Lambda. Two invocation modes:
 *
 *   - { mode: 'direct', affectedAgentSlug? } - rerenders the leaderboard
 *     JSON from current DDB state + PUTs to s3://codearena-public-data
 *     + invalidates CloudFront paths. Triggered by the score-runner
 *     Lambda after a new Score row is written.
 *
 *   - { mode: 'cron' } - the same rerender PLUS first polls each
 *     deployed agent app's /api/score endpoint for prediction_accuracy_at_t
 *     updates. Triggered by EventBridge every 15 min during knockout
 *     rounds; disabled in v1 until launch (m4-1 flips it on).
 *
 * Per m2-2 piece-3 design - see
 * docs/codearena-v1/m2-2-scoring/piece-3-publisher-lambda.md
 */
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Handler } from 'aws-lambda';
import { buildLeaderboard } from './render-leaderboard';

const PUBLIC_BUCKET =
  process.env.PUBLIC_BUCKET ??
  `codearena-public-data-${process.env.AWS_ACCOUNT_ID ?? ''}`;
const CLOUDFRONT_DIST_ID = process.env.CLOUDFRONT_DIST_ID ?? '';

const s3 = new S3Client({ region: 'us-east-1' });
const cf = new CloudFrontClient({ region: 'us-east-1' });

interface PublisherEvent {
  mode?: 'direct' | 'cron';
  affectedAgentSlug?: string;
}

export const handler: Handler<PublisherEvent, void> = async (event) => {
  const mode = event?.mode ?? 'direct';

  // TODO m4-1: when mode === 'cron', also poll deployed apps' /api/score
  // for prediction_accuracy_at_t and update DDB before the rerender.
  if (mode === 'cron') {
    // eslint-disable-next-line no-console
    console.log(
      'cron mode invoked - prediction_accuracy polling stub. Implement in m4-1 once first agent app deploys.',
    );
  }

  const leaderboard = await buildLeaderboard();
  await s3.send(
    new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: 'leaderboard.json',
      Body: JSON.stringify(leaderboard, null, 2),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=60, s-maxage=60',
    }),
  );

  if (CLOUDFRONT_DIST_ID) {
    await cf.send(
      new CreateInvalidationCommand({
        DistributionId: CLOUDFRONT_DIST_ID,
        InvalidationBatch: {
          CallerReference: `codearena-publisher-${Date.now()}`,
          Paths: { Quantity: 1, Items: ['/leaderboard.json'] },
        },
      }),
    );
  }
};
