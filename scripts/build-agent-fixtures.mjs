#!/usr/bin/env node
/**
 * build-agent-fixtures.mjs
 *
 * Derives public/fixtures/agents/*.json + leaderboard.json from the score
 * ledger (scores/world-cup-2026-v3.json). The ledger holds ONLY raw measured
 * data (per-phase cumulative passed/total + run wall-clock). Everything derived
 * — correctness, composite, cumulative-as-of-phase trajectory, rank — is
 * computed here, never hand-typed into the fixtures. See memory
 * codercup_fixtures_no_hardcode.
 *
 * Usage: node scripts/build-agent-fixtures.mjs
 * Then:  node scripts/publish-fixtures.mjs   (push to CDN)
 *
 * To add a phase: append its entry per agent to the ledger (cum_passed/total
 * from that phase's live TestSprite scoring against its deploy, run_wall_seconds
 * from the run console.log), bump scored_through_phase, re-run this + publish.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'scores/world-cup-2026-v3.json'), 'utf8'));
// Real per-test verdicts (standalone, per phase) — the ONLY source for the
// /tests/ matrix. We emit these REAL plan names verbatim so they join to
// app/tests/data.ts; we never synthesize placeholder names (synthetic names
// silently break the name-join and blank the page — that was the bug this
// pipeline now prevents). Missing → empty array, never fabricated.
const verdictsLedger = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'scores/world-cup-2026-v3.verdicts.json'), 'utf8')).agents || {};
  } catch {
    return {};
  }
})();
const AGENTS_DIR = path.join(ROOT, 'public/fixtures/agents');

// WEIGHTED scoring: a test's priority sets its weight (p0=3, p1=2, p2=1).
// correctness = Σ(weight·passed) / Σ(weight). This makes core (p0) features
// dominate, so an app that only passes trivial p2 checks but fails the p0
// "does the feature actually work" checks scores low — WITHOUT any contrived
// per-feature test. Priorities come from the plan files themselves; verdict
// names are TestSprite-truncated so we match by prefix. Unknown → weight 1.
const PRIO_W = { p0: 3, p1: 2, p2: 1 };
const normName = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const PRIO_INDEX = (() => {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.json') && e.name !== 'suite-index.json') {
        try {
          const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
          if (j.name && j.priority) out.push({ name: normName(j.name), prio: j.priority });
        } catch { /* skip */ }
      }
    }
  };
  walk(path.join(ROOT, 'tests/world-cup-2026-v3'));
  return out;
})();
const weightFor = (verdictName) => {
  const a = normName(verdictName);
  if (!a) return 1;
  for (const p of PRIO_INDEX) {
    if (p.name.startsWith(a) || a.startsWith(p.name)) return PRIO_W[p.prio] ?? 1;
  }
  return 1;
};

const clamp = (x) => Math.max(0, Math.min(1, x));
const round4 = (x) => Math.round(x * 1e4) / 1e4;
const costScore = (usd) => clamp(1 - (usd || 0) / 50);
const wallScore = (min) => clamp(1 - min / 75);
const composite = (corr, wallMin, usd) =>
  round4(0.7 * corr + 0.15 * wallScore(wallMin) + 0.15 * costScore(usd));

const DRIVER = { Anthropic: 'claude_code_cli', OpenAI: 'codex_cli', Google: 'antigravity_cli', Moonshot: 'kimi_code_cli' };
const rankings = [];
let ledgerDirty = false;

for (const [slug, a] of Object.entries(ledger.agents)) {
  const phaseNums = Object.keys(a.phases).map(Number).sort((x, y) => x - y);
  const latestPhase = phaseNums[phaseNums.length - 1];
  const runs = [];
  const per_phase = {};
  let last = null;
  // CUMULATIVE wall-clock + cost across every scored phase. The /agents
  // head-to-head chart plots the running SUM of per-phase wall_clock_minutes /
  // usd (EventComparisonCanvas chartPoints), so its endpoint is the cumulative
  // total — NOT the last phase's standalone value. The leaderboard table reads
  // side_metrics.raw.wall_clock_minutes / usd_spent_this_task; to make table ==
  // chart endpoint, the ranking must carry these cumulative sums (computed the
  // same way the chart sums its per-phase points).
  let cumWallMin = 0;
  let cumUsd = 0;
  // CUMULATIVE (aggregated) correctness: the trajectory + leaderboard show the
  // running Σ(weighted passed) / Σ(weighted total) across all phases 1..N, NOT
  // each phase's volatile standalone score. This is the agent's overall standing
  // and grows smoothly; the leaderboard = the final cumulative point.
  let cumWPass = 0;
  let cumWTotal = 0;
  for (const p of phaseNums) {
    const ph = a.phases[String(p)];
    // SINGLE SOURCE OF TRUTH: the real per-test verdicts. passed/total/
    // correctness are COUNTED from them (verdict==='passed'), so the /tests/
    // matrix and the trajectory chart can never disagree. Falls back to the
    // ledger's standalone counts only if a phase has no verdicts yet.
    const rawVerdicts = verdictsLedger[slug]?.[String(p)] ?? [];
    // Pass {name, verdict} PLUS any latest-run detail fields seeded by
    // scripts/fetch-test-details.mjs (video_url, error_message,
    // root_cause_hypothesis, recommended_fix_target, failure_kind,
    // recorded_steps). The /tests/[testId] page reads these off
    // per_test_verdicts[] to render the recording + failure analysis; absent
    // fields are simply omitted (the page treats them as null). We allow-list
    // the keys so unrelated ledger bookkeeping never leaks into the public fixture.
    const DETAIL_KEYS = [
      'video_url',
      'error_message',
      'root_cause_hypothesis',
      'recommended_fix_target',
      'failure_kind',
      'recorded_steps',
    ];
    const verdicts = rawVerdicts.map((v) => {
      const out = { name: v.name, verdict: v.verdict };
      for (const k of DETAIL_KEYS) {
        if (v[k] !== undefined && v[k] !== null) out[k] = v[k];
      }
      return out;
    });
    const passed = rawVerdicts.length
      ? rawVerdicts.filter((v) => v.verdict === 'passed').length
      : (ph.passed ?? 0);
    const total = rawVerdicts.length ? rawVerdicts.length : (ph.total ?? 0);
    // Per-phase WEIGHTED tallies (p0=3/p1=2/p2=1), then ACCUMULATE them so the
    // reported correctness is cumulative-through-phase, not standalone.
    let wPass = 0, wTotal = 0;
    for (const v of rawVerdicts) {
      const w = weightFor(v.name);
      wTotal += w;
      if (v.verdict === 'passed') wPass += w;
    }
    cumWPass += wPass;
    cumWTotal += wTotal;
    const wallMin = round4((ph.run_wall_seconds ?? 0) / 60);
    const usd = ph.usd_spent || 0;
    cumWallMin += wallMin;
    cumUsd += usd;
    // corr/composite are CUMULATIVE through this phase. The trajectory point for
    // each phase is FROZEN at its as-graded value — the cumulative correctness
    // measured when THAT phase was scored, against THAT phase's own deploy. Later
    // phases re-score all prior plans against the newer deploy (cumulative rule),
    // which overwrites prior-phase verdicts in the verdicts ledger; that must NOT
    // retroactively rewrite an earlier phase's trajectory point (e.g. an agent that
    // shipped a broken phase-1 site and fixed it in phase 2 must still read 0 at
    // phase 1, then recover at phase 2). So prefer the frozen ledger snapshot
    // (ph.cum_correctness); only the LATEST phase — whose verdicts ARE the current
    // full 1..N re-score — is computed live, then frozen back for future runs.
    const computedCorr = cumWTotal ? round4(cumWPass / cumWTotal) : 0;
    let corr;
    if (ph.cum_correctness != null) {
      corr = ph.cum_correctness;
    } else {
      corr = computedCorr;
      ph.cum_correctness = corr; // freeze this phase's as-graded cumulative snapshot
      ledgerDirty = true;
    }
    const phaseCorr = wTotal ? round4(wPass / wTotal) : 0; // per-phase, kept for reference
    // wall/cost sub-scores use the CUMULATIVE total time + spend across all
    // phases so far — total elapsed time IS the efficiency cost; a cumulatively
    // slow agent is correctly penalized on this dimension.
    const comp = composite(corr, cumWallMin, cumUsd);
    const score = {
      agent_slug: slug, task_slug: ledger.task_slug, run_id: ph.run_id, phase: p,
      composite: comp, components: { correctness: corr },
      side_metrics: { prediction_accuracy_at_t: 0, lifetime_bugs_caught: 0,
        raw: { bugs_caught_this_task: 0, usd_spent_this_task: cumUsd, tokens_total: 0, iterations: 0, wall_clock_minutes: cumWallMin } },
      passed, total, correctness: corr, phase_correctness: phaseCorr,
      note: 'correctness = CUMULATIVE weighted (Σpassed/Σtotal through this phase); passed/total + phase_correctness are this phase standalone',
    };
    const endMs = new Date(ph.started_at).getTime() + ph.run_wall_seconds * 1000;
    runs.push({
      run_id: ph.run_id, task_slug: ledger.task_slug, phase: p, phase_slug: `phase-${p}`,
      phase_label: `Phase ${p} · ${ledger.phase_labels[String(p)]}`,
      started_at: ph.started_at, ended_at: new Date(endMs).toISOString().replace(/\.\d+Z$/, 'Z'),
      status: 'completed',
      artifact: { repo_url: `https://github.com/TestSprite/CoderCup-${slug}`, commit_sha: `phase-${p}`, deployed_app_url: a.deploy_url, amplify_app_id: a.amplify_app_id },
      driver_metadata: { driver: DRIVER[a.vendor] || 'unknown', model_id: a.model_id, prompt_tokens: 0, completion_tokens: 0, wall_clock_ms: ph.run_wall_seconds * 1000 },
      per_test_verdicts: verdicts, score,
    });
    per_phase[`phase_${p}`] = { correctness: corr, passed, total };
    last = { score, ph, passed, total };
  }

  // Preserve onboarded_at / schema_version if the file already exists.
  const file = path.join(AGENTS_DIR, `${slug}.json`);
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fresh */ }
  const out = {
    schema_version: prev.schema_version || '1',
    agent: { slug, name: a.name, vendor: a.vendor, driver_type: DRIVER[a.vendor] || 'unknown',
      model_id: a.model_id, status: 'completed', onboarded_at_iso: prev.agent?.onboarded_at_iso || '2026-05-24T00:00:00Z' },
    runs,
    amplify_app: { stable_url: a.deploy_url, app_id: a.amplify_app_id,
      note: `Per-(agent, event) Amplify reuse: one app id per (${slug}, ${ledger.event_slug}).` },
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');

  // Leaderboard side_metrics carry CUMULATIVE wall-clock + cost (sum across all
  // scored phases) so the table cells equal the chart's cumulative endpoint.
  // Everything else mirrors the latest phase's score. cumWallMin/cumUsd are
  // re-rounded after summation to avoid float drift in the rendered value.
  const cumSideMetrics = {
    ...last.score.side_metrics,
    raw: {
      ...last.score.side_metrics.raw,
      wall_clock_minutes: round4(cumWallMin),
      usd_spent_this_task: round4(cumUsd),
    },
  };
  // Leaderboard standing = the FINAL cumulative point (last.score is already
  // cumulative-through-the-last-phase): correctness = Σweighted passed/total,
  // composite from that + cumulative wall/cost.
  rankings.push({
    agent_slug: slug, agent_name: a.name, vendor: a.vendor,
    composite: last.score.composite, components: { correctness: last.score.correctness },
    side_metrics: cumSideMetrics,
    official_run_id: last.score.run_id, deployed_app_url: a.deploy_url, detail_url: `/agents/${slug}`,
    status: 'completed', per_phase,
    cumulative: { passed: last.passed, total_definitive: last.total, correctness: last.score.correctness },
  });
}

rankings.sort((x, y) => y.composite - x.composite);
rankings.forEach((r, i) => (r.rank = i + 1));

const lb = {
  schema_version: '2', task_slug: ledger.task_slug, task_name: ledger.task_name, event_slug: ledger.event_slug,
  current_phase: ledger.scored_through_phase, current_iteration_slug: `phase-${ledger.scored_through_phase}-rerun`,
  last_updated_iso: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), state: 'graded',
  note: `Phase 1-${ledger.scored_through_phase} re-run, derived from the score ledger. Per-phase = cumulative-as-of-phase (all plans 1..N re-scored against phase N's deploy). ${ledger.cost_note}`,
  methodology: { composite_formula: `composite = ${ledger.composite_formula}`, wall_clock_score: 'clamp(1 − run_wall_min / 75, 0, 1)', cost_score: ledger.cost_score_formula, current_state: ledger.cost_note },
  rankings,
};
fs.writeFileSync(path.join(ROOT, 'public/fixtures/leaderboard.json'), JSON.stringify(lb, null, 2) + '\n');

// Persist any newly-frozen per-phase correctness snapshots so a later phase's
// cumulative re-scoring can never retroactively rewrite an earlier trajectory point.
if (ledgerDirty) {
  fs.writeFileSync(path.join(ROOT, 'scores/world-cup-2026-v3.json'), JSON.stringify(ledger, null, 2) + '\n');
  console.log('Froze per-phase cum_correctness snapshot(s) into the score ledger.');
}

console.log(`Built ${rankings.length} agents + leaderboard from ledger (through phase ${ledger.scored_through_phase}).`);
for (const r of rankings) {
  const traj = Object.values(r.per_phase).map((p) => round4(p.correctness));
  console.log(`  #${r.rank} ${r.agent_slug}: composite=${r.composite} corr=${r.components.correctness} trajectory=[${traj.join(', ')}]`);
}
