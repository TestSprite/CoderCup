/**
 * Driver-side helper: after a driver PUTs its manifest to
 * s3://codearena-runs-<account>/runs/(run-id)/manifest.json, it
 * synthesizes the same shape AWS would have sent via S3-notification
 * and invokes codearena-score-runner directly (InvocationType: Event,
 * fire-and-forget).
 *
 * Why direct invoke vs S3-notification: the S3-PUT-triggered path
 * creates a cyclic CFN reference between CodeArenaDataStack (owns the
 * bucket) and CodeArenaComputeStack (owns the Lambda). The clean v1
 * solution is the driver invoking the Lambda explicitly. See
 * infra/cdk/lib/codearena-compute-stack.ts for the in-stack TODO.
 *
 * The driver's IAM role (codearena-runner-role) needs
 * lambda:InvokeFunction on arn:aws:lambda:us-east-1:<account>:function:
 * codearena-* - granted in CodeArenaRunnerStack.
 */
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const SCORE_RUNNER_FN = 'codearena-score-runner';
const RUNS_BUCKET =
  process.env.RUNS_BUCKET ?? `codearena-runs-${process.env.AWS_ACCOUNT_ID ?? ''}`;

const lambda = new LambdaClient({ region: 'us-east-1' });

export async function invokeScorer(runId: string): Promise<void> {
  const fakeS3Event = {
    Records: [
      {
        s3: {
          bucket: { name: RUNS_BUCKET },
          object: { key: `runs/${runId}/manifest.json` },
        },
      },
    ],
  };

  try {
    await lambda.send(
      new InvokeCommand({
        FunctionName: SCORE_RUNNER_FN,
        InvocationType: 'Event', // fire-and-forget
        Payload: Buffer.from(JSON.stringify(fakeS3Event)),
      }),
    );
  } catch (err) {
    // Don't bubble - the driver's job (producing the manifest) is done.
    // Operators can re-trigger the scorer via:
    //   aws lambda invoke --function-name codearena-score-runner \
    //     --payload '<json>' /tmp/out.json
    // eslint-disable-next-line no-console
    console.warn(
      `[invoke-scorer] failed to fire score-runner for run ${runId}: ${(err as Error).message}`,
    );
  }
}
