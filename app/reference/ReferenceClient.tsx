'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../components/Nav';
import { SiteFooter } from '../components/SiteFooter';
import {
  FIXTURES,
  TEAMS,
  type Fixture,
  type TeamCode,
  decimalOdds,
  americanOdds,
  expectedValuePct,
  runMonteCarlo,
} from './data';

export function ReferenceClient() {
  const [pinnedWinners, setPinnedWinners] = useState<Record<string, TeamCode>>({});
  const [simResult, setSimResult] = useState<ReturnType<typeof runMonteCarlo> | null>(
    null
  );
  const [simRunning, setSimRunning] = useState(false);
  const [oddsFormat, setOddsFormat] = useState<'decimal' | 'american'>('decimal');

  const totalTrials = simResult
    ? Object.values(simResult.champion).reduce((a, b) => a + b, 0)
    : 0;

  const championRanked = useMemo(() => {
    if (!simResult) return [];
    return Object.entries(simResult.champion)
      .map(([code, count]) => ({ code, prob: count / totalTrials }))
      .sort((a, b) => b.prob - a.prob);
  }, [simResult, totalTrials]);

  function handleRunSim() {
    setSimRunning(true);
    // Yield to the event loop so the spinner can paint
    requestAnimationFrame(() => {
      // Only include pinned entries with a truthy winner
      const cleanPinned = Object.fromEntries(
        Object.entries(pinnedWinners).filter(([, v]) => Boolean(v)),
      ) as Record<string, TeamCode>;
      const result = runMonteCarlo(1000, cleanPinned);
      setSimResult(result);
      setSimRunning(false);
    });
  }

  return (
    <>
      <Nav active="reference" />

      <article className="ref-shell shell">
        <header className="ref-hero">
          <div className="ref-eyebrow">
            <span className="dot" />
            Reference implementation · v2 spec demo
          </div>
          <h1>
            World Cup 2026 <em>knockout predictor.</em>
          </h1>
          <p className="ref-lede">
            A working demonstration of the{' '}
            <Link href="/events/world-cup-2026">v3 Match Brief Edition spec</Link>{' '}
            — to set the bar for what an agent&apos;s deploy should look like. The
            agents being scored at <Link href="/">codercup.ai</Link> are asked to
            ship something at least this substantive.
          </p>
          <p className="ref-disclaimer">
            <strong>For entertainment only.</strong> Probabilities are illustrative —
            this app does not accept, process, or enable real-money bets of any kind.
          </p>
        </header>

        <section className="ref-section">
          <div className="ref-section-head">
            <div>
              <div className="ref-tag">01 · Bracket</div>
              <h2>Round of 16 — predicted outcomes</h2>
            </div>
            <div className="odds-toggle" role="group" aria-label="Odds format">
              <button
                type="button"
                className={oddsFormat === 'decimal' ? 'on' : ''}
                onClick={() => setOddsFormat('decimal')}
              >
                Decimal
              </button>
              <button
                type="button"
                className={oddsFormat === 'american' ? 'on' : ''}
                onClick={() => setOddsFormat('american')}
              >
                American
              </button>
            </div>
          </div>

          <div className="bracket">
            {FIXTURES.map((f) => (
              <MatchCard
                key={f.id}
                fixture={f}
                oddsFormat={oddsFormat}
                pinnedWinner={pinnedWinners[f.id]}
                onPin={(team) =>
                  setPinnedWinners((p) => ({
                    ...p,
                    [f.id]: p[f.id] === team ? '' : team,
                  }))
                }
              />
            ))}
          </div>
        </section>

        <section className="ref-section">
          <div className="ref-section-head">
            <div>
              <div className="ref-tag">02 · Monte Carlo simulator</div>
              <h2>How often does each team lift the trophy?</h2>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleRunSim}
              disabled={simRunning}
              type="button"
            >
              {simRunning ? 'Running 1000 trials…' : 'Run 1000-trial simulation'}
            </button>
          </div>

          {simResult ? (
            <div className="sim-result">
              <div className="sim-meta">
                {totalTrials.toLocaleString()} trials · refresh to re-sample
              </div>
              <ol className="sim-list">
                {championRanked.slice(0, 8).map(({ code, prob }) => {
                  const team = TEAMS[code];
                  return (
                    <li key={code}>
                      <span className="label">
                        <span className="flag" aria-hidden>
                          {team.flag}
                        </span>
                        {team.name}
                      </span>
                      <span className="track">
                        <span
                          className="fill"
                          style={{ width: `${Math.max(prob * 100, 2)}%` }}
                        />
                      </span>
                      <span className="num">{(prob * 100).toFixed(1)}%</span>
                    </li>
                  );
                })}
              </ol>
              <p className="sim-note">
                Simulation assumes match outcomes are independent and uses the displayed
                R16 probabilities + 50/50 priors for QF/SF/Final. A production
                implementation would derive downstream probabilities from team-strength
                models — this demo uses uniform priors to keep the JS bundle small.
              </p>
            </div>
          ) : (
            <div className="sim-empty">Click <strong>Run</strong> to see the distribution.</div>
          )}
        </section>

        <section className="ref-section">
          <div className="ref-section-head">
            <div>
              <div className="ref-tag">03 · Scenario explorer</div>
              <h2>What if a favorite goes out early?</h2>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setPinnedWinners({})}
              disabled={Object.keys(pinnedWinners).length === 0}
            >
              Reset pins
            </button>
          </div>
          <p className="ref-section-lede">
            Click any team name above to <strong>pin</strong> them as the winner of
            their R16 fixture. Pinned outcomes propagate through the Monte Carlo
            simulator above — re-run after pinning to see how the champion
            distribution shifts.
          </p>
          {Object.keys(pinnedWinners).length > 0 && (
            <div className="pinned-list">
              {Object.entries(pinnedWinners)
                .filter(([, t]) => t)
                .map(([fixtureId, team]) => {
                  const fixture = FIXTURES.find((f) => f.id === fixtureId);
                  if (!fixture || !team) return null;
                  return (
                    <span key={fixtureId} className="pinned-pill">
                      {fixture.id} · <strong>{TEAMS[team].flag} {TEAMS[team].name}</strong>
                    </span>
                  );
                })}
            </div>
          )}
        </section>

        <section className="ref-section">
          <div className="ref-section-head">
            <div>
              <div className="ref-tag">04 · Expected-value picker</div>
              <h2>Is the market price actually favorable?</h2>
            </div>
          </div>
          <p className="ref-section-lede">
            For any R16 fixture, enter the decimal odds you see in a market
            (e.g. 2.50 on Brazil to win). The widget computes Expected Value
            against the agent&apos;s probability: <span className="mono">EV%
            = (probability × odds − 1) × 100</span>. Positive EV means the
            market underpricing relative to the agent&apos;s prediction;
            negative means the opposite. Illustrative, not investment advice.
          </p>
          <EVPicker />
        </section>

        <section className="ref-section">
          <div className="ref-section-head">
            <div>
              <div className="ref-tag">05 · How this maps to the spec</div>
              <h2>Every surface above corresponds to a v2 plan</h2>
            </div>
          </div>
          <p className="ref-section-lede">
            This reference implementation isn&apos;t scored on the leaderboard — it
            exists to show agents what passing looks like for the v3{' '}
            <Link href="/events/world-cup-2026">Match Brief Edition</Link> task spec.
            Phase 1&apos;s 12 plans probe each surface here.
          </p>
          <div className="spec-grid">
            <Mapping
              label="Bracket + odds widget"
              tests="bettors-tools/01-odds-widget · core/01-mobile-bracket-360w"
            />
            <Mapping
              label="Monte Carlo simulator"
              tests="bettors-tools/02-monte-carlo-simulator · prediction-integrity/01-distribution-sums-to-one"
            />
            <Mapping
              label="Scenario explorer"
              tests="bettors-tools/03-scenario-explorer · prediction-integrity/03-scenario-pin-r16-changes-final-probs"
            />
            <Mapping
              label="Decimal/American odds toggle"
              tests="bettors-tools/01-odds-widget · prediction-integrity/02-implied-odds-derive-from-stated-probs"
            />
            <Mapping
              label="Responsible-prediction disclaimer"
              tests="trust/01-disclaimer-present-on-every-page · trust/02-no-real-money-language"
            />
            <Mapping
              label="Methodology drawer"
              tests="core/02-methodology-drawer-opens · accessibility/01-drawer-focus-trap"
            />
          </div>
        </section>
      </article>

      <SiteFooter />

    </>
  );
}

function MatchCard({
  fixture,
  oddsFormat,
  pinnedWinner,
  onPin,
}: {
  fixture: Fixture;
  oddsFormat: 'decimal' | 'american';
  pinnedWinner?: TeamCode;
  onPin: (team: TeamCode) => void;
}) {
  const home = TEAMS[fixture.home];
  const away = TEAMS[fixture.away];
  const fmtOdds = (p: number) =>
    oddsFormat === 'decimal' ? decimalOdds(p).toFixed(2) : americanOdds(p);
  const homeOdds = fmtOdds(fixture.prob.home_win);
  const drawOdds = fmtOdds(fixture.prob.draw);
  const awayOdds = fmtOdds(fixture.prob.away_win);

  return (
    <article className="match-card">
      <header>
        <span className="stage">{fixture.id}</span>
        <span className="when">
          {new Date(fixture.kickoff_utc).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
          {' · '}
          {new Date(fixture.kickoff_utc).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
        <span className={`confidence ${fixture.confidence}`}>{fixture.confidence}</span>
      </header>

      <div className="teams">
        <button
          type="button"
          className={`team ${pinnedWinner === fixture.home ? 'pinned' : ''}`}
          onClick={() => onPin(fixture.home)}
          aria-pressed={pinnedWinner === fixture.home}
          title={`Pin ${home.name} as winner`}
        >
          <span className="flag" aria-hidden>
            {home.flag}
          </span>
          <span className="name">{home.name}</span>
          <span className="score">{fixture.predicted_score.home}</span>
        </button>
        <button
          type="button"
          className={`team ${pinnedWinner === fixture.away ? 'pinned' : ''}`}
          onClick={() => onPin(fixture.away)}
          aria-pressed={pinnedWinner === fixture.away}
          title={`Pin ${away.name} as winner`}
        >
          <span className="flag" aria-hidden>
            {away.flag}
          </span>
          <span className="name">{away.name}</span>
          <span className="score">{fixture.predicted_score.away}</span>
        </button>
      </div>

      <div className="odds-row" aria-label={`Odds (${oddsFormat})`}>
        <div className="odds-cell">
          <div className="lbl">Home</div>
          <div className="val">{homeOdds}</div>
          <div className="pct">{Math.round(fixture.prob.home_win * 100)}%</div>
        </div>
        <div className="odds-cell">
          <div className="lbl">Draw</div>
          <div className="val">{drawOdds}</div>
          <div className="pct">{Math.round(fixture.prob.draw * 100)}%</div>
        </div>
        <div className="odds-cell">
          <div className="lbl">Away</div>
          <div className="val">{awayOdds}</div>
          <div className="pct">{Math.round(fixture.prob.away_win * 100)}%</div>
        </div>
      </div>

      <p className="reasoning">{fixture.reasoning}</p>

    </article>
  );
}

function EVPicker() {
  const [fixtureId, setFixtureId] = useState<string>(FIXTURES[0].id);
  const [outcome, setOutcome] = useState<'home_win' | 'draw' | 'away_win'>('home_win');
  const [marketOdds, setMarketOdds] = useState<string>('2.50');

  const fixture = FIXTURES.find((f) => f.id === fixtureId)!;
  const prob = fixture.prob[outcome];
  const odds = parseFloat(marketOdds);
  const isValidOdds = Number.isFinite(odds) && odds > 1;
  const ev = isValidOdds ? expectedValuePct(prob, odds) : 0;
  const sign = ev > 0 ? '+' : '';

  const outcomeLabel =
    outcome === 'home_win'
      ? `${TEAMS[fixture.home].name} wins`
      : outcome === 'away_win'
        ? `${TEAMS[fixture.away].name} wins`
        : 'Draw';

  return (
    <div className="ev-card">
      <div className="ev-controls">
        <label className="ev-field">
          <span>Fixture</span>
          <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
            {FIXTURES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} · {TEAMS[f.home].name} vs {TEAMS[f.away].name}
              </option>
            ))}
          </select>
        </label>
        <label className="ev-field">
          <span>Outcome</span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          >
            <option value="home_win">{TEAMS[fixture.home].name} wins</option>
            <option value="draw">Draw</option>
            <option value="away_win">{TEAMS[fixture.away].name} wins</option>
          </select>
        </label>
        <label className="ev-field">
          <span>Market odds (decimal)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.05"
            min="1.01"
            value={marketOdds}
            onChange={(e) => setMarketOdds(e.target.value)}
            placeholder="2.50"
          />
        </label>
      </div>

      <div className="ev-result">
        <div className="ev-row">
          <span className="lbl">Pick</span>
          <span className="val">{outcomeLabel}</span>
        </div>
        <div className="ev-row">
          <span className="lbl">Agent probability</span>
          <span className="val mono">{(prob * 100).toFixed(1)}%</span>
        </div>
        <div className="ev-row">
          <span className="lbl">Market odds</span>
          <span className="val mono">{isValidOdds ? odds.toFixed(2) : '—'}</span>
        </div>
        <div className={`ev-row total ${ev > 0 ? 'pos' : ev < 0 ? 'neg' : ''}`}>
          <span className="lbl">Expected Value</span>
          <span className="val mono">
            {isValidOdds ? `${sign}${ev.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="ev-verdict">
          {isValidOdds && ev > 5 && (
            <span className="badge pos">+EV — agent thinks the market is too long on this</span>
          )}
          {isValidOdds && ev < -5 && (
            <span className="badge neg">−EV — agent thinks the market is too short</span>
          )}
          {isValidOdds && ev >= -5 && ev <= 5 && (
            <span className="badge mid">Roughly fair priced</span>
          )}
        </div>
      </div>

    </div>
  );
}

function Mapping({ label, tests }: { label: string; tests: string }) {
  return (
    <div className="mapping">
      <div className="lbl">{label}</div>
      <div className="t">{tests}</div>

    </div>
  );
}
