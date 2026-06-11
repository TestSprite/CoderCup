'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../components/Nav';
import { SiteFooter } from '../components/SiteFooter';
import {
  CATEGORY_META,
  PHASE_META,
  PHASE1_SEO_OVERRIDE,
  TESTS,
  groupByPhaseAndCategory,
  planNameMatches,
  type Phase,
  type TestEntry,
} from './data';
import { CDN_BASE, type AgentJson } from '../lib/api';
import { AgentLogo } from '../components/AgentLogo';
import './tests.css';

const KNOWN_AGENT_SLUGS = ['antigravity', 'codex', 'claude-code', 'kimi'];

// VerdictMap[planTestId][agentSlug] = verdict — keyed by test_id (stable
// across phases) so the rendering loop doesn't have to know about plan-name
// truncation.
type VerdictMap = Record<string, Record<string, string>>;

type VerdictFilter = 'all' | 'passed' | 'failed' | 'blocked' | 'inconclusive';
type PhaseFilter = 'all' | Phase;

export function TestsClient() {
  // Render by phase first, then by category within each phase. This way
  // adding phase-3 just means adding entries to TESTS — the page picks
  // them up automatically.
  const phaseGroups = groupByPhaseAndCategory();
  const [verdicts, setVerdicts] = useState<VerdictMap>({});
  const [agentSlugs, setAgentSlugs] = useState<string[]>([]);
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all');
  const [activeAgent, setActiveAgent] = useState<string | 'all'>('all');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Try to discover agents via leaderboard.json; fall back to known list.
        let slugs = KNOWN_AGENT_SLUGS;
        try {
          const lb = await fetch(`${CDN_BASE}/leaderboard.json`).then((r) => r.json());
          if (lb?.rankings?.length) {
            slugs = lb.rankings.map((r: { agent_slug: string }) => r.agent_slug);
          }
        } catch {}
        const map: VerdictMap = {};
        await Promise.all(
          slugs.map(async (slug) => {
            try {
              const a: AgentJson = await fetch(`${CDN_BASE}/agents/${slug}.json`).then((r) => r.json());
              // Walk ALL runs (phase-1 + phase-2 verdicts live in different
              // runs[i] entries). Join verdicts to the data.ts catalog via
              // plan name — TestSprite truncates verdict.name at ~60 chars,
              // so use a prefix-tolerant matcher (planNameMatches).
              for (const run of a?.runs ?? []) {
                for (const v of run.per_test_verdicts) {
                  const plan = TESTS.find((t) => planNameMatches(v.name, t.name));
                  if (!plan) continue;
                  const key = plan.test_id;
                  if (!map[key]) map[key] = {};
                  if (!map[key][slug]) {
                    map[key][slug] = v.verdict;
                  }
                }
              }
            } catch {}
          }),
        );
        if (alive) {
          setVerdicts(map);
          setAgentSlugs(slugs);
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Distinct scored phases present in the catalog — auto-grows when phase-3
  // plans are added to TESTS, so the suite-meta copy stays accurate.
  const scoredPhaseCount = useMemo(
    () => new Set(TESTS.map((t) => t.phase)).size,
    [],
  );

  // Plan count for the suite-meta — respects the selected phase so the
  // counts don't keep reading "32 plans" while a single phase is shown.
  const selectedPlanCount =
    phaseFilter === 'all'
      ? TESTS.length
      : TESTS.filter((t) => t.phase === phaseFilter).length;

  // Filter a plan by the verdict / agent rail. Returns true when the plan
  // should be shown.
  function matchesFilters(t: TestEntry): boolean {
    if (phaseFilter !== 'all' && t.phase !== phaseFilter) return false;
    if (verdictFilter === 'all' && activeAgent === 'all') return true;
    const row = verdicts[t.test_id] ?? {};
    const slugs = activeAgent === 'all' ? agentSlugs : [activeAgent];
    return slugs.some((s) => {
      const v = row[s];
      if (verdictFilter === 'all') return !!v;
      return v === verdictFilter;
    });
  }

  return (
    <>
      <Nav active="tests" />
      <article className="tests-shell shell">
        <header className="tests-hero">
          <div className="tests-eyebrow">{`Test suites · world-cup-2026-v3 · all ${scoredPhaseCount} phases scored · ${TESTS.length} plans`}</div>
          <h1>
            What TestSprite probes,
            <br />
            <em>line by line.</em>
          </h1>
          <p className="tests-lede">
            Every score on the leaderboard derives from this suite. Each plan is a
            structured natural-language test that the TestSprite agent reads, then
            executes against the deployed URL with a real headless Chromium. Pass /
            fail / blocked per plan. The full plan JSONs are PR-able on GitHub.
          </p>
          <div className="tests-cta">
            <Link href="/methodology" className="btn btn-primary">
              How scoring uses these →
            </Link>
            <a
              href="https://github.com/TestSprite/CoderCup/tree/main/tests/world-cup-2026-v3"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              Browse on GitHub
            </a>
            <a
              href="https://github.com/TestSprite/CoderCup/issues/new?title=Add+a+plan&labels=test-suite"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              Propose a plan
            </a>
          </div>
        </header>

        {/* Suite selector — now lists both scored phases */}
        <div className="suite-rail">
          <span className="lbl">Suite</span>
          <select
            className="suite-select"
            value={phaseFilter === 'all' ? 'all' : String(phaseFilter)}
            onChange={(e) => {
              const v = e.target.value;
              setPhaseFilter(v === 'all' ? 'all' : (Number(v) as Phase));
            }}
          >
            <option value="all">{`world-cup-2026-v3 · all ${scoredPhaseCount} phases scored · ${TESTS.length} plans`}</option>
            <option value="1">world-cup-2026-v3 · phase 1 (landing) · 17 plans</option>
            <option value="2">world-cup-2026-v3 · phase 2 (match details) · 16 plans</option>
            <option value="3">world-cup-2026-v3 · phase 3 (predictions) · 20 plans</option>
            <option value="4">world-cup-2026-v3 · phase 4 (lineups) · 16 plans</option>
            <option value="5">world-cup-2026-v3 · phase 5 (analysis) · 22 plans</option>
            <option value="6">world-cup-2026-v3 · phase 6 (related news) · 16 plans</option>
            <option value="7">world-cup-2026-v3 · phase 7 (betting odds) · 19 plans</option>
            <option value="8">world-cup-2026-v3 · phase 8 (multi-language) · 24 plans</option>
            <option value="9">world-cup-2026-v3 · phase 9 (light/dark polish) · 16 plans</option>
            <option value="10">world-cup-2026-v3 · phase 10 (final polish) · 16 plans</option>
          </select>
          <div className="suite-meta">
            <span>
              <strong>{selectedPlanCount}</strong>
              {phaseFilter === 'all' ? 'plans total' : `plans in phase ${phaseFilter}`}
            </span>
            <span><strong>{agentSlugs.length}</strong>agents · phases 1-{scoredPhaseCount} graded</span>
            <span><strong>{agentSlugs.length * selectedPlanCount}</strong>plan runs executed</span>
            <Link href="/events">All suites →</Link>
          </div>
        </div>

        {agentSlugs.length > 0 && (
          <div className="filter-rail">
            <div className="filter-group">
              <span className="filter-lbl">Verdict</span>
              <div className="filter-chips">
                {(['all', 'passed', 'failed', 'blocked', 'inconclusive'] as VerdictFilter[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`fchip ${verdictFilter === v ? 'on' : ''}`}
                    onClick={() => setVerdictFilter(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-lbl">Agent</span>
              <div className="filter-chips">
                <button
                  type="button"
                  className={`fchip ${activeAgent === 'all' ? 'on' : ''}`}
                  onClick={() => setActiveAgent('all')}
                >
                  all
                </button>
                {agentSlugs.map((slug) => (
                  <button
                    key={slug}
                    type="button"
                    className={`fchip ${activeAgent === slug ? 'on' : ''}`}
                    onClick={() => setActiveAgent(slug)}
                  >
                    {slug}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {phaseGroups.map(({ phase, categories }) => {
          if (phaseFilter !== 'all' && phaseFilter !== phase) return null;
          // Apply verdict/agent filters within each category.
          const visibleCategories = categories
            .map(({ key, tests }) => ({ key, tests, filtered: tests.filter(matchesFilters), all: tests }))
            .filter(({ filtered }) => filtered.length > 0);
          if (visibleCategories.length === 0) return null;
          return (
            <section key={phase} className="phase-block">
              <div className="phase-head">
                <span className="phase-tag">{PHASE_META[phase].label}</span>
                <span className="phase-feature">{PHASE_META[phase].feature}</span>
              </div>
              {visibleCategories.map(({ key, filtered, all }) => {
                // CATEGORY_META.seo carries the phase-2 SEO description; swap
                // for phase-1's single-plan sitemap description when needed.
                const meta =
                  key === 'seo' && phase === 1 ? PHASE1_SEO_OVERRIDE : CATEGORY_META[key];
                if (!meta) return null;
                return (
                  <div key={`${phase}-${key}`} className="cat">
                    <div className="cat-meta">
                      <div className="cat-tag">
                        {meta.weight}
                        {filtered.length !== all.length && (
                          <span className="count-meta" style={{ marginLeft: 10 }}>
                            — showing {filtered.length} of {all.length}
                          </span>
                        )}
                      </div>
                      <p>{meta.description}</p>
                    </div>
                    <ul className="plan-list">
                      {filtered.map((t) => (
                        <PlanRow
                          key={t.test_id}
                          t={t}
                          verdicts={verdicts[t.test_id] ?? {}}
                          agentSlugs={activeAgent === 'all' ? agentSlugs : [activeAgent]}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          );
        })}

        <div className="v2-cat">
          <h3>{`world-cup-2026-v3 · all ${scoredPhaseCount} phases scored · ${TESTS.length} plans`}</h3>
          <p>
            The v3.2 spec ships 10 feature-themed phases: landing (phase 1) →
            match details (phase 2) → predictions (phase 3) → lineups
            (phase 4) → analysis (phase 5) → related news (phase 6) → betting
            odds (phase 7) → multi-language (phase 8) → light/dark polish
            (phase 9) → final polish (phase 10). All 10 are scored — 182 plans total, re-run cumulatively
            against the deployed app at every later phase. Cohorts 1 (v1) and 2
            (v2) have been retired as dry-runs.
          </p>
          <a
            href="https://github.com/TestSprite/CoderCup/tree/main/tests/world-cup-2026-v3"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
          >
            Browse the v3 suite →
          </a>
        </div>
      </article>
      <SiteFooter />

    </>
  );
}

function PlanRow({
  t,
  verdicts,
  agentSlugs,
}: {
  t: TestEntry;
  verdicts: Record<string, string>;
  agentSlugs: string[];
}) {
  return (
    <li className="plan-row">
      <Link href={`/tests/${t.test_id}`}>
        <span className="id">{t.test_id.slice(0, 8)}</span>
        <span className="name">{t.name}</span>
        {agentSlugs.length > 0 ? (
          <span className="vs-dots" aria-label="Verdicts across agents">
            {agentSlugs.map((slug) => {
              const v = verdicts[slug];
              return (
                <AgentLogo
                  key={slug}
                  slug={slug}
                  size={22}
                  className={`vs-dot${v ? ` ${v}` : ''}`}
                />
              );
            })}
          </span>
        ) : (
          <span />
        )}
        {t.priority ? (
          <span className={`priority ${t.priority}`}>{t.priority.toUpperCase()}</span>
        ) : (
          <span />
        )}
      </Link>
    </li>
  );
}
