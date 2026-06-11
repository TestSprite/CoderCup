#!/usr/bin/env node
// Extend public/fixtures/agents/<slug>.json with `events[]` + `career`
// derived from existing `runs[]`. Keeps `runs[]` in place so existing
// consumers (the /tests page) keep working.

import fs from 'node:fs';
import path from 'node:path';

const AGENTS_DIR = path.join(process.cwd(), 'public/fixtures/agents');
const EVENT_SLUG = 'world-cup-2026-cohort-1';
const EVENT_DISPLAY = 'Event #001 · World Cup Code Battle 2026';

// Pull rankings from the global leaderboard to assign per-event rank
const lb = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/fixtures/leaderboard.json'), 'utf8'),
);
const rankBySlug = new Map(lb.rankings.map((r) => [r.agent_slug, r.rank]));

// Model + status mapping; could move into a config later
const META_BY_SLUG = {
  antigravity: { model_id: 'gemini-3-flash', status: 'idle', onboarded_at_iso: '2026-05-24T00:00:00Z' },
  codex: { model_id: 'gpt-5-code', status: 'idle', onboarded_at_iso: '2026-05-24T00:00:00Z' },
  'claude-code': { model_id: 'sonnet-4-5', status: 'idle', onboarded_at_iso: '2026-05-24T00:00:00Z' },
};

function durationMin(startedIso, endedIso) {
  const ms = new Date(endedIso).getTime() - new Date(startedIso).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.json'));
for (const f of files) {
  const filePath = path.join(AGENTS_DIR, f);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const slug = data.agent.slug;
  const meta = META_BY_SLUG[slug] ?? {
    model_id: 'unknown',
    status: 'idle',
    onboarded_at_iso: '2026-05-24T00:00:00Z',
  };

  // Migrate agent meta
  data.agent.model_id = data.agent.model_id ?? meta.model_id;
  data.agent.status = data.agent.status ?? meta.status;
  data.agent.onboarded_at_iso = data.agent.onboarded_at_iso ?? meta.onboarded_at_iso;

  // Derive events[] from runs[]
  const events = (data.runs ?? []).map((r) => ({
    event_slug: EVENT_SLUG,
    event_display_name: EVENT_DISPLAY,
    rank: rankBySlug.get(slug) ?? 99,
    composite: r.score?.composite ?? 0,
    components: r.score?.components ?? { correctness: 0, bugs: 0, efficiency: 0 },
    started_at_iso: r.started_at,
    duration_minutes: durationMin(r.started_at, r.ended_at),
    artifact_url: r.artifact?.deployed_app_url ?? '',
    run_id: r.run_id,
  }));

  // Derive career aggregates
  const career = {
    events_entered: events.length,
    lifetime_bugs_caught: (data.runs ?? []).reduce(
      (sum, r) => sum + (r.driver_metadata?.bugs_caught_this_task ?? 0),
      0,
    ),
    lifetime_wall_clock_minutes: (data.runs ?? []).reduce(
      (sum, r) =>
        sum + (r.score?.side_metrics?.raw?.wall_clock_minutes ?? durationMin(r.started_at, r.ended_at)),
      0,
    ),
    lifetime_imputed_usd: Number(
      (data.runs ?? [])
        .reduce((sum, r) => sum + (r.score?.side_metrics?.raw?.usd_spent_this_task ?? 0), 0)
        .toFixed(2),
    ),
  };

  // Inline latest event's verdicts for first-fold render
  const latest = data.runs?.[0];
  const latestVerdicts = (latest?.per_test_verdicts ?? []).map((v) => ({
    test_id: v.test_id,
    name: v.name,
    verdict: v.verdict,
  }));

  data.career = career;
  data.events = events;
  data.latest_event_verdicts = latestVerdicts;

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  extended ${slug}: ${events.length} events, ${latestVerdicts.length} verdicts`);
}

console.log('done');
