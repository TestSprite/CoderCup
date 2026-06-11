#!/usr/bin/env node
/**
 * publish-fixtures.mjs
 *
 * Syncs public/fixtures/ JSON files to S3 and optionally invalidates CloudFront.
 *
 * Usage:
 *   node scripts/publish-fixtures.mjs [--no-invalidate]
 *
 * Env vars (all optional, fall back to defaults):
 *   FIXTURES_BUCKET        S3 bucket name  (default: codearena-public-data-<account-id>)
 *   FIXTURES_PREFIX        S3 key prefix   (default: fixtures)
 *   CF_DISTRIBUTION_ID     CloudFront ID   (default: ECHKHYNFBK4E3)
 *   AWS_REGION             AWS region      (default: us-east-1)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { capturePreviews } from './capture-previews.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BUCKET = process.env.FIXTURES_BUCKET ?? `codearena-public-data-${process.env.AWS_ACCOUNT_ID ?? ''}`;
const PREFIX = process.env.FIXTURES_PREFIX ?? 'fixtures';
const CF_DIST = process.env.CF_DISTRIBUTION_ID ?? 'ECHKHYNFBK4E3';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

const REPO_ROOT = path.resolve(process.cwd());
const FIXTURES_DIR = path.join(REPO_ROOT, 'public', 'fixtures');

const NO_INVALIDATE = process.argv.includes('--no-invalidate');
const NO_PREVIEWS = process.argv.includes('--no-previews');

// ---------------------------------------------------------------------------
// AWS clients
// ---------------------------------------------------------------------------
const s3 = new S3Client({ region: REGION });
const cf = new CloudFrontClient({ region: 'us-east-1' }); // CF is global, always us-east-1

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function walkJson(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJson(fullPath));
    } else if (entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function uploadFile(localPath) {
  const relPath = path.relative(FIXTURES_DIR, localPath);           // e.g. agents/claude-code.json
  const s3Key = `${PREFIX}/${relPath.replace(/\\/g, '/')}`;         // fixtures/agents/claude-code.json

  const body = fs.readFileSync(localPath);

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: body,
    ContentType: 'application/json',
    CacheControl: 'max-age=30,s-maxage=30',
  }));

  return s3Key;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`fixtures dir not found: ${FIXTURES_DIR}`);
    process.exit(1);
  }

  const files = walkJson(FIXTURES_DIR);
  if (files.length === 0) {
    console.log('No JSON files found — nothing to upload.');
    return;
  }

  console.log(`Uploading ${files.length} fixture(s) → s3://${BUCKET}/${PREFIX}/`);

  const uploaded = [];
  for (const f of files) {
    const key = await uploadFile(f);
    const rel = path.relative(FIXTURES_DIR, f);
    console.log(`  ✓ ${rel} → s3://${BUCKET}/${key}`);
    uploaded.push('/' + key);
  }

  console.log(`\nUploaded ${uploaded.length} file(s).`);

  // Refresh the /agents app previews from the live deploys so they land at the
  // exact `runs/<official_run_id>/preview.png` path the cards read. Best-effort:
  // a missing browser or a flaky deploy must not fail the fixture publish.
  if (!NO_PREVIEWS) {
    try {
      await capturePreviews({ invalidate: !NO_INVALIDATE });
    } catch (e) {
      console.warn(`[previews] skipped — ${e.message}`);
    }
  }

  if (NO_INVALIDATE) {
    console.log('Skipping CloudFront invalidation (--no-invalidate).');
    return;
  }

  // Invalidate the fixtures prefix so CDN edge caches drop stale copies
  // immediately (TTL is only 30 s but invalidation makes it instant).
  console.log(`\nInvalidating CloudFront distribution ${CF_DIST} …`);
  const inv = await cf.send(new CreateInvalidationCommand({
    DistributionId: CF_DIST,
    InvalidationBatch: {
      CallerReference: `publish-fixtures-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: [`/${PREFIX}/*`],
      },
    },
  }));

  const invId = inv.Invalidation?.Id ?? '(unknown)';
  const invStatus = inv.Invalidation?.Status ?? '(unknown)';
  console.log(`  Invalidation ${invId} — ${invStatus}`);
  console.log('\nDone. Portal will serve fresh data within ~30 s (cache TTL).');
}

main().catch((err) => {
  console.error('publish-fixtures failed:', err);
  process.exit(1);
});
