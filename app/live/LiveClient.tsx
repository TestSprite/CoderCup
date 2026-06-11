'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Nav } from '../components/Nav';
import { SiteFooter } from '../components/SiteFooter';
import { AgentLogo } from '../components/AgentLogo';
import { TESTS, planNameMatches, PHASE_CATEGORY_ORDER, type Phase } from '../tests/data';
import { CDN_BASE, type AgentJson } from '../lib/api';
import phase1SuiteIndex from '../../tests/world-cup-2026-v3/phase-1/suite-index.json';
import phase2SuiteIndex from '../../tests/world-cup-2026-v3/phase-2/suite-index.json';
import eventsIndex from '../../public/fixtures/events.json';
// CDN_BASE no longer used — live JSONL lives on a different CloudFront
// distribution (see LIVE_CDN_BASE below). Keep this comment so future
// edits know the lookup table.
import './live.css';

// Real-data version. The stream is fetched from
// `${LIVE_CDN_BASE}/live/world-cup-2026/cohort-3.jsonl`, parsed line-by-line,
// rendered newest-first, and re-polled every 5s. New events get a brief
// flash flag for the existing @keyframes flashin animation; existing
// rows are not re-rendered so the list doesn't strobe on poll.
//
// The visual treatment (hero, racer cards, stream rows, side panels,
// agent-filter chips) is preserved verbatim from the prior hardcoded
// build. The workspace tree and TestSprite panel are now derived from
// the real JSONL stream + the real Phase 1 plan catalog — the prior
// "demo" fallbacks have been removed.

// ─── Event schema (matches scripts/live-emit.sh) ─────────────────────
//
// One line of JSONL ==
// {
//   "ts":     "2026-05-28T10:30:00Z",
//   "agent":  "claude-code" | "codex" | "antigravity",
//   "phase":  number,
//   "type":   "start" | "read" | "write" | "bash" | "build" |
//             "deploy" | "gate-pass" | "gate-fail" | "score" | "ship",
//   "target": string,    // file path, command, URL, etc.
//   "meta":   string,    // human-readable annotation
// }

type WireAgent = 'claude-code' | 'codex' | 'antigravity' | 'kimi';
type AgentKey = 'claude' | 'codex' | 'antigrav' | 'kimi';
type EventType =
  | 'start'
  | 'read'
  | 'write'
  | 'bash'
  | 'build'
  | 'deploy'
  | 'gate-pass'
  | 'gate-fail'
  | 'score'
  | 'ship';
export interface WireEvent {
  ts: string;
  agent: WireAgent;
  phase: number;
  type: EventType;
  target: string;
  meta: string;
}

interface StreamLine {
  id: string;            // ts|agent|type|target — stable across polls
  ts: string;            // HH:MM:SS for display
  iso: string;           // raw ISO ts for ordering / diffing
  agent: AgentKey;
  phase: number;
  type: EventType;
  file: string;
  meta: string;
  flash: boolean;
}

// Live JSONL lives on the public-data CloudFront distribution (separate
// from codercup.ai's Amplify CDN). Hardcoded because CDN_BASE points at
// /fixtures, which is served by Amplify and doesn't carry the live stream
// — only static fixtures. Cross-origin OK: the S3 bucket has codercup.ai
// in its CORS AllowedOrigins.
const LIVE_CDN_BASE = 'https://d3ckiyhxdozx1c.cloudfront.net';
const COHORT_PATH = '/live/world-cup-2026/cohort-3.jsonl';
const POLL_INTERVAL_MS = 5_000;

const WIRE_TO_UI: Record<WireAgent, AgentKey> = {
  'claude-code': 'claude',
  codex: 'codex',
  antigravity: 'antigrav',
  kimi: 'kimi',
};

const UI_TO_WIRE: Record<AgentKey, WireAgent> = {
  claude: 'claude-code',
  codex: 'codex',
  antigrav: 'antigravity',
  kimi: 'kimi',
};

const ACTION_LABEL: Record<EventType, string> = {
  start: 'started',
  read: 'read',
  write: 'wrote',
  bash: 'ran',
  build: 'built',
  deploy: 'deployed',
  'gate-pass': '✓ gate',
  'gate-fail': '✗ gate',
  score: 'scored',
  ship: 'shipped',
};

const ACTION_CLASS: Record<EventType, string> = {
  start: 'act-bash',
  read: 'act-read',
  write: 'act-write',
  bash: 'act-bash',
  build: 'act-test-pass',
  deploy: 'act-deploy',
  'gate-pass': 'act-test-pass',
  'gate-fail': 'act-test-fail',
  score: 'act-commit',
  ship: 'act-deploy',
};

const AGENT_LABEL: Record<AgentKey, string> = {
  claude: 'claude-code',
  codex: 'codex',
  antigrav: 'anti-gravity',
  kimi: 'kimi',
};

const AGENT_DISPLAY_NAME: Record<AgentKey, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  antigrav: 'Anti-Gravity',
  kimi: 'Kimi',
};

// Vendor · model_id strings — must match the real driver metadata in
// public/fixtures/agents/<slug>.json#agent.model_id. The rest of the site
// (app/page.tsx, EventComparisonCanvas, AgentDetailClient) sources these
// from the fixture; mirror the same values here so the racer cards don't
// drift from the agent profiles. claude-code = opus-4-8 (NOT sonnet),
// antigravity = gemini-3.5-flash-high.
const AGENT_VENDOR: Record<AgentKey, string> = {
  claude: 'Anthropic · opus-4-8',
  codex: 'OpenAI · gpt-5.5',
  antigrav: 'Google · gemini-3.5-flash-high',
  kimi: 'Moonshot · kimi-k2.6',
};

const BUDGET_MIN = 240;

// Ordered list of UI slugs used as the *static* fallback for the agent
// card column when correctness data hasn't loaded yet. Once `agentScores`
// hydrates (from each agent's fixture's `score.components.correctness`)
// the cards are re-sorted correctness desc — see `racerOrder` below.
const STATIC_RACER_ORDER: AgentKey[] = ['claude', 'codex', 'antigrav', 'kimi'];

// ─── Phase 1 plan catalog ─────────────────────────────────────────────
//
// Built at module load from suite-index.json (16 plans). Each plan is
// resolved to a stable test_id via app/tests/data.ts so the row can link
// to /tests/<test_id>. Plans that haven't been catalog-mapped yet fall
// back to a derived test_id (deterministic hash-ish — purely cosmetic
// since the row still links to the catalog path).
//
// Verdict starts at 'pending' for every plan; when the FE picks up
// scoring data from the agent JSON it can flip to passed/failed/inconclusive.
// The wire-up for that lives below in `verdictByPlan`.

// `planFilenameFromPath`, `buildPlanCatalog`, `buildPhaseLookup`,
// `parseJsonl`, `isValidWireEvent`, `parseComposite`, and the `PLAN_CATALOG`
// / `PHASE_LOOKUP` snapshots are exported below the function bodies so the
// /live unit tests can exercise them in isolation. The names are otherwise
// not part of the public API of this module — only `LiveClient` is rendered
// from app/live/page.tsx.
export function planFilenameFromPath(planPath: string): string {
  // "bracket/01-bracket-cardinality.json" → "01_bracket_cardinality"
  // Strip directory + extension, then normalize separators to underscores.
  const base = planPath.split('/').pop() ?? planPath;
  return base.replace(/\.json$/, '').replace(/-/g, '_');
}

interface PlanRow {
  filename: string;
  category: string;
  path: string;
  test_id: string;
  href: string;
  name: string;
  priority: string;
  phase: number;
}

interface SuiteIndexLike { phase: number; categories: Record<string, string[]> }

export function buildPlanCatalogForPhase(suiteIndex: SuiteIndexLike): PlanRow[] {
  const phase = suiteIndex.phase;
  const testsByPath: Record<string, { test_id: string; name: string; priority?: string }> = {};
  for (const t of TESTS) {
    if (t.phase !== phase) continue;
    testsByPath[t.path] = { test_id: t.test_id, name: t.name, priority: t.priority };
  }
  const rows: PlanRow[] = [];
  for (const category of Object.keys(suiteIndex.categories)) {
    for (const file of suiteIndex.categories[category]) {
      const path = `${category}/${file}`;
      const catalogEntry = testsByPath[path];
      const test_id = catalogEntry?.test_id ?? planFilenameFromPath(path).slice(0, 8);
      rows.push({
        filename: planFilenameFromPath(path),
        category,
        path,
        test_id,
        href: `/tests/${test_id}`,
        name: catalogEntry?.name ?? planFilenameFromPath(path),
        priority: catalogEntry?.priority ?? '',
        phase,
      });
    }
  }
  return rows;
}

// Legacy export for the unit tests in app/live/live-emit.test.ts. Kept
// pointing at phase-1 since that's what the test suite asserts against.
export function buildPlanCatalog(): PlanRow[] {
  return buildPlanCatalogForPhase(phase1SuiteIndex as SuiteIndexLike);
}

export const PHASE_1_CATALOG = buildPlanCatalogForPhase(phase1SuiteIndex as SuiteIndexLike);
export const PHASE_2_CATALOG = buildPlanCatalogForPhase(phase2SuiteIndex as SuiteIndexLike);

// Build a phase's plan catalog straight from the data.ts TESTS catalog,
// ordered by PHASE_CATEGORY_ORDER. Phases 5 + 6 ship a suite-index.json with
// an empty `categories` map, so the suite-index-driven builder above can't
// reconstruct them — TESTS is the single source of truth that carries every
// scored phase. Used to populate the per-phase test rail for phases 3-6.
export function buildPlanCatalogFromTests(phase: number): PlanRow[] {
  const order = PHASE_CATEGORY_ORDER[phase as Phase] ?? [];
  const byCat: Record<string, PlanRow[]> = {};
  for (const t of TESTS) {
    if (t.phase !== phase) continue;
    (byCat[t.category] = byCat[t.category] ?? []).push({
      filename: planFilenameFromPath(t.path),
      category: t.category,
      path: t.path,
      test_id: t.test_id,
      href: `/tests/${t.test_id}`,
      name: t.name,
      priority: t.priority ?? '',
      phase,
    });
  }
  const categories = order.length ? order : Object.keys(byCat);
  return categories.flatMap((c) => byCat[c] ?? []);
}

// Per-phase catalogs for every phase present in the TESTS catalog. The test
// rail toggles across these; keys are the scored phase numbers (1-6 today).
export const CATALOG_BY_PHASE: Record<number, PlanRow[]> = (() => {
  const out: Record<number, PlanRow[]> = {};
  for (const phase of Array.from(new Set(TESTS.map((t) => t.phase))).sort((a, b) => a - b)) {
    out[phase] = buildPlanCatalogFromTests(phase);
  }
  return out;
})();

// Default catalog for the test-rail = latest-completed phase. Kept exported
// as PLAN_CATALOG for backward compatibility with the unit tests.
export const PLAN_CATALOG = PHASE_1_CATALOG;

// ─── Phase metadata ───────────────────────────────────────────────────
//
// Driven by public/fixtures/events.json — the world-cup-2026 event's
// iterations array holds the 9 phases with display_name + starts_at_iso.
// Used by the "Phase N · COMPLETE" banner's next-phase teaser.

interface PhaseMeta {
  phaseNumber: number;
  label: string;         // "Phase 2 · Match details"
  startsAtIso: string;
}

export function buildPhaseLookup(): Record<number, PhaseMeta> {
  const out: Record<number, PhaseMeta> = {};
  const worldCup = eventsIndex.events.find((e) => e.slug === 'world-cup-2026');
  if (!worldCup) return out;
  for (const iter of worldCup.iterations) {
    const itAny = iter as { phase_number?: number; display_name?: string; starts_at_iso?: string };
    const pn = typeof itAny.phase_number === 'number' ? itAny.phase_number : null;
    if (pn === null) continue;
    out[pn] = {
      phaseNumber: pn,
      label: itAny.display_name ?? `Phase ${pn}`,
      startsAtIso: itAny.starts_at_iso ?? '',
    };
  }
  return out;
}

export const PHASE_LOOKUP = buildPhaseLookup();

function formatPhaseDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoToClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function eventKey(e: WireEvent): string {
  return `${e.ts}|${e.agent}|${e.type}|${e.target}`;
}

export function isValidWireEvent(e: unknown): e is WireEvent {
  if (!e || typeof e !== 'object') return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.ts === 'string' &&
    typeof obj.agent === 'string' &&
    obj.agent in WIRE_TO_UI &&
    typeof obj.type === 'string' &&
    obj.type in ACTION_LABEL &&
    typeof obj.target === 'string'
  );
}

export function parseJsonl(text: string): WireEvent[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): WireEvent | null => {
      try {
        const parsed = JSON.parse(line);
        if (!isValidWireEvent(parsed)) return null;
        return parsed as WireEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is WireEvent => e !== null);
}

function toStreamLine(e: WireEvent, flash: boolean): StreamLine {
  return {
    id: eventKey(e),
    ts: isoToClock(e.ts),
    iso: e.ts,
    agent: WIRE_TO_UI[e.agent],
    phase: typeof e.phase === 'number' ? e.phase : 0,
    type: e.type,
    file: e.target,
    meta: e.meta ?? '',
    flash,
  };
}

export function parseComposite(scoreText: string | null): number | null {
  if (!scoreText) return null;
  const m = scoreText.match(/[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

type FetchStatus = 'loading' | 'ok' | 'error';

// Derive "latest scored phase" from events.json — used to surface the
// most-recently-scored phase in the page eyebrow + as the default
// suggestion next to the phase toggle. Falls back to phase 1 when
// nothing has shipped yet.
function getLatestScoredPhase(): number {
  const worldCup = eventsIndex.events.find((e) => e.slug === 'world-cup-2026');
  if (!worldCup) return 1;
  const scoredPhases = worldCup.iterations
    .map((it) => it as unknown as { phase_number?: number; state?: string })
    .filter((it) => it.state === 'completed' || it.state === 'live')
    .map((it) => it.phase_number ?? 0)
    .filter((n) => n > 0);
  if (scoredPhases.length === 0) return 1;
  // Restrict to phases we actually have a catalog for (CATALOG_BY_PHASE is
  // built from the TESTS catalog, which covers every scored phase).
  const withCatalog = scoredPhases.filter((n) => CATALOG_BY_PHASE[n]?.length);
  return withCatalog.length ? Math.max(...withCatalog) : 1;
}

const LATEST_SCORED_PHASE = getLatestScoredPhase();

// Set of phase numbers events.json marks as actually scored (completed/live).
// The agent fixtures carry runs[] for phases that are still `planning` in
// events.json (e.g. a dry-run of phase 3 lands in the fixture before the
// phase is published). Gating the per-phase aggregation below by this set
// keeps the phase-complete banner's "N of 9 phases scored" + total
// wall-clock in lockstep with the hero eyebrow — both now count only
// published phases instead of the banner silently counting the unpublished
// dry-run phase too.
function getScoredPhaseSet(): Set<number> {
  const worldCup = eventsIndex.events.find((e) => e.slug === 'world-cup-2026');
  const out = new Set<number>();
  if (!worldCup) return out;
  for (const it of worldCup.iterations) {
    const itAny = it as unknown as { phase_number?: number; state?: string };
    if (
      (itAny.state === 'completed' || itAny.state === 'live') &&
      typeof itAny.phase_number === 'number' &&
      itAny.phase_number > 0
    ) {
      out.add(itAny.phase_number);
    }
  }
  return out;
}

const SCORED_PHASE_SET = getScoredPhaseSet();

// The next phase that has NOT yet been scored — i.e. the first phase whose
// state is still planning/dry-run, after the highest scored phase. Used by
// the phase-complete banner's "Next phase" teaser. Blindly using
// `streamedPhase + 1` was wrong: the stream replays phase 1, but phase 2 is
// already scored, so the teaser used to say "Next phase: Phase 2" (with a
// past unlock date) when phase 2 is in fact complete.
function getNextUnscoredPhase(): PhaseMeta | null {
  const worldCup = eventsIndex.events.find((e) => e.slug === 'world-cup-2026');
  if (!worldCup) return null;
  const scored = worldCup.iterations
    .map((it) => it as unknown as { phase_number?: number; state?: string })
    .filter((it) => it.state === 'completed' || it.state === 'live')
    .map((it) => it.phase_number ?? 0)
    .filter((n) => n > 0);
  const maxScored = scored.length > 0 ? Math.max(...scored) : 0;
  const candidates = worldCup.iterations
    .map((it) => it as unknown as { phase_number?: number; display_name?: string; state?: string; starts_at_iso?: string })
    .filter((it) => (it.phase_number ?? 0) > maxScored && (it.state === 'planning' || it.state === 'dry-run'))
    .sort((a, b) => (a.phase_number ?? 0) - (b.phase_number ?? 0));
  const next = candidates[0];
  if (!next || typeof next.phase_number !== 'number') return null;
  return {
    phaseNumber: next.phase_number,
    label: next.display_name ?? `Phase ${next.phase_number}`,
    startsAtIso: next.starts_at_iso ?? '',
  };
}

const NEXT_UNSCORED_PHASE = getNextUnscoredPhase();

// Default active phase for the workspace + test-rail panes. Hardcoded to
// phase 1 to keep the cohort-3 JSONL stream (which is all phase 1) aligned
// with the test rail's plan catalog on first paint — flipping to phase 2
// is a single click on the rail. The eyebrow + hero copy already reflect
// the latest-scored phase via LATEST_SCORED_PHASE.
const DEFAULT_ACTIVE_PHASE = 1;

// Phases offered in the test-rail toggle: scored (per events.json) AND
// catalogued (per TESTS), sorted ascending. Today: 1-6.
const TOGGLE_PHASES: number[] = Array.from(SCORED_PHASE_SET)
  .filter((n) => CATALOG_BY_PHASE[n]?.length)
  .sort((a, b) => a - b);

export function LiveClient() {
  const [lines, setLines] = useState<StreamLine[]>([]);
  // The 3 big agent cards in the center column ARE the agent selector for
  // the whole dashboard. Clicking a card re-scopes the Workspace panel (and
  // any future per-agent slots) to that agent. Default: claude.
  //
  // The stream panel itself intentionally stays unfiltered — every event
  // shows, color-coded by the `data-agent` attribute on each row. We
  // dropped the prior CC/OX/AG filter chips after the polish pass:
  // duplicating the selection control in two places was noise, not signal.
  // Start with 'claude' as placeholder; flipped to the rank-1 agent once
  // the leaderboard hydrates (see the effect below). Manual card clicks pin
  // the selection and prevent further auto-switches.
  const [selectedAgent, setSelectedAgent] = useState<AgentKey>('claude');
  const [userPinnedAgent, setUserPinnedAgent] = useState(false);
  // Track whether the user has interacted with the agent selector. The
  // "click an agent card to switch" hint disappears the moment they do
  // — keeping it visible afterwards is noise, not signal.
  const [hasUserSelectedAgent, setHasUserSelectedAgent] = useState(false);
  // Active phase for the workspace + test-rail panes. Starts at phase 1
  // for stream-alignment + test-stability; user toggles to phase 2 via
  // the rail above the test panel.
  const [activePhase, setActivePhase] = useState<number>(DEFAULT_ACTIVE_PHASE);
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const streamBodyRef = useRef<HTMLDivElement | null>(null);
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Poll the JSONL stream. The first call hydrates the list; subsequent
  // calls diff against `seenIdsRef` and append only the new events.
  useEffect(() => {
    let cancelled = false;
    const url = `${LIVE_CDN_BASE}${COHORT_PATH}`;

    async function poll(isFirst: boolean) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
        const text = await res.text();
        if (cancelled) return;

        const wireEvents = parseJsonl(text);
        // Sort ascending by ts so newest ends up last (we render reversed).
        wireEvents.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

        if (isFirst) {
          // Initial hydrate — no flash on existing history.
          const initialLines = wireEvents.map((e) => toStreamLine(e, false));
          seenIdsRef.current = new Set(initialLines.map((l) => l.id));
          setLines(initialLines);
        } else {
          // Diff-append: only events whose key we haven't seen.
          const fresh = wireEvents.filter(
            (e) => !seenIdsRef.current.has(eventKey(e)),
          );
          if (fresh.length > 0) {
            const freshLines = fresh.map((e) => toStreamLine(e, true));
            for (const l of freshLines) seenIdsRef.current.add(l.id);
            setLines((prev) => [...prev, ...freshLines]);

            // Drop the flash flag after the existing flashin animation
            // duration (500ms — matches the prior fake-stream timing).
            for (const l of freshLines) {
              const timer = setTimeout(() => {
                setLines((current) =>
                  current.map((row) =>
                    row.id === l.id ? { ...row, flash: false } : row,
                  ),
                );
                flashTimersRef.current.delete(l.id);
              }, 500);
              flashTimersRef.current.set(l.id, timer);
            }
          }
        }

        setStatus('ok');
        setLastUpdated(new Date().toISOString());
      } catch {
        if (!cancelled) setStatus((prev) => (prev === 'ok' ? 'ok' : 'error'));
      }
    }

    void poll(true);
    const id = setInterval(() => void poll(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      for (const t of flashTimersRef.current.values()) clearTimeout(t);
      flashTimersRef.current.clear();
    };
  }, []);

  // Auto-scroll the stream as new events land.
  useEffect(() => {
    const body = streamBodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines]);

  // Derived: latest event per agent — powers the racer cards.
  const racerActions = useMemo<Record<AgentKey, StreamLine | null>>(() => {
    const latest: Record<AgentKey, StreamLine | null> = {
      claude: null,
      codex: null,
      antigrav: null,
      kimi: null,
    };
    for (const line of lines) {
      latest[line.agent] = line;
    }
    return latest;
  }, [lines]);

  // Derived: per-agent counters from the real stream.
  const counters = useMemo(() => {
    let writes = 0;
    let reads = 0;
    let builds = 0;
    let deploys = 0;
    const filesByAgent: Record<AgentKey, number> = {
      claude: 0,
      codex: 0,
      antigrav: 0,
      kimi: 0,
    };
    // Total stream events per agent — powers the racer "Events" tile
    // (was a low-signal ●/— active-dot before; a real count is more useful
    // and aligns with the page-level "Total events" tile).
    const eventsByAgent: Record<AgentKey, number> = {
      claude: 0,
      codex: 0,
      antigrav: 0,
      kimi: 0,
    };
    const lastScore: Record<AgentKey, string | null> = {
      claude: null,
      codex: null,
      antigrav: null,
      kimi: null,
    };
    for (const line of lines) {
      eventsByAgent[line.agent] += 1;
      if (line.type === 'write') {
        writes += 1;
        filesByAgent[line.agent] += 1;
      }
      if (line.type === 'read') reads += 1;
      if (line.type === 'build') builds += 1;
      if (line.type === 'deploy' || line.type === 'ship') deploys += 1;
      if (line.type === 'score') lastScore[line.agent] = line.file;
    }
    return {
      total: lines.length,
      eventsByAgent,
      writes,
      reads,
      builds,
      deploys,
      filesByAgent,
      lastScore,
    };
  }, [lines]);

  // Derived: time bounds for the wall-clock strip — first event = start.
  //
  // We track the *bounds* from the JSONL stream (first event / last event
  // ISO) plus a `nowMs` clock state that ticks every second while the
  // phase is in-flight. The "phase in-flight" signal is: stream is
  // populated but no `score` event for all 3 agents yet (i.e.
  // `phaseComplete === null`). When complete, the elapsed is locked to
  // last-event − first-event so the display doesn't drift.
  //
  // The prior implementation derived `elapsedSec` purely from the stream
  // events — meaning the timer froze the moment the stream stopped
  // emitting (which is exactly what happens after phase-1 finished). The
  // user saw a static `03:40:01` for hours afterwards.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const startMs = useMemo(
    () => (lines.length === 0 ? null : new Date(lines[0].iso).getTime()),
    [lines],
  );
  const lastEventMs = useMemo(
    () =>
      lines.length === 0
        ? null
        : new Date(lines[lines.length - 1].iso).getTime(),
    [lines],
  );

  // Derived: per-agent file-write tree for the workspace panel.
  //
  // NOTE (issue C — "我们不都deploy了吗?" / didn't we deploy?):
  // This panel is intentionally a *live* view of `type: "write"` events
  // landing on the JSONL stream — NOT the static `out/` tree of the
  // already-deployed Amplify app. With the cohort-3 seed JSONL it
  // populates correctly: each agent has 2–4 writes that file in here
  // under their target paths. If the deployed view of the final
  // `out/` tree is wanted instead (post-ship snapshot rather than
  // in-flight stream), that's a conceptual change — needs a separate
  // panel keyed off `ship`/`deploy` events and pulling the deployed
  // app's manifest, not a fix to this memo.
  //
  // Last-write wins on duplicates; sorted newest-first so the most
  // recently edited file is at the top.
  interface WriteEntry {
    file: string;
    meta: string;
    iso: string;
    ts: string;
  }
  const workspaceEntries = useMemo<Record<AgentKey, WriteEntry[]>>(() => {
    const out: Record<AgentKey, WriteEntry[]> = {
      claude: [],
      codex: [],
      antigrav: [],
      kimi: [],
    };
    const seenByAgent: Record<AgentKey, Map<string, WriteEntry>> = {
      claude: new Map(),
      codex: new Map(),
      antigrav: new Map(),
      kimi: new Map(),
    };
    for (const line of lines) {
      if (line.type !== 'write') continue;
      // Last write wins — newer iso replaces older.
      seenByAgent[line.agent].set(line.file, {
        file: line.file,
        meta: line.meta,
        iso: line.iso,
        ts: line.ts,
      });
    }
    for (const ag of ['claude', 'codex', 'antigrav', 'kimi'] as AgentKey[]) {
      const arr = Array.from(seenByAgent[ag].values());
      arr.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
      out[ag] = arr;
    }
    return out;
  }, [lines]);

  // Per-PHASE composite + wall-clock from the agent fixtures' runs[] —
  // the per-phase numbers powering the cumulative banner's scored-phase
  // COUNT + the TOTAL wall-clock (sum of each phase's slowest-agent wall).
  // The stream's own score events are a stale replay: phase-1 composite was
  // recorded when wall/cost were $0, so it collapsed to the correctness value
  // (0.75/0.625/0.562) instead of the real composite (0.789/0.701/0.641).
  // Keyed [phase][wireSlug] = { composite, wall(minutes) }. Populated by the
  // agent-fixtures fetch below.
  const [phaseScores, setPhaseScores] = useState<
    Record<number, Record<string, { composite: number; wall: number }>>
  >({});
  // Per-agent CUMULATIVE composite fetched from leaderboard.json — used
  // to sort racer cards, to display the "Composite" stat on each card, AND
  // (since 2026-05-28) to rank + label the phase-complete banner's podium as
  // the across-phase standing. Composite-as-cumulative is the user-facing
  // "true score" once phases are accumulating. Falls back to the stream's
  // per-phase score event only until the leaderboard fixture hydrates.
  // Declared above the phaseComplete memo because that memo reads it.
  const [agentComposite, setAgentComposite] = useState<Record<string, number>>({});

  // Derived: phase-complete state — all 3 agents have at least one
  // score event. Builds the banner payload, which is now framed as the
  // CUMULATIVE standing (not the per-phase replay): ranked cumulative
  // composites from leaderboard.json, vendor logos, total wall-clock
  // across all scored phases, next-phase teaser. The stream's score
  // events are still the *gate* for whether the banner shows at all
  // (all 3 agents scored = a phase wrapped), but the numbers shown are
  // the across-phase totals — the user found the per-phase "Phase 1
  // COMPLETE" framing confusing while phase 2 was the latest scored.
  interface PhaseCompleteRow {
    agent: AgentKey;
    slug: WireAgent;
    name: string;
    composite: number | null;
    rawScore: string;
  }
  const phaseComplete = useMemo(() => {
    const scoreLineByAgent: Record<AgentKey, StreamLine | null> = {
      claude: null,
      codex: null,
      antigrav: null,
      kimi: null,
    };
    // Agents that actually appear in the stream (any event). The banner shows
    // when EVERY agent present in the stream has a score event — agent-set-driven
    // rather than hardcoded to a fixed roster, so a 3-agent cohort, the 4-agent
    // v3 stream, and any future roster all work without code changes.
    const agentsInStream: AgentKey[] = [];
    for (const line of lines) {
      if (line.type === 'score') scoreLineByAgent[line.agent] = line;
      if (!agentsInStream.includes(line.agent)) agentsInStream.push(line.agent);
    }
    const scoredAgents = agentsInStream.filter((a) => scoreLineByAgent[a]);
    const allScored = agentsInStream.length > 0 && scoredAgents.length === agentsInStream.length;
    if (!allScored) return null;

    // Stream phase number — only used as the fallback for `scoredCount`
    // when phaseScores hasn't hydrated (e.g. server render / tests). Take
    // the max across the score events (handles a mid-phase clock skew
    // where one agent's score arrives last).
    const streamPhaseNum = Math.max(
      ...scoredAgents.map((a) => scoreLineByAgent[a]!.phase),
      1,
    );

    // Number of scored phases for the eyebrow ("N OF 9 PHASES SCORED").
    // Derived from the hydrated per-phase map; falls back to the stream's
    // phase number when fixtures haven't loaded (pre-hydrate / tests).
    const haveFixtures = Object.keys(phaseScores).length > 0;
    const scoredCount = haveFixtures ? Object.keys(phaseScores).length : streamPhaseNum;

    const rows: PhaseCompleteRow[] = scoredAgents.map(
      (ag) => {
        const sl = scoreLineByAgent[ag]!;
        const wire = UI_TO_WIRE[ag];
        // CUMULATIVE composite from leaderboard.json (the across-phase
        // "true score" the leaderboard ranks on); fall back to the
        // stream's per-phase score line only until the fixtures hydrate.
        const composite = agentComposite[wire] ?? parseComposite(sl.file);
        return {
          agent: ag,
          slug: wire,
          name: AGENT_DISPLAY_NAME[ag],
          composite,
          rawScore: sl.file,
        };
      },
    );
    rows.sort((a, b) => (b.composite ?? -Infinity) - (a.composite ?? -Infinity));

    // Total wall-clock = sum over every scored phase of that phase's MAX
    // agent wall-clock (agents run in parallel, so a phase isn't done
    // until the slowest finishes; the cohort total is the sum of those
    // per-phase maxima). From the hydrated fixtures. Falls back to the
    // stream's first-start→last-score span only until the fixtures load.
    let totalWallSec: number;
    if (haveFixtures) {
      const totalMin = Object.values(phaseScores).reduce(
        (acc, byAgent) =>
          acc + Math.max(...Object.values(byAgent).map((s) => s.wall)),
        0,
      );
      totalWallSec = Math.round(totalMin * 60);
    } else {
      let firstStartMs: number | null = null;
      let lastScoreMs: number | null = null;
      for (const line of lines) {
        const ms = new Date(line.iso).getTime();
        if (Number.isNaN(ms)) continue;
        if (line.type === 'start' && (firstStartMs === null || ms < firstStartMs)) firstStartMs = ms;
        if (line.type === 'score' && (lastScoreMs === null || ms > lastScoreMs)) lastScoreMs = ms;
      }
      if (firstStartMs === null) firstStartMs = new Date(lines[0].iso).getTime();
      if (lastScoreMs === null) lastScoreMs = new Date(lines[lines.length - 1].iso).getTime();
      totalWallSec = Math.max(0, Math.round((lastScoreMs - firstStartMs) / 1000));
    }
    const elapsedH = Math.floor(totalWallSec / 3600);
    const elapsedM = Math.floor((totalWallSec % 3600) / 60);
    const elapsedS = totalWallSec % 60;

    // Next phase = the first NOT-yet-scored phase (planning/dry-run), not
    // blindly streamedPhase+1 — the stream replays phase 1 but phase 2 is
    // already scored, so phaseNum+1 pointed at an already-complete phase
    // with a past unlock date. Falls back to PHASE_LOOKUP[phaseNum+1] only
    // when nothing in events.json is still planned (cohort wrap).
    const nextPhase = NEXT_UNSCORED_PHASE ?? PHASE_LOOKUP[streamPhaseNum + 1] ?? null;

    return {
      scoredCount,
      rows,
      elapsedDisplay: `${pad2(elapsedH)}:${pad2(elapsedM)}:${pad2(elapsedS)}`,
      totalWallSec,
      nextPhase,
    };
  }, [lines, phaseScores, agentComposite]);

  // Wall-clock derivation — picks one of three states:
  //   1. no stream yet → 0:00:00 / "—" remaining
  //   2. phase complete (all 3 scored) → lock elapsed to phaseComplete's
  //      lastScore − firstStart total, no remaining countdown, "(completed)"
  //   3. phase in-flight → elapsed = nowMs − firstEvent (live tick),
  //      remaining = budget − elapsed (clamped >= 0)
  const phaseInFlight = phaseComplete === null && startMs !== null;
  const isPhaseComplete = phaseComplete !== null;

  // Tick effect: 1s setInterval only while phase is in-flight. The
  // setNowMs call flips `nowMs` every second and re-runs the derived
  // elapsed/remaining below.
  useEffect(() => {
    if (!phaseInFlight) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phaseInFlight]);

  const { elapsedSec, remainSec, phaseStateTag } = useMemo<{
    elapsedSec: number;
    remainSec: number | null;
    phaseStateTag: string | null;
  }>(() => {
    if (startMs === null) {
      return { elapsedSec: 0, remainSec: null, phaseStateTag: null };
    }
    if (isPhaseComplete) {
      // Lock elapsed to the cumulative TOTAL wall-clock across all scored
      // phases (the same value the banner shows) so the timer-strip and the
      // banner agree exactly. Fall back to the stream's first-event→last-event
      // span only until the fixtures hydrate.
      const endMs = lastEventMs ?? startMs;
      const streamSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
      return {
        elapsedSec: phaseComplete?.totalWallSec ?? streamSec,
        remainSec: null,
        phaseStateTag: 'completed',
      };
    }
    // In-flight: live-tick from nowMs.
    const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    return {
      elapsedSec: elapsed,
      remainSec: Math.max(0, BUDGET_MIN * 60 - elapsed),
      phaseStateTag: null,
    };
  }, [startMs, lastEventMs, nowMs, isPhaseComplete, phaseComplete]);

  const progPct = Math.min(100, (elapsedSec / (BUDGET_MIN * 60)) * 100);
  const rh = remainSec === null ? 0 : Math.floor(remainSec / 3600);
  const rm = remainSec === null ? 0 : Math.floor((remainSec % 3600) / 60);
  const rs = remainSec === null ? 0 : remainSec % 60;
  const eh = Math.floor(elapsedSec / 3600);
  const em = Math.floor((elapsedSec % 3600) / 60);
  const es = elapsedSec % 60;

  // Per-plan verdict map — scoped to the *selected* agent's fixture.
  // Each agent's `per_test_verdicts` carries the plan `name` + verdict;
  // we match by name (matching by test_id isn't possible because the
  // TestSprite-assigned UUIDs differ from the static catalog test_ids
  // and the agent fixture stores the engine UUID).
  //
  // The previous version of this code aggregated worst-of across all 3
  // agents — i.e. a plan was only `passed` if EVERY agent passed it. That
  // surfaced as a misleading "5 pass · 11 fail" header even on a card
  // labeled "Workspace · claude-code" (whose own fixture is 10 pass / 6
  // fail). User reversed that decision 2026-05-28: the panel head says
  // "Workspace · <selectedAgent>" so the test rail must also be scoped to
  // <selectedAgent>'s own verdicts. Switching cards re-scopes the rail.
  // `blocked` is a first-class verdict in the agent fixtures (a definitive
  // non-pass that counts in the cumulative-correctness denominator) — the
  // rest of the site (TestDetailClient, AgentDetailClient) surfaces it
  // distinctly, so the /live rail must too rather than collapsing it into
  // `pending` (which on a COMPLETED phase reads as "still running").
  type PlanVerdict = 'pending' | 'passed' | 'failed' | 'inconclusive' | 'blocked';
  const [agentVerdicts, setAgentVerdicts] = useState<
    Record<string, Record<string, string>>
  >({});
  // (agentComposite is declared above, before the phaseComplete memo that
  // consumes it; setAgentComposite is called in the same fetch effect below.)
  const [agentCorrectness, setAgentCorrectness] = useState<Record<string, number>>({});
  // Verdicts now collected per phase so the test rail can scope to the
  // active phase. Structure: { [wireSlug]: { [phaseNum]: { [name]: verdict } } }
  // — for backward compat we keep agentVerdicts above for the
  // selectedAgentVerdicts fan-out, but verdicts FOR THE ACTIVE PHASE are
  // resolved via the per-phase map below.
  // (kept the old agentVerdicts state — populated below in the same fetch.)

  useEffect(() => {
    let alive = true;
    (async () => {
      const slugs = ['claude-code', 'codex', 'antigravity', 'kimi'];
      const verdictsOut: Record<string, Record<string, string>> = {};
      const correctnessOut: Record<string, number> = {};
      const compositeOut: Record<string, number> = {};
      const phaseScoresOut: Record<number, Record<string, { composite: number; wall: number }>> = {};
      // Hit leaderboard.json first for cumulative composite + correctness.
      try {
        const lb = await fetch(`${CDN_BASE}/leaderboard.json`, { cache: 'no-store' })
          .then((r) => r.json());
        type LbRow = {
          agent_slug: string;
          composite?: number;
          components?: { correctness?: number };
        };
        for (const row of (lb?.rankings ?? []) as LbRow[]) {
          if (typeof row.composite === 'number') compositeOut[row.agent_slug] = row.composite;
          const c = row.components?.correctness;
          if (typeof c === 'number') correctnessOut[row.agent_slug] = c;
        }
      } catch {}
      await Promise.all(
        slugs.map(async (slug) => {
          try {
            const a: AgentJson = await fetch(
              `${CDN_BASE}/agents/${slug}.json`,
              { cache: 'no-store' },
            ).then((r) => r.json());
            const verdictByName: Record<string, string> = {};
            // Walk all runs newest-first so the latest verdict per plan wins.
            const runs = [...(a?.runs ?? [])].sort((x, y) => {
              const tx = x.started_at ? new Date(x.started_at).getTime() : 0;
              const ty = y.started_at ? new Date(y.started_at).getTime() : 0;
              return ty - tx;
            });
            for (const run of runs) {
              for (const v of run.per_test_verdicts ?? []) {
                if (!verdictByName[v.name]) {
                  verdictByName[v.name] = v.verdict;
                }
              }
            }
            verdictsOut[slug] = verdictByName;
            // Per-phase composite + wall-clock for the phase-complete podium.
            for (const run of runs) {
              const ph = (run as unknown as { phase?: number }).phase;
              if (typeof ph !== 'number') continue;
              // Only count phases events.json has actually published as
              // scored (1-6 today). Fixtures may carry an unpublished
              // dry-run phase ahead of its events.json publish; counting it
              // here would contradict the hero eyebrow's derived count.
              if (SCORED_PHASE_SET.size > 0 && !SCORED_PHASE_SET.has(ph)) continue;
              const comp = run.score?.composite;
              if (typeof comp !== 'number') continue;
              const wall = run.score?.side_metrics?.raw?.wall_clock_minutes;
              (phaseScoresOut[ph] ??= {})[slug] = {
                composite: comp,
                wall: typeof wall === 'number' ? wall : 0,
              };
            }
            // Fallback: per-run correctness when leaderboard didn't carry it.
            if (typeof correctnessOut[slug] !== 'number') {
              const firstRun = runs[0];
              const c = firstRun?.score?.components?.correctness;
              if (typeof c === 'number') correctnessOut[slug] = c;
            }
          } catch {
            verdictsOut[slug] = {};
          }
        }),
      );
      if (alive) {
        setAgentVerdicts(verdictsOut);
        setAgentCorrectness(correctnessOut);
        setAgentComposite(compositeOut);
        setPhaseScores(phaseScoresOut);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Selected-agent's verdict map, keyed by plan name. Empty {} until the
  // fixtures hydrate.
  const selectedAgentVerdicts = useMemo<Record<string, string>>(() => {
    const wireSlug = UI_TO_WIRE[selectedAgent];
    return agentVerdicts[wireSlug] ?? {};
  }, [agentVerdicts, selectedAgent]);

  // Active catalog defaults to phase 1 (aligns with the cohort JSONL stream);
  // user can flip across any scored phase (1-6) via the rail above the panel.
  const activeCatalog = CATALOG_BY_PHASE[activePhase] ?? PHASE_1_CATALOG;

  const verdictByPlan = useMemo<Record<string, PlanVerdict>>(() => {
    const out: Record<string, PlanVerdict> = {};
    const hasData = Object.keys(selectedAgentVerdicts).length > 0;
    const verdictEntries = Object.entries(selectedAgentVerdicts);
    for (const p of activeCatalog) {
      if (!hasData) {
        out[p.path] = 'pending';
        continue;
      }
      // TestSprite truncates verdict.name at ~60 chars while data.ts
      // carries the full plan name. Use planNameMatches (prefix-tolerant)
      // so phase-1 + phase-2 plans both join correctly.
      const entry = verdictEntries.find(([name]) => planNameMatches(name, p.name));
      const v = entry?.[1];
      if (v === 'passed') out[p.path] = 'passed';
      else if (v === 'failed') out[p.path] = 'failed';
      else if (v === 'blocked') out[p.path] = 'blocked';
      else if (v === 'inconclusive') out[p.path] = 'inconclusive';
      else out[p.path] = 'pending';
    }
    return out;
  }, [selectedAgentVerdicts, activeCatalog]);

  const planCounts = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let blocked = 0;
    let pending = 0;
    for (const p of activeCatalog) {
      const v = verdictByPlan[p.path] ?? 'pending';
      if (v === 'passed') passed += 1;
      else if (v === 'failed') failed += 1;
      // blocked + inconclusive are definitive non-passes (count in the
      // correctness denominator) — bucket them under "blocked" in the
      // header so they don't masquerade as still-running "pending" rows.
      else if (v === 'blocked' || v === 'inconclusive') blocked += 1;
      else pending += 1;
    }
    return { passed, failed, blocked, pending };
  }, [verdictByPlan, activeCatalog]);
  const pendingCount = planCounts.pending;

  // Racer card order: cumulative composite desc once leaderboard hydrates;
  // static fallback (claude → codex → antigrav) while loading. Composite
  // is the user-facing "true score" — the phase-complete podium below
  // also sorts by composite, so the two reads are aligned.
  const racerOrder = useMemo<AgentKey[]>(() => {
    const haveComposite = Object.keys(agentComposite).length > 0;
    const haveCorrectness = Object.keys(agentCorrectness).length > 0;
    if (!haveComposite && !haveCorrectness) return STATIC_RACER_ORDER;
    const scoreOf = (a: AgentKey): number => {
      const slug = UI_TO_WIRE[a];
      const c = agentComposite[slug];
      if (typeof c === 'number') return c;
      return agentCorrectness[slug] ?? -Infinity;
    };
    const order = [...STATIC_RACER_ORDER];
    order.sort((a, b) => {
      const ca = scoreOf(a);
      const cb = scoreOf(b);
      if (cb !== ca) return cb - ca;
      return STATIC_RACER_ORDER.indexOf(a) - STATIC_RACER_ORDER.indexOf(b);
    });
    return order;
  }, [agentComposite, agentCorrectness]);

  // Auto-select rank-1 agent once the leaderboard hydrates, unless the user
  // already manually picked a card.
  useEffect(() => {
    if (userPinnedAgent) return;
    if (racerOrder[0] && racerOrder[0] !== selectedAgent) {
      setSelectedAgent(racerOrder[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racerOrder]);

  const isEmpty = status === 'ok' && lines.length === 0;
  const isError = status === 'error' && lines.length === 0;

  const currentWriteEntries = workspaceEntries[selectedAgent];

  // Derive eyebrow + hero copy from events.json + leaderboard state.
  // When phases have been scored, surface the latest one + the cohort
  // progress. When nothing has scored yet, fall back to the prior
  // "race is on" framing so the page reads correctly during the first
  // cohort window.
  const phasesScored = useMemo(() => {
    const worldCup = eventsIndex.events.find((e) => e.slug === 'world-cup-2026');
    if (!worldCup) return [] as Array<{ phaseNumber: number; label: string }>;
    return worldCup.iterations
      .map((it) => it as unknown as { phase_number?: number; display_name?: string; state?: string })
      .filter((it) => it.state === 'completed' || it.state === 'live')
      .map((it) => ({
        phaseNumber: it.phase_number ?? 0,
        label: it.display_name ?? '',
      }))
      .filter((p) => p.phaseNumber > 0)
      .sort((a, b) => a.phaseNumber - b.phaseNumber);
  }, []);
  const phasesPlannedTotal = useMemo(() => {
    const worldCup = eventsIndex.events.find((e) => e.slug === 'world-cup-2026');
    return worldCup?.iterations.length ?? 9;
  }, []);
  const latestScoredPhase = phasesScored[phasesScored.length - 1] ?? null;
  const nextPlannedPhase = useMemo(() => {
    const worldCup = eventsIndex.events.find((e) => e.slug === 'world-cup-2026');
    if (!worldCup) return null;
    const after = (latestScoredPhase?.phaseNumber ?? 0);
    const candidates = worldCup.iterations
      .map((it) => it as unknown as { phase_number?: number; display_name?: string; state?: string; starts_at_iso?: string })
      .filter((it) => (it.phase_number ?? 0) > after && (it.state === 'planning' || it.state === 'dry-run'))
      .sort((a, b) => (a.phase_number ?? 0) - (b.phase_number ?? 0));
    return candidates[0] ?? null;
  }, [latestScoredPhase]);

  const liveEyebrowText = latestScoredPhase
    ? `${latestScoredPhase.label} · cohort complete · ${phasesScored.length} of ${phasesPlannedTotal} phases scored`
    : 'Phase 1 · landing page · cohort live';

  return (
    <>
      <Nav active="live" />

      <div className="shell">
        <header className="live-hero">
          <div className="live-hero-inner">
            <div>
              <div className="live-eyebrow">
                <span className="dot" /> {liveEyebrowText}
              </div>
              <h1>
                {phasesScored.length > 0 ? (
                  <>
                    {phasesScored.length} phase{phasesScored.length === 1 ? '' : 's'} scored.{' '}
                    <em>{phasesPlannedTotal - phasesScored.length} to go.</em>
                    <br />
                    <span className="accent">
                      {nextPlannedPhase
                        ? `${nextPlannedPhase.display_name ?? `Phase ${nextPlannedPhase.phase_number ?? '?'}`} next.`
                        : 'Cohort wrap incoming.'}
                    </span>
                  </>
                ) : (
                  <>
                    Multiple agents. <em>One task.</em>
                    <br />
                    <span className="accent">The race is on.</span>
                  </>
                )}
              </h1>
              <p className="live-hero-sub">
                {phasesScored.length > 0 ? (
                  <>
                    {phasesScored.length} phase{phasesScored.length === 1 ? '' : 's'} of the
                    {' '}{phasesPlannedTotal}-phase World Cup task scored. Inspect each
                    agent&apos;s workspace + test verdicts per phase below — switch the
                    phase rail to see how the leaderboard came together.
                  </>
                ) : (
                  <>
                    Watch every agent ship the same Next.js app in real time.
                    Every file write, every shell command, every test pass — streamed
                    from the runner host as it happens.
                  </>
                )}
              </p>
            </div>
            <div
              className={`timer-strip${isPhaseComplete ? ' completed' : ''}`}
              data-testid="wall-clock-strip"
              data-phase-state={phaseStateTag ?? 'in-flight'}
            >
              <div className="label">
                {isPhaseComplete
                  ? 'Total wall-clock · cumulative'
                  : 'Wall-clock · time remaining'}
              </div>
              <div className="big num" data-testid="wall-clock-big">
                {isPhaseComplete ? (
                  <>
                    <span>{pad2(eh)}</span>
                    <span className="sep">:</span>
                    <span>{pad2(em)}</span>
                    <span className="sep">:</span>
                    <span>{pad2(es)}</span>
                  </>
                ) : (
                  <>
                    <span>{pad2(rh)}</span>
                    <span className="sep">:</span>
                    <span>{pad2(rm)}</span>
                    <span className="sep">:</span>
                    <span>{pad2(rs)}</span>
                  </>
                )}
              </div>
              <div className="sub" data-testid="wall-clock-sub">
                {isPhaseComplete ? (
                  <>
                    <span className="completed-tag">(completed)</span> ·
                    summed across{' '}
                    <span>
                      {phaseComplete
                        ? `${phaseComplete.scoredCount} scored phase${
                            phaseComplete.scoredCount === 1 ? '' : 's'
                          }`
                        : 'scored phases'}
                    </span>
                  </>
                ) : (
                  <>
                    elapsed{' '}
                    <span>
                      {pad2(eh)}:{pad2(em)}:{pad2(es)}
                    </span>
                  </>
                )}
              </div>
              {!isPhaseComplete && (
                <>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progPct}%` }}
                    />
                  </div>
                  <div className="progress-marks">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {phaseComplete && (
          <section className="phase-complete-banner">
            <div className="pcb-head">
              {/*
                Cumulative framing (not "Phase N COMPLETE"): the banner shows
                the across-phase leaderboard standing, so the eyebrow reads
                "■ N OF 9 PHASES SCORED · cumulative standing" — one mono line,
                square marker, lowercase qualifier after the dot.
              */}
              <div className="pcb-title">
                <span className="pcb-eyebrow">
                  <span className="pcb-marker">■</span>{' '}
                  {phaseComplete.scoredCount} of {phasesPlannedTotal} phases scored
                </span>
                <span className="pcb-state">· cumulative standing</span>
              </div>
              <div className="pcb-elapsed">
                <span className="pcb-elapsed-label">Total wall-clock</span>
                <span className="pcb-elapsed-value num">
                  {phaseComplete.elapsedDisplay}
                </span>
              </div>
            </div>
            <ol className="pcb-podium">
              {phaseComplete.rows.map((r, i) => (
                <li key={r.agent} className={i === 0 ? 'pcb-row leading' : 'pcb-row'}>
                  <span className="pcb-rank">
                    {String(i + 1).padStart(2, '0')}
                    {/* Leader gets a star, the rest a blank slot so the
                       agent name column stays aligned across all rows. */}
                    <span className="pcb-star">{i === 0 ? '★' : ''}</span>
                  </span>
                  <AgentLogo slug={r.slug} size={26} />
                  <div className="pcb-agent">
                    <div className="pcb-name">{r.name}</div>
                    <div className="pcb-vendor">{AGENT_VENDOR[r.agent]}</div>
                  </div>
                  <div className="pcb-composite num">
                    {r.composite !== null ? r.composite.toFixed(3) : r.rawScore}
                  </div>
                </li>
              ))}
            </ol>
            {phaseComplete.nextPhase && (
              <div className="pcb-next">
                Next phase: {phaseComplete.nextPhase.label}
                {phaseComplete.nextPhase.startsAtIso && (
                  <> · unlocks {formatPhaseDate(phaseComplete.nextPhase.startsAtIso)}</>
                )}
              </div>
            )}
          </section>
        )}

        {/*
          live-stats — dropped the BUILDS tile 2026-05-28: the cohort-3
          JSONL stream emits `gate-pass` events to mark CI gates, not
          `build` events, so this tile always showed `0` and was noise.
          Keeping the other 3 tiles (events / writes / ships) which DO
          have correct backing data on the stream.
        */}
        <div className="live-stats live-stats-3">
          <div>
            <div className="label">Total events</div>
            <div className="v num">{counters.total.toLocaleString()}</div>
          </div>
          <div>
            <div className="label">Files written</div>
            <div className="v num">{counters.writes}</div>
          </div>
          <div>
            <div className="label">Ships / deploys</div>
            <div className="v num">{counters.deploys}</div>
          </div>
        </div>

        <div className="stage">
          <div>
            {/*
              Agent cards — ordered by correctness desc (highest first) once
              the agent fixtures' score.components.correctness has hydrated.
              Falls back to STATIC_RACER_ORDER (claude → codex → antigrav)
              while loading. The first card in racerOrder gets `leading`.
            */}
            <div className="racers" role="radiogroup" aria-label="Select agent">
              {racerOrder.map((slug, i) => (
                <Racer
                  key={slug}
                  slug={slug}
                  wireSlug={UI_TO_WIRE[slug]}
                  name={AGENT_DISPLAY_NAME[slug]}
                  vendor={AGENT_VENDOR[slug]}
                  filesWritten={counters.filesByAgent[slug]}
                  eventCount={counters.eventsByAgent[slug]}
                  lastScore={counters.lastScore[slug]}
                  cumulComposite={agentComposite[UI_TO_WIRE[slug]] ?? null}
                  phaseComplete={isPhaseComplete}
                  leading={i === 0}
                  selected={selectedAgent === slug}
                  onSelect={() => {
                    setUserPinnedAgent(true);
                    setSelectedAgent(slug);
                    setHasUserSelectedAgent(true);
                  }}
                  action={racerActions[slug]}
                />
              ))}
            </div>

            <div className="stream-panel" style={{ marginTop: 16 }}>
              <div className="stream-head">
                <div className="left">
                  <span className="dot" />
                  <span>cohort-3.jsonl · all agents · color-coded by source</span>
                  <span style={{ color: 'var(--ink-3)' }}>
                    {status === 'loading'
                      ? 'connecting…'
                      : status === 'error'
                        ? 'stream unavailable'
                        : `${counters.total} events`}
                  </span>
                </div>
              </div>
              <div className="stream-body" ref={streamBodyRef}>
                {isEmpty && (
                  <div
                    className="stream-line"
                    data-agent="claude"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    <span className="ts">--:--:--</span>
                    <span>
                      Phase 1 hasn&apos;t streamed yet — events will appear
                      here as agents work.
                    </span>
                  </div>
                )}
                {isError && (
                  <div
                    className="stream-line"
                    data-agent="claude"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    <span className="ts">--:--:--</span>
                    <span>Stream unavailable — retrying every 5s.</span>
                  </div>
                )}
                {lines.map((line) => {
                  const actClass = ACTION_CLASS[line.type];
                  return (
                    <div
                      key={line.id}
                      className={`stream-line${line.flash ? ' new' : ''}`}
                      data-agent={line.agent}
                    >
                      <span className="ts">{line.ts}</span>
                      <span className={`ag-${line.agent}`}>
                        {AGENT_LABEL[line.agent]}
                      </span>
                      <span>
                        <span className={actClass}>
                          {ACTION_LABEL[line.type]}
                        </span>{' '}
                        <span className="file">{line.file}</span>{' '}
                        {line.meta && (
                          <span className="meta">· {line.meta}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="side-stack">
            <div className="panel">
              <div className="panel-head">
                <span>
                  Workspace ·{' '}
                  <span
                    data-testid="workspace-current-agent"
                    style={{ color: 'var(--ink)', fontWeight: 600 }}
                  >
                    {AGENT_LABEL[selectedAgent]}
                  </span>
                </span>
                {!hasUserSelectedAgent && (
                  <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>
                    click an agent card to switch
                  </span>
                )}
              </div>
              <div className="filetree" data-testid={`workspace-tree-${selectedAgent}`}>
                {currentWriteEntries.length === 0 ? (
                  <div
                    className="ftnode file"
                    style={{
                      color: 'var(--ink-3)',
                      ['--indent' as never]: '0px',
                    }}
                  >
                    <span>
                      no writes yet from {AGENT_LABEL[selectedAgent]} · stream
                      waiting
                    </span>
                  </div>
                ) : (
                  currentWriteEntries.map((entry, i) => (
                    <div
                      key={`${selectedAgent}-${entry.file}-${i}`}
                      className="ftnode file"
                      style={{ ['--indent' as never]: '0px' }}
                      title={`${entry.file}${entry.meta ? ` · ${entry.meta}` : ''}`}
                    >
                      <span>{entry.file}</span>
                      {entry.meta && <span className="edit">{entry.meta}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel testsprite-panel">
              <div className="panel-head">
                <span>
                  TestSprite · world-cup-v3 · phase{' '}
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                    {activePhase}
                  </span>
                </span>
                <span style={{ color: 'var(--ink-3)' }}>
                  {planCounts.passed > 0 || planCounts.failed > 0 ? (
                    <>
                      <span style={{ color: 'var(--accent)' }}>
                        {planCounts.passed} pass
                      </span>
                      {' · '}
                      <span style={{ color: 'var(--negative)' }}>
                        {planCounts.failed} fail
                      </span>
                      {planCounts.blocked > 0 && (
                        <>
                          {' · '}
                          {planCounts.blocked} blocked
                        </>
                      )}
                      {pendingCount > 0 && (
                        <>
                          {' · '}
                          {pendingCount} pending
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {pendingCount}/{activeCatalog.length} pending
                    </>
                  )}
                </span>
              </div>
              {/*
                Phase toggle — one tab per scored + catalogued phase (1-6
                today, from TOGGLE_PHASES). Lets viewers compare each agent's
                per-phase verdicts without leaving /live.
              */}
              <div className="phase-toggle" role="tablist" aria-label="Select scored phase">
                {TOGGLE_PHASES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={activePhase === p}
                    className={`phase-toggle-btn${activePhase === p ? ' on' : ''}`}
                    onClick={() => setActivePhase(p)}
                  >
                    Phase {p}
                    {p === LATEST_SCORED_PHASE && (
                      <span className="phase-toggle-tag">latest</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="tests">
                {activeCatalog.map((plan) => {
                  const v = verdictByPlan[plan.path] ?? 'pending';
                  // blocked + inconclusive share the "blocked" treatment
                  // (definitive non-pass, but distinct from a true-fail and
                  // from a not-yet-run "pending"). pending stays for plans
                  // with no verdict yet (e.g. a phase still in-flight).
                  const statusClass =
                    v === 'passed'
                      ? 'pass'
                      : v === 'failed'
                        ? 'fail'
                        : v === 'blocked' || v === 'inconclusive'
                          ? 'blocked'
                          : 'pending';
                  const sym =
                    v === 'passed'
                      ? '✓'
                      : v === 'failed'
                        ? '✗'
                        : v === 'blocked' || v === 'inconclusive'
                          ? '⊘'
                          : '·';
                  return (
                    <a
                      key={plan.path}
                      href={plan.href}
                      className={`test-row ${statusClass} test-row-link`}
                      title={plan.name}
                    >
                      <span className="icon">{sym}</span>
                      <span className="test-row-name">
                        <span className="test-row-cat">
                          {plan.category}
                          {plan.priority && (
                            <span className={`test-row-prio prio-${plan.priority}`}>
                              {plan.priority}
                            </span>
                          )}
                        </span>
                        <span className="test-row-file">{plan.name}</span>
                      </span>
                      <span className="ms">{v}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            <a
              href={`/agents/${UI_TO_WIRE[selectedAgent]}`}
              className="btn btn-accent"
              style={{ justifyContent: 'center' }}
            >
              View {AGENT_DISPLAY_NAME[selectedAgent]}&apos;s full profile
              <span className="btn-arrow">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </a>
          </div>
        </div>
        {lastUpdated && (
          <div
            style={{
              color: 'var(--ink-3)',
              fontSize: 11,
              padding: '12px 0',
              fontFamily: 'var(--font-mono)',
            }}
          >
            polled {new Date(lastUpdated).toUTCString()} · re-poll every{' '}
            {POLL_INTERVAL_MS / 1000}s
          </div>
        )}
      </div>

      <SiteFooter />
    </>
  );
}

interface RacerProps {
  slug: AgentKey;
  wireSlug: WireAgent;
  name: string;
  vendor: string;
  filesWritten: number;
  /** Total stream events emitted by this agent. */
  eventCount: number;
  lastScore: string | null;
  /** Cumulative composite from leaderboard.json — falls back to the
   *  stream's last-score event when not yet hydrated. */
  cumulComposite: number | null;
  /** When true, the synthetic file-count progress is overridden with
   *  100% (phase is done — counting writes per agent is noise). */
  phaseComplete: boolean;
  leading?: boolean;
  selected: boolean;
  onSelect: () => void;
  action: StreamLine | null;
}

function Racer({
  slug,
  wireSlug,
  name,
  vendor,
  filesWritten,
  eventCount,
  lastScore,
  cumulComposite,
  phaseComplete,
  leading,
  selected,
  onSelect,
  action,
}: RacerProps) {
  const actClass = action ? ACTION_CLASS[action.type] : '';
  // Prefer cumulative composite (post-fixture-hydrate); fall back to the
  // last `score` stream event composite the prior single-phase /live
  // surfaced.
  const streamComposite = parseComposite(lastScore);
  const composite = cumulComposite ?? streamComposite;
  const compositeDisplay = composite !== null ? composite.toFixed(3) : '—';
  // Progress: when phase is complete, lock to 100% (the file-count math
  // is meaningless once everyone shipped). Otherwise stay with the
  // file-count heuristic that powered the prior in-flight view.
  const progress = phaseComplete
    ? 100
    : action
      ? Math.min(100, filesWritten * 12 + 18)
      : 0;

  // Keyboard: Enter and Space activate the card, mirroring native button
  // semantics. role="radio" is the most accurate AT mapping — only one of
  // the three cards is selected at a time, and the radio group lives on
  // the parent .racers wrapper.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      className={`racer${leading ? ' leading' : ''}${selected ? ' selected' : ''}`}
      role="radio"
      aria-checked={selected}
      aria-label={`Select ${name} as the active agent`}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      data-testid={`racer-card-${slug}`}
    >
      <div className="racer-id">
        <AgentLogo slug={wireSlug} size={30} />
        <div>
          <div className="name">{name}</div>
          <div className="vendor">{vendor}</div>
        </div>
      </div>
      <div className="racer-stats">
        <div>
          <div className="stat-label">Files written</div>
          <div className="stat-value num">{filesWritten}</div>
        </div>
        <div>
          <div className="stat-label">Events</div>
          <div className="stat-value num">
            {eventCount > 0 ? eventCount : '—'}
          </div>
        </div>
        <div>
          {/*
            Cumulative composite from leaderboard.json (the across-phase
            standing), NOT a per-phase value — label it "Composite" rather
            than "Composite live" so it reads honestly once phases are
            accumulating. Falls back to the stream's last per-phase score
            only while the leaderboard fixture is still hydrating.
          */}
          <div className="stat-label">Composite</div>
          <div className={`stat-value num${leading ? ' comp' : ''}`}>
            {compositeDisplay}
          </div>
        </div>
      </div>
      <div className="racer-state">
        <div className="racer-action">
          {action ? (
            <>
              <span className={actClass}>{ACTION_LABEL[action.type]}</span>{' '}
              <span className="file">{action.file}</span>{' '}
              {action.meta && <span className="ok">· {action.meta}</span>}
            </>
          ) : (
            <span>idle</span>
          )}
        </div>
        <div className="racer-progress">
          <div className="fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
