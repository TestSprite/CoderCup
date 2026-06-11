// Reference World Cup fixtures + agent prediction probabilities.
// This data drives the /reference Bettor's Edition demo — it's also
// the canonical fixtures payload the world-cup-v1 / v2 task expects.

export type TeamCode = string;

export interface Team {
  code: TeamCode;
  name: string;
  flag: string; // emoji flag for the demo
}

export interface Fixture {
  id: string;
  stage: 'R16' | 'QF' | 'SF' | 'TP' | 'Final';
  kickoff_utc: string;
  home: TeamCode;
  away: TeamCode;
  // Reference prediction probabilities; sum to 1.0 each row
  prob: { home_win: number; draw: number; away_win: number };
  // Reference predicted scoreline
  predicted_score: { home: number; away: number };
  // Reference agent's confidence in this pick: high / medium / low
  confidence: 'high' | 'medium' | 'low';
  // Brief reasoning (the "expert analysis" the v2 spec asks for)
  reasoning: string;
}

export const TEAMS: Record<TeamCode, Team> = {
  BRA: { code: 'BRA', name: 'Brazil', flag: '🇧🇷' },
  CRO: { code: 'CRO', name: 'Croatia', flag: '🇭🇷' },
  ARG: { code: 'ARG', name: 'Argentina', flag: '🇦🇷' },
  POR: { code: 'POR', name: 'Portugal', flag: '🇵🇹' },
  FRA: { code: 'FRA', name: 'France', flag: '🇫🇷' },
  GER: { code: 'GER', name: 'Germany', flag: '🇩🇪' },
  ENG: { code: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  ESP: { code: 'ESP', name: 'Spain', flag: '🇪🇸' },
  NED: { code: 'NED', name: 'Netherlands', flag: '🇳🇱' },
  BEL: { code: 'BEL', name: 'Belgium', flag: '🇧🇪' },
  ITA: { code: 'ITA', name: 'Italy', flag: '🇮🇹' },
  URY: { code: 'URY', name: 'Uruguay', flag: '🇺🇾' },
  USA: { code: 'USA', name: 'United States', flag: '🇺🇸' },
  MEX: { code: 'MEX', name: 'Mexico', flag: '🇲🇽' },
  JPN: { code: 'JPN', name: 'Japan', flag: '🇯🇵' },
  KOR: { code: 'KOR', name: 'South Korea', flag: '🇰🇷' },
};

export const FIXTURES: Fixture[] = [
  // R16
  {
    id: 'R16-1',
    stage: 'R16',
    kickoff_utc: '2026-06-25T20:00:00Z',
    home: 'BRA',
    away: 'CRO',
    prob: { home_win: 0.58, draw: 0.22, away_win: 0.2 },
    predicted_score: { home: 2, away: 1 },
    confidence: 'high',
    reasoning:
      "Brazil's depth in the front three and Croatia's aging midfield core tilt this — but Modric still creates enough that a late equaliser stays plausible.",
  },
  {
    id: 'R16-2',
    stage: 'R16',
    kickoff_utc: '2026-06-25T23:00:00Z',
    home: 'ARG',
    away: 'POR',
    prob: { home_win: 0.46, draw: 0.24, away_win: 0.3 },
    predicted_score: { home: 3, away: 2 },
    confidence: 'medium',
    reasoning:
      "Generational match-up. Both squads have elite shot-creators and shaky defenses; bet under expects fewer than 3.5 total goals — this prediction goes over.",
  },
  {
    id: 'R16-3',
    stage: 'R16',
    kickoff_utc: '2026-06-26T20:00:00Z',
    home: 'FRA',
    away: 'GER',
    prob: { home_win: 0.42, draw: 0.27, away_win: 0.31 },
    predicted_score: { home: 2, away: 1 },
    confidence: 'low',
    reasoning:
      "Coin flip. France's individual quality vs Germany's pressing structure — Mbappé's first 30 minutes will set the tone. Predicted close FRA win but draw very plausible.",
  },
  {
    id: 'R16-4',
    stage: 'R16',
    kickoff_utc: '2026-06-26T23:00:00Z',
    home: 'ENG',
    away: 'ESP',
    prob: { home_win: 0.34, draw: 0.28, away_win: 0.38 },
    predicted_score: { home: 1, away: 2 },
    confidence: 'medium',
    reasoning:
      "Spain's possession game gives them the edge unless England goes 4-3-3 with Bellingham high. Predict Spain breaks through after the hour mark.",
  },
  {
    id: 'R16-5',
    stage: 'R16',
    kickoff_utc: '2026-06-27T20:00:00Z',
    home: 'NED',
    away: 'BEL',
    prob: { home_win: 0.5, draw: 0.25, away_win: 0.25 },
    predicted_score: { home: 2, away: 1 },
    confidence: 'high',
    reasoning:
      "Netherlands' settled core under Koeman beats Belgium's transition era. The Dutch defense is the difference in a Group of Death-feel match.",
  },
  {
    id: 'R16-6',
    stage: 'R16',
    kickoff_utc: '2026-06-27T23:00:00Z',
    home: 'ITA',
    away: 'URY',
    prob: { home_win: 0.45, draw: 0.3, away_win: 0.25 },
    predicted_score: { home: 1, away: 0 },
    confidence: 'medium',
    reasoning:
      "Italy's defensive shape vs Uruguay's hold-up play. Likely a low-scorer; an Italian 1-0 set-piece win fits both styles.",
  },
  {
    id: 'R16-7',
    stage: 'R16',
    kickoff_utc: '2026-06-28T20:00:00Z',
    home: 'USA',
    away: 'MEX',
    prob: { home_win: 0.42, draw: 0.26, away_win: 0.32 },
    predicted_score: { home: 2, away: 1 },
    confidence: 'low',
    reasoning:
      "Concacaf classic on home soil. USA's youth movement (Pulisic + Reyna) tilts the model toward them, but rivalry games defy form.",
  },
  {
    id: 'R16-8',
    stage: 'R16',
    kickoff_utc: '2026-06-28T23:00:00Z',
    home: 'JPN',
    away: 'KOR',
    prob: { home_win: 0.4, draw: 0.3, away_win: 0.3 },
    predicted_score: { home: 1, away: 1 },
    confidence: 'low',
    reasoning:
      "Asian derby. Both squads have improved markedly since 2022; predict a draw that goes to penalties (pen).",
  },
];

export function getFixture(id: string): Fixture | undefined {
  return FIXTURES.find((f) => f.id === id);
}

export function decimalOdds(prob: number): number {
  if (prob <= 0) return Infinity;
  return Math.round((1 / prob) * 100) / 100;
}

export function americanOdds(prob: number): string {
  if (prob <= 0) return '—';
  if (prob >= 1) return '—';
  if (prob >= 0.5) {
    return `-${Math.round((prob / (1 - prob)) * 100)}`;
  }
  return `+${Math.round(((1 - prob) / prob) * 100)}`;
}

export function expectedValuePct(prob: number, userOdds: number): number {
  // EV % = (prob × userOdds - 1) × 100
  if (userOdds <= 0) return 0;
  return Math.round((prob * userOdds - 1) * 100 * 10) / 10;
}

// Monte Carlo simulator: client-side.
// Given the R16 prob array, pick a winner stochastically for each R16,
// then advance the bracket. Returns a count distribution over:
// who reached the Final, who won the Final.
//
// `pinned`: map fixtureId -> forced winner. Used by the scenario
// explorer — pinned R16 outcomes propagate through downstream rounds.
export function runMonteCarlo(
  trials: number,
  pinned: Record<string, TeamCode> = {},
): {
  finalist: Record<TeamCode, number>;
  champion: Record<TeamCode, number>;
} {
  const finalist: Record<TeamCode, number> = {};
  const champion: Record<TeamCode, number> = {};

  for (let t = 0; t < trials; t++) {
    const r16Winners: TeamCode[] = [];
    for (let i = 0; i < 8; i++) {
      const f = FIXTURES[i];
      // Honor pinned outcome if set
      if (pinned[f.id]) {
        r16Winners.push(pinned[f.id]);
        continue;
      }
      const r = Math.random();
      const pHome = f.prob.home_win;
      const pHomeOrDraw = pHome + f.prob.draw;
      let winner: TeamCode;
      if (r < pHome) winner = f.home;
      else if (r < pHomeOrDraw) {
        // draw -> penalty shootout, 50/50
        winner = Math.random() < 0.5 ? f.home : f.away;
      } else winner = f.away;
      r16Winners.push(winner);
    }

    // QF: simple paired progression with 50/50 priors
    const qfWinners: TeamCode[] = [];
    for (let i = 0; i < 8; i += 2) {
      qfWinners.push(Math.random() < 0.5 ? r16Winners[i] : r16Winners[i + 1]);
    }

    // SF
    const sfWinners: TeamCode[] = [];
    for (let i = 0; i < 4; i += 2) {
      sfWinners.push(Math.random() < 0.5 ? qfWinners[i] : qfWinners[i + 1]);
    }

    const champ = Math.random() < 0.5 ? sfWinners[0] : sfWinners[1];

    finalist[sfWinners[0]] = (finalist[sfWinners[0]] ?? 0) + 1;
    finalist[sfWinners[1]] = (finalist[sfWinners[1]] ?? 0) + 1;
    champion[champ] = (champion[champ] ?? 0) + 1;
  }

  return { finalist, champion };
}
