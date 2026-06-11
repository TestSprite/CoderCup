#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';
import { CodeArenaDataStack } from '../lib/codearena-data-stack';
import { CodeArenaRunnerStack } from '../lib/codearena-runner-stack';
import { CodeArenaPublicCdnStack } from '../lib/codearena-public-cdn-stack';
import { CodeArenaComputeStack } from '../lib/codearena-compute-stack';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const data = new CodeArenaDataStack(app, 'CodeArenaDataStack', {
  env,
  description:
    'CoderCup W1 data layer - DynamoDB single-table + run/public S3 buckets. SHARED account: all resources prefixed codearena-.',
});

new CodeArenaRunnerStack(app, 'CodeArenaRunnerStack', {
  env,
  description:
    'CoderCup W2 runner - persistent EC2 hosting Claude / Codex / Antigravity CLIs with account login. Connect via SSM Session Manager.',
  publicDataBucket: data.publicDataBucket,
  runsBucket: data.runsBucket,
  mainTable: data.mainTable,
});

const cdn = new CodeArenaPublicCdnStack(app, 'CodeArenaPublicCdnStack', {
  env,
  description:
    'CoderCup W2 m2-2 piece-4 - CloudFront fronting codearena-public-data via OAC. Bucket stays BPA-enabled; CloudFront is the only public read path.',
  publicDataBucket: data.publicDataBucket,
});

new CodeArenaComputeStack(app, 'CodeArenaComputeStack', {
  env,
  description:
    'CoderCup W2 m2-2 piece-2 + piece-3 - score-runner Lambda (S3-trigger) + publisher Lambda + EventBridge cron + Secrets Manager container for the TestSprite API key.',
  mainTable: data.mainTable,
  publicDataBucket: data.publicDataBucket,
  runsBucket: data.runsBucket,
  publicCdnDistribution: cdn.distribution,
});

Tags.of(app).add('Project', 'CodeArena');
Tags.of(app).add('ManagedBy', 'ClaudeCode');
