#!/usr/bin/env node
/**
 * fetch-test-details.mjs
 *
 * Enriches the score-verdict ledger (scores/world-cup-2026-v3.verdicts.json)
 * with the LATEST TestSprite run's artifacts + failure analysis per test, so
 * the static /tests/[testId] detail page can render the recording and the
 * error / trace / fix prose without calling TestSprite live.
 *
 * WHEN TO RUN — STRICTLY AFTER SCORING COMPLETES.
 * ----------------------------------------------
 * This reads the LATEST run of every test in the cohort project. If a scoring
 * sweep is mid-flight (an agent re-running these same tests), the "latest run"
 * is a moving target and you will capture half-finished / stale artifacts. Only
 * run this once the per-phase scoring for the phases you care about is DONE and
 * each test sits at a terminal status (passed / failed / blocked).
 *
 * USAGE
 * -----
 *   node scripts/fetch-test-details.mjs                 # all scored phases
 *   node scripts/fetch-test-details.mjs --phase 1,2,3   # restrict to phases
 *   node scripts/fetch-test-details.mjs --dry           # CLI shape probe only
 *
 * Then rebuild the fixtures from the (now-enriched) ledger and publish:
 *   node scripts/build-agent-fixtures.mjs               # threads fields through
 *   node scripts/publish-fixtures.mjs                   # push to CDN
 *
 * DATA SOURCE
 * -----------
 * The TestSprite project (env TESTSPRITE_PROJECT_ID) holds one test per
 * (agent, phase, plan), named:  "<agent> · phase-<N> · <plan name>".
 * For each test we pull the LATEST run only (the CLI exposes no historic
 * run-list — `test result` / `test failure get` already return the latest):
 *   - failed/blocked → `testsprite test failure get <test-id>` returns ONE
 *     bundle with result.videoUrl + failure.rootCauseHypothesis +
 *     failure.recommendedFixTarget{reference,rationale} + evidence + steps.
 *   - passed         → `testsprite test result <id> --include-analysis` for the
 *     videoUrl, plus `testsprite test steps <id>` for the recorded trace.
 *
 * OUTPUT — merged INTO scores/world-cup-2026-v3.verdicts.json
 * ----------------------------------------------------------
 * Each verdict entry (agents.<slug>.<phase>[]) gains, when available:
 *   video_url               latest-run recording (presigned S3 URL)
 *   error_message           concise underlying-error line
 *   root_cause_hypothesis   TestSprite's diagnosis prose
 *   recommended_fix_target  "<reference> — <rationale>" actionable string
 *   failure_kind            assertion | routing_404 | ... (omitted if unknown)
 *   recorded_steps          condensed agent trace [{step,action,observation,status}]
 * The ledger keeps {name, verdict} as before; these are additive. The detail
 * page joins by plan name (see planNameMatches in app/tests/data.ts), so we
 * write under the SAME plan name the ledger already carries.
 *
 * Note: presigned artifact URLs expire. Re-run after scoring whenever the page
 * starts 403-ing on recordings.
 *
 * COST: ~1 `list` + up to 3 read-only gets per test. The 20/min run-trigger cap
 * does not apply (no runs are triggered); a small inter-call sleep keeps us polite.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const PROJECT_ID = process.env.TESTSPRITE_PROJECT_ID
  ?? (() => { throw new Error('set TESTSPRITE_PROJECT_ID'); })();
const VERDICTS_PATH = path.join(ROOT, 'scores/world-cup-2026-v3.verdicts.json');
const SLEEP_MS = 250;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const phaseArg = (() => {
  const i = argv.indexOf('--phase');
  if (i === -1 || !argv[i + 1]) return null;
  return new Set(argv[i + 1].split(',').map((s) => Number(s.trim())));
})();

// TestSprite test names embed the agent as a display label; map back to the
// ledger slug. Matched case-insensitively against the "<agent>" segment.
const AGENT_LABEL_TO_SLUG = {
  'claude-code': 'claude-code',
  'claude code': 'claude-code',
  claude: 'claude-code',
  codex: 'codex',
  'anti-gravity': 'antigravity',
  antigravity: 'antigravity',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run a testsprite subcommand and parse its JSON. Returns null on any
// non-zero exit / parse failure (e.g. a passed test has no failure bundle).
function ts(args) {
  try {
    const out = execFileSync('testsprite', ['--output', 'json', ...args], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// Parse "<agent> · phase-<N> · <plan name>" → {slug, phase, planName}.
// The separator is a middle-dot (·); tolerate surrounding whitespace and a
// "phase-N" / "phase N" spelling. Returns null when the name doesn't fit the
// cohort grading convention (e.g. a codercup.ai self-test).
function parseTestName(name) {
  if (!name) return null;
  const parts = name.split('·').map((s) => s.trim());
  if (parts.length < 3) return null;
  const [agentLabel, phaseLabel, ...rest] = parts;
  const slug = AGENT_LABEL_TO_SLUG[agentLabel.toLowerCase()];
  if (!slug) return null;
  const m = /phase[-\s]?(\d+)/i.exec(phaseLabel);
  if (!m) return null;
  const phase = Number(m[1]);
  const planName = rest.join(' · ').trim();
  if (!planName) return null;
  return { slug, phase, planName };
}

// Same name-join the detail page uses (app/tests/data.ts planNameMatches):
// TestSprite truncates verdict names at ~60 chars, so accept either side being
// a prefix of the other.
function planNameMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

// Condense a TestSprite steps[] payload to the page's RecordedStep shape.
function condenseSteps(stepsItems) {
  if (!Array.isArray(stepsItems)) return null;
  const out = stepsItems
    .slice()
    .sort((p, q) => (p.stepIndex ?? 0) - (q.stepIndex ?? 0))
    .map((s) => ({
      step: typeof s.stepIndex === 'number' ? s.stepIndex + 1 : undefined,
      action: s.action ?? null,
      observation: s.description ?? null,
      status: s.status ?? null,
    }));
  return out.length ? out : null;
}

// TestSprite embeds the ACTUAL deterministic test error at the tail of
// rootCauseHypothesis, behind a literal "Underlying error:" marker (usually
// followed by a "TEST FAILURE" banner and a trailing — often truncated —
// "Observations:" section). Everything BEFORE the marker is the LLM's
// speculative diagnosis; everything AFTER is the real assertion failure. We
// split them so the detail page can show the concrete error (red, above) as a
// first-class field distinct from the hypothesis prose. Returns the cleaned
// hypothesis (speculative half) and the extracted errorMessage (or null when
// the marker is absent — older blocked runs, non-assertion failures).
function splitUnderlyingError(hypothesis) {
  if (!hypothesis || typeof hypothesis !== 'string') {
    return { hypothesis: hypothesis ?? null, errorMessage: null };
  }
  const m = /underlying error\s*:?/i.exec(hypothesis);
  if (!m) return { hypothesis: hypothesis.trim() || null, errorMessage: null };
  const before = hypothesis.slice(0, m.index).trim();
  let after = hypothesis.slice(m.index + m[0].length).trim();
  // Drop the "TEST FAILURE" banner so the error reads as a plain sentence.
  after = after.replace(/^test\s+failure\s*[:.\-]?\s*/i, '').trim();
  after = trimObservations(after);
  return { hypothesis: before || null, errorMessage: after || null };
}

// Drop a trailing "Observations:" section (incl. backend-truncated forms like
// "Observat…") — the headline error above it is the signal; the tail is noise.
function trimObservations(s) {
  if (!s) return s;
  return s.replace(/\n+\s*observ[\s\S]*$/i, '').trim();
}

// Build the actionable "fix target" string from the structured recommendedFixTarget.
function fixTargetString(rec) {
  if (!rec) return null;
  if (typeof rec === 'string') return rec;
  const ref = rec.reference ? String(rec.reference) : '';
  const rationale = rec.rationale ? String(rec.rationale) : '';
  if (ref && rationale) return `${ref} — ${rationale}`;
  return ref || rationale || null;
}

// Pull the latest-run detail bundle for one test. Returns the additive fields
// (or {} when nothing useful is available). Uses the failure bundle for
// failed/blocked (richest single call), else result+steps for passed.
async function fetchDetail(testId, status) {
  const fields = {};
  const failedish = status === 'failed' || status === 'blocked' || status === 'cancelled';

  if (failedish) {
    const bundle = ts(['test', 'failure', 'get', testId]);
    await sleep(SLEEP_MS);
    if (bundle) {
      const r = bundle.result || {};
      const f = bundle.failure || {};
      if (r.videoUrl) fields.video_url = r.videoUrl;
      if (r.failureKind && r.failureKind !== 'unknown') fields.failure_kind = r.failureKind;
      const { hypothesis, errorMessage } = splitUnderlyingError(f.rootCauseHypothesis);
      if (hypothesis) fields.root_cause_hypothesis = hypothesis;
      const fix = fixTargetString(f.recommendedFixTarget);
      if (fix) fields.recommended_fix_target = fix;
      // error_message: the concrete "Underlying error:" the hypothesis embeds is
      // the real assertion failure — prefer it. Fall back to the first
      // failure-contributing step / evidence summary only when it's absent.
      const failStep = (bundle.steps || []).find((s) => s.outcomeContributesToFailure);
      const ev = Array.isArray(f.evidence) ? f.evidence[0] : null;
      const err = errorMessage || ev?.summary || failStep?.description || null;
      if (err) fields.error_message = err;
      const steps = condenseSteps(bundle.steps);
      if (steps) fields.recorded_steps = steps;
      return fields;
    }
    // Fall through to result+steps if the failure bundle is unavailable
    // (the CLI has historically returned run_id_mismatch on some runs).
  }

  const result = ts(['test', 'result', testId, '--include-analysis']);
  await sleep(SLEEP_MS);
  if (result) {
    if (result.videoUrl) fields.video_url = result.videoUrl;
    if (result.failureKind && result.failureKind !== 'unknown') {
      fields.failure_kind = result.failureKind;
    }
    // --include-analysis attaches an inline analysis block on some responses.
    const an = result.analysis || {};
    const { hypothesis, errorMessage } = splitUnderlyingError(an.rootCauseHypothesis);
    if (hypothesis) fields.root_cause_hypothesis = hypothesis;
    if (errorMessage && !fields.error_message) fields.error_message = errorMessage;
    const fix = fixTargetString(an.recommendedFixTarget);
    if (fix) fields.recommended_fix_target = fix;
  }

  const steps = ts(['test', 'steps', testId]);
  await sleep(SLEEP_MS);
  const condensed = condenseSteps(steps?.items);
  if (condensed) fields.recorded_steps = condensed;

  return fields;
}

// Backfill mode: re-split already-stored root_cause_hypothesis fields in the
// ledger into {root_cause_hypothesis (speculative), error_message (real error)}
// WITHOUT calling TestSprite. Use this to retro-fix entries enriched before the
// splitUnderlyingError logic existed. Idempotent — re-running is a no-op once
// the marker has been stripped out of root_cause_hypothesis.
function splitExisting() {
  const ledger = JSON.parse(fs.readFileSync(VERDICTS_PATH, 'utf8'));
  let split = 0;
  for (const phases of Object.values(ledger.agents || {})) {
    for (const arr of Object.values(phases)) {
      if (!Array.isArray(arr)) continue;
      for (const v of arr) {
        // Normalize any already-extracted error_message (e.g. trim a trailing
        // truncated "Observ…" tail left by an earlier split). Idempotent.
        if (v.error_message) {
          const cleaned = trimObservations(v.error_message);
          if (cleaned !== v.error_message) {
            v.error_message = cleaned;
            split++;
          }
        }
        if (!v.root_cause_hypothesis || !/underlying error/i.test(v.root_cause_hypothesis)) continue;
        const { hypothesis, errorMessage } = splitUnderlyingError(v.root_cause_hypothesis);
        if (!errorMessage) continue;
        v.error_message = errorMessage;
        if (hypothesis) v.root_cause_hypothesis = hypothesis;
        else delete v.root_cause_hypothesis;
        split++;
      }
    }
  }
  fs.writeFileSync(VERDICTS_PATH, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`Split ${split} embedded "Underlying error:" segments into error_message.`);
  console.log('Now run: node scripts/build-agent-fixtures.mjs && node scripts/publish-fixtures.mjs');
}

async function main() {
  if (argv.includes('--split-existing')) {
    splitExisting();
    return;
  }
  if (DRY) {
    console.log('[dry] CLI shape probe — no ledger writes.');
    console.log(JSON.stringify(ts(['--dry-run', 'test', 'list', '--project', PROJECT_ID]), null, 2));
    return;
  }

  const ledger = JSON.parse(fs.readFileSync(VERDICTS_PATH, 'utf8'));
  const agents = ledger.agents || {};

  // 1) enumerate every test in the cohort project (auto-paged).
  console.log(`Listing tests in project ${PROJECT_ID} ...`);
  const tests = [];
  let token = null;
  do {
    const args = ['test', 'list', '--project', PROJECT_ID, '--page-size', '100'];
    if (token) args.push('--starting-token', token);
    const page = ts(args);
    if (!page) break;
    for (const t of page.items || []) tests.push(t);
    token = page.nextToken || null;
    if (token) await sleep(SLEEP_MS);
  } while (token);
  console.log(`  ${tests.length} tests in project.`);

  // 2) enrich each verdict entry from its test's latest run.
  let enriched = 0;
  let unmatched = 0;
  for (const t of tests) {
    const parsed = parseTestName(t.name);
    if (!parsed) {
      unmatched++;
      continue;
    }
    const { slug, phase, planName } = parsed;
    if (phaseArg && !phaseArg.has(phase)) continue;
    const phaseArr = agents[slug]?.[String(phase)];
    if (!Array.isArray(phaseArr)) {
      unmatched++;
      continue;
    }
    const entry = phaseArr.find((v) => planNameMatches(v.name, planName));
    if (!entry) {
      unmatched++;
      continue;
    }
    const fields = await fetchDetail(t.id, t.status);
    if (Object.keys(fields).length === 0) continue;
    Object.assign(entry, fields);
    enriched++;
    if (enriched % 10 === 0) console.log(`  enriched ${enriched} ...`);
  }

  ledger._details_fetched_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  fs.writeFileSync(VERDICTS_PATH, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`Enriched ${enriched} verdict entries (${unmatched} tests unmatched/skipped).`);
  console.log('Now run: node scripts/build-agent-fixtures.mjs && node scripts/publish-fixtures.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
