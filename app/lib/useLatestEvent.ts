'use client';

import { useEffect, useState } from 'react';
import {
  CDN_BASE,
  type Event,
  type EventIteration,
  type EventsIndex,
  type EventSummary,
} from './api';

// Pre-seeded fallback so first-paint isn't blank while events.json is fetching.
// Auto-updated whenever events.json[0] changes shape.
const FALLBACK_EVENT: Event = {
  slug: 'world-cup-2026',
  display_name: 'Event #001 · World Cup Code Battle 2026',
  ordinal: 1,
  subtitle: 'AI coding agents ship a World Cup match-brief app — phase by phase',
  cover_image_url: null,
  iterations: [
    {
      slug: 'phase-1',
      task_slug: 'world-cup-2026-v3',
      display_name: 'Phase 1 · Landing page',
      state: 'planning',
      starts_at_iso: '2026-05-28T00:00:00Z',
      ends_at_iso: null,
      participating_agents: ['antigravity', 'codex', 'claude-code'],
    },
  ],
};

function pickLatestIteration(event: Event): EventIteration {
  const its = [...event.iterations];
  its.sort((a, b) => {
    // live wins; then most recent start
    if (a.state === 'live' && b.state !== 'live') return -1;
    if (b.state === 'live' && a.state !== 'live') return 1;
    return b.starts_at_iso.localeCompare(a.starts_at_iso);
  });
  return its[0];
}

// Iteration number is derived from the iteration's slug ("iteration-N").
// events.json stores iterations newest-first, so positional indexing would
// give the wrong number. Slug parsing is the source of truth.
function iterationNumber(iteration: EventIteration): number {
  const m = iteration.slug.match(/iteration-(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function toSummary(event: Event, iteration: EventIteration): EventSummary {
  return {
    event_slug: event.slug,
    iteration_slug: iteration.slug,
    task_slug: iteration.task_slug,
    display_name: `${event.display_name} · ${iteration.display_name.split(' · ')[0]}`,
    event_display_name: event.display_name,
    iteration_display_name: iteration.display_name,
    ordinal: event.ordinal,
    iteration_number: iterationNumber(iteration),
    state: iteration.state,
    starts_at_iso: iteration.starts_at_iso,
    ends_at_iso: iteration.ends_at_iso,
    participating_agents: iteration.participating_agents,
    cover_image_url: event.cover_image_url,
  };
}

// Returns the latest event + latest iteration as a flat summary the rest of
// the app (nav pill, footer, hero eyebrow) reads from.
export function useLatestEvent(): EventSummary {
  const fallbackIter = FALLBACK_EVENT.iterations[0];
  const [summary, setSummary] = useState<EventSummary>(
    toSummary(FALLBACK_EVENT, fallbackIter),
  );

  useEffect(() => {
    let alive = true;
    fetch(`${CDN_BASE}/events.json`)
      .then((r) => r.json() as Promise<EventsIndex>)
      .then((d) => {
        if (!alive) return;
        const events = [...d.events].sort((a, b) => b.ordinal - a.ordinal);
        const e0 = events[0];
        if (!e0 || !e0.iterations.length) return;
        const latestIter = pickLatestIteration(e0);
        setSummary(toSummary(e0, latestIter));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return summary;
}

export function useEventsIndex(): EventsIndex | null {
  const [data, setData] = useState<EventsIndex | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${CDN_BASE}/events.json`)
      .then((r) => r.json() as Promise<EventsIndex>)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** Multi-phase context derived from the latest event's iterations. Used
 *  by the home eyebrow, /live, and the events detail page to surface "X
 *  of N phases scored" rather than picking the literal most-recently-
 *  STARTED iteration (which is whichever phase is currently in planning,
 *  not the scored one a viewer cares about).
 *
 *  `latestCompleted` is the iteration the user expects to read as "the
 *  current standings" — i.e. the freshest phase whose state is 'live'
 *  or 'completed'. `nextPlanned` is the next iteration up after the
 *  latest-completed (state === 'planning' or 'dry-run'). */
export interface PhaseProgress {
  phasesPlanned: number;          // total iterations in the event
  phasesCompleted: number;        // count of state in ('completed' or 'live')
  latestCompleted: EventIteration | null;
  nextPlanned: EventIteration | null;
}

function iterationPhaseNumber(it: EventIteration): number {
  const itAny = it as unknown as { phase_number?: number };
  if (typeof itAny.phase_number === 'number') return itAny.phase_number;
  const m = it.slug.match(/(?:phase|iteration)-(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

export function computePhaseProgress(event: Event | null): PhaseProgress {
  if (!event || event.iterations.length === 0) {
    return { phasesPlanned: 0, phasesCompleted: 0, latestCompleted: null, nextPlanned: null };
  }
  const its = [...event.iterations].sort(
    (a, b) => iterationPhaseNumber(a) - iterationPhaseNumber(b),
  );
  const completed = its.filter((it) => it.state === 'completed' || it.state === 'live');
  const latestCompleted = completed[completed.length - 1] ?? null;
  const latestNum = latestCompleted ? iterationPhaseNumber(latestCompleted) : 0;
  const nextPlanned = its.find(
    (it) => iterationPhaseNumber(it) > latestNum && (it.state === 'planning' || it.state === 'dry-run'),
  ) ?? null;
  return {
    phasesPlanned: its.length,
    phasesCompleted: completed.length,
    latestCompleted,
    nextPlanned,
  };
}

export function useWorldCupPhaseProgress(): PhaseProgress {
  const data = useEventsIndex();
  const event = data?.events.find((e) => e.slug === 'world-cup-2026') ?? null;
  return computePhaseProgress(event);
}
