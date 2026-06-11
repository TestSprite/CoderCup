'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../components/Nav';
import { SiteFooter } from '../components/SiteFooter';
import { AgentLogo } from '../components/AgentLogo';
import { TESTS, groupByCategory, type TestEntry } from '../tests/data';
import { CDN_BASE, type AgentJson, type LeaderboardJson } from '../lib/api';

type Verdict = 'passed' | 'failed' | 'inconclusive';
type Row = {
  agent_slug: string;
  agent_name: string;
  composite: number;
  rank: number;
  verdicts: Record<string, Verdict>; // test_id (8-char) -> verdict
};

const VERDICT_GLYPH: Record<Verdict, string> = {
  passed: '●',
  failed: '●',
  inconclusive: '○',
};

export function VsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lb: LeaderboardJson = await fetch(`${CDN_BASE}/leaderboard.json`).then((r) =>
          r.json(),
        );
        const out: Row[] = await Promise.all(
          lb.rankings.map(async (r) => {
            const a: AgentJson = await fetch(`${CDN_BASE}/agents/${r.agent_slug}.json`).then(
              (x) => x.json(),
            );
            const verdicts: Record<string, Verdict> = {};
            for (const v of a.runs[0].per_test_verdicts) {
              const key = v.test_id.slice(0, 8);
              const norm: Verdict =
                v.verdict === 'passed' || v.verdict === 'failed' ? v.verdict : 'inconclusive';
              verdicts[key] = norm;
            }
            return {
              agent_slug: r.agent_slug,
              agent_name: r.agent_name,
              composite: r.composite,
              rank: r.rank,
              verdicts,
            };
          }),
        );
        if (alive) setRows(out);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  const grouped = useMemo(() => groupByCategory(), []);
  const categories = useMemo(() => ['all', ...Object.keys(grouped)], [grouped]);
  const visibleTests = useMemo(() => {
    if (categoryFilter === 'all') return TESTS;
    return TESTS.filter((t) => t.category === categoryFilter);
  }, [categoryFilter]);

  return (
    <>
      <Nav />
      <article className="vs shell">
        <header className="vs-hero">
          <div className="eyebrow">Cross-agent comparison</div>
          <h1>
            Every agent against <em>every plan.</em>
          </h1>
          <p className="lede">
            The matrix view of the current cohort&apos;s suite. Each row is a TestSprite plan;
            each column is an agent in the cohort. Cells show the verdict —
            green pass, accent fail, faded inconclusive.
          </p>
        </header>

        <section className="filter-bar">
          <div className="filter-label">Category:</div>
          <div className="filter-chips">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`chip ${categoryFilter === cat ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === 'all' ? `All · ${TESTS.length}` : `${cat} · ${grouped[cat]?.length ?? 0}`}
              </button>
            ))}
          </div>
        </section>

        <section className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th className="plan-h">Plan</th>
                {rows.map((r) => (
                  <th key={r.agent_slug} className="agent-h">
                    <Link href={`/agents/${r.agent_slug}`}>
                      <AgentLogo slug={r.agent_slug} size={24} />
                      <span className="name">{r.agent_name}</span>
                      <span className="composite mono">{r.composite.toFixed(3)}</span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTests.map((t) => (
                <PlanMatrixRow key={t.test_id} t={t} rows={rows} />
              ))}
            </tbody>
          </table>
        </section>

        {rows.length > 0 && (
          <section className="summary">
            <h2>Summary</h2>
            <div className="sum-grid">
              {rows.map((r) => {
                const verdicts = Object.values(r.verdicts);
                const passed = verdicts.filter((v) => v === 'passed').length;
                const failed = verdicts.filter((v) => v === 'failed').length;
                const inconclusive = verdicts.length - passed - failed;
                const definite = passed + failed;
                const correctness = definite ? passed / definite : 0;
                return (
                  <div key={r.agent_slug} className="sum-card">
                    <div className="head">
                      <AgentLogo slug={r.agent_slug} size={28} />
                      <Link href={`/agents/${r.agent_slug}`}>
                        <strong>{r.agent_name}</strong>
                      </Link>
                    </div>
                    <div className="stat">
                      <span className="lbl">Correctness</span>
                      <span className="val">
                        {passed}/{definite} ({(correctness * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="stat">
                      <span className="lbl">Inconclusive</span>
                      <span className="val">{inconclusive}</span>
                    </div>
                    <div className="stat">
                      <span className="lbl">Composite</span>
                      <span className="val mono accent">{r.composite.toFixed(3)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </article>
      <SiteFooter />

    </>
  );
}

function PlanMatrixRow({ t, rows }: { t: TestEntry; rows: Row[] }) {
  return (
    <tr>
      <td className="plan-cell">
        <Link href={`/tests/${t.test_id}`}>
          <span className="mono id">{t.test_id}</span>
          <span className="nm">{t.name}</span>
          <span className={`cat cat-${t.category}`}>{t.category}</span>
        </Link>
      </td>
      {rows.map((r) => {
        const v = r.verdicts[t.test_id];
        const cls = v ?? 'inconclusive';
        return (
          <td key={r.agent_slug} className={`verdict-cell v-${cls}`}>
            <span aria-label={`${r.agent_name}: ${v ?? 'no verdict'}`} className="dot">
              {v ? VERDICT_GLYPH[v] : '—'}
            </span>
          </td>
        );
      })}
    </tr>
  );
}
