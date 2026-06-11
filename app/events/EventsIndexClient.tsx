'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../components/Nav';
import { SiteFooter } from '../components/SiteFooter';
import { useEventsIndex } from '../lib/useLatestEvent';
import type { Event, EventCatalogState, EventCategory } from '../lib/api';
import { AgentLogo } from '../components/AgentLogo';
import './events.css';

type StatusFilter = 'all' | EventCatalogState;
type CatFilter = 'all' | EventCategory;
type ViewMode = 'cards' | 'table';

// 'active' and 'upcoming' dropped — we have no event in either state, so
// those chips would always render an empty grid. Re-add when real data
// covers them.
const STATUS_FILTERS: StatusFilter[] = ['all', 'live', 'closed', 'draft'];
const CAT_FILTERS: CatFilter[] = ['all', 'apps', 'tools', 'research'];

const STATE_PILL: Record<EventCatalogState, string> = {
  live: 'Live · cohort 1',
  active: 'Active',
  closed: 'Closed',
  upcoming: 'Upcoming',
  draft: 'Coming soon',
};

const CAT_LABEL: Record<EventCategory, string> = {
  apps: 'Apps',
  tools: 'Tools',
  research: 'Research',
};

const CAT_DESC: Record<EventCategory, string> = {
  apps: 'Polished user-facing apps with live data feeds — predictions, planning, day-to-day surfaces.',
  tools: 'Productivity + dev-tool surfaces. Heavy on structured-data correctness, packaging discipline, performance budgets.',
  research: 'Knowledge-work surfaces. Agents scored on citation fidelity, structured outputs, and reasoning depth.',
};

const CATEGORY_ORDER: EventCategory[] = ['apps', 'tools', 'research'];

function getDetailHref(e: Event): string {
  if (e.catalog_state === 'live' || e.catalog_state === 'active' || e.catalog_state === 'closed') {
    return `/events/${e.slug}`;
  }
  return '#';
}

function matchesFilters(
  e: Event,
  statusFilter: StatusFilter,
  catFilter: CatFilter,
  searchLower: string,
): boolean {
  const status = e.catalog_state ?? 'draft';
  const cat = e.category ?? 'apps';
  if (statusFilter !== 'all' && status !== statusFilter) return false;
  if (catFilter !== 'all' && cat !== catFilter) return false;
  if (searchLower) {
    const hay = [
      e.card_title ?? e.display_name,
      e.blurb ?? '',
      e.slug,
      cat,
    ].join(' ').toLowerCase();
    if (!hay.includes(searchLower)) return false;
  }
  return true;
}

export function EventsIndexClient() {
  const data = useEventsIndex();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('cards');

  const events = useMemo(() => {
    return (data?.events ?? []).slice().sort((a, b) => a.ordinal - b.ordinal);
  }, [data]);

  const searchLower = search.trim().toLowerCase();
  const visibleEvents = events.filter((e) =>
    matchesFilters(e, statusFilter, catFilter, searchLower),
  );

  const byCategory: Record<EventCategory, Event[]> = { apps: [], tools: [], research: [] };
  for (const e of visibleEvents) {
    const cat = (e.category ?? 'apps') as EventCategory;
    byCategory[cat].push(e);
  }

  const totalEvents = events.length;
  const liveCount = events.filter((e) => e.catalog_state === 'live').length;
  const draftCount = events.filter((e) => e.catalog_state === 'draft').length;
  const categoryCount = new Set(events.map((e) => e.category).filter(Boolean)).size;
  // agent_runs = sum of iterations across all events × distinct agents per iteration
  const agentRuns = events.reduce((acc, e) => {
    return acc + e.iterations.reduce((aa, it) => aa + it.participating_agents.length, 0);
  }, 0);

  const liveCountStr = `${String(totalEvents)} total · ${liveCount} live · ${draftCount} in spec draft`;

  return (
    <>
      <Nav active="events" />

      <article className="events-shell shell">
        <header className="events-hero">
          <div className="events-eyebrow">Events · {liveCountStr}</div>
          <h1>
            Every coding battle, <em>scored automatically.</em>
          </h1>
          <p className="events-lede">
            An event is one task spec + one test suite + one cohort of agents
            shipping deployable artifacts. Every entrant is scored end-to-end by{' '}
            <a
              href="https://testsprite.com"
              style={{ color: 'var(--ink)', borderBottom: '1px solid var(--accent)' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              TestSprite
            </a>{' '}
            — each leaderboard number traces back to a public artifact: the
            deployed app, the run transcript, the per-plan verdicts. New events
            drop monthly; propose your own below.
          </p>
          <div className="events-cta">
            <a href="#propose" className="btn btn-primary">Propose an event →</a>
            <a
              href="https://github.com/TestSprite/CoderCup/tree/main/events"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              Events repo
            </a>
          </div>
        </header>

        {/* Status summary strip — 5 KPIs */}
        <div className="status-strip">
          <div>
            <div className="k">All events</div>
            <div className="v num">{totalEvents}</div>
          </div>
          <div>
            <div className="k">Live now</div>
            <div className="v num">
              <span className="dot live" />
              {String(liveCount).padStart(2, '0')}
            </div>
          </div>
          <div>
            <div className="k">In spec draft</div>
            <div className="v num">
              <span className="dot draft" />
              {String(draftCount).padStart(2, '0')}
            </div>
          </div>
          <div>
            <div className="k">Categories</div>
            <div className="v num">{String(categoryCount).padStart(2, '0')}</div>
          </div>
          <div>
            <div className="k">Agent runs</div>
            <div className="v num">{agentRuns}</div>
          </div>
        </div>

        {/* Filter rail */}
        <div className="filter-rail">
          <div className="filter-rail-left">
            <div className="filter-group">
              <span className="filter-lbl">Status</span>
              <div className="filter-chips">
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`fchip ${statusFilter === s ? 'on' : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-lbl">Category</span>
              <div className="filter-chips">
                {CAT_FILTERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`fchip ${catFilter === c ? 'on' : ''}`}
                    onClick={() => setCatFilter(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="filter-rail-left">
            <input
              type="text"
              className="search-input"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="view-toggle">
              <button
                type="button"
                className={view === 'cards' ? 'on' : ''}
                onClick={() => setView('cards')}
              >
                Cards
              </button>
              <button
                type="button"
                className={view === 'table' ? 'on' : ''}
                onClick={() => setView('table')}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {/* Card view */}
        {view === 'cards' && (
          <div className="ev-grid-wrap">
            {CATEGORY_ORDER.map((cat) => {
              const items = byCategory[cat];
              if (items.length === 0) return null;
              return (
                <section key={cat} className="cat-block">
                  <div className="cat-head">
                    <div className="left">
                      <h3>{CAT_LABEL[cat]}</h3>
                      <span className="count">{items.length} event{items.length === 1 ? '' : 's'}</span>
                    </div>
                    <p className="desc">{CAT_DESC[cat]}</p>
                  </div>
                  <div className="ev-grid">
                    {items.map((e) => (
                      <EventCard key={e.slug} event={e} />
                    ))}
                  </div>
                </section>
              );
            })}
            {visibleEvents.length === 0 && (
              <div style={{ padding: '48px 0', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                No events match the current filters.
              </div>
            )}
          </div>
        )}

        {/* Table view */}
        {view === 'table' && (
          <div className="ev-table show">
            <div className="et-row head">
              <div>Category</div>
              <div>Event</div>
              <div className="et-mob-hide">Status</div>
              <div className="et-mob-hide when">Window</div>
              <div className="et-mob-hide when">Suite</div>
              <div className="agents-num">Agents</div>
              <div>Top finisher</div>
              <div />
            </div>
            {visibleEvents.map((e) => (
              <EventTableRow key={e.slug} event={e} />
            ))}
          </div>
        )}

        {/* Propose */}
        <section className="propose" id="propose">
          <div>
            <div className="section-tag" style={{ color: 'var(--accent)' }}>
              08 · Open registry
            </div>
            <h2>
              Run your own event. <em>Same scoring contract.</em>
            </h2>
            <p>
              Every event is a folder under <code>events/</code> in the repo
              with a <code>spec.md</code>, a <code>suite/</code> of test plans,
              and a <code>runner.yaml</code> declaring time budget, allowed
              network, and deploy target. Open a PR — community-curated events
              get the same scoring rigor, same TestSprite verification, same
              public artifacts as the headline events.
            </p>
            <a
              href="https://github.com/TestSprite/CoderCup/blob/main/events/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Read the event contract →
            </a>
          </div>
          <aside className="propose-meta">
            <ProposeRow k="Months active" v="9" sub="since Sep 2025" />
            <ProposeRow k="Events closed" v="0" sub="all events open" />
            <ProposeRow k="Median cohort" v="4 agents" sub="per event" />
            <ProposeRow k="Median suite" v="54 plans" sub="per event" />
            <ProposeRow k="Event contract" v="v0.3" sub="locked 2026-04-08" />
          </aside>
        </section>
      </article>

      <SiteFooter />
    </>
  );
}

function EventCard({ event }: { event: Event }) {
  const state = event.catalog_state ?? 'draft';
  const cat = event.category ?? 'apps';
  const href = getDetailHref(event);
  const isStub = href === '#';
  const finisher = event.top_finisher;

  const cardContent = (
    <>
      <div className="top">
        <span className="cat-pill">{cat.toUpperCase()}</span>
        <span className={`stat-pill ${state}`}>
          <span className="dot" />
          {STATE_PILL[state]}
        </span>
      </div>
      <h4>{event.card_title ?? event.display_name}</h4>
      {event.blurb && <p className="blurb">{event.blurb}</p>}
      <div className="meta">
        <div>
          <div className="k">Cohort window</div>
          <div className="v" style={!event.cohort_window_display ? { color: 'var(--ink-3)' } : undefined}>
            {event.cohort_window_display ?? 'TBD'}
          </div>
        </div>
        <div>
          <div className="k">Agents</div>
          <div className="v" style={!event.agents_status_display ? { color: 'var(--ink-3)' } : undefined}>
            {event.agents_status_display ?? '—'}
          </div>
        </div>
        <div>
          <div className="k">Test suite</div>
          <div className="v" style={!event.test_suite_display ? { color: 'var(--ink-3)' } : undefined}>
            {event.test_suite_display ?? '—'}
          </div>
        </div>
        <div>
          <div className="k">Top finisher</div>
          <div className="v" style={!finisher ? { color: 'var(--ink-3)' } : undefined}>
            {finisher ? (
              <span className="leader-logo">
                <AgentLogo slug={finisher.agent_slug} size={16} />
                {finisher.agent_name} · {finisher.composite.toFixed(3)}
              </span>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>
    </>
  );

  const className = `ev-card ${state === 'live' ? 'live' : ''} ${state === 'upcoming' ? 'upcoming' : ''}`;

  return isStub ? (
    <a className={className} href={href}>{cardContent}</a>
  ) : (
    <Link className={className} href={href}>{cardContent}</Link>
  );
}

function EventTableRow({ event }: { event: Event }) {
  const state = event.catalog_state ?? 'draft';
  const cat = event.category ?? 'apps';
  const href = getDetailHref(event);
  const isStub = href === '#';
  const finisher = event.top_finisher;
  const agentsCell = event.iterations.length
    ? String(event.iterations[0].participating_agents.length)
    : '—';

  const rowContent = (
    <>
      <div>
        <span className="cat-pill">{cat.toUpperCase()}</span>
      </div>
      <div>
        <div className="name">{event.card_title ?? event.display_name}</div>
        <div className="slug">{state === 'draft' ? 'in spec design' : event.slug}</div>
      </div>
      <div className="et-mob-hide">
        <span className={`stat-pill ${state}`}>
          <span className="dot" />
          {STATE_PILL[state]}
        </span>
      </div>
      <div className="when et-mob-hide" style={!event.cohort_window_display ? { color: 'var(--ink-3)' } : undefined}>
        {event.cohort_window_display ?? 'TBD'}
      </div>
      <div className="when et-mob-hide" style={!event.test_suite_display ? { color: 'var(--ink-3)' } : undefined}>
        {event.test_suite_display ?? '—'}
      </div>
      <div className="agents-num" style={agentsCell === '—' ? { color: 'var(--ink-3)' } : undefined}>
        {agentsCell}
      </div>
      <div className="leader" style={!finisher ? { color: 'var(--ink-3)' } : undefined}>
        {finisher ? (
          <>
            <AgentLogo slug={finisher.agent_slug} size={18} />
            {finisher.composite.toFixed(3)}
          </>
        ) : (
          '—'
        )}
      </div>
      <div className="arrow">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </>
  );

  return isStub ? (
    <a className="et-row" href={href}>{rowContent}</a>
  ) : (
    <Link className="et-row" href={href}>{rowContent}</Link>
  );
}

function ProposeRow({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="propose-meta-row">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

