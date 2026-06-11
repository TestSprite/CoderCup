'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAgent, useLeaderboard } from '../../lib/hooks';
import { Nav } from '../../components/Nav';
import { SiteFooter } from '../../components/SiteFooter';
import { TranscriptEmbed } from '../../components/TranscriptEmbed';
import { AgentLogo } from '../../components/AgentLogo';
import type { AgentJson, RunSummary, LeaderboardRow } from '../../lib/api';
import { CDN_BASE } from '../../lib/api';
import './agent.css';

interface Props {
  slug: string;
}

export function AgentDetailClient({ slug }: Props) {
  const { data, error, isLoading } = useAgent(slug);
  const { data: lb } = useLeaderboard();

  return (
    <>
      <Nav active="agents" />
      <div className="shell">
        <div className="breadcrumb">
          <Link href="/">Leaderboard</Link>
          <Chevron />
          <Link href="/#agents">Agents</Link>
          <Chevron />
          <span style={{ color: 'var(--ink)' }}>
            {data?.agent.name ?? toTitle(slug)}
          </span>
        </div>

        {isLoading && (
          <p style={{ padding: '48px 0', color: 'var(--ink-3)' }}>
            Loading {slug}…
          </p>
        )}
        {!isLoading && (error || !data) && (
          <p style={{ padding: '48px 0', color: 'var(--ink-3)' }}>
            No data yet for {slug}.
          </p>
        )}
        {data && data.runs.length === 0 && (
          <p style={{ padding: '48px 0', color: 'var(--ink-3)' }}>
            {data.agent.name} has no runs yet for the current event.
          </p>
        )}
        {data && data.runs.length > 0 && (
          <AgentBody
            agent={data}
            rank={lb?.rankings.find((r) => r.agent_slug === slug)?.rank ?? null}
            cohortSize={lb?.rankings.length ?? 3}
            acm={lb?.rankings.find((r) => r.agent_slug === slug)?.acm_breakdown}
          />
        )}
      </div>
      <SiteFooter />
    </>
  );
}

type AcmBreakdown = NonNullable<LeaderboardRow['acm_breakdown']>;

function AgentBody({
  agent,
  rank,
  cohortSize,
  acm,
}: {
  agent: AgentJson;
  rank: number | null;
  cohortSize: number;
  acm?: AcmBreakdown;
}) {
  // Single-profile view of the LATEST phase. Sort by phase number desc — NOT
  // started_at: the fixtures stamp every run with the same started_at, so a
  // timestamp sort ties and falls back to phase 1, which made the headline show
  // phase-1 numbers (e.g. antigravity's 0.000). Phase number is the real order.
  const phaseOf = (r: typeof agent.runs[number]) =>
    (r as { phase?: number }).phase ??
    Number(String(r.run_id).match(/phase-?(\d+)/)?.[1] ?? 0);
  const runs = [...agent.runs].sort((a, b) => {
    const dp = phaseOf(b) - phaseOf(a);
    if (dp !== 0) return dp;
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    return tb - ta;
  });
  const headline = runs[0];
  const taskSlug = headline.task_slug ?? 'world-cup-2026-v3';

  return (
    <>
      <Identity agent={agent} run={headline} rank={rank} cohortSize={cohortSize} taskSlug={taskSlug} />
      <Breakdown run={headline} acm={acm} />
      <Sides run={headline} runs={runs} />
      <Runs runs={runs} taskSlug={taskSlug} />
      {headline.transcript_inline && <Transcript run={headline} />}
      {headline.artifact.deployed_app_url && <Deployed run={headline} agentName={agent.agent.name} />}
    </>
  );
}

function Identity({
  agent,
  run,
  rank,
  cohortSize,
  taskSlug,
}: {
  agent: AgentJson;
  run: RunSummary;
  rank: number | null;
  cohortSize: number;
  taskSlug: string;
}) {
  const slug = agent.agent.slug;
  const modelId = run.driver_metadata?.model_id ?? '—';
  const lifetimeBugs = agent.runs.reduce(
    (acc, r) => acc + (r.score.side_metrics.raw.bugs_caught_this_task ?? 0),
    0,
  );
  const phaseLabel = (run as RunSummary & { phase_label?: string; phase?: number }).phase_label
    ?? (typeof (run as RunSummary & { phase?: number }).phase === 'number'
      ? `Phase ${(run as RunSummary & { phase?: number }).phase}`
      : null);

  return (
    <section className="identity">
      <div className="identity-left">
        <AgentLogo slug={slug} size={64} className="identity-logo" />
        <div>
          <h1>{agent.agent.name}</h1>
          <div className="vendor">
            {agent.agent.vendor} · {modelId} · driver type {agent.agent.driver_type}
          </div>
          <div className="meta">
            <span className="pill success">
              <span className="dot" />
              READY · DRIVER LIVE
            </span>
            <span className="pill">{lifetimeBugs} LIFETIME BUGS</span>
            {phaseLabel && <span className="pill">LATEST · {phaseLabel.toUpperCase()}</span>}
          </div>
        </div>
      </div>
      <div className="identity-right">
        <div className="label">Composite · {run.run_id}</div>
        <div className="big">{run.score.composite.toFixed(3)}</div>
        <div className="rank-strip">
          <span className="rank-num">
            RANK {rank ? String(rank).padStart(2, '0') : '—'}
          </span>
          <span>
            of {cohortSize} agents · {taskSlug}
          </span>
        </div>
      </div>
    </section>
  );
}

function Breakdown({ run, acm }: { run: RunSummary; acm?: AcmBreakdown }) {
  const c = run.score.components;
  const verdicts = run.per_test_verdicts;
  const passing = verdicts.filter((v) => v.verdict === 'passed').length;
  const failing = verdicts.filter((v) => v.verdict === 'failed');
  const inconclusive = verdicts.filter(
    (v) => v.verdict !== 'passed' && v.verdict !== 'failed',
  ).length;
  const definite = passing + failing.length;
  const raw = run.score.side_metrics.raw;
  const tokens = raw.tokens_total ?? 0;
  const usd = raw.usd_spent_this_task ?? 0;
  const wallClock = raw.wall_clock_minutes ?? 0;
  const iters = raw.iterations ?? 0;
  const hasCostTelemetry = tokens > 0 || usd > 0;
  const hasWallClock = wallClock > 0;
  const blendedRate = tokens > 0 ? usd / (tokens / 1000) : 0;
  const composite = run.score.composite;

  return (
    <section className="breakdown">
      <div className="section-tag" style={{ marginBottom: 20 }}>
        Score breakdown
      </div>
      <div className="breakdown-grid">
        <SubCard
          name="Composite"
          weight="quality blend"
          value={composite}
          headline="A pure-quality score blending five outcome lenses, cumulative through this phase."
        >
          <span className="mono" style={{ fontSize: 11 }}>
            0.35·correctness + 0.25·first-try + 0.20·(1−regression) + 0.10·(1−never) + 0.10·ACM
          </span>
          . Quality only — <strong>wall-clock and cost are reported separately</strong> and
          are <em>not</em> blended in (industry Pareto convention). ACM here is the
          decay-weighted contest lens (first-try=full,{' '}
          <span className="mono" style={{ fontSize: 11 }}>×max(0.4, 1−0.25k)</span> k phases
          late, 0 if never solved or left regressed); it contributes the graded
          convergence-over-phases signal.
        </SubCard>
        <SubCard
          name="Correctness"
          weight="separate"
          value={c.correctness}
          headline={
            definite > 0
              ? `${passing} of ${definite} TestSprite verdicts pass${
                  inconclusive > 0 ? ` (${inconclusive} inconclusive)` : ''
                }.`
              : verdicts.length > 0
                ? `All ${verdicts.length} verdicts inconclusive.`
                : 'No verdict yet.'
          }
        >
          Cumulative weighted pass-rate across every plan seen through this
          phase — a separate metric from the composite, not a weighted input.
          {failing.length > 0 ? (
            <>
              {' '}Failing:{' '}
              {failing.slice(0, 4).map((v, i) => (
                <span key={v.test_id}>
                  {i > 0 ? ', ' : ''}
                  <span className="mono" style={{ fontSize: 11 }}>
                    {v.name || v.test_id}
                  </span>
                </span>
              ))}
              {failing.length > 4 && (
                <span style={{ color: 'var(--ink-3)' }}>
                  {' '}
                  · +{failing.length - 4} more
                </span>
              )}
              .
            </>
          ) : (
            <> All tests in the suite passed against the deployed app.</>
          )}
        </SubCard>
        <div className="sub-card">
          <div className="name">
            <span>Side metrics</span>
            <span className="weight">not scored</span>
          </div>
          <div className="value num" style={{ fontSize: 30 }}>
            {hasWallClock ? formatWallClock(wallClock) : '—'}
            <span style={{ color: 'var(--ink-3)', fontSize: 18 }}>{' · '}</span>
            {hasCostTelemetry ? `$${usd.toFixed(2)}` : '—'}
          </div>
          <div className="bar bar-empty" aria-hidden />
          <h3>Raw wall-clock and imputed cost.</h3>
          <p>
            {hasWallClock
              ? `${wallClock} minute${wallClock === 1 ? '' : 's'} from session start to the phase-ready gate. `
              : 'Wall-clock telemetry not captured this run. '}
            {hasCostTelemetry ? (
              <>
                {formatTokens(tokens)} tokens at ${blendedRate.toFixed(3)}/k
                blended rate across {iters} iteration{iters === 1 ? '' : 's'}.
              </>
            ) : (
              <>Cost / token telemetry not captured this run.</>
            )}{' '}
            Both are raw side-metrics — neither feeds the composite.
          </p>
        </div>
      </div>

      {acm && (
        <div className="acm-grid">
          <AcmStat label="First-try" value={acm.first_try} total={acm.total_plans} accent />
          <AcmStat label="Solved late" value={acm.solved_late} total={acm.total_plans} />
          <AcmStat label="Never solved" value={acm.never_solved} total={acm.total_plans} />
          <AcmStat label="Regressions" value={acm.regressions} total={acm.total_plans} />
        </div>
      )}
    </section>
  );
}

function AcmStat({
  label,
  value,
  total,
  accent = false,
}: {
  label: string;
  value: number;
  total: number;
  accent?: boolean;
}) {
  return (
    <div className="acm-stat">
      <div className="acm-stat-label">{label}</div>
      <div className="acm-stat-value" style={accent ? { color: 'var(--accent)' } : undefined}>
        {value}
        <span className="acm-stat-total">/ {total}</span>
      </div>
    </div>
  );
}

function SubCard({
  name,
  weight,
  value,
  headline,
  children,
}: {
  name: string;
  weight: string;
  value: number;
  headline: string;
  children: React.ReactNode;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="sub-card">
      <div className="name">
        <span>{name}</span>
        <span className="weight">{weight}</span>
      </div>
      <div className="value num">{value.toFixed(3)}</div>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <h3>{headline}</h3>
      <p>{children}</p>
    </div>
  );
}

/** Variant of SubCard that surfaces a RAW value (minutes / USD) instead
 *  of a 0-1 score with a progress bar. Used for wall-clock + cost. */
function RawCard({
  name,
  weight,
  display,
  headline,
  children,
}: {
  name: string;
  weight: string;
  display: string;
  headline: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sub-card">
      <div className="name">
        <span>{name}</span>
        <span className="weight">{weight}</span>
      </div>
      <div className="value num">{display}</div>
      <div className="bar bar-empty" aria-hidden />
      <h3>{headline}</h3>
      <p>{children}</p>
    </div>
  );
}

function Sides({ run, runs }: { run: RunSummary; runs: RunSummary[] }) {
  const raw = run.score.side_metrics.raw;
  const dm = run.driver_metadata ?? {};
  const usd = raw.usd_spent_this_task ?? 0;
  const tokens = raw.tokens_total ?? 0;
  const prompt = (dm as { prompt_tokens?: number }).prompt_tokens ?? 0;
  const completion = (dm as { completion_tokens?: number }).completion_tokens ?? 0;
  const calls = (dm as { tool_calls?: number }).tool_calls ?? 0;
  const hasCostTelemetry = tokens > 0 || usd > 0;
  const blended = tokens > 0 ? usd / (tokens / 1000) : 0;

  return (
    <section className="sides">
      <div className="section-tag" style={{ marginBottom: 20 }}>
        Side metrics · not in composite
      </div>
      <div className="sides-grid">
        <CompositeTrajectory runs={runs} />

        <div className="chart-card">
          <div className="head">
            <div>
              <h3>Imputed cost</h3>
              <div className="desc">Tokens × uniform rate · cross-vendor</div>
            </div>
            <div className="summary">
              <div className="num" style={!hasCostTelemetry ? { color: 'var(--ink-3)' } : undefined}>
                {hasCostTelemetry ? `$${usd.toFixed(2)}` : '—'}
              </div>
              <div className="delta" style={{ color: 'var(--ink-3)' }}>
                {hasCostTelemetry ? `${formatTokens(tokens)} tokens` : 'telemetry pending (iteration 3)'}
              </div>
            </div>
          </div>
          <div className="cost-rows">
            <CostRow k="Prompt tokens" v={prompt > 0 ? prompt.toLocaleString() : '—'} />
            <CostRow k="Completion tokens" v={completion > 0 ? completion.toLocaleString() : '—'} />
            <CostRow k="Tool calls" v={calls > 0 ? calls.toLocaleString() : '—'} />
            <CostRow k="Blended rate" v={hasCostTelemetry ? `$${blended.toFixed(4)}/k` : '—'} />
            <CostRow k="Imputed total" v={hasCostTelemetry ? `$${usd.toFixed(2)}` : '—'} total />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Real per-phase correctness sparkline. Sorts runs by phase ascending and
 *  plots run.score.components.correctness (0..1) across phases 1..N. Composite
 *  tends to be near-flat across phases, so we surface raw correctness — the
 *  metric that actually moves. Points whose correctness is missing/non-finite
 *  are skipped. */
function CompositeTrajectory({ runs }: { runs: RunSummary[] }) {
  const phaseOf = (r: RunSummary) =>
    (r as RunSummary & { phase?: number }).phase ??
    Number(String(r.run_id).match(/phase-?(\d+)/)?.[1] ?? 0);

  const points = [...runs]
    .sort((a, b) => phaseOf(a) - phaseOf(b))
    .map((r) => ({ phase: phaseOf(r), composite: r.score.components?.correctness }))
    .filter((p) => Number.isFinite(p.composite));

  const n = points.length;
  const W = 720;
  const H = 200;
  const padX = 8;
  const padY = 24;
  const x = (i: number) =>
    n <= 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1);
  const y = (v: number) =>
    H - padY - Math.max(0, Math.min(1, v)) * (H - 2 * padY);

  const latest = points[n - 1]?.composite;
  const first = points[0]?.composite;
  const delta = n >= 2 && first !== undefined && latest !== undefined
    ? latest - first
    : null;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.composite)}`).join(' ');
  const areaPath = n >= 1
    ? `${linePath} L${x(n - 1)},${H} L${x(0)},${H} Z`
    : '';

  return (
    <div className="chart-card">
      <div className="head">
        <div>
          <h3>Correctness trajectory</h3>
          <div className="desc">
            Priority-weighted correctness per phase · {n} phase{n === 1 ? '' : 's'} scored
          </div>
        </div>
        <div className="summary">
          <div className="num" style={latest === undefined ? { color: 'var(--ink-3)' } : undefined}>
            {latest !== undefined ? latest.toFixed(3) : '—'}
          </div>
          <div
            className="delta"
            style={{
              color:
                delta === null
                  ? 'var(--ink-3)'
                  : delta >= 0
                    ? 'var(--positive)'
                    : 'var(--negative, #B91C1C)',
            }}
          >
            {delta === null
              ? 'latest phase'
              : `${delta >= 0 ? '+' : ''}${delta.toFixed(3)} vs phase ${points[0].phase}`}
          </div>
        </div>
      </div>
      {n === 0 ? (
        <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          No scored phases yet.
        </div>
      ) : (
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#15803D" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#15803D" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g stroke="#E8E8E8" strokeWidth="1">
            <line x1="0" y1="40" x2={W} y2="40" />
            <line x1="0" y1="80" x2={W} y2="80" />
            <line x1="0" y1="120" x2={W} y2="120" />
            <line x1="0" y1="160" x2={W} y2="160" />
          </g>
          {areaPath && <path d={areaPath} fill="url(#g1)" />}
          <path
            d={linePath}
            fill="none"
            stroke="#15803D"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <g fill="#15803D">
            {points.map((p, i) => (
              <circle
                key={p.phase}
                cx={x(i)}
                cy={y(p.composite)}
                r={i === n - 1 ? 3.5 : 2.5}
                stroke={i === n - 1 ? '#fff' : undefined}
                strokeWidth={i === n - 1 ? 2 : undefined}
              />
            ))}
          </g>
          <g fill="#8E8E8E" fontFamily="Geist Mono" fontSize="9">
            <text x="0" y="190">phase {points[0].phase}</text>
            {n > 1 && (
              <text x={W} y="190" textAnchor="end">
                phase {points[n - 1].phase}
              </text>
            )}
          </g>
        </svg>
      )}
    </div>
  );
}

function CostRow({ k, v, total = false }: { k: string; v: string; total?: boolean }) {
  return (
    <div className={`cost-row${total ? ' total' : ''}`}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function Runs({ runs, taskSlug }: { runs: RunSummary[]; taskSlug: string }) {
  return (
    <section className="runs">
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'end',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div className="section-tag">Run history</div>
          <h2
            style={{
              fontSize: 24,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              fontWeight: 500,
              margin: '6px 0 0',
            }}
          >
            All runs against {taskSlug}
          </h2>
        </div>
        <span className="pill">
          <span className="mono">
            {runs.length} RUN{runs.length === 1 ? '' : 'S'}
          </span>
        </span>
      </div>

      <div className="runs-table">
        <div className="runs-row head">
          <div>#</div>
          <div>Started</div>
          <div>Run</div>
          <div>Tokens</div>
          <div>Cost</div>
          <div>Status</div>
          <div style={{ textAlign: 'right' }}>Composite</div>
        </div>
        {runs.map((r, i) => (
          <RunRow key={r.run_id} index={runs.length - i} run={r} highlight={i === 0} />
        ))}
      </div>
    </section>
  );
}

function RunRow({
  index,
  run,
  highlight,
}: {
  index: number;
  run: RunSummary;
  highlight: boolean;
}) {
  const started = run.started_at
    ? new Date(run.started_at).toISOString().slice(0, 16).replace('T', ' ')
    : '—';
  const raw = run.score.side_metrics.raw;
  const usd = raw.usd_spent_this_task ?? 0;
  const tokens = raw.tokens_total ?? 0;
  const wall = raw.wall_clock_minutes ?? 0;
  const status = run.status;
  const isOk = status === 'completed';
  const pillClass = isOk
    ? 'pill success'
    : status === 'time_budget_exceeded'
      ? 'pill warning'
      : 'pill';

  return (
    <div className="runs-row">
      <div className="id">R{index.toString().padStart(2, '0')}</div>
      <div className="when">{started}</div>
      <div className="label-row">
        {(run as RunSummary & { phase_label?: string }).phase_label ?? run.run_id}
        <small>
          {(run as RunSummary & { phase_label?: string }).phase_label
            ? `${run.run_id} · `
            : ''}
          {run.artifact.commit_sha ? `commit ${run.artifact.commit_sha.slice(0, 7)} · ` : ''}
          {formatTokens(tokens)} tok · {formatWallClock(wall)}
        </small>
      </div>
      <div className="mono-cell">{formatTokens(tokens)}</div>
      <div className="mono-cell">${usd.toFixed(2)}</div>
      <div>
        <span className={pillClass}>
          <span className="dot" />
          <span className="mono" style={{ fontSize: 10 }}>
            {status.toUpperCase().replace(/_/g, ' ')}
          </span>
        </span>
      </div>
      <div className="comp" style={highlight ? { color: 'var(--accent)' } : undefined}>
        {run.score.composite.toFixed(3)}
      </div>
    </div>
  );
}

function Transcript({ run }: { run: RunSummary }) {
  return (
    <section className="transcript">
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'end',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div className="section-tag">Transcript · {run.run_id}</div>
          <h2
            style={{
              fontSize: 24,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              fontWeight: 500,
              margin: '6px 0 0',
            }}
          >
            The moment the agent worked the spec
          </h2>
        </div>
        <a
          href={run.artifact.repo_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          View full transcript →
        </a>
      </div>
      <TranscriptEmbed
        markdown={run.transcript_inline ?? ''}
        truncated={run.transcript_truncated}
        repoUrl={run.artifact.repo_url}
      />
    </section>
  );
}

function Deployed({ run, agentName }: { run: RunSummary; agentName: string }) {
  const url = run.artifact.deployed_app_url;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const [errored, setErrored] = useState(false);

  return (
    <section className="deploy">
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'end',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div className="section-tag">Deployed artifact</div>
          <h2
            style={{
              fontSize: 24,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              fontWeight: 500,
              margin: '6px 0 0',
            }}
          >
            What {agentName} shipped
          </h2>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm"
        >
          Open deployed app ↗
        </a>
      </div>
      <div className="deploy-card">
        <div className="deploy-bar">
          <div className="url">{host}</div>
          <a
            href={run.artifact.repo_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            View source repo →
          </a>
        </div>
        <div className="deploy-content">
          {errored ? (
            <div className="deploy-fake" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                Preview not captured yet
              </div>
              <div style={{ fontSize: 13 }}>
                The deployed app is live at {host} — open it to see what {agentName} shipped.
              </div>
            </div>
          ) : (
            <img
              src={`${CDN_BASE.replace(/\/fixtures$/, '')}/runs/${run.run_id}/preview.png`}
              alt={`Preview of ${run.run_id} deployed at ${host}`}
              loading="lazy"
              onError={() => setErrored(true)}
              style={{
                maxWidth: '80%',
                maxHeight: '320px',
                boxShadow: '0 20px 40px -20px rgba(0,0,0,0.1)',
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function toTitle(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString()}k`;
  return n.toString();
}

function formatWallClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
