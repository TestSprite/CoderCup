#!/usr/bin/env node
/**
 * capture-previews.mjs
 *
 * Screenshots each agent's LIVE deployed app and uploads it to the exact path
 * the /agents page requests its preview from — `runs/<official_run_id>/preview.png`
 * at the public bucket ROOT (NOT under /fixtures).
 *
 * WHY THIS EXISTS
 * ---------------
 * The /agents card builds its preview URL as `${CDN_ROOT}/runs/${official_run_id}/preview.png`
 * where official_run_id is the CLEAN ledger run id (e.g. "claude-code-phase2").
 * The EC2 runner, however, only ever wrote preview.png into TIMESTAMPED run dirs
 * (`claude-code-phase2-20260531-120516/`) — and not reliably (a from-scratch
 * re-run produced run dirs with no preview at all). So the clean path 403'd and
 * every card showed the broken/empty state.
 *
 * Rather than depend on the runner producing a screenshot, we capture from the
 * deploy URL directly here — it is always live, always current, and lands at the
 * one path the page actually reads. Wired into publish-fixtures so previews stay
 * fresh on every publish; also runnable standalone.
 *
 * USAGE
 *   node scripts/capture-previews.mjs                 # all agents in leaderboard
 *   node scripts/capture-previews.mjs --no-invalidate # skip CF invalidation
 *   CHROME_BIN=/path/to/chrome node scripts/capture-previews.mjs
 *
 * Requires a Chrome/Chromium binary (auto-detected; override with CHROME_BIN).
 * No npm browser dependency — spawns the system browser in headless mode.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const BUCKET = process.env.FIXTURES_BUCKET ?? `codearena-public-data-${process.env.AWS_ACCOUNT_ID ?? ''}`;
const CF_DIST = process.env.CF_DISTRIBUTION_ID ?? 'ECHKHYNFBK4E3';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const REPO_ROOT = path.resolve(process.cwd());
const LEADERBOARD = path.join(REPO_ROOT, 'public', 'fixtures', 'leaderboard.json');
const VIEWPORT = process.env.PREVIEW_VIEWPORT ?? '1280,800';

const NO_INVALIDATE = process.argv.includes('--no-invalidate');

// Locate a Chrome/Chromium binary. CHROME_BIN wins; else probe the usual spots.
function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // last resort: ask the shell
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch { /* not on PATH */ }
  }
  return null;
}

// Headless screenshot of `url` → PNG buffer (via a temp file, which Chrome writes).
function screenshot(chrome, url) {
  const tmp = path.join(os.tmpdir(), `preview-${Math.abs(hashStr(url))}.png`);
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-sandbox',
      `--window-size=${VIEWPORT}`,
      `--screenshot=${tmp}`,
      url,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'], timeout: 60000 },
  );
  const buf = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return buf;
}

// Stable, dependency-free string hash for temp filenames (avoid Math.random).
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const s3 = new S3Client({ region: REGION });
const cf = new CloudFrontClient({ region: 'us-east-1' });

export async function capturePreviews({ invalidate = !NO_INVALIDATE } = {}) {
  if (!fs.existsSync(LEADERBOARD)) {
    console.warn(`[previews] leaderboard not found at ${LEADERBOARD} — skipping.`);
    return;
  }
  const chrome = findChrome();
  if (!chrome) {
    console.warn('[previews] no Chrome/Chromium binary found (set CHROME_BIN) — skipping previews.');
    return;
  }

  const lb = JSON.parse(fs.readFileSync(LEADERBOARD, 'utf8'));
  const rows = (lb.rankings || []).filter((r) => r.official_run_id && r.deployed_app_url);
  if (rows.length === 0) {
    console.warn('[previews] no rankings with official_run_id + deployed_app_url — skipping.');
    return;
  }

  console.log(`[previews] capturing ${rows.length} app(s) with ${path.basename(chrome)} …`);
  const invalidatePaths = [];
  for (const r of rows) {
    const key = `runs/${r.official_run_id}/preview.png`;
    try {
      const png = screenshot(chrome, r.deployed_app_url);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: png,
        ContentType: 'image/png',
        CacheControl: 'max-age=300,s-maxage=300',
      }));
      console.log(`  ✓ ${r.agent_slug} (${r.deployed_app_url}) → s3://${BUCKET}/${key} [${(png.length / 1024).toFixed(0)} KB]`);
      invalidatePaths.push(`/${key}`);
    } catch (e) {
      console.warn(`  ✗ ${r.agent_slug}: capture/upload failed — ${e.message}`);
    }
  }

  if (invalidate && invalidatePaths.length) {
    const inv = await cf.send(new CreateInvalidationCommand({
      DistributionId: CF_DIST,
      InvalidationBatch: {
        CallerReference: `capture-previews-${Date.now()}`,
        Paths: { Quantity: invalidatePaths.length, Items: invalidatePaths },
      },
    }));
    console.log(`[previews] invalidated ${invalidatePaths.length} path(s) — ${inv.Invalidation?.Status}`);
  }
}

// Run standalone when invoked directly (not when imported by publish-fixtures).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  capturePreviews().catch((err) => {
    console.error('capture-previews failed:', err);
    process.exit(1);
  });
}
