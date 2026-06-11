'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AgentLogo } from '../components/AgentLogo';
import { CDN_BASE, type AgentJson, type LeaderboardRow } from '../lib/api';

// Vendor → hex color for the trajectory polylines + legend swatches.
// Kept narrow because only the 3 live drivers contribute trajectory data.
const VENDOR_COLOR: Record<string, string> = {
  'claude-code': '#F97316',
  codex: '#14B8A6',
  antigravity: '#2D5BFF',
  kimi: '#8B5CF6',
};

const TOTAL_PHASES = 9;

/**
 * Cumulative correctness across every scored phase: total passed plans ÷
 * total plans. Phase-1 tests re-run in every later phase, so an agent's
 * true standing aggregates BOTH suites — it is never any single phase's
 * pass-rate. Blocked/inconclusive verdicts count in the denominator, to
 * match the published leaderboard.json numbers.
 */
function cumulativeCorrectness(
  points: Array<{ passed: number; total: number }>,
): number | null {
  const passed = points.reduce((s, p) => s + (p.passed || 0), 0);
  const total = points.reduce((s, p) => s + (p.total || 0), 0);
  return total > 0 ? passed / total : null;
}

/**
 * Mirror of scoring/score-runner composite() — used only as a fallback to
 * derive the cumulative composite when leaderboard.json (the canonical
 * cumulative source) has not hydrated yet. Weights and calibration match
 * runners/contract/schema.ts.
 */
function localComposite(
  correctness: number,
  wall?: number | null,
  cost?: number | null,
): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  let weightSum = 0.7;
  let blended = correctness * 0.7;
  if (typeof wall === 'number' && wall > 0) {
    blended += clamp(1 - wall / 75) * 0.15;
    weightSum += 0.15;
  }
  if (typeof cost === 'number' && cost > 0) {
    blended += clamp(1 - cost / 50) * 0.15;
    weightSum += 0.15;
  }
  return weightSum > 0 ? blended / weightSum : 0;
}

type Trajectory = {
  slug: string;
  name: string;
  vendor: string;
  model_id: string;
  color: string;
  /** Cumulative composite (legend + winner pick). NOT the latest phase's
   *  per-run composite — that flattens distinct agents onto one value. */
  composite_latest: number | null;
  is_winner: boolean;
  /** Cumulative standing across all scored phases — mirrors leaderboard.json
   *  and the agent cards. Drives the transposed table. The per-phase
   *  `points` below drive the small-multiples charts. */
  cum: {
    composite: number | null;
    correctness: number | null;
    wall_clock_minutes: number | null;
    cost_usd: number | null;
  };
  points: Array<{
    phase: number;
    composite: number;
    correctness: number;
    /** Passed / total plan count for THIS phase's suite — summed across
     *  points to derive cumulative correctness. */
    passed: number;
    total: number;
    /** Raw wall-clock minutes for the phase (lower = better). `null`
     *  when telemetry was not captured by the cohort runner. */
    wall_clock_minutes: number | null;
    /** Raw imputed USD for the phase (lower = better). `null` when
     *  telemetry was not captured. */
    cost_usd: number | null;
  }>;
  /** Cumulative-as-of-phase series that the small-multiples chart plots —
   *  each point is the agent's STANDING through that phase (correctness =
   *  running pass-rate, wall-clock/cost = running sums), so the chart's
   *  endpoint matches the cumulative table and the three agents stay
   *  distinct (vs the per-phase `points`, where every agent shares the
   *  same single-phase pass-rate). Phase 1 keeps its stored value; the
   *  latest phase uses the leaderboard cumulative. */
  chartPoints: Array<{
    phase: number;
    composite: number;
    correctness: number;
    wall_clock_minutes: number | null;
    cost_usd: number | null;
  }>;
};

export function EventComparisonCanvas({
  rankings,
  eventSlug,
}: {
  rankings: LeaderboardRow[];
  eventSlug: string;
}) {
  const [agents, setAgents] = useState<AgentJson[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const slugs = ['claude-code', 'codex', 'antigravity', 'kimi'];
        // allSettled (not all): a single missing/404 agent file must not blank
        // every trajectory. Guard res.ok so a 404 HTML body never reaches
        // r.json(), and drop any agent that lacks a runs array.
        const settled = await Promise.allSettled(
          slugs.map(async (s) => {
            const res = await fetch(`${CDN_BASE}/agents/${s}.json`);
            if (!res.ok) throw new Error(`agent ${s} -> ${res.status}`);
            return (await res.json()) as AgentJson;
          }),
        );
        const list = settled
          .filter((r): r is PromiseFulfilledResult<AgentJson> => r.status === 'fulfilled')
          .map((r) => r.value)
          .filter((a) => a && Array.isArray(a.runs));
        if (alive) {
          setAgents(list);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // leaderboard.json (cumulative standing) keyed by slug — the canonical
  // source for the table/legend numbers and the latest-phase point of each
  // chart trajectory. Per-phase points still come from the agent JSON.
  const lbBySlug = useMemo(() => {
    const m = new Map<string, LeaderboardRow>();
    rankings.forEach((r) => m.set(r.agent_slug, r));
    return m;
  }, [rankings]);

  const trajectories = useMemo<Trajectory[]>(() => {
    if (!agents.length) return [];
    const t = agents.map<Trajectory>((a) => {
      const sortedRuns = [...a.runs].sort((x, y) => {
        const tx = x.started_at ? new Date(x.started_at).getTime() : 0;
        const ty = y.started_at ? new Date(y.started_at).getTime() : 0;
        return tx - ty;
      });
      const points = sortedRuns.map((r, idx) => {
        // For v3 multi-phase runs, score has phase metadata; for legacy
        // single-shot runs, treat each as phase=idx+1 so the chart still
        // plots something coherent.
        const phase = (r as unknown as { phase?: number }).phase ?? idx + 1;
        const rawWall = r.score?.side_metrics?.raw?.wall_clock_minutes;
        const rawCost = r.score?.side_metrics?.raw?.usd_spent_this_task;
        // Per-phase plan tallies — summed to derive cumulative correctness.
        const verdicts =
          (r as unknown as { per_test_verdicts?: Array<{ verdict?: string }> })
            .per_test_verdicts ?? [];
        const passed = verdicts.filter(
          (v) => (v.verdict ?? '').toLowerCase() === 'passed',
        ).length;
        const total = verdicts.length;
        // Treat 0 as "not captured" — the cohort runner currently emits 0
        // for both fields in Phase 1. Surface null so the FE can render —.
        return {
          phase,
          composite: r.score?.composite ?? 0,
          correctness: r.score?.components?.correctness ?? 0,
          passed,
          total,
          wall_clock_minutes:
            typeof rawWall === 'number' && rawWall > 0 ? rawWall : null,
          cost_usd:
            typeof rawCost === 'number' && rawCost > 0 ? rawCost : null,
        };
      });

      // Cumulative standing: prefer leaderboard.json (canonical, matches the
      // cards), fall back to deriving it from the per-phase points so the
      // canvas is still correct if the leaderboard prop hasn't hydrated.
      const lb = lbBySlug.get(a.agent.slug);
      const sumWall = points.reduce(
        (s, p) => s + (typeof p.wall_clock_minutes === 'number' ? p.wall_clock_minutes : 0),
        0,
      );
      const sumCost = points.reduce(
        (s, p) => s + (typeof p.cost_usd === 'number' ? p.cost_usd : 0),
        0,
      );
      const cumCorrectness = lb
        ? lb.components.correctness
        : cumulativeCorrectness(points);
      const cumWall = lb
        ? lb.side_metrics.raw.wall_clock_minutes ?? null
        : sumWall > 0
          ? sumWall
          : null;
      const cumCost = lb
        ? lb.side_metrics.raw.usd_spent_this_task ?? null
        : sumCost > 0
          ? sumCost
          : null;
      const cumComposite = lb
        ? lb.composite
        : cumCorrectness != null
          ? localComposite(cumCorrectness, cumWall, cumCost)
          : null;

      // Cumulative-as-of-phase chart series. Phase 1 keeps its stored
      // standalone value (= its standing at phase 1, honoring the published
      // phase-1 score); the latest phase uses the leaderboard cumulative;
      // any middle phase derives the running pass-rate. Wall-clock and cost
      // accumulate. This keeps the three agents distinct at every phase and
      // makes each chart's endpoint equal its table cell.
      // Each run already stores CUMULATIVE-through-that-phase values
      // (correctness = Σweighted passed/total, wall-clock + cost = running sums),
      // produced by build-agent-fixtures.mjs. Plot them DIRECTLY — do not
      // re-accumulate here (that would double-count). The endpoint equals the
      // leaderboard cumulative by construction.
      const chartPoints = points.map((p) => ({
        phase: p.phase,
        composite: p.composite,
        correctness: p.correctness,
        wall_clock_minutes:
          typeof p.wall_clock_minutes === 'number' && p.wall_clock_minutes > 0
            ? p.wall_clock_minutes
            : null,
        cost_usd:
          typeof p.cost_usd === 'number' && p.cost_usd > 0 ? p.cost_usd : null,
      }));

      return {
        slug: a.agent.slug,
        name: a.agent.name,
        vendor: a.agent.vendor,
        model_id: a.agent.model_id ?? '',
        color: VENDOR_COLOR[a.agent.slug] ?? '#0A0A0C',
        composite_latest: cumComposite,
        is_winner: false,
        cum: {
          composite: cumComposite,
          correctness: cumCorrectness,
          wall_clock_minutes: cumWall,
          cost_usd: cumCost,
        },
        points,
        chartPoints,
      };
    });
    // Winner = highest cumulative composite (matches leaderboard rank 1).
    if (t.some((x) => x.composite_latest !== null)) {
      const sorted = [...t].sort(
        (a, b) => (b.composite_latest ?? -1) - (a.composite_latest ?? -1),
      );
      const winner = sorted[0];
      return t.map((x) => ({ ...x, is_winner: x.slug === winner.slug }));
    }
    return t;
  }, [agents, lbBySlug]);

  const totalIterations = useMemo(() => {
    return trajectories.reduce((acc, t) => Math.max(acc, t.points.length), 0);
  }, [trajectories]);

  const hasAnyData = totalIterations > 0;
  // Total phases = derived from the data (NOT a hardcoded 9), so the table
  // denominator + chart x-axis grow when phase 10+ lands.
  const totalPhases = Math.max(
    TOTAL_PHASES,
    ...trajectories.flatMap((t) => t.chartPoints.map((p) => p.phase)),
  );

  // Transposed table snapshot — ALL four metrics are cumulative across the
  // scored phases (composite, correctness, wall-clock, cost), mirroring
  // leaderboard.json and the agent cards. Correctness is the aggregate
  // pass-rate, NOT the latest phase's pass-rate (which is identical across
  // agents when they each pass the same count that phase). Sorted by
  // cumulative composite desc so the leftmost rank cell matches table order.
  const latestSnapshot = useMemo(() => {
    const rows = trajectories.map((t) => {
      const p = t.points.length
        ? {
            phase: t.points[t.points.length - 1].phase,
            composite: t.cum.composite ?? 0,
            correctness: t.cum.correctness ?? 0,
            wall_clock_minutes: t.cum.wall_clock_minutes,
            cost_usd: t.cum.cost_usd,
          }
        : null;
      return { t, p };
    });
    rows.sort((a, b) => {
      const av = a.p?.composite ?? -1;
      const bv = b.p?.composite ?? -1;
      return bv - av;
    });
    return rows;
  }, [trajectories]);

  const winnerSlugs = useMemo(() => {
    if (!hasAnyData) return {} as Record<string, string | null>;
    const out: Record<string, string | null> = {};
    // Higher = better.
    const higherIsBetter: Array<'composite' | 'correctness'> = [
      'composite',
      'correctness',
    ];
    higherIsBetter.forEach((m) => {
      let best = -Infinity;
      let bestSlug: string | null = null;
      latestSnapshot.forEach(({ t, p }) => {
        if (!p) return;
        const v = p[m];
        if (typeof v === 'number' && v > best) {
          best = v;
          bestSlug = t.slug;
        }
      });
      out[m] = bestSlug;
    });
    // Wall-clock + cost: lower is better, and null means "not captured".
    (['wall_clock_minutes', 'cost_usd'] as const).forEach((m) => {
      let best = Infinity;
      let bestSlug: string | null = null;
      latestSnapshot.forEach(({ t, p }) => {
        if (!p) return;
        const v = p[m];
        if (typeof v === 'number' && v > 0 && v < best) {
          best = v;
          bestSlug = t.slug;
        }
      });
      out[m] = bestSlug;
    });
    return out;
  }, [latestSnapshot, hasAnyData]);

  // Cost/wall-clock charts plot CUMULATIVE values, so their y-axes must cover
  // the running totals (cumulative cost reaches ~$27, far past the old yMax of
  // 2.0 that silently clamped every line to the top). Round up to a clean tick.
  // ~15% headroom above the max so the latest-phase dot isn't glued to the axis.
  const maxCumCost = Math.max(0, ...trajectories.map((t) => t.cum.cost_usd ?? 0));
  const costYMax = Math.max(10, Math.ceil((maxCumCost * 1.15) / 10) * 10);
  const maxCumWall = Math.max(0, ...trajectories.map((t) => t.cum.wall_clock_minutes ?? 0));
  const wallYMax = Math.max(30, Math.ceil((maxCumWall * 1.15) / 10) * 10);

  if (!loaded) {
    return (
      <section className="event-compare">
        <div className="event-compare-head">
          <div>
            <div className="event-compare-tag">
              Head-to-head · {eventSlug} · loading…
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="event-compare" id="event-compare">
      <div className="event-compare-head">
        <div>
          <div className="event-compare-tag">
            Head-to-head · {eventSlug} · {hasAnyData ? `${totalIterations} phase${totalIterations === 1 ? '' : 's'} scored` : 'phase 1 unlocks 2026-05-28'}
          </div>
          <h2>
            Multiple agents, same brief. <em>{hasAnyData ? "Here's how they stack up." : 'Trajectory populates as phases score.'}</em>
          </h2>
        </div>
        <Link href="/events/world-cup-2026" className="event-compare-link">
          View v3 spec →
        </Link>
      </div>

      <div className="comparison-canvas">
        {/* Iteration meta strip */}
        <div className="ec-iter-meta">
          <span>
            <span className="key">
              {trajectories.length} agent{trajectories.length === 1 ? '' : 's'} ·{' '}
              {hasAnyData ? `${totalIterations} of ${totalPhases} phases` : `0 of ${totalPhases} phases`}
            </span>{' '}
            · {hasAnyData ? `last scored ${new Date().toISOString().slice(0, 10)}` : 'cohort 1 & 2 retired as dry runs'}
          </span>
        </div>

        {/* Agent legend chips */}
        <div className="agent-legend">
          {trajectories.map((t) => (
            <div
              key={t.slug}
              className={`agent-chip ${t.is_winner ? 'winner' : ''}`}
              data-agent={t.slug}
            >
              <span className="swatch" style={{ background: t.color }} />
              <span className="name">{t.name}</span>
              <span className="composite-mini">
                {t.composite_latest !== null
                  ? `${t.composite_latest.toFixed(3)}${t.is_winner ? ' ★' : ''}`
                  : 'pending'}
              </span>
            </div>
          ))}
        </div>

        {/* Small-multiples chart grid — 4 metrics plotted as the CUMULATIVE
            standing through each phase (matches the table below + the cards):
            composite, correctness, wall-clock (cumulative minutes, lower=better),
            cost (cumulative USD, lower=better). Per-phase values would collapse
            all three agents onto one correctness dot at phase 2 (each passed
            13/16 that phase) — the cumulative series keeps them distinct. */}
        <div className="sm-grid">
          <SmallMultiple
            title="COMPOSITE"
            subtitle="cumulative"
            trajectories={trajectories}
            yKey="composite"
            yMax={1.0}
            yTicks={[0, 0.5, 1.0]}
            empty={!hasAnyData}
            totalPhases={totalPhases}
          />
          <SmallMultiple
            title="CORRECTNESS"
            subtitle="cumulative"
            trajectories={trajectories}
            yKey="correctness"
            yMax={1.0}
            yTicks={[0, 0.5, 1.0]}
            empty={!hasAnyData}
            totalPhases={totalPhases}
          />
          <SmallMultiple
            title="WALL-CLOCK"
            subtitle="cumulative min · lower = better"
            trajectories={trajectories}
            yKey="wall_clock_minutes"
            yMax={wallYMax}
            yTicks={[0, wallYMax / 2, wallYMax]}
            yLabelFmt={(v) => `${Math.round(v)}m`}
            empty={!hasAnyData}
            totalPhases={totalPhases}
          />
          <SmallMultiple
            title="COST"
            subtitle="cumulative USD · lower = better"
            trajectories={trajectories}
            yKey="cost_usd"
            yMax={costYMax}
            yTicks={[0, costYMax / 2, costYMax]}
            yLabelFmt={(v) => `$${v.toFixed(v >= 10 ? 0 : 2)}`}
            empty={!hasAnyData}
            totalPhases={totalPhases}
          />
        </div>

        {/* Transposed metric table — mirrors the 4-tile grid above. */}
        <div className="th-table">
          <div className="tr th">
            <div className="td td-agent">Agent</div>
            <div className="td">Composite</div>
            <div className="td">Correctness</div>
            <div className="td">Wall-clock</div>
            <div className="td">Cost</div>
            <div className="td">Phases</div>
            <div className="td bk-col" title="Plans solved the phase they were introduced (ACM full credit)">First-try</div>
            <div className="td bk-col" title="Plans solved a phase or more after introduction (decayed)">Late</div>
            <div className="td bk-col" title="Plans never solved in any phase">Never</div>
            <div className="td bk-col" title="Plans that passed then broke in a later phase (regression)">Regr</div>
          </div>
          {latestSnapshot.map(({ t, p }, i) => {
            const bk = rankings.find((r) => r.agent_slug === t.slug)?.acm_breakdown;
            return (
            <div
              key={t.slug}
              className="tr"
              data-color={t.color}
              style={{ ['--row-color' as string]: t.color }}
            >
              <div className="td td-agent">
                <span className="rk">{p ? (i === 0 ? '★' : String(i + 1).padStart(2, '0')) : '—'}</span>
                <AgentLogo slug={t.slug} size={24} />
                <div className="agent-meta">
                  <div className="agent-name">{t.name}</div>
                  <div className="agent-vendor">{t.vendor} · {t.model_id}</div>
                </div>
              </div>
              <div className={`td ${winnerSlugs.composite === t.slug ? 'winner' : ''}`}>
                {p ? p.composite.toFixed(3) : '—'}
              </div>
              <div className={`td ${winnerSlugs.correctness === t.slug ? 'winner' : ''}`}>
                {p ? p.correctness.toFixed(3) : '—'}
              </div>
              <div className={`td ${winnerSlugs.wall_clock_minutes === t.slug ? 'winner' : ''}`}>
                {p && p.wall_clock_minutes !== null ? `${p.wall_clock_minutes}m` : '—'}
              </div>
              <div className={`td ${winnerSlugs.cost_usd === t.slug ? 'winner' : ''}`}>
                {p && p.cost_usd !== null ? `$${p.cost_usd.toFixed(2)}` : '—'}
              </div>
              <div className="td">{t.points.length}/{totalPhases}</div>
              <div className="td bk-col">{bk ? bk.first_try : '—'}</div>
              <div className="td bk-col">{bk ? bk.solved_late : '—'}</div>
              <div className="td bk-col">{bk ? bk.never_solved : '—'}</div>
              <div className="td bk-col warn">{bk ? bk.regressions : '—'}</div>
            </div>
            );
          })}
        </div>
      </div>
      <div className="canvas-foot">
        <span>
          {hasAnyData
            ? 'Trajectory updates after each phase clears its TestSprite gate'
            : 'Phase 1 unlocks 2026-05-28 · trajectory chart populates as phases close'}
        </span>
        <span>
          <a
            href="https://github.com/TestSprite/CoderCup/tree/main/runs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download raw run data ↗
          </a>
        </span>
      </div>
    </section>
  );
}

// ─── Small-multiples chart ───────────────────────────────────────────────

type SMProps = {
  title: string;
  subtitle?: string;
  trajectories: Trajectory[];
  yKey: keyof Trajectory['chartPoints'][number];
  yMax: number;
  yTicks: number[];
  invert?: boolean;       // cost: lower = better, so flip the y-axis visually
  yLabelFmt?: (v: number) => string;
  empty: boolean;
  totalPhases: number;
};

function SmallMultiple({
  title,
  subtitle,
  trajectories,
  yKey,
  yMax,
  yTicks,
  invert,
  yLabelFmt,
  empty,
  totalPhases,
}: SMProps) {
  // SVG canvas: 260×140 viewBox; usable plot area x=28..246, y=18..118.
  const X0 = 28;
  const X1 = 246;
  const Y0 = 18;
  const Y1 = 118;

  const xForPhase = (phase: number) => {
    // evenly spaced positions across the actual phase count
    if (phase <= 1) return X0;
    if (phase >= totalPhases) return X1;
    return X0 + ((X1 - X0) * (phase - 1)) / (totalPhases - 1);
  };
  const yForValue = (v: number) => {
    const clamped = Math.max(0, Math.min(yMax, v));
    const pct = clamped / yMax;
    const inv = invert ? pct : 1 - pct;
    return Y0 + (Y1 - Y0) * inv;
  };

  return (
    <svg
      className="sm-chart"
      viewBox="0 0 260 140"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x={X0}
        y={12}
        fontFamily="Geist Mono, monospace"
        fontSize={9}
        fontWeight={500}
        fill="#141F15"
        letterSpacing="0.06em"
      >
        {title}
      </text>
      {subtitle && (
        <text
          x={X1}
          y={12}
          textAnchor="end"
          fontFamily="Geist Mono, monospace"
          fontSize={8}
          fill="#8E8D95"
        >
          {subtitle}
        </text>
      )}

      {/* Grid lines */}
      {yTicks.map((v) => {
        const y = yForValue(v);
        return (
          <line
            key={v}
            x1={X0}
            y1={y}
            x2={X1}
            y2={y}
            stroke="#EFEEEA"
            strokeWidth={0.6}
          />
        );
      })}
      {/* Y labels */}
      {yTicks.map((v) => {
        const y = yForValue(v);
        const lbl = yLabelFmt ? yLabelFmt(v) : v.toFixed(2);
        return (
          <text
            key={`l-${v}`}
            x={X0 - 4}
            y={y + 3}
            textAnchor="end"
            fontFamily="Geist Mono, monospace"
            fontSize={8}
            fill="#8E8D95"
          >
            {lbl}
          </text>
        );
      })}
      {/* X labels */}
      <text
        x={X0}
        y={136}
        fontFamily="Geist Mono, monospace"
        fontSize={8}
        fill="#8E8D95"
      >
        phase 1
      </text>
      <text
        x={X1}
        y={136}
        textAnchor="end"
        fontFamily="Geist Mono, monospace"
        fontSize={8}
        fill="#8E8D95"
      >
        phase {totalPhases}
      </text>

      {/* Polylines per agent. Skip points where the metric is null
          (e.g. wall_clock_minutes / cost_usd when telemetry was not
          captured this phase). */}
      {!empty &&
        trajectories.map((t) => {
          if (t.chartPoints.length === 0) return null;
          const drawablePoints = t.chartPoints
            .map((p) => ({ phase: p.phase, v: p[yKey] }))
            .filter((q): q is { phase: number; v: number } => typeof q.v === 'number');
          if (drawablePoints.length === 0) return null;
          const pts = drawablePoints
            .map((q) => `${xForPhase(q.phase).toFixed(1)},${yForValue(q.v).toFixed(1)}`)
            .join(' ');
          const last = drawablePoints[drawablePoints.length - 1];
          const lx = xForPhase(last.phase);
          const ly = yForValue(last.v);
          return (
            <g key={t.slug}>
              <polyline
                points={pts}
                fill="none"
                stroke={t.color}
                strokeWidth={1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={t.is_winner ? 1 : 0.85}
              />
              <circle cx={lx} cy={ly} r={2.5} fill={t.color} />
            </g>
          );
        })}

      {/* Empty-state overlay — either no data at all or every point is
          null for this metric (e.g. wall-clock + cost in Phase 1). */}
      {(empty ||
        trajectories.every((t) =>
          t.chartPoints.every((p) => typeof p[yKey] !== 'number'),
        )) && (
        <text
          x={137}
          y={72}
          textAnchor="middle"
          fontFamily="Geist Mono, monospace"
          fontSize={8.5}
          fill="#8E8D95"
        >
          {empty ? 'pending phase 1' : 'telemetry not captured'}
        </text>
      )}
    </svg>
  );
}
