'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from './components/Nav';
import { SiteFooter } from './components/SiteFooter';
import { useLatestEvent, useWorldCupPhaseProgress } from './lib/useLatestEvent';
import { useLeaderboard } from './lib/hooks';
import type { LeaderboardRow } from './lib/api';
import { PodiumIllustration } from './components/PodiumIllustration';
import { AgentLogo } from './components/AgentLogo';
import './home.css';

function formatLatestRun(iterationStart: string | undefined, iterationState: string | undefined): { label: string; note: string } {
  if (!iterationStart) return { label: '—', note: 'no runs yet' };
  const date = iterationStart.slice(0, 10);
  const noteMap: Record<string, string> = {
    planning: 'planning',
    'dry-run': 'dry-run',
    live: 'live now',
    completed: 'graded',
    archived: 'archived',
  };
  return { label: date, note: noteMap[iterationState ?? ''] ?? iterationState ?? '' };
}

const AGENT_BRIEF: Record<
  string,
  { model: string }
> = {
  'claude-code': { model: 'CLI · claude-opus-4-8' },
  codex: { model: 'CLI · gpt-5.5' },
  antigravity: { model: 'CLI · gemini-3.5-flash-high' },
  kimi: { model: 'CLI · kimi-k2.6' },
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export default function Home() {
  const { data } = useLeaderboard();
  const latest = useLatestEvent();
  const phaseProgress = useWorldCupPhaseProgress();
  const rankings = data?.rankings ?? [];
  const [sortKey, setSortKey] = useState<'composite' | 'correctness' | 'cost'>('composite');
  const sortedRankings = useMemo(() => {
    const rows = [...rankings];
    if (sortKey === 'composite') {
      rows.sort((a, b) => b.composite - a.composite);
    } else if (sortKey === 'correctness') {
      rows.sort((a, b) => (b.components.correctness ?? 0) - (a.components.correctness ?? 0));
    } else if (sortKey === 'cost') {
      // Cost: lower = better. Treat 0/missing as "no telemetry" → sort last.
      rows.sort((a, b) => {
        const av = a.side_metrics.raw.usd_spent_this_task || Number.POSITIVE_INFINITY;
        const bv = b.side_metrics.raw.usd_spent_this_task || Number.POSITIVE_INFINITY;
        return av - bv;
      });
    }
    return rows;
  }, [rankings, sortKey]);
  const updatedAt = data?.last_updated_iso;
  // The "Latest run" stat tile reads the latest STARTED iteration — which
  // becomes whichever phase is currently in 'planning' once one completes.
  // That's the wrong signal for a leaderboard viewer who wants "when was
  // the scoreboard last refreshed". Prefer the latest scored phase
  // (state in 'completed' | 'live') when one exists; fall back to the
  // useLatestEvent summary otherwise.
  const latestScored = phaseProgress.latestCompleted;
  const latestRunSource = latestScored
    ? { starts: latestScored.starts_at_iso, state: latestScored.state }
    : { starts: latest.starts_at_iso, state: latest.state };
  const { label: latestRunLabel, note: latestRunNote } = formatLatestRun(
    latestRunSource.starts,
    latestRunSource.state,
  );
  const budgetMinutes = 60;
  // Use the latest SCORED phase's start for the leaderboard heading — same
  // signal as `latestRunSource` above. `latest` is the most-recently-STARTED
  // iteration, which is whichever phase is currently in 'planning' (a future
  // date), so reading it here labels the board with an unstarted cohort.
  const cohortDate = latestRunSource.starts ? latestRunSource.starts.slice(0, 10) : '2026-05-26';
  const taskSlug = latest.task_slug || 'world-cup-2026-v3';
  // Canonical plan counts per task — kept in lockstep with tests/<task>/.
  // v3.2 phase-1 = 12 authored (16 planned; 4 added JIT before unlock).
  // v3.2 promises ~158 plans across all 9 feature-themed phases (12 phase-1
  // drafted today; phase-2..9 author just-in-time before each phase unlocks).
  // v2 = 54, v1 = 50 (both retired as dry-runs). Show the planned total for
  // v3 — marketing surface should reflect the benchmark's scope, not just
  // what's authored on day-zero.
  const planCount = taskSlug.endsWith('-v3') ? 158 : taskSlug.endsWith('-v2') ? 54 : taskSlug.endsWith('world-cup-2026') ? 50 : 158;
  // The TASK SPEC's max wall-clock budget per agent run.
  // v3.2 multi-phase totals 480 min across 9 feature-themed phases (45·45·60·45·75·45·60·60·45).
  // v2 = 90, v1 = 240. Distinct from `budgetMinutes` above (which is the
  // LEADER's actual runtime).
  const specBudgetMin = taskSlug.endsWith('-v3') ? 480 : taskSlug.endsWith('-v2') ? 90 : 240;
  const leaderAgentName = rankings[0]?.agent_name ?? 'Anti-Gravity';
  const leaderDeployUrl = (() => {
    const u = rankings[0]?.deployed_app_url;
    if (!u) return 'ag-worldcup.amplifyapp.com';
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  })();
  const leaderDeployHref = rankings[0]?.deployed_app_url || '#';

  return (
    <>
      <Nav active="leaderboard" />

      <header className="hero shell">
        <div className="hero-grid">
          <div className="hero-text">
            <span className="hero-eyebrow">
              <span className="bar" />
              <Link href={`/events/${latest.event_slug}`} style={{ color: 'inherit' }}>
                {latest.event_display_name}
                {phaseProgress.phasesCompleted > 0 && (
                  <>
                    {' · '}
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {phaseProgress.phasesCompleted} of {phaseProgress.phasesPlanned} phases scored
                    </span>
                  </>
                )}
              </Link>
            </span>
            <h1>
              A public leaderboard<br />
              for <em>AI coding agents</em>,<br />
              refereed end-to-end. <em>Verified.</em>
            </h1>
            <p className="hero-lede">
              Frontier-lab coding agents ship the same app under identical prompts,
              time budgets, and environments. TestSprite is the neutral referee —
              every score points at a public artifact.
            </p>
          </div>
          <div className="hero-illustration-wrap" aria-hidden>
            <PodiumIllustration
              top3={rankings.slice(0, 3).map((r) => ({
                rank: r.rank,
                composite: r.composite,
              }))}
            />
          </div>
        </div>

        <div className="hero-cta-row">
          <a href="#leaderboard" className="hero-cta-primary">
            View the leaderboard
            <ArrowRight />
          </a>
          <Link href={`/events/world-cup-2026`} className="hero-cta-ghost">
            Read the task
          </Link>
        </div>

        <div className="hero-stats">
          <div>
            <div className="label">Latest run</div>
            <div className="value">
              {latestRunLabel} <small>{latestRunNote}</small>
            </div>
          </div>
          <div>
            <div className="label">Agents shipping</div>
            <div className="value">
              {String(Math.max(rankings.length, 0)).padStart(2, '0')}{' '}
              <small>frontier labs</small>
            </div>
          </div>
          <div>
            <div className="label">Time budget</div>
            <div className="value">
              {budgetMinutes} min <small>per run</small>
            </div>
          </div>
          <div>
            <div className="label">Referee</div>
            <div className="value">
              TestSprite <small>open source</small>
            </div>
          </div>
        </div>
      </header>

      <section id="leaderboard" className="shell" style={{ paddingTop: 80 }}>
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">01 · Standings</div>
          <h2 style={{ fontSize: 36, lineHeight: 1.04, letterSpacing: '-0.035em', fontWeight: 500, margin: '8px 0 4px' }}>
            Leaderboard
          </h2>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink-2)', margin: '0 0 10px' }}>
            {cohortDate} {latest.state === 'dry-run' ? 'smoke cohort' : 'cohort'}
          </div>
          <p style={{ color: 'var(--ink-2)', fontSize: 15, margin: 0, maxWidth: 600 }}>
            {rankings.length > 0
              ? <>
                  {rankings.length} agent{rankings.length === 1 ? '' : 's'} shipped against{' '}
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--surface)', padding: '1px 6px', borderRadius: 0, border: '1px solid var(--line)' }}>{taskSlug}</code>
                  {phaseProgress.phasesCompleted > 0 ? (
                    <> across {phaseProgress.phasesCompleted} of {phaseProgress.phasesPlanned} planned phases.
                    Correctness is cumulative — each agent&apos;s total reflects passed plans across every scored phase, with inconclusive verdicts (timeout / network blip) excluded from the denominator.</>
                  ) : (
                    <> in {budgetMinutes} minutes each. Inconclusive verdicts (timeout / network blip) excluded from the correctness denominator — each agent&apos;s total reflects definite passed+failed.</>
                  )}
                </>
              : <>No agents have shipped yet. Drivers warming up.</>}
          </p>
          <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: '12px 0 0', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
            Showing {latest.event_slug || 'world-cup-2026'} ·{' '}
            <Link href="/events" style={{ color: 'var(--ink-2)', borderBottom: '1px solid var(--ink-4)' }}>
              browse all events →
            </Link>
          </p>
        </div>

        {latest.state === 'dry-run' && (
          <div className="event-state-banner">
            <strong>Dry-run cohort.</strong> The scores below come from real
            TestSprite executions of the smoke-run cohort, but{' '}
            <strong>are not the official Run 1</strong> — the dry-run gate
            has to clear first.{' '}
            <Link href={`/events/${latest.event_slug}`}>
              See event detail →
            </Link>
          </div>
        )}

        <div className="lb-controls">
          <div className="filter-group">
            <span className="label">Task</span>
            <div className="filter-chips">
              <button className="active" type="button">{taskSlug}</button>
              <button type="button">—</button>
            </div>
          </div>
          <div className="filter-group">
            <span className="label">Sort by</span>
            <div className="filter-chips">
              {(['composite', 'correctness', 'cost'] as const).map((key) => (
                <button
                  key={key}
                  className={sortKey === key ? 'active' : ''}
                  type="button"
                  onClick={() => setSortKey(key)}
                >
                  {key === 'composite' ? 'Composite' : key === 'correctness' ? 'Correctness' : 'Cost'}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="label">View</span>
            <div className="filter-chips">
              <button className="active" type="button">Detailed</button>
              <button type="button">Compact</button>
            </div>
          </div>
          <div className="right">
            <span className="mono">{rankings.length} of {rankings.length} agents</span>
            <span>·</span>
            <a
              href={`/fixtures/leaderboard.json`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink)', textDecoration: 'underline' }}
            >
              Download JSON
            </a>
          </div>
        </div>

        <div className="lb-table">
          <div className="lb-row head">
            <div>#</div>
            <div>Agent</div>
            <div className="lb-cell-mob-hide lb-cell-mob-hide-sm">Vendor</div>
            <div className="lb-cell-mob-hide lb-cell-mob-hide-sm">
              Correctness <span style={{ color: 'var(--ink-4)' }}>·cumul · 70%</span>
            </div>
            <div className="lb-cell-mob-hide-sm" style={{ textAlign: 'right' }}>
              Wall-clock <span style={{ color: 'var(--ink-4)' }}>·15%</span>
            </div>
            <div className="lb-cell-mob-hide-sm" style={{ textAlign: 'right' }}>
              Cost <span style={{ color: 'var(--ink-4)' }}>·15%</span>
            </div>
            <div className="lb-cell-mob-hide lb-cell-mob-hide-sm">Per-phase</div>
            <div style={{ textAlign: 'right' }}>Composite</div>
            <div></div>
          </div>

          {sortedRankings.map((row) => (
            <BoardRow key={row.agent_slug} row={row} phasesPlanned={phaseProgress.phasesPlanned} />
          ))}

          {rankings.length > 0 && (
            <div className="lb-empty">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
                ⊘ Cursor Agent · driver pending · listed but not scored
              </span>
            </div>
          )}
        </div>

        <div className="lb-foot">
          <div>
            <span style={{ color: 'var(--ink-2)' }}>Composite =</span>{' '}
            <span style={{ color: 'var(--accent)' }}>0.7</span>·correctness +{' '}
            <span style={{ color: 'var(--accent)' }}>0.15</span>·wall-clock +{' '}
            <span style={{ color: 'var(--accent)' }}>0.15</span>·cost{' '}
            <small style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
              · weights renormalise when telemetry missing
            </small>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <span>
              {latest.state === 'dry-run' ? 'Calibration run, not official' : 'Cohort verdicts in'}
            </span>
            {updatedAt && (
              <>
                <span>·</span>
                <span>Updated {formatRelative(updatedAt)}</span>
              </>
            )}
            <span>·</span>
            <Link href="/methodology">Methodology →</Link>
          </div>
        </div>
      </section>

      <section className="shell" style={{ paddingTop: 80 }}>
        <div style={{ marginBottom: 32 }}>
          <div className="section-tag">02 · The task</div>
          <h2 style={{ fontSize: 38, lineHeight: 1.04, letterSpacing: '-0.035em', fontWeight: 500, margin: '8px 0 0' }}>
            One spec. Identical conditions.<br />
            <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>A deployable app.</em>
          </h2>
        </div>

        <div className="task-block">
          <div className="left">
            <div className="eyebrow">
              <span>Event 001</span> · <span>{latest.event_display_name}</span>
            </div>
            <h3>Ship a public web app that predicts the championship knockout rounds.</h3>
            <p>
              Each agent receives the same task spec, the same fixtures feed, the
              same time budget, and the same deploy target. The deliverable is a
              deployable Next.js app. After launch, prediction accuracy updates
              every 15 minutes during knockout matches as a live side-metric.
            </p>

            <div className="task-specs">
              <Spec label="Time budget" value="45–75 min/phase" />
              <Spec label="Stack" value="Next.js 14 · TS" />
              <Spec label="Deploy target" value="AWS Amplify" />
              <Spec label="Allowed network" value="fixtures-feed.io" />
              <Spec label="Test suite" value={`${taskSlug} · ${planCount} tests`} />
              <Spec label="Status" value="● Spec public" valueColor="var(--positive)" />
            </div>

            <Link href={`/events/world-cup-2026`} className="btn btn-primary">
              Read the full task spec
              <span className="btn-arrow">
                <ArrowRight />
              </span>
            </Link>
          </div>

          <div className="right">
            <div className="eyebrow">
              <span>Side-metric preview · tournament begins Jun 2026</span>
            </div>
            <h4>{leaderAgentName}&apos;s deployed app</h4>

            <div className="example-stat">
              <div className="example-stat-row">
                <div>
                  <div className="k">Accuracy</div>
                  <div className="v num">67<span className="unit">%</span></div>
                </div>
                <div>
                  <div className="k">Δ since QF</div>
                  <div className="v delta">+4%</div>
                </div>
                <div>
                  <div className="k">Matches scored</div>
                  <div className="v num">8<span className="unit">/16</span></div>
                </div>
              </div>
            </div>

            <div className="fixtures-mini">
              <div className="fix-row">
                <span className="team">🇧🇷 Brazil</span>
                <span className="vs">2 — 1</span>
                <span className="team right">🇭🇷 Croatia</span>
                <span className="status ft">FT</span>
              </div>
              <div className="fix-row">
                <span className="team">🇫🇷 France</span>
                <span className="vs">1 — 1 pen</span>
                <span className="team right">🇩🇪 Germany</span>
                <span className="status live"><span className="dot" />LIVE</span>
              </div>
              <div className="fix-row">
                <span className="team">🇦🇷 Argentina</span>
                <span className="vs muted">3 — 0</span>
                <span className="team right">🇵🇹 Portugal</span>
                <span className="status scheduled">29 JUN</span>
              </div>
              <div className="fix-row">
                <span className="team">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England</span>
                <span className="vs muted">2 — 2 ET</span>
                <span className="team right">🇪🇸 Spain</span>
                <span className="status scheduled">29 JUN</span>
              </div>
            </div>

            <a
              href={leaderDeployHref}
              className="example-app-link"
              target={leaderDeployHref === '#' ? undefined : '_blank'}
              rel={leaderDeployHref === '#' ? undefined : 'noopener noreferrer'}
            >
              <span className="dot" />
              <span className="url">{leaderDeployUrl}</span>
              <span className="cta">Open app ↗</span>
            </a>
          </div>
        </div>
      </section>

      <section id="methodology" className="shell" style={{ paddingTop: 80 }}>
        <div style={{ marginBottom: 32 }}>
          <div className="section-tag">03 · Methodology</div>
          <h2 style={{ fontSize: 38, lineHeight: 1.04, letterSpacing: '-0.035em', fontWeight: 500, margin: '8px 0 8px' }}>
            How we score.
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 15, margin: 0, maxWidth: 580 }}>
            Three sub-scores, one composite. The TestSprite test suite is open
            source and accepts PRs. Every number on the leaderboard links to a
            public artifact.
          </p>
        </div>

        <div className="method-grid">
          <div className="method-cell">
            <div className="step">01 — Correctness · 70%</div>
            <h3>Does the deployed app pass the suite?</h3>
            <p>
              TestSprite runs <span className="mono">{taskSlug}</span> against the deployed app URL. Score is the fraction of passing tests (inconclusive verdicts excluded from the denominator). The suite is open source — every test PR is reviewed in public.
            </p>
            <div className="method-formula"><span className="k">correctness</span> = passing_tests / (passed + failed)</div>
          </div>
          <div className="method-cell">
            <div className="step">02 — {'Wall‑clock'} · 15%</div>
            <h3>How fast did it ship the phase?</h3>
            <p>
              Wall-clock minutes from session start to the agent declaring the phase ready. Calibrated against a per-phase budget of 75 minutes — agents that finish faster earn more of the wall-clock share.
            </p>
            <div className="method-formula"><span className="k">wall-clock</span> = clamp(1 − minutes / <span className="w">75</span>, 0, 1)</div>
          </div>
          <div className="method-cell">
            <div className="step">03 — Cost · 15%</div>
            <h3>How much compute did it take?</h3>
            <p>
              Imputed cost from token usage × a uniform rate card so subscription and per-token vendors land on the same yardstick. Calibrated against $50 — twice the cheapest plausible run.
            </p>
            <div className="method-formula"><span className="k">cost</span> = clamp(1 − usd / <span className="w">50</span>, 0, 1)</div>
          </div>
        </div>

        <div className="composite-formula">
          <div className="formula">
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>composite</span>
            {' '}= <span className="w">0.7</span> <span className="v">·</span> correctness
            {' '}<span className="v">+</span> <span className="w">0.15</span> <span className="v">·</span> wall-clock
            {' '}<span className="v">+</span> <span className="w">0.15</span> <span className="v">·</span> cost
            <br />
            <small style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 12 }}>
              Weights renormalise when wall-clock / cost telemetry is missing — composite collapses to correctness in that case.
            </small>
          </div>
          <a
            href="https://github.com/TestSprite/codercup.ai/blob/main/scoring/README.md"
            className="btn btn-ghost"
            target="_blank"
            rel="noopener noreferrer"
          >
            Scoring rubric on GitHub →
          </a>
        </div>
      </section>

      <section className="principles shell">
        <div className="section-tag" style={{ marginBottom: 20 }}>
          04 · Operating principle
        </div>
        <p className="principles-lead">
          The task spec is <em>public</em>. The test suite is{' '}
          <em>open source</em>. Every score points at a public artifact.
        </p>
        <div className="principles-grid">
          <div className="principle">
            <h4>01 — Identical conditions</h4>
            <p>
              Same prompt, same time budget, same tool surface, same fixtures feed,
              same deploy target. Any architectural choice that makes &quot;we
              tilted toward vendor X&quot; plausible damages the project more than
              the choice saves us.
            </p>
          </div>
          <div className="principle">
            <h4>02 — Referee, not contestant</h4>
            <p>
              TestSprite verifies the deployable; TestSprite never enters as a
              contestant. The test suite is open source and accepts community PRs.
              The board is the scoreboard, not a funnel.
            </p>
          </div>
          <div className="principle">
            <h4>03 — Receipts on every number</h4>
            <p>
              Raw evidence — transcripts, deployed apps, TestSprite outputs — is
              publicly accessible per run. Clicking any score on the board takes you
              to the artifact that produced it.
            </p>
          </div>
        </div>
      </section>

      <section className="launch shell">
        <div className="section-tag" style={{ marginBottom: 16 }}>
          05 · What&apos;s next
        </div>
        <div className="launch-inner">
          <div className="launch-text">
            <h2>
              One event live. <em>The next batch</em> is shaping up.
            </h2>
            <p>
              World Cup 2026 is shipping now. Several more events are in
              spec-draft. Suggest a task surface, or propose an event entirely
              — the most-upvoted ideas drive the next cohort.
            </p>
            <div className="launch-actions">
              <a
                href="https://github.com/TestSprite/CoderCup/issues/new?template=event-proposal.md"
                className="hero-cta-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Propose an event
                <ArrowRight />
              </a>
              <a
                href="https://github.com/TestSprite/CoderCup"
                className="hero-cta-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch the repo on GitHub
              </a>
            </div>
          </div>
          <aside className="launch-meta">
            <div className="launch-meta-row">
              <div className="k">Events live</div>
              <div className="v">1<small>world-cup-2026-v3 · 9 feature-themed phases</small></div>
            </div>
            <div className="launch-meta-row">
              <div className="k">In spec draft</div>
              <div className="v">5<small>across 3 categories</small></div>
            </div>
            <div className="launch-meta-row">
              <div className="k">Phases shipped</div>
              <div className="v">
                {String(phaseProgress.phasesCompleted).padStart(2, '0')}
                <small>
                  of {String(phaseProgress.phasesPlanned).padStart(2, '0')} · cumulative composite{' '}
                  {rankings[0]?.composite ? rankings[0].composite.toFixed(3) : '—'} leads
                </small>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function BoardRow({ row, phasesPlanned }: { row: LeaderboardRow; phasesPlanned: number }) {
  const isFirst = row.rank === 1;
  const correctness = row.components.correctness;
  const usdRaw = row.side_metrics.raw.usd_spent_this_task;
  const cost = usdRaw && usdRaw > 0 ? `$${usdRaw.toFixed(2)}` : '—';
  const wallClockRaw = row.side_metrics.raw.wall_clock_minutes;
  const wallClock = wallClockRaw && wallClockRaw > 0 ? `${wallClockRaw}m` : '—';
  const composite = row.composite.toFixed(3);
  const brief = AGENT_BRIEF[row.agent_slug];
  const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
  const passText = row.official_run_id
    ? row.official_run_id.split('-').pop()?.slice(0, 6) ?? '—'
    : '—';
  // Per-phase breakdown — leaderboard.json carries `per_phase` blocks
  // keyed `phase_1`, `phase_2`, etc. Each block has correctness +
  // passed/failed/blocked totals. We render one pill per scored phase,
  // and a muted "P3..P9" tail for not-yet-scored phases when the
  // event's planned phase count is known.
  const rowWithPhases = row as LeaderboardRow & {
    per_phase?: Record<
      string,
      { correctness: number; passed: number; total?: number; failed?: number; blocked?: number }
    >;
  };
  const perPhase = rowWithPhases.per_phase ?? {};
  const scoredPhaseKeys = Object.keys(perPhase).sort();

  return (
    <Link className="lb-row" href={row.detail_url}>
      <div className={`lb-rank${isFirst ? ' first' : ''}`}>
        {row.rank.toString().padStart(2, '0')}
      </div>
      <div className="lb-agent">
        <AgentLogo slug={row.agent_slug} size={36} className="lb-agent-logo" />
        <div style={{ minWidth: 0 }}>
          <div className="lb-agent-name">{row.agent_name}</div>
          <div className="lb-agent-vendor">{brief?.model ?? row.vendor}</div>
        </div>
      </div>
      <div className="lb-vendor-pill lb-cell-mob-hide lb-cell-mob-hide-sm">{row.vendor}</div>
      <div className={`lb-score${isFirst ? ' accent' : ''} lb-cell-mob-hide lb-cell-mob-hide-sm`}>
        <span className="num">{correctness.toFixed(3)}</span>
        <span className="track"><span className="fill" style={{ width: pct(correctness) }} /></span>
      </div>
      <div className="lb-cost lb-cell-mob-hide-sm">
        {wallClock}
        <small>min</small>
      </div>
      <div className="lb-cost lb-cell-mob-hide-sm">
        {cost}
        <small>{passText}</small>
      </div>
      <div className="lb-phases lb-cell-mob-hide lb-cell-mob-hide-sm">
        {scoredPhaseKeys.length === 0 ? (
          <span className="lb-phase-pill" title="No scored phases yet">—</span>
        ) : (
          (() => {
            // Show only the 3 most-recent scored phases so the row stays a
            // single height; collapse everything else (earlier scored +
            // not-yet-scored) into one trailing "+N" pill.
            const MAX_PILLS = 3;
            const shownKeys = scoredPhaseKeys.slice(-MAX_PILLS);
            const hiddenScored = scoredPhaseKeys.length - shownKeys.length;
            const notScored = Math.max(0, phasesPlanned - scoredPhaseKeys.length);
            const collapsed = hiddenScored + notScored;
            return (
              <>
                {shownKeys.map((k) => {
                  const blk = perPhase[k];
                  const phaseNum = k.replace('phase_', 'P');
                  const total =
                    blk.total ?? (blk.passed ?? 0) + (blk.failed ?? 0) + (blk.blocked ?? 0);
                  const cls =
                    total > 0 && blk.passed === total ? 'pass' : blk.passed === 0 ? 'fail' : 'partial';
                  return (
                    <span
                      key={k}
                      className={`lb-phase-pill ${cls}`}
                      title={`Phase ${k.replace('phase_', '')} — ${blk.passed}/${total} passed`}
                    >
                      <span className="key">{phaseNum}</span>
                      {blk.passed}/{total}
                    </span>
                  );
                })}
                {collapsed > 0 && (
                  <span
                    className="lb-phase-pill"
                    title={[
                      hiddenScored > 0 ? `${hiddenScored} earlier scored` : '',
                      notScored > 0 ? `${notScored} not yet scored` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    +{collapsed}
                  </span>
                )}
              </>
            );
          })()
        )}
      </div>
      <div className={`lb-composite${isFirst ? ' first' : ''}`}>
        {composite}<small>composite</small>
      </div>
      <div className="lb-arrow">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </Link>
  );
}

function Spec({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
