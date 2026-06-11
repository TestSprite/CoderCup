import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import {
  Bucket,
  BlockPublicAccess,
  BucketEncryption,
  ObjectOwnership,
  HttpMethods,
} from 'aws-cdk-lib/aws-s3';

/**
 * W1 data layer for CoderCup. Intentionally minimal:
 *  - codearena-main DynamoDB table (single-table design with GSI1 for leaderboard sort).
 *  - codearena-public-data-<account> S3 bucket (private; CloudFront added in W2 when
 *    leaderboard.json starts flowing).
 *  - codearena-runs-<account> S3 bucket (private; receives per-run manifests/logs/transcripts).
 *
 * Lambdas, CloudFront, and IAM roles for scoring/publisher are W2+; not provisioned here
 * to keep the W1 deploy surface tight.
 *
 * Shared-account guardrails (see [[project-codearena-w1-decisions]]):
 *  - every resource name is prefixed `codearena-`
 *  - every resource is tagged Project=CoderCup ManagedBy=ClaudeCode (via Tags.of(app) in bin/)
 *  - Block Public Access is fully enforced on every bucket
 *  - DynamoDB uses point-in-time-recovery and AWS-managed encryption
 */
export class CodeArenaDataStack extends Stack {
  public readonly mainTable: Table;
  public readonly publicDataBucket: Bucket;
  public readonly runsBucket: Bucket;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const accountId = Stack.of(this).account;

    this.mainTable = new Table(this, 'CodeArenaMainTable', {
      tableName: 'codearena-main',
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1_pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi1_sk', type: AttributeType.NUMBER },
      projectionType: ProjectionType.ALL,
    });

    this.publicDataBucket = new Bucket(this, 'CodeArenaPublicDataBucket', {
      bucketName: `codearena-public-data-${accountId}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: [
            'https://main.d2wicurs2ws3dd.amplifyapp.com',
            'https://*.amplifyapp.com',
            'http://localhost:3000',
          ],
          allowedHeaders: ['*'],
          maxAge: 60,
        },
      ],
    });

    this.runsBucket = new Bucket(this, 'CodeArenaRunsBucket', {
      bucketName: `codearena-runs-${accountId}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    new CfnOutput(this, 'MainTableName', {
      value: this.mainTable.tableName,
      description: 'DynamoDB single-table for CoderCup entities',
    });
    new CfnOutput(this, 'PublicDataBucketName', {
      value: this.publicDataBucket.bucketName,
      description: 'S3 bucket fronted by CloudFront in W2 — leaderboard.json + agents/<slug>.json',
    });
    new CfnOutput(this, 'RunsBucketName', {
      value: this.runsBucket.bucketName,
      description: 'S3 bucket for per-run manifests, logs, transcripts',
    });
  }
}
