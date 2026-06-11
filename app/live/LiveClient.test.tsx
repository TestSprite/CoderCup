// Unit tests for app/live/LiveClient.tsx — covers both the pure helpers
// (planFilenameFromPath, buildPlanCatalog, buildPhaseLookup, parseJsonl,
// isValidWireEvent, parseComposite, the PLAN_CATALOG + PHASE_LOOKUP
// snapshots) and the hook+component behavior (empty stream, loaded stream,
// agent-card selector — clicking + keyboard nav re-scopes the workspace —
// phase-complete banner, CORS error retry).
//
// Note: prior versions of this file tested a CC/OX/AG filter chip group
// inside the stream panel header AND a separate switcher inside the
// workspace panel. Both control surfaces were removed when the 3 big
// agent cards became the dashboard-wide selector (see the user's UX note
// — "the cards ARE the selector"). The tests below exercise the new
// single-source-of-truth selection model.
//
// fetch is mocked per-test via vi.fn() so we never hit the real CloudFront
// edge. The 5s poll interval is exercised via vi.useFakeTimers + advance.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  LiveClient,
  PLAN_CATALOG,
  PHASE_LOOKUP,
  buildPlanCatalog,
  buildPhaseLookup,
  planFilenameFromPath,
  parseJsonl,
  isValidWireEvent,
  parseComposite,
  type WireEvent,
} from './LiveClient';
import { TESTS } from '../tests/data';

// ─── Helpers ──────────────────────────────────────────────────────────

function jsonl(events: WireEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function mockFetchOnce(body: string, ok = true): void {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    text: async () => body,
  });
}

function mockFetchAlways(body: string, ok = true): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: async () => body,
  });
  global.fetch = fn;
  return fn;
}

function mockFetchRejects(err = new Error('CORS')): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockRejectedValue(err);
  global.fetch = fn;
  return fn;
}

// Route-aware mock: serves the JSONL body for the cohort-3 URL and a
// per-slug JSON body for each agent fixture URL. Use when the test needs
// real agent fixtures hydrated (verdict scoping, racer correctness sort).
function mockFetchRoutes(opts: {
  jsonlBody: string;
  agentJson: Record<string, unknown>;
}): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.endsWith('.jsonl')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => opts.jsonlBody,
        json: async () => ({}),
      });
    }
    // /fixtures/agents/<slug>.json → look up by suffix.
    const slugMatch =
      typeof url === 'string'
        ? url.match(/agents\/([a-z-]+)\.json/)
        : null;
    if (slugMatch) {
      const slug = slugMatch[1];
      const body = opts.agentJson[slug] ?? {};
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      });
    }
    // Unknown URL → empty 200.
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({}),
    });
  });
  global.fetch = fn;
  return fn;
}

const SEED_EVENTS: WireEvent[] = [
  {
    ts: '2026-05-28T08:25:38Z',
    agent: 'claude-code',
    phase: 1,
    type: 'start',
    target: 'phase-1 · routes',
    meta: 'elapsed 0:00',
  },
  {
    ts: '2026-05-28T08:25:43Z',
    agent: 'codex',
    phase: 1,
    type: 'start',
    target: 'phase-1 · routes',
    meta: 'elapsed 0:00',
  },
  {
    ts: '2026-05-28T08:26:13Z',
    agent: 'claude-code',
    phase: 1,
    type: 'write',
    target: 'app/page.tsx',
    meta: '+86 lines',
  },
  {
    ts: '2026-05-28T08:26:28Z',
    agent: 'codex',
    phase: 1,
    type: 'write',
    target: 'src/pages/index.tsx',
    meta: '+72 lines',
  },
];

const FULL_PHASE_EVENTS: WireEvent[] = [
  ...SEED_EVENTS,
  {
    ts: '2026-05-28T08:25:48Z',
    agent: 'antigravity',
    phase: 1,
    type: 'start',
    target: 'phase-1 · routes',
    meta: 'elapsed 0:00',
  },
  {
    ts: '2026-05-28T08:32:33Z',
    agent: 'claude-code',
    phase: 1,
    type: 'score',
    target: 'composite 0.78',
    meta: 'pass 39 · fail 8 · incon 3',
  },
  {
    ts: '2026-05-28T08:32:48Z',
    agent: 'codex',
    phase: 1,
    type: 'score',
    target: 'composite 0.71',
    meta: 'pass 35 · fail 12 · incon 3',
  },
  {
    ts: '2026-05-28T08:33:03Z',
    agent: 'antigravity',
    phase: 1,
    type: 'score',
    target: 'composite 0.74',
    meta: 'pass 37 · fail 10 · incon 3',
  },
];

// ─── Pure helpers ─────────────────────────────────────────────────────

describe('planFilenameFromPath', () => {
  it('strips directory and .json extension, converts dashes to underscores', () => {
    expect(planFilenameFromPath('bracket/01-bracket-cardinality.json')).toBe(
      '01_bracket_cardinality',
    );
    expect(planFilenameFromPath('routes/02-match-permalink-resolves.json')).toBe(
      '02_match_permalink_resolves',
    );
    expect(planFilenameFromPath('a11y/03-landmarks.json')).toBe('03_landmarks');
  });

  it('falls back to the input when there is no directory', () => {
    expect(planFilenameFromPath('foo.json')).toBe('foo');
    expect(planFilenameFromPath('foo-bar.json')).toBe('foo_bar');
  });

  it('handles empty / pathological inputs without crashing', () => {
    expect(planFilenameFromPath('')).toBe('');
    expect(planFilenameFromPath('no-extension')).toBe('no_extension');
  });
});

describe('buildPlanCatalog', () => {
  const catalog = buildPlanCatalog();

  it('returns 17 entries (matches Phase 1 suite-index)', () => {
    expect(catalog).toHaveLength(17);
  });

  it('every entry has a non-empty test_id and a /tests/<id> href', () => {
    for (const row of catalog) {
      expect(row.test_id.length).toBeGreaterThan(0);
      expect(row.href).toBe(`/tests/${row.test_id}`);
    }
  });

  it('entries match TESTS catalog test_ids where the path overlaps', () => {
    // TESTS catalog now spans phase 1 + phase 2 — both phases share a few
    // category-relative paths (e.g. `seo/01-sitemap-lists-matches.json`).
    // Filter to phase-1 entries before building the byPath lookup so the
    // assertion is comparing apples to apples.
    const byPath = new Map(
      TESTS.filter((t) => t.phase === 1).map((t) => [t.path, t.test_id]),
    );
    let matched = 0;
    for (const row of catalog) {
      if (byPath.has(row.path)) {
        expect(row.test_id).toBe(byPath.get(row.path));
        matched += 1;
      }
    }
    // All 17 phase-1 plans map cleanly now that visual/02-flag-images-render
    // is registered in the TESTS catalog.
    expect(matched).toBe(17);
  });

  it('categories appear in declaration order: routes → data → match-detail → a11y → visual → seo', () => {
    const cats = catalog.map((r) => r.category);
    const firstIdxByCat: Record<string, number> = {};
    cats.forEach((c, i) => {
      if (!(c in firstIdxByCat)) firstIdxByCat[c] = i;
    });
    expect(firstIdxByCat.routes).toBeLessThan(firstIdxByCat.data);
    expect(firstIdxByCat.data).toBeLessThan(firstIdxByCat['match-detail']);
    expect(firstIdxByCat['match-detail']).toBeLessThan(firstIdxByCat.a11y);
    expect(firstIdxByCat.a11y).toBeLessThan(firstIdxByCat.visual);
    expect(firstIdxByCat.visual).toBeLessThan(firstIdxByCat.seo);
  });

  it('PLAN_CATALOG module snapshot matches a fresh build()', () => {
    expect(PLAN_CATALOG).toHaveLength(17);
    expect(PLAN_CATALOG[0].path).toBe(catalog[0].path);
  });
});

describe('buildPhaseLookup', () => {
  const phases = buildPhaseLookup();

  it('returns 10 phases from events.json', () => {
    expect(Object.keys(phases)).toHaveLength(10);
  });

  it('phase 1 label matches "Phase 1 · Landing page"', () => {
    expect(phases[1].label).toBe('Phase 1 · Landing page');
  });

  it("phase 1 startsAtIso is 2026-05-28", () => {
    expect(phases[1].startsAtIso).toBe('2026-05-28T00:00:00Z');
  });

  it('phase 2 label matches "Phase 2 · Match details" (PHASE_LOOKUP snapshot)', () => {
    expect(phases[2].label).toBe('Phase 2 · Match details');
  });

  it('PHASE_LOOKUP module snapshot is non-empty', () => {
    expect(Object.keys(PHASE_LOOKUP).length).toBeGreaterThan(0);
  });
});

describe('isValidWireEvent', () => {
  it('accepts a well-formed event', () => {
    expect(
      isValidWireEvent({
        ts: '2026-05-28T00:00:00Z',
        agent: 'claude-code',
        phase: 1,
        type: 'write',
        target: 'foo.ts',
      }),
    ).toBe(true);
  });

  it('rejects unknown agent (e.g. the smoke-agent test entry)', () => {
    expect(
      isValidWireEvent({
        ts: '2026-05-28T00:00:00Z',
        agent: 'smoke-agent',
        phase: 0,
        type: 'start',
        target: 'x',
      }),
    ).toBe(false);
  });

  it('rejects unknown type', () => {
    expect(
      isValidWireEvent({
        ts: '2026-05-28T00:00:00Z',
        agent: 'codex',
        type: 'frobnicate',
        target: 'x',
      }),
    ).toBe(false);
  });

  it('rejects null / non-object / missing fields', () => {
    expect(isValidWireEvent(null)).toBe(false);
    expect(isValidWireEvent(undefined)).toBe(false);
    expect(isValidWireEvent('a string')).toBe(false);
    expect(isValidWireEvent({})).toBe(false);
    expect(isValidWireEvent({ ts: 'x', agent: 'codex' })).toBe(false);
  });
});

describe('parseJsonl', () => {
  it('empty string returns []', () => {
    expect(parseJsonl('')).toEqual([]);
  });

  it('parses 3 valid lines into 3 events', () => {
    const text =
      JSON.stringify(SEED_EVENTS[0]) +
      '\n' +
      JSON.stringify(SEED_EVENTS[1]) +
      '\n' +
      JSON.stringify(SEED_EVENTS[2]);
    const out = parseJsonl(text);
    expect(out).toHaveLength(3);
    expect(out[0].agent).toBe('claude-code');
  });

  it('drops malformed lines without crashing', () => {
    const text = [
      JSON.stringify(SEED_EVENTS[0]),
      'not valid json',
      JSON.stringify(SEED_EVENTS[1]),
      '{"ts":"x"}', // valid JSON but not a WireEvent
    ].join('\n');
    const out = parseJsonl(text);
    expect(out).toHaveLength(2);
  });

  it('tolerates trailing whitespace and empty lines', () => {
    const text =
      '\n\n  ' +
      JSON.stringify(SEED_EVENTS[0]) +
      '\n\n   \n' +
      JSON.stringify(SEED_EVENTS[1]) +
      '\n\n';
    const out = parseJsonl(text);
    expect(out).toHaveLength(2);
  });

  it('drops events with an unknown agent slug (e.g. smoke-agent)', () => {
    const text = [
      JSON.stringify(SEED_EVENTS[0]),
      JSON.stringify({
        ts: '2026-05-28T08:55:58Z',
        agent: 'smoke-agent',
        phase: 0,
        type: 'start',
        target: 'ec2-setup',
        meta: 'verify-no-overwrite',
      }),
    ].join('\n');
    const out = parseJsonl(text);
    expect(out).toHaveLength(1);
    expect(out[0].agent).toBe('claude-code');
  });
});

describe('parseComposite', () => {
  it('extracts the first numeric token from "composite 0.78"', () => {
    expect(parseComposite('composite 0.78')).toBe(0.78);
  });

  it('returns null for null input', () => {
    expect(parseComposite(null)).toBe(null);
  });

  it('returns null when no number is present', () => {
    expect(parseComposite('pending')).toBe(null);
  });

  it('parses a bare number', () => {
    expect(parseComposite('0.123')).toBe(0.123);
  });
});

// ─── Hook + component behavior ────────────────────────────────────────

describe('LiveClient — fetch + render', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the "stream waiting" copy and all 17 plans when the stream is empty', async () => {
    mockFetchAlways('');
    render(<LiveClient />);

    // Drain the initial-fetch microtask queue.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // "no writes yet from <agent>" empty-state for the workspace panel.
    expect(
      screen.getByText(/no writes yet from claude-code/i),
    ).toBeInTheDocument();

    // 17 plans rendered, all PENDING.
    const pendingCells = screen.getAllByText('pending');
    expect(pendingCells.length).toBe(17);
  });

  it('hydrates the stream + workspace from a seeded JSONL body', async () => {
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);

    // Drain the initial-fetch microtask queue. The first poll fires
    // synchronously inside useEffect; runAllTicks lets the resolved
    // .text() promise + setState chain flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Default selection is claude — its tree contains app/page.tsx.
    const claudeTree = screen.getByTestId('workspace-tree-claude');
    expect(claudeTree.textContent).toContain('app/page.tsx');
    expect(claudeTree.textContent).not.toContain('src/pages/index.tsx');

    // Click the Codex agent card → workspace re-scopes to codex.
    fireEvent.click(screen.getByTestId('racer-card-codex'));
    const codexTree = screen.getByTestId('workspace-tree-codex');
    expect(codexTree.textContent).toContain('src/pages/index.tsx');
    expect(codexTree.textContent).not.toContain('app/page.tsx');
  });

  it('clicking an agent card swaps the dashboard agent (selector regression)', async () => {
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Default: claude. Claude card has the .selected class; the other
    // two do NOT.
    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'claude-code',
    );
    expect(screen.getByTestId('racer-card-claude').className).toContain(
      'selected',
    );
    expect(screen.getByTestId('racer-card-codex').className).not.toContain(
      'selected',
    );
    expect(screen.getByTestId('racer-card-antigrav').className).not.toContain(
      'selected',
    );

    // Click the Codex card.
    fireEvent.click(screen.getByTestId('racer-card-codex'));

    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'codex',
    );
    expect(screen.getByTestId('racer-card-codex').className).toContain(
      'selected',
    );
    expect(screen.getByTestId('racer-card-claude').className).not.toContain(
      'selected',
    );
    const codexTree = screen.getByTestId('workspace-tree-codex');
    expect(codexTree.textContent).toContain('src/pages/index.tsx');
    expect(codexTree.textContent).not.toContain('app/page.tsx');

    // Click the Anti-Gravity card → empty-state copy uses its display label.
    fireEvent.click(screen.getByTestId('racer-card-antigrav'));
    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'anti-gravity',
    );
    expect(
      screen.getByTestId('workspace-tree-antigrav').textContent,
    ).toContain('no writes yet from anti-gravity');

    // Back to claude restores the original tree.
    fireEvent.click(screen.getByTestId('racer-card-claude'));
    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'claude-code',
    );
    expect(
      screen.getByTestId('workspace-tree-claude').textContent,
    ).toContain('app/page.tsx');
  });

  it('Enter and Space activate the agent card (keyboard a11y)', async () => {
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Enter on codex card.
    fireEvent.keyDown(screen.getByTestId('racer-card-codex'), {
      key: 'Enter',
    });
    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'codex',
    );
    expect(screen.getByTestId('racer-card-codex').className).toContain(
      'selected',
    );

    // Space on antigrav card.
    fireEvent.keyDown(screen.getByTestId('racer-card-antigrav'), {
      key: ' ',
    });
    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'anti-gravity',
    );
    expect(screen.getByTestId('racer-card-antigrav').className).toContain(
      'selected',
    );

    // Some keyboards send "Spacebar" (legacy IE/Edge). Make sure we accept it.
    fireEvent.keyDown(screen.getByTestId('racer-card-claude'), {
      key: 'Spacebar',
    });
    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'claude-code',
    );

    // Non-activating keys (e.g. ArrowDown) do NOT change selection.
    fireEvent.keyDown(screen.getByTestId('racer-card-codex'), {
      key: 'ArrowDown',
    });
    expect(screen.getByTestId('workspace-current-agent').textContent).toBe(
      'claude-code',
    );
  });

  it('agent cards expose ARIA radio semantics with one card checked at a time', async () => {
    mockFetchAlways('');
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The .racers wrapper has role="radiogroup".
    const radiogroup = document.querySelector('[role="radiogroup"]');
    expect(radiogroup).not.toBeNull();

    // One role="radio" child per agent in the roster (claude/codex/antigrav/kimi).
    const radios = radiogroup!.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(4);

    // Exactly one is aria-checked="true" (claude by default).
    const checked = Array.from(radios).filter(
      (r) => r.getAttribute('aria-checked') === 'true',
    );
    expect(checked.length).toBe(1);
    expect(checked[0].getAttribute('data-testid')).toBe('racer-card-claude');
  });

  it('stream renders ALL events regardless of selected agent (no per-stream filter)', async () => {
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const streamBodyEl = () => document.querySelector('.stream-body');
    // Both seeded writes show in the stream body (default selection is
    // claude, but the stream is unfiltered by design).
    expect(streamBodyEl()?.textContent).toContain('app/page.tsx');
    expect(streamBodyEl()?.textContent).toContain('src/pages/index.tsx');

    // Switching the selected agent does NOT narrow the stream.
    fireEvent.click(screen.getByTestId('racer-card-codex'));
    expect(streamBodyEl()?.textContent).toContain('app/page.tsx');
    expect(streamBodyEl()?.textContent).toContain('src/pages/index.tsx');
  });

  it('the removed CC/OX/AG control surfaces are not in the DOM', async () => {
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The .stream-tabs container (filter chip group) is gone.
    expect(document.querySelector('.stream-tabs')).toBeNull();
    // The .panel-head .switcher container (workspace tab group) is gone.
    expect(document.querySelector('.panel-head .switcher')).toBeNull();
    // The old per-agent workspace aria-labels are gone.
    expect(screen.queryByLabelText(/Show Codex workspace/i)).toBeNull();
    expect(screen.queryByLabelText(/Show Claude Code workspace/i)).toBeNull();
    expect(screen.queryByLabelText(/Show Anti-Gravity workspace/i)).toBeNull();
  });

  it('"View full profile" CTA href follows the selected agent', async () => {
    mockFetchAlways('');
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Default selection is claude → /agents/claude-code.
    const cta = (): HTMLAnchorElement | null =>
      document.querySelector('a.btn.btn-accent');
    expect(cta()?.getAttribute('href')).toBe('/agents/claude-code');
    expect(cta()?.textContent).toContain('Claude Code');

    fireEvent.click(screen.getByTestId('racer-card-codex'));
    expect(cta()?.getAttribute('href')).toBe('/agents/codex');
    expect(cta()?.textContent).toContain('Codex');

    fireEvent.click(screen.getByTestId('racer-card-antigrav'));
    expect(cta()?.getAttribute('href')).toBe('/agents/antigravity');
    expect(cta()?.textContent).toContain('Anti-Gravity');
  });

  it('hides the phase-complete banner with only 2 score events; shows it with 3', async () => {
    // 2 score events only → no banner.
    const twoScoreEvents = FULL_PHASE_EVENTS.filter(
      (e) => e.type !== 'score' || e.agent !== 'antigravity',
    );
    mockFetchAlways(jsonl(twoScoreEvents));
    const { unmount } = render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.querySelector('.phase-complete-banner')).toBeNull();
    unmount();

    // 3 score events → banner renders with all ranked composites.
    mockFetchAlways(jsonl(FULL_PHASE_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const banner = document.querySelector('.phase-complete-banner');
    expect(banner).not.toBeNull();
    // The banner is now a CUMULATIVE standing readout, not a "Phase N
    // COMPLETE" announcement. Head reads "N OF 10 PHASES SCORED · cumulative
    // standing" + a "Total wall-clock" label. With no fixtures hydrated in
    // the test mock, agentComposite/phaseScores are empty, so the FALLBACK
    // path runs: scoredCount falls back to the stream phase number (1), and
    // per-row composite falls back to parseComposite(score-event target).
    expect(banner!.textContent).toMatch(/phases scored/i);
    expect(banner!.textContent).toMatch(/cumulative standing/i);
    expect(banner!.textContent).toMatch(/Total wall-clock/i);
    // The old per-phase "COMPLETE" heading is gone.
    expect(banner!.textContent).not.toMatch(/COMPLETE/i);
    // scoredCount fallback = stream phaseNum = 1; denominator is derived from
    // events.json (10 phases) → "1 of 10 phases scored".
    expect(banner!.textContent).toMatch(/1 of 10 phases scored/i);
    // Composite values rendered as 3-decimal floats inside the podium —
    // these come from the stream-score FALLBACK (no leaderboard fixture in
    // the mock). Scope to the banner since the racer card may show the same.
    expect(banner!.textContent).toContain('0.780');
    expect(banner!.textContent).toContain('0.710');
    expect(banner!.textContent).toContain('0.740');
    // Next-phase teaser points at the first not-yet-completed planned phase.
    // All 10 phases in events.json are now `completed`, so there is no planned
    // phase to skip ahead to — the teaser falls back to streamedPhase+1, which
    // for the phase-1 replay is "Phase 2 · Match details".
    expect(banner!.textContent).toMatch(/Phase 2 · Match details/);
    expect(banner!.textContent).not.toMatch(/Phase 7 · Betting odds/);
  });

  it('renders "stream unavailable" on a CORS/fetch reject + retries on the 5s poll', async () => {
    const fetchFn = mockFetchRejects(new TypeError('NetworkError'));
    render(<LiveClient />);

    // First poll fires immediately. Let it reject + the state to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const firstCallCount = fetchFn.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);
    // There are two "Stream unavailable" copy slots (panel-head status +
    // body retrying-every-5s line). Just verify at least one renders.
    const matches = screen.getAllByText(/Stream unavailable/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);

    // Advance the 5s interval → at least one additional poll fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    expect(fetchFn.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it('test-row category prefix renders (issue B regression test)', async () => {
    mockFetchAlways('');
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The first plan in PLAN_CATALOG is "routes/01-click-r16-cell-to-match.json"
    // — category "routes" with the human-readable plan name. Both should
    // appear in the rendered DOM (left small category label + primary plan
    // name surfaced from the plan JSON's `name` field).
    const allRoutesLabels = screen.getAllByText('routes');
    expect(allRoutesLabels.length).toBeGreaterThanOrEqual(5); // 5 routes plans
    const allDataLabels = screen.getAllByText('data');
    expect(allDataLabels.length).toBeGreaterThanOrEqual(4); // 4 data plans

    // The plan name portion (sourced from each plan JSON's `name` field)
    // renders — not the path-derived slug.
    expect(
      screen.getByText(
        /Clicking a Round-of-16 cell navigates from homepage to a match detail page/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Clicking one cell from each bracket stage reaches four distinct match pages/i,
      ),
    ).toBeInTheDocument();
  });

  it('seenIdsRef dedup: re-polling the same JSONL does NOT double-render rows', async () => {
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // First poll: 4 events rendered.
    const before = document.querySelectorAll('.stream-body .stream-line').length;

    // Advance time — same body comes back from the next poll.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    const after = document.querySelectorAll('.stream-body .stream-line').length;

    // No new rows added since every key was already in seenIdsRef.
    expect(after).toBe(before);
  });

  // ── Fix coverage for 5 /live bugs caught by the user 2026-05-28 ────

  it('BUILDS tile is dropped (cohort-3 emits no `build` events)', async () => {
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // The label "Builds" must NOT appear in .live-stats; the other 3
    // tiles still do.
    const stats = document.querySelector('.live-stats');
    expect(stats).not.toBeNull();
    expect(stats!.textContent).not.toMatch(/Builds/i);
    expect(stats!.textContent).toMatch(/Total events/i);
    expect(stats!.textContent).toMatch(/Files written/i);
    expect(stats!.textContent).toMatch(/Ships \/ deploys/i);
    // Grid override class applied so the remaining 3 tiles fill the row.
    expect(stats!.className).toContain('live-stats-3');
  });

  it('wall-clock locks to phase elapsed + "(completed)" tag when all 3 agents scored', async () => {
    mockFetchAlways(jsonl(FULL_PHASE_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const strip = screen.getByTestId('wall-clock-strip');
    expect(strip).not.toBeNull();
    // data-phase-state attribute flips to "completed" when phaseComplete
    // resolves. While in-flight it would be "in-flight".
    expect(strip.getAttribute('data-phase-state')).toBe('completed');
    // The sub-line carries the "(completed)" tag instead of the old
    // misleading "budget 240:00" copy, and now frames the locked clock as
    // the cumulative total ("summed across N scored phases").
    const sub = screen.getByTestId('wall-clock-sub');
    expect(sub.textContent).toMatch(/\(completed\)/i);
    expect(sub.textContent).not.toMatch(/budget 240/);
    expect(sub.textContent).toMatch(/summed across/i);
    // The label flips from "time remaining" → the cumulative total framing
    // ("Total wall-clock · cumulative"), replacing the old "phase elapsed".
    expect(strip.textContent).toMatch(/total wall-clock/i);
    expect(strip.textContent).not.toMatch(/phase elapsed/i);
    // The progress track / 0-25-50-75-100 marks are hidden when complete
    // — they only make sense for the live countdown.
    expect(strip.querySelector('.progress-track')).toBeNull();
  });

  it('wall-clock shows live countdown + budget marks while phase is in-flight (only start events, no scores)', async () => {
    // Only `start` + `write` events — no score → phaseComplete is null
    // → in-flight path.
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const strip = screen.getByTestId('wall-clock-strip');
    expect(strip.getAttribute('data-phase-state')).toBe('in-flight');
    expect(strip.textContent).toMatch(/time remaining/i);
    // Progress track + marks render in-flight.
    expect(strip.querySelector('.progress-track')).not.toBeNull();
    expect(strip.textContent).toContain('0%');
    expect(strip.textContent).toContain('100%');
  });

  it('TestSprite panel is scoped to selectedAgent verdicts (not worst-of-3)', async () => {
    // Build fixtures where the 3 agents have DIFFERENT verdicts for the
    // same plan name. The previous worst-of code would mark a plan failed
    // if ANY agent failed; the new per-agent scoping should reflect ONLY
    // the selected agent's verdict.
    const planNameClaude = PLAN_CATALOG[0].name;
    const planNameCodex = PLAN_CATALOG[1].name;
    const agentJson = {
      'claude-code': {
        schema_version: '1',
        agent: { slug: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', driver_type: 'cli' },
        runs: [
          {
            run_id: 'cc-test',
            score: { components: { correctness: 0.625 } },
            per_test_verdicts: [
              { test_id: 'cc-1', name: planNameClaude, verdict: 'passed' },
              { test_id: 'cc-2', name: planNameCodex, verdict: 'failed' },
            ],
          },
        ],
      },
      codex: {
        schema_version: '1',
        agent: { slug: 'codex', name: 'Codex', vendor: 'OpenAI', driver_type: 'cli' },
        runs: [
          {
            run_id: 'cx-test',
            score: { components: { correctness: 0.5625 } },
            per_test_verdicts: [
              { test_id: 'cx-1', name: planNameClaude, verdict: 'failed' },
              { test_id: 'cx-2', name: planNameCodex, verdict: 'passed' },
            ],
          },
        ],
      },
      antigravity: {
        schema_version: '1',
        agent: { slug: 'antigravity', name: 'Anti-Gravity', vendor: 'Google', driver_type: 'cli' },
        runs: [
          {
            run_id: 'ag-test',
            score: { components: { correctness: 0.75 } },
            per_test_verdicts: [
              { test_id: 'ag-1', name: planNameClaude, verdict: 'passed' },
              { test_id: 'ag-2', name: planNameCodex, verdict: 'passed' },
            ],
          },
        ],
      },
    };
    mockFetchRoutes({ jsonlBody: jsonl(SEED_EVENTS), agentJson });
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // After hydration the rank-1 agent (antigravity, correctness 0.75) is
    // auto-selected. Its verdicts say both plans passed → panel reports 2 pass.
    // (claude-code has correctness 0.625 and codex 0.5625 in this mock.)
    const panelHeads = document.querySelectorAll('.panel-head');
    const testsHead = Array.from(panelHeads).find((h) =>
      /TestSprite/i.test(h.textContent ?? ''),
    );
    expect(testsHead).not.toBeUndefined();
    expect(testsHead!.textContent).toMatch(/2 pass/);

    // Click codex card → panel reflects codex's flipped verdicts.
    fireEvent.click(screen.getByTestId('racer-card-codex'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const testsHeadAfter = Array.from(
      document.querySelectorAll('.panel-head'),
    ).find((h) => /TestSprite/i.test(h.textContent ?? ''));
    expect(testsHeadAfter!.textContent).toMatch(/1 pass/);
    expect(testsHeadAfter!.textContent).toMatch(/1 fail/);

    // Click antigrav card → 2 pass, 0 fail (both plans pass).
    fireEvent.click(screen.getByTestId('racer-card-antigrav'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const testsHeadAg = Array.from(
      document.querySelectorAll('.panel-head'),
    ).find((h) => /TestSprite/i.test(h.textContent ?? ''));
    expect(testsHeadAg!.textContent).toMatch(/2 pass/);
    expect(testsHeadAg!.textContent).toMatch(/0 fail/);
  });

  it('switching agent cards re-renders the test rail row verdicts (regression for bug 4)', async () => {
    // Same data as the previous test — assert on the row-level icons
    // (not just the header summary) since bug 4 was "panel head agrees
    // but rows don't update."
    const planNameClaude = PLAN_CATALOG[0].name;
    const agentJson = {
      'claude-code': {
        runs: [
          {
            score: { components: { correctness: 0.625 } },
            per_test_verdicts: [
              { name: planNameClaude, verdict: 'passed' },
            ],
          },
        ],
      },
      codex: {
        runs: [
          {
            score: { components: { correctness: 0.5625 } },
            per_test_verdicts: [
              { name: planNameClaude, verdict: 'failed' },
            ],
          },
        ],
      },
      antigravity: {
        runs: [
          {
            score: { components: { correctness: 0.75 } },
            per_test_verdicts: [{ name: planNameClaude, verdict: 'passed' }],
          },
        ],
      },
    };
    mockFetchRoutes({ jsonlBody: jsonl(SEED_EVENTS), agentJson });
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Locate the row for the first plan name in the tests rail. Default
    // selection is claude → verdict 'passed' → class 'pass'.
    const findRow = (): Element | undefined =>
      Array.from(document.querySelectorAll('.test-row')).find((r) =>
        r.textContent?.includes(planNameClaude),
      );
    expect(findRow()?.className).toContain('pass');

    fireEvent.click(screen.getByTestId('racer-card-codex'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Codex verdict for the same plan is 'failed' → row class flips.
    expect(findRow()?.className).toContain('fail');

    fireEvent.click(screen.getByTestId('racer-card-antigrav'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(findRow()?.className).toContain('pass');
  });

  it('racer cards are ordered by correctness desc after fixtures hydrate', async () => {
    // Mirror real cohort-3 correctness: AG 0.75 > CC 0.625 > CX 0.5625.
    const agentJson = {
      'claude-code': {
        runs: [{ score: { components: { correctness: 0.625 } }, per_test_verdicts: [] }],
      },
      codex: {
        runs: [{ score: { components: { correctness: 0.5625 } }, per_test_verdicts: [] }],
      },
      antigravity: {
        runs: [{ score: { components: { correctness: 0.75 } }, per_test_verdicts: [] }],
      },
    };
    mockFetchRoutes({ jsonlBody: jsonl(SEED_EVENTS), agentJson });
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const cards = Array.from(document.querySelectorAll('[data-testid^="racer-card-"]'));
    const order = cards.map((c) => c.getAttribute('data-testid'));
    // Expected: antigrav (0.75) → claude (0.625) → codex (0.5625) → kimi
    // (no fixture in this mock → no correctness → sorts last).
    expect(order).toEqual([
      'racer-card-antigrav',
      'racer-card-claude',
      'racer-card-codex',
      'racer-card-kimi',
    ]);
  });

  it('first racer card in correctness-sorted order gets the .leading class', async () => {
    const agentJson = {
      'claude-code': {
        runs: [{ score: { components: { correctness: 0.625 } }, per_test_verdicts: [] }],
      },
      codex: {
        runs: [{ score: { components: { correctness: 0.5625 } }, per_test_verdicts: [] }],
      },
      antigravity: {
        runs: [{ score: { components: { correctness: 0.75 } }, per_test_verdicts: [] }],
      },
    };
    mockFetchRoutes({ jsonlBody: jsonl(SEED_EVENTS), agentJson });
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Antigrav has highest correctness → its card carries .leading.
    expect(screen.getByTestId('racer-card-antigrav').className).toContain('leading');
    // The other two do not.
    expect(screen.getByTestId('racer-card-claude').className).not.toContain('leading');
    expect(screen.getByTestId('racer-card-codex').className).not.toContain('leading');
  });

  it('racer cards keep static fallback order when correctness data has not loaded', async () => {
    // mockFetchAlways serves the JSONL body for every URL, including the
    // agent fixture URLs — those will throw on .json() and fall into the
    // catch block, leaving agentCorrectness = {}. Cards stay in static
    // order claude → codex → antigrav → kimi.
    mockFetchAlways(jsonl(SEED_EVENTS));
    render(<LiveClient />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const cards = Array.from(document.querySelectorAll('[data-testid^="racer-card-"]'));
    const order = cards.map((c) => c.getAttribute('data-testid'));
    expect(order).toEqual([
      'racer-card-claude',
      'racer-card-codex',
      'racer-card-antigrav',
      'racer-card-kimi',
    ]);
  });
});
