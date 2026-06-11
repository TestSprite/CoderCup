import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  Rule,
  Schedule,
  RuleTargetInput,
} from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import {
  PolicyStatement,
  Effect,
} from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';

/**
 * W2 m2-2 piece-2 + piece-3 compute. Two Lambdas:
 *
 *   - codearena-score-runner: S3 PUT trigger on
 *     "codearena-runs/runs/RUN-ID/manifest.json" -> runs TestSprite
 *     suite via HTTP API (no CLI bundling) -> computes composite per
 *     locked rubric -> writes Score row to DDB -> invokes publisher.
 *
 *   - codearena-score-publisher: direct invoke from score-runner OR
 *     EventBridge cron (15 min, disabled until launch via m4-1). Reads
 *     DDB GSI1 -> writes leaderboard.json to public-data bucket ->
 *     invalidates CloudFront.
 *
 * Plus the codearena/testsprite-api-key Secret container (empty;
 * value populated out of band).
 */
export interface CodeArenaComputeStackProps extends StackProps {
  mainTable: Table;
  publicDataBucket: Bucket;
  runsBucket: Bucket;
  publicCdnDistribution: Distribution;
}

export class CodeArenaComputeStack extends Stack {
  public readonly testspriteSecret: Secret;
  public readonly scoreRunner: NodejsFunction;
  public readonly scorePublisher: NodejsFunction;
  public readonly predictionAccuracyCron: Rule;

  constructor(
    scope: Construct,
    id: string,
    props: CodeArenaComputeStackProps,
  ) {
    super(scope, id, props);

    // ----- Secrets Manager: TestSprite API key -----
    this.testspriteSecret = new Secret(this, 'CodeArenaTestSpriteApiKey', {
      secretName: 'codearena/testsprite-api-key',
      description:
        'TestSprite API key. Populated via `aws secretsmanager update-secret` ' +
        'by the operator; never inlined.',
    });

    // ----- Publisher Lambda (built first; runner invokes it) -----
    this.scorePublisher = new NodejsFunction(
      this,
      'CodeArenaScorePublisher',
      {
        functionName: 'codearena-score-publisher',
        entry: '../../scoring/publisher/handler.ts',
        handler: 'handler',
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.minutes(5),
        memorySize: 512,
        bundling: {
          format: OutputFormat.CJS,
          target: 'node20',
          externalModules: ['@aws-sdk/*'],
        },
        environment: {
          DDB_TABLE: props.mainTable.tableName,
          PUBLIC_BUCKET: props.publicDataBucket.bucketName,
          CLOUDFRONT_DIST_ID: props.publicCdnDistribution.distributionId,
          TASK_SLUG: 'world-cup-2026',
        },
      },
    );

    props.mainTable.grantReadWriteData(this.scorePublisher);
    props.publicDataBucket.grantWrite(this.scorePublisher);
    this.scorePublisher.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${props.publicCdnDistribution.distributionId}`,
        ],
      }),
    );

    // ----- Score-runner Lambda -----
    this.scoreRunner = new NodejsFunction(this, 'CodeArenaScoreRunner', {
      functionName: 'codearena-score-runner',
      entry: '../../scoring/score-runner/handler.ts',
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.minutes(15),
      memorySize: 1024,
      bundling: {
        format: OutputFormat.CJS,
        target: 'node20',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        DDB_TABLE: props.mainTable.tableName,
        PUBLISHER_FN_NAME: this.scorePublisher.functionName,
        TESTSPRITE_PROJECT_ID: process.env.TESTSPRITE_PROJECT_ID ?? '',
      },
    });

    props.mainTable.grantReadWriteData(this.scoreRunner);
    props.runsBucket.grantRead(this.scoreRunner);
    props.publicDataBucket.grantWrite(this.scoreRunner);
    this.scorePublisher.grantInvoke(this.scoreRunner);
    this.testspriteSecret.grantRead(this.scoreRunner);

    // S3 PUT trigger - DEFERRED.
    //
    // Wiring addEventNotification on a Bucket owned by another stack
    // (DataStack) creates a cyclic CFN reference: DataStack would need
    // to reference this stack's Lambda ARN while this stack already
    // references DataStack's bucket. The clean fixes are (a) move the
    // bucket creation into this stack, or (b) drop the S3-trigger
    // entirely and have the drivers invoke the score-runner Lambda
    // directly after writing the manifest.
    //
    // v1 picks (b) - drivers do `lambda.send(new InvokeCommand({...}))`
    // explicitly. The Lambda's handler still accepts an S3Event shape
    // so the driver only needs to synthesize one Records entry. See
    // m2-1 driver follow-up; for now this Lambda is reachable via
    // `aws lambda invoke` for manual testing.

    // ----- EventBridge cron (disabled in v1; m4-1 enables) -----
    this.predictionAccuracyCron = new Rule(
      this,
      'CodeArenaPredictionAccuracyCron',
      {
        ruleName: 'codearena-prediction-accuracy-cron',
        schedule: Schedule.rate(Duration.minutes(15)),
        enabled: false,
        description:
          'Polls deployed agent apps /api/score for prediction_accuracy_at_t. ' +
          'Disabled until m4-1 launch flips it on.',
      },
    );
    this.predictionAccuracyCron.addTarget(
      new LambdaFunction(this.scorePublisher, {
        event: RuleTargetInput.fromObject({ mode: 'cron' }),
      }),
    );

    // ----- Outputs -----
    new CfnOutput(this, 'ScoreRunnerFunctionName', {
      value: this.scoreRunner.functionName,
    });
    new CfnOutput(this, 'ScorePublisherFunctionName', {
      value: this.scorePublisher.functionName,
    });
    new CfnOutput(this, 'TestSpriteSecretName', {
      value: this.testspriteSecret.secretName,
      description:
        'Populate with: aws secretsmanager update-secret --secret-id codearena/testsprite-api-key --secret-string <key>',
    });
  }
}
