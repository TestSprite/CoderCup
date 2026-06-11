'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { SiteFooter } from '../../components/SiteFooter';
import { AgentLogo } from '../../components/AgentLogo';
import { CDN_BASE, type AgentJson, type LeaderboardJson } from '../../lib/api';
import { TESTS, CATEGORY_META, PHASE1_SEO_OVERRIDE, planNameMatches, type TestEntry } from '../data';
import './test-detail.css';

type Verdict = 'passed' | 'failed' | 'inconclusive' | 'blocked' | undefined;

// One recorded step from the TestSprite agent trace, condensed in the fixture
// to drop presigned-URL bloat. `step` is the 1-indexed step ordinal.
type RecordedStep = {
  step?: number;
  action?: string | null;
  observation?: string | null;
  status?: string | null;
};

type AgentVerdict = {
  slug: string;
  name: string;
  vendor: string;
  model: string;
  verdict: Verdict;
  summary?: string;
  deployed_app_url?: string;
  // TestSprite-captured video for THIS agent's latest run of this plan.
  // Populated from per_test_verdicts[].video_url in the agent fixture, joined
  // by plan name. Null when no capture is available (rare — every completed
  // TestSprite run carries one).
  video_url: string | null;
  // TestSprite-emitted failure analysis. Populated from per_test_verdicts[]
  // fields seeded by `testsprite test result --include-analysis`.
  //  - error_message:        concise underlying-error line for failed runs
  //  - root_cause_hypothesis: TestSprite's diagnosis prose (may be truncated)
  //  - recommended_fix_target: actionable rationale string (where to look)
  //  - failure_kind:          assertion | routing_404 | etc — null when unknown
  //  - recorded_steps:        condensed agent trace, present for pass and fail
  error_message: string | null;
  root_cause_hypothesis: string | null;
  recommended_fix_target: string | null;
  failure_kind: string | null;
  recorded_steps: RecordedStep[] | null;
  // Per-PHASE cells for this plan, phase 1 → phase N. A verdict renders ONLY
  // where a recorded result exists — the plan's authoring phase, carrying its
  // latest TestSprite run. Later scored phases DID re-run the plan (suites are
  // cumulative) but the per-plan record isn't retained, so those columns are
  // an explicit not_retained gap rather than a carried-forward copy. Phases
  // before the plan existed are n/a; phases beyond the latest scored are
  // pending roadmap.
  phase_history: Array<{
    phase: number;
    phase_label: string;
    verdict: Verdict;
    // true when this column is a future / not-yet-run slot (greyed-out).
    pending: boolean;
    // true when the plan did not exist in this earlier phase (n/a, not a gap).
    not_applicable: boolean;
    // true when the phase was scored cumulatively but the per-plan verdict
    // record from that re-run wasn't retained (rendered as a dash).
    not_retained?: boolean;
  }>;
};

type LatestProbe = {
  test_id: string;
  name: string;
  video_url: string;
  target_url: string;
  target_agent_slug: string | null;
  finished_at: string | null;
};

type TestVideosCache = {
  schema_version: string;
  plans: Record<string, LatestProbe>;
};

// The v3.2 spec ships 9 feature-themed phases; 2 are scored so far. The
// history matrix shows one column PER PHASE (phase 1 … phase TOTAL_PHASES),
// with phases beyond the latest scored phase greyed-out as a roadmap. Read
// the latest scored phase from the data (runs[].phase) so the matrix grows
// automatically as phase 3+ land — TOTAL_PHASES only caps the roadmap tail.
const TOTAL_PHASES = 9;

// Vendor shortlabel for the .mini-lg in the history matrix.
const VENDOR_SHORT: Record<string, { key: string; label: string }> = {
  'claude-code': { key: 'anthropic', label: 'CC' },
  codex: { key: 'openai', label: 'OX' },
  antigravity: { key: 'google', label: 'AG' },
};

const VENDOR_VAR: Record<string, string> = {
  anthropic: 'var(--vendor-anthropic)',
  openai: 'var(--vendor-openai)',
  google: 'var(--vendor-google)',
};

function planSteps(planSource: unknown): Array<{ description: string; assertion?: string }> {
  if (!planSource || typeof planSource !== 'object') return [];
  const obj = planSource as Record<string, unknown>;
  const raw =
    (obj.steps as unknown) ||
    (obj.planSteps as unknown) ||
    (obj.actions as unknown);
  if (!Array.isArray(raw)) return [];
  return raw.map((s: unknown) => {
    if (typeof s === 'string') return { description: s };
    if (typeof s === 'object' && s !== null) {
      const ss = s as Record<string, unknown>;
      const desc =
        (ss.description as string) ||
        (ss.action as string) ||
        (ss.step as string) ||
        JSON.stringify(s);
      const assertion = (ss.assertion as string) || (ss.assert as string);
      return { description: desc, assertion };
    }
    return { description: String(s) };
  });
}

function renderInlineCode(text: string): JSX.Element[] {
  // Splits on `text` style backticks → renders <code> for fenced parts.
  const out: JSX.Element[] = [];
  const parts = text.split(/(`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      out.push(<code key={i}>{part.slice(1, -1)}</code>);
    } else {
      out.push(<span key={i}>{part}</span>);
    }
  });
  return out;
}

export function TestDetailClient({
  testId,
  planSource,
}: {
  testId: string;
  planSource: unknown;
}) {
  const plan = TESTS.find((t) => t.test_id === testId);
  const [agents, setAgents] = useState<AgentVerdict[]>([]);
  const [probe, setProbe] = useState<LatestProbe | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lb: LeaderboardJson = await fetch(`${CDN_BASE}/leaderboard.json`).then((r) =>
          r.json(),
        );
        const slugs = lb.rankings.map((r) => r.agent_slug);
        const list: AgentVerdict[] = await Promise.all(
          slugs.map(async (slug) => {
            const a: AgentJson = await fetch(`${CDN_BASE}/agents/${slug}.json`).then((r) =>
              r.json(),
            );
            // Walk runs[] oldest→newest for the history strip.
            const runs = [...a.runs].sort((x, y) => {
              const tx = x.started_at ? new Date(x.started_at).getTime() : 0;
              const ty = y.started_at ? new Date(y.started_at).getTime() : 0;
              return tx - ty;
            });
            // data.ts catalog uses deterministic 8-char hex `test_id`s for
            // routing while the agent JSONs carry the TestSprite-engine UUID
            // in `test_id`. The stable cross-key is the plan `name` — unique
            // within a phase catalog — so join verdicts on that. Note that
            // TestSprite truncates verdict.name at ~60 chars while data.ts
            // carries the full plan name, so we accept either side being a
            // prefix of the other (see planNameMatches in data.ts).
            const planName = plan?.name ?? null;
            const matchVerdict = (v: { test_id: string; name?: string }) =>
              planName ? planNameMatches(v.name, planName) : v.test_id.startsWith(testId);
            // A run is tagged with the phase it scored. Type RunSummary in
            // lib/api.ts doesn't yet declare `phase`, but every World-Cup
            // fixture carries it (1, 2, …), so read it via a local cast.
            const runPhase = (r: (typeof runs)[number]) =>
              (r as unknown as { phase?: number }).phase ?? null;
            // Latest scored phase = the highest phase any run covers. Phase
            // columns past this point read as a future roadmap.
            const latestScoredPhase = runs.reduce((mx, r) => {
              const p = runPhase(r);
              return p && p > mx ? p : mx;
            }, 0);
            // Phase-aware history. Suites re-run cumulatively (every scored
            // phase ≥ the plan's own phase re-fires the plan), but only the
            // plan's LATEST run is recorded in the fixtures — re-runs reuse
            // the same test id and overwrite. So the only honest cell is the
            // plan's authoring-phase column; later scored phases render as an
            // explicit not_retained gap instead of a carried-forward copy.
            const planPhase = plan?.phase ?? 1;
            const ownPhaseRun = runs.find((r) => runPhase(r) === planPhase);
            const ownVerdict = ownPhaseRun?.per_test_verdicts.find(matchVerdict)
              ?.verdict as Verdict;
            const columnCount = Math.max(TOTAL_PHASES, latestScoredPhase);
            const phase_history = Array.from({ length: columnCount }, (_, k) => {
              const ph = k + 1;
              const runForPh = runs.find((r) => runPhase(r) === ph);
              const phase_label =
                (runForPh as unknown as { phase_label?: string })?.phase_label ??
                `Phase ${ph}`;
              if (ph < planPhase) {
                return { phase: ph, phase_label, verdict: undefined as Verdict, pending: false, not_applicable: true };
              }
              if (ph <= latestScoredPhase) {
                if (ph === planPhase) {
                  return { phase: ph, phase_label, verdict: ownVerdict, pending: false, not_applicable: false };
                }
                // Re-run cumulatively in this phase, but the per-plan record
                // wasn't retained — an explicit gap, never a synthesized copy.
                return { phase: ph, phase_label, verdict: undefined as Verdict, pending: false, not_applicable: false, not_retained: true };
              }
              return { phase: ph, phase_label, verdict: undefined as Verdict, pending: true, not_applicable: false };
            });
            // Latest verdict (from any run, prefer newest). Also pulls the
            // per-agent video_url that landed in fixtures via the artifact-
            // pull pipeline — present on every completed TestSprite run.
            // Plus the failure-analysis fields seeded by
            // `testsprite test result --include-analysis` and the condensed
            // recorded_steps from `testsprite test steps`.
            type RawVerdict = {
              verdict: string;
              summary?: string;
              video_url?: string;
              error_message?: string;
              root_cause_hypothesis?: string;
              recommended_fix_target?: string;
              failure_kind?: string;
              recorded_steps?: RecordedStep[];
            };
            let latest: Verdict;
            let latestSummary: string | undefined;
            let latestVideoUrl: string | null = null;
            let latestErrorMessage: string | null = null;
            let latestHypothesis: string | null = null;
            let latestFixTarget: string | null = null;
            let latestFailureKind: string | null = null;
            let latestRecordedSteps: RecordedStep[] | null = null;
            for (let i = runs.length - 1; i >= 0; i--) {
              const v = runs[i].per_test_verdicts.find(matchVerdict);
              if (v) {
                const rv = v as unknown as RawVerdict;
                latest = rv.verdict as Verdict;
                latestSummary = rv.summary;
                latestVideoUrl = rv.video_url ?? null;
                latestErrorMessage = rv.error_message ?? null;
                latestHypothesis = rv.root_cause_hypothesis ?? null;
                latestFixTarget = rv.recommended_fix_target ?? null;
                latestFailureKind = rv.failure_kind ?? null;
                latestRecordedSteps =
                  Array.isArray(rv.recorded_steps) && rv.recorded_steps.length > 0
                    ? rv.recorded_steps
                    : null;
                break;
              }
            }
            return {
              slug,
              name: a.agent.name,
              vendor: a.agent.vendor,
              model: (a.agent as { model_id?: string }).model_id ?? '',
              verdict: latest,
              summary: latestSummary,
              deployed_app_url: runs[runs.length - 1]?.artifact.deployed_app_url,
              video_url: latestVideoUrl,
              error_message: latestErrorMessage,
              root_cause_hypothesis: latestHypothesis,
              recommended_fix_target: latestFixTarget,
              failure_kind: latestFailureKind,
              recorded_steps: latestRecordedSteps,
              phase_history,
            };
          }),
        );
        if (alive) setAgents(list);

        try {
          const videos: TestVideosCache = await fetch(`${CDN_BASE}/test-videos.json`).then(
            (r) => r.json(),
          );
          const p = videos.plans?.[testId];
          if (p && alive) setProbe(p);
        } catch {}
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [testId]);

  // Related plans — same category, exclude self, max 4.
  const related = useMemo(() => {
    if (!plan) return [] as TestEntry[];
    return TESTS.filter((t) => t.category === plan.category && t.test_id !== plan.test_id).slice(
      0,
      4,
    );
  }, [plan]);

  if (!plan) {
    return (
      <>
        <Nav active="tests" />
        <article className="plan-shell shell">
          <h1>Plan not found.</h1>
          <p>
            <Link href="/tests">← Back to the test suite</Link>
          </p>
        </article>
        <SiteFooter />
      </>
    );
  }

  const phaseCols = agents[0]?.phase_history ?? [];
  // Phases this plan actually participates in (its own phase + every later
  // scored phase). Drives the "graded across N phases" copy — counts only
  // phases with a recorded verdict for THIS plan (re-run gaps don't claim
  // a grade), not the full roadmap of pending columns.
  const gradedPhaseCount = phaseCols.filter(
    (h) => !h.pending && !h.not_applicable && !h.not_retained,
  ).length;
  // Phase-1 `seo` and Phase-2 `seo` share a catalog key but ship different
  // numbers of plans. CATEGORY_META.seo carries the phase-2 description by
  // default; swap to PHASE1_SEO_OVERRIDE when this plan is in phase 1.
  const rawCat = CATEGORY_META[plan.category];
  const cat =
    plan.category === 'seo' && plan.phase === 1 ? PHASE1_SEO_OVERRIDE : rawCat;
  const passed = agents.filter((a) => a.verdict === 'passed').length;
  const failed = agents.filter((a) => a.verdict === 'failed').length;
  const blocked = agents.filter((a) => a.verdict === 'blocked').length;
  const inconclusive = agents.length - passed - failed - blocked;
  const REPO_BASE = `https://github.com/TestSprite/CoderCup/blob/main/tests/world-cup-2026-v3/phase-${plan.phase}`;
  // Recorded plan-runs in the matrix — only cells carrying an actual verdict
  // count (not_retained re-run gaps don't claim a recorded run).
  const totalRuns = agents.reduce(
    (acc, a) =>
      acc +
      a.phase_history.filter(
        (h) => !h.pending && !h.not_applicable && !h.not_retained && h.verdict,
      ).length,
    0,
  );

  const titleNodes = renderInlineCode(plan.name);

  return (
    <>
      <Nav active="tests" />

      <article className="plan-shell shell">
        <nav className="crumb">
          <Link href="/tests">Tests</Link>
          <span className="sep">›</span>
          <span>world-cup-2026-v3 phase {plan.phase}</span>
          <span className="sep">›</span>
          <span>{plan.test_id}</span>
        </nav>

        <header className="plan-head">
          <div className="plan-id">
            Plan · {plan.test_id} · category: {plan.category}
          </div>
          <h1 className="plan-title">{titleNodes}</h1>
          {cat && <p className="plan-lede">{cat.description}</p>}
          <div className="plan-meta-row">
            {plan.priority && (
              <span className="pill">
                <span
                  className="dot"
                  style={{
                    background: plan.priority === 'p0' ? 'var(--negative)' : 'var(--ink-3)',
                  }}
                />
                {plan.priority.toUpperCase()} · CORRECTNESS
              </span>
            )}
            <span className="pill">CATEGORY · {plan.category.toUpperCase()}</span>
            <span className="pill">WORLD-CUP-2026-V3 · PHASE {plan.phase}</span>
            {gradedPhaseCount > 0 && (
              <span className="pill">
                GRADED IN {gradedPhaseCount} PHASE{gradedPhaseCount === 1 ? '' : 'S'} · {totalRuns} PLAN RUN{totalRuns === 1 ? '' : 'S'}
              </span>
            )}
          </div>
        </header>

        <div className="plan-body">
          {/* LEFT */}
          <div>
            {/* History matrix — one column per phase. A plan is part of the
                cumulative suite of every scored phase ≥ its own, so it shows
                its recorded verdict at its authoring phase; later scored
                phases show an explicit not-retained gap; phases beyond the
                latest scored read as a greyed roadmap. */}
            {phaseCols.length > 0 && agents.length > 0 && (
              <div className="card-block">
                <h2>
                  Verdict across phases{' '}
                  <span className="meta">
                    graded in {gradedPhaseCount} of {phaseCols.length} planned phases
                  </span>
                </h2>
                <div className="history-wrap">
                <div
                  className="history-head"
                  style={{ gridTemplateColumns: `128px repeat(${phaseCols.length}, minmax(24px, 1fr))` }}
                >
                  <div />
                  {phaseCols.map((h, i) => (
                    <div key={i} className={h.pending ? 'is-future' : h.not_applicable ? 'is-na' : ''}>
                      P{h.phase}
                    </div>
                  ))}
                </div>
                <div
                  className="history"
                  style={{ gridTemplateColumns: `128px repeat(${phaseCols.length}, minmax(24px, 1fr))` }}
                >
                  {agents.map((a) => {
                    const vs = VENDOR_SHORT[a.slug];
                    return (
                      <div key={a.slug} className="row">
                        <div className="label">
                          <span
                            className="mini-lg"
                            style={{ background: vs ? VENDOR_VAR[vs.key] : '#0A0A0C' }}
                          >
                            {vs?.label ?? a.slug.slice(0, 2).toUpperCase()}
                          </span>
                          {a.name}
                        </div>
                        {a.phase_history.map((h, i) => (
                          <div
                            key={i}
                            className={`cell ${
                              h.not_applicable
                                ? 'na'
                                : h.pending
                                ? 'pending'
                                : h.not_retained
                                ? 'nr'
                                : h.verdict === 'passed'
                                ? 'pass'
                                : h.verdict === 'failed'
                                ? 'fail'
                                : h.verdict === 'blocked'
                                ? 'blocked'
                                : 'inc'
                            }`}
                            title={
                              h.not_applicable
                                ? `${h.phase_label} · plan not in this phase`
                                : h.pending
                                ? `${h.phase_label} · not yet run`
                                : h.not_retained
                                ? `${h.phase_label} · re-run cumulatively; per-plan record not retained`
                                : `${h.phase_label} · ${h.verdict ?? 'no verdict'}`
                            }
                          >
                            {h.not_applicable
                              ? ''
                              : h.pending
                              ? ''
                              : h.not_retained
                              ? '–'
                              : h.verdict === 'passed'
                              ? '✓'
                              : h.verdict === 'failed'
                              ? '✗'
                              : h.verdict === 'blocked'
                              ? '⊘'
                              : '·'}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <p className="history-note">
                  Suites re-run cumulatively — every scored phase re-fires all
                  earlier plans against that phase&apos;s deploy. A plan&apos;s verdict is
                  recorded from its latest TestSprite run at its authoring phase;
                  per-phase re-run records aren&apos;t retained (–). Aggregate per-phase
                  results drive each agent&apos;s trajectory chart.
                </p>
                </div>
              </div>
            )}

            {/* Per-agent verdict accordions */}
            <div className="card-block">
              <h2>
                Verdicts · latest scored phase <span className="meta">{agents.length} agents</span>
              </h2>
              {agents.length === 0 ? (
                <div className="aside-row" style={{ padding: '20px 0' }}>
                  <span className="k">Loading verdicts…</span>
                </div>
              ) : (
                agents.map((a) => (
                  <AgentVerdictBlock
                    key={a.slug}
                    agent={a}
                    probe={probe}
                    collapsed={collapsed.has(a.slug)}
                    onToggle={() => {
                      const next = new Set(collapsed);
                      if (next.has(a.slug)) next.delete(a.slug);
                      else next.add(a.slug);
                      setCollapsed(next);
                    }}
                  />
                ))
              )}
              {agents.length > 0 && (
                <p className="history-note">
                  {passed} passed · {failed} failed
                  {blocked > 0 && <> · {blocked} blocked</>}
                  {inconclusive > 0 && <> · {inconclusive} inconclusive</>}{' '}
                  across the latest scored phase.
                </p>
              )}
            </div>
          </div>

          {/* RIGHT — sidebar */}
          <aside className="plan-aside">
            <div className="aside-block" style={{ padding: 0 }}>
              <h4 style={{ padding: '14px 18px 0' }}>
                Plan steps · {planSteps(planSource).length} ops
              </h4>
              <div className="steps" style={{ border: 'none', borderTop: '1px solid var(--line)', marginTop: 12 }}>
                {planSteps(planSource).map((s, i) => (
                  <div key={i} className="step">
                    <div className="n">{i + 1}</div>
                    <div className="body">
                      {renderInlineCode(s.description)}
                      {s.assertion && <span className="assertion">{s.assertion}</span>}
                    </div>
                  </div>
                ))}
                {planSteps(planSource).length === 0 && (
                  <div className="step">
                    <div className="n">—</div>
                    <div className="body">
                      Plan JSON loading. View raw on GitHub for the full step list.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="aside-block">
              <h4>Plan metadata</h4>
              <div className="aside-row">
                <span className="k">Plan id</span>
                <span className="v">{plan.test_id}</span>
              </div>
              <div className="aside-row">
                <span className="k">Suite</span>
                <span className="v">world-cup-2026-v3 phase {plan.phase}</span>
              </div>
              <div className="aside-row">
                <span className="k">Category</span>
                <span className="v">{cat?.weight?.split(' · ')[0] ?? plan.category}</span>
              </div>
              {plan.priority && (
                <div className="aside-row">
                  <span className="k">Priority</span>
                  <span
                    className="v"
                    style={{
                      color: plan.priority === 'p0' ? 'var(--negative)' : undefined,
                    }}
                  >
                    {plan.priority.toUpperCase()}
                  </span>
                </div>
              )}
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a
                  href={`${REPO_BASE}/${plan.path}`}
                  className="btn btn-ghost btn-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ justifyContent: 'center' }}
                >
                  View plan JSON ↗
                </a>
              </div>
            </div>

            {related.length > 0 && (
              <div className="aside-block">
                <h4>Related plans · same category</h4>
                <div className="related">
                  {related.map((r) => (
                    <Link key={r.test_id} href={`/tests/${r.test_id}`}>
                      <span className="rid">{r.test_id}</span>
                      <span className="rname">{r.name}</span>
                      <span className="rverdict">
                        {agents.map((a) => {
                          // NOTE: this strip is decorative — it cannot show the
                          // RELATED plan's own verdicts because the effect only
                          // fetches the current plan's join. We surface the
                          // agent's latest graded verdict on the current plan as
                          // a per-agent legend, not a per-related-plan result.
                          const v = a.phase_history
                            .slice()
                            .reverse()
                            .find((h) => !h.pending && !h.not_applicable && h.verdict)?.verdict;
                          return (
                            <span
                              key={a.slug}
                              className={`vdot ${
                                v === 'passed'
                                  ? 'pass'
                                  : v === 'failed'
                                  ? 'fail'
                                  : v === 'blocked'
                                  ? 'blocked'
                                  : 'inc'
                              }`}
                            />
                          );
                        })}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </article>

      <SiteFooter />
    </>
  );
}

function AgentVerdictBlock({
  agent,
  probe,
  collapsed,
  onToggle,
}: {
  agent: AgentVerdict;
  probe: LatestProbe | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const v = agent.verdict;
  const klass = v === 'passed' ? 'is-pass' : v === 'failed' ? 'is-fail' : v === 'blocked' ? 'is-blocked' : '';
  const statKlass =
    v === 'passed' ? 'pass' : v === 'failed' ? 'fail' : v === 'blocked' ? 'blocked' : 'inc';
  // How many scored phases this plan was graded in (its own phase carried
  // Used in the "across N phases" copy below — counts only phases carrying
  // a recorded verdict; phase_history is the source of truth.
  const gradedPhaseCount = agent.phase_history.filter(
    (h) => !h.pending && !h.not_applicable && !h.not_retained,
  ).length;
  // Prefer the per-verdict video_url that the artifact-pull pipeline lands in
  // each agent's fixture (1 video per (agent, plan)). Fall back to the legacy
  // test-videos.json probe, which historically only surfaced ONE agent per
  // test — that's the source of the "Per-agent capture pending" copy below.
  const perVerdictVideo = agent.video_url;
  const probeVideo = probe && probe.target_agent_slug === agent.slug ? probe : null;
  const videoUrl = perVerdictVideo ?? probeVideo?.video_url ?? null;
  // Caption: when we use the fixture URL we don't have a separate target_url
  // record, so anchor on the agent's deployed_app_url instead.
  const captionHost = perVerdictVideo
    ? agent.deployed_app_url
      ? new URL(agent.deployed_app_url).hostname
      : null
    : probeVideo
    ? new URL(probeVideo.target_url).hostname
    : null;
  const captionDate = probeVideo?.finished_at ?? null;

  return (
    <div className={`agent-verdict ${klass} ${collapsed ? 'collapsed' : ''}`}>
      <div className="agent-verdict-head" onClick={onToggle}>
        <AgentLogo slug={agent.slug} size={26} />
        <div className="head-meta">
          <div className="name">{agent.name}</div>
          <div className="vendor">
            {agent.vendor}
            {agent.model ? ` · ${agent.model}` : ''}
          </div>
        </div>
        <span className="duration">{/* per-plan duration not captured yet */}</span>
        <span className={`stat ${statKlass}`}>
          <span className="dot" />
          {v ? v.charAt(0).toUpperCase() + v.slice(1) : 'No verdict'}
        </span>
      </div>
      <div className="agent-verdict-body">
        <div className="test-recording">
          {videoUrl ? (
            <>
              <video
                src={videoUrl}
                controls
                preload="metadata"
                playsInline
              />
              <p className="video-caption">
                TestSprite headless Chrome capture
                {captionHost && ` · target ${captionHost}`}
                {captionDate && ` · ${new Date(captionDate).toLocaleDateString()}`}
              </p>
            </>
          ) : (
            <div className="test-recording pending">
              <span className="dot" />
              Per-agent capture pending — TestSprite CLI only surfaces the latest run today,
              {agent.deployed_app_url && (
                <>
                  {' '}target was{' '}
                  <a
                    href={agent.deployed_app_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {new URL(agent.deployed_app_url).hostname}
                  </a>
                </>
              )}
              .
            </div>
          )}
        </div>
        {(v === 'failed' || v === 'blocked') && (
          <FailedReasoning agent={agent} verdict={v} />
        )}
        {v === 'passed' && agent.deployed_app_url && (
          <>
            <h3>Deployed artifact</h3>
            <div className="reasoning">
              Probe target:{' '}
              <a
                href={agent.deployed_app_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {new URL(agent.deployed_app_url).hostname}
              </a>{' '}
              · returned the expected response across{' '}
              {gradedPhaseCount > 1
                ? `all ${gradedPhaseCount} graded phases`
                : 'the graded phase'}
              .
            </div>
          </>
        )}
        {agent.recorded_steps && agent.recorded_steps.length > 0 && (
          <RecordedStepsList steps={agent.recorded_steps} verdict={v} />
        )}
      </div>
    </div>
  );
}

// Renders TestSprite's per-failure analysis: underlying error, root-cause
// hypothesis, recommended-fix rationale, and a failure-kind tag. Each block
// is independently gated — if a field is absent (which happens for a small
// minority of failed runs, esp. ones that got the `blocked` status before
// analysis ran), that block is silently dropped. Falls back to the legacy
// per-verdict `summary` line when no analysis fields are present at all.
function FailedReasoning({ agent, verdict }: { agent: AgentVerdict; verdict: Verdict }) {
  // `blocked` means TestSprite couldn't reach a definitive pass/fail (e.g. the
  // host returned an SPA fallback that hid response headers) — the same
  // analysis fields apply, so we reuse this block with blocked-aware framing.
  const isBlocked = verdict === 'blocked';
  const heading = isBlocked ? 'Blocked — diagnostics' : 'Failure analysis';
  const hasAnalysis =
    !!agent.error_message ||
    !!agent.root_cause_hypothesis ||
    !!agent.recommended_fix_target ||
    !!agent.failure_kind;
  if (!hasAnalysis) {
    if (!agent.summary) return null;
    return (
      <>
        <h3>{isBlocked ? 'Status' : 'Reasoning'}</h3>
        <div className="reasoning fail">{agent.summary}</div>
      </>
    );
  }
  return (
    <>
      <h3>
        {heading}
        {agent.failure_kind && (
          <span className="reasoning-tag">{agent.failure_kind.replace(/_/g, ' ')}</span>
        )}
      </h3>
      {agent.error_message && (
        <div className="reasoning-row">
          <div className="reasoning-row-label">Error</div>
          <div className="reasoning fail">{agent.error_message}</div>
        </div>
      )}
      {agent.root_cause_hypothesis && (
        <div className="reasoning-row">
          <div className="reasoning-row-label">Root cause hypothesis</div>
          <div className="reasoning">{agent.root_cause_hypothesis}</div>
        </div>
      )}
      {agent.recommended_fix_target && (
        <div className="reasoning-row">
          <div className="reasoning-row-label">Recommended fix target</div>
          <div className="reasoning">{agent.recommended_fix_target}</div>
        </div>
      )}
    </>
  );
}

// Compact agent trace — one row per recorded step. We render this for BOTH
// passed (audit trail: "what did the agent actually see?") and failed (where
// did the run break?) cases. Server returns up to ~6 steps with action +
// description + status; we don't truncate further but the box itself caps
// height so long traces scroll.
function RecordedStepsList({
  steps,
  verdict,
}: {
  steps: RecordedStep[];
  verdict: Verdict;
}) {
  return (
    <>
      <h3>
        Recorded steps
        <span className="reasoning-tag soft">{steps.length} ops</span>
      </h3>
      <ol className="recorded-steps">
        {steps.map((s, i) => {
          const stat = s.status || (verdict === 'failed' && i === steps.length - 1 ? 'failed' : 'passed');
          const statClass =
            stat === 'failed' ? 'fail' : stat === 'passed' ? 'pass' : 'inc';
          return (
            <li key={i} className={`rs-row ${statClass}`}>
              <div className="rs-n">{s.step ?? i + 1}</div>
              <div className="rs-body">
                {s.action && <span className="rs-action">{s.action}</span>}
                {s.observation && <span className="rs-obs">{s.observation}</span>}
              </div>
              <div className="rs-stat">
                {stat === 'failed' ? '✗' : stat === 'passed' ? '✓' : '·'}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
