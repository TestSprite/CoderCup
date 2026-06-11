'use client';

import Link from 'next/link';
import { Nav } from '../components/Nav';
import { SiteFooter } from '../components/SiteFooter';

interface Entry {
  date: string;
  tag: 'platform' | 'task' | 'agent' | 'rubric' | 'verdict' | 'infra';
  title: string;
  body: React.ReactNode;
}

const ENTRIES: Entry[] = [
  {
    date: '2026-05-27',
    tag: 'task',
    title: 'v3 spec restructured around 9 user-visible features (v3.2) · supersedes the v3.1 engineering-layer split',
    body: (
      <>
        The v3.1 spec broke the build into 9 engineering layers (data model ·
        routing · ingestion · content tabs · references · odds · predictions ·
        perf · a11y). Half of those phases shipped no new visible UI — a
        TestSprite probe driving a browser couldn&apos;t fairly grade
        &quot;agent built a build-time fetcher pipeline.&quot; v3.2 keeps
        the 9-phase scaffold but restructures it around{' '}
        <strong>user-visible features</strong> — every phase ships something
        a visitor can navigate to, screenshot, and judge:
        <ul>
          <li>
            <strong>Phase 1 · Landing</strong> — bracket + 12 group
            standings + FIFA-style hero. Unlocks <strong>2026-05-28</strong>.
          </li>
          <li>
            <strong>Phase 2 · Match details</strong> — 78 SSR permalinks at
            <code>/match/&lt;id&gt;</code> with teams, flags, kickoff, venue, round.
          </li>
          <li>
            <strong>Phase 3 · Predictions</strong> — winner + scoreline + bars
            + reasoning per match; champion locked at SIGSTART before kickoff.
          </li>
          <li>
            <strong>Phase 4 · Lineups</strong> — predicted XI + formation
            diagram + injury/suspension notes.
          </li>
          <li>
            <strong>Phase 5 · Your analysis</strong> — 3-5 paragraphs
            of original tactical writeup with <code>&lt;sup&gt;[N]&lt;/sup&gt;</code>{' '}
            citations resolving to a References panel.
          </li>
          <li>
            <strong>Phase 6 · Related news</strong> — ≥3 news cards per
            match, freshness ≤7d, HEAD-checked, source diversity ≥5 domains.
          </li>
          <li>
            <strong>Phase 7 · Betting odds</strong> — ≥3 bookmakers +
            market consensus (de-vig math correct) + agent&apos;s own implied prob.
          </li>
          <li>
            <strong>Phase 8 · Multi-language · i18n</strong> — en/es/pt locale
            routes + locale switcher + localized formatting.
          </li>
          <li>
            <strong>Phase 9 · Light/Dark · polish</strong> — system-pref dark
            mode + manual toggle persisted; perf budget; WCAG AA in both modes.
          </li>
        </ul>
        Total: 480 min across 10 phases, 182 plans. Every assertion in every
        suite is a <code>curl/grep/jq/lighthouse</code> check against a live URL.
        v1 (50 plans), v2 (54 plans), v3.0 (4-phase draft), and v3.1
        (9-engineering-layer draft) are all retired as build iterations.
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'platform',
    title: 'Plan rewrite + multi-event / multi-agent / live architecture',
    body: (
      <>
        The original codearena-v1 plan assumed one launch event (World Cup
        2026, hard date 6/22). Reality drifted: the brand changed, the
        launch model went continuous, and the site grew surfaces the plan
        never anticipated. After a self-audit, the plan was rewritten as{' '}
        a revised build plan with three independent axes treated
        as first-class concepts (event / agent / live), each piece scoped
        90/10, deferred work surfaced via{' '}
        <code>coming-soon-pattern.md</code>. Phase 1 ships:
        <ul>
          <li>
            <strong>Event as first-class</strong> — <code>/events</code> index +
            per-event detail page, Nav pill driven by{' '}
            <code>events.json[0]</code>, hardcoded &quot;Event #001 · WORLD
            CUP&quot; purged.
          </li>
          <li>
            <strong>Agent as first-class</strong> — <code>/agents/&lt;slug&gt;</code> redesigned
            with event-agnostic identity strip, 4-stat career summary,
            event participation table (accordion). Old single-event glass
            ceiling removed.
          </li>
          <li>
            <strong>Live as active vs idle</strong> — <code>/live</code>{' '}
            redesigned with explicit active state (race view) and idle
            state (most-recent event + countdown), polling 30s/60s. Demo
            banner explicit until m4 piece-3 wires the publisher Lambda.
          </li>
          <li>
            <strong>Coming-soon UX pattern</strong> — greyed cards + inline
            chips on /events (propose), /agents (trajectory, AI diff),
            /live (broadcast, embed).
          </li>
        </ul>
        Original plan preserved in the project archive.
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'platform',
    title: 'Real dark mode and a methodology drawer',
    body: (
      <>
        Two concrete product moves to close the test-vs-product gap:
        <ul>
          <li>
            <strong>Real dark mode</strong> — pre-hydration script in{' '}
            <code>layout.tsx</code> reads <code>localStorage</code> + system{' '}
            <code>prefers-color-scheme</code> and sets{' '}
            <code>documentElement.dataset.theme</code> before first paint
            (no flash). Sun/moon toggle in nav writes the choice; CSS vars
            switch via <code>:root[data-theme=&quot;dark&quot;]</code>.
          </li>
          <li>
            <strong>Methodology drawer</strong> — slide-in &quot;How this
            works&quot; from the nav, with sections on prediction source,
            scoring rubric, and the entertainment-only disclaimer. Escape
            and overlay-click close.
          </li>
        </ul>
        First post-shipping verdict: <code>trust-01</code> on the new
        drawer returned <strong>passed</strong> legitimately (10/10
        steps).
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'task',
    title: '24 e2e workflow plans drafted at the new quality bar',
    body: (
      <>
        After audit feedback that the original 50 plans were too thin (mostly
        2-step HTTP probes), rewrote the world-cup-v1 suite as multi-step
        user workflows — 6-9 plan steps per workflow, named as product
        features (Bracket Browsing, Predicting, Filtering, Preferences,
        Resilience, Comparison, Mobile, Sharing, Progression,
        Accessibility, Trust, Live-update, Visualization, API, Performance,
        i18n). Drafts live at <code>tests/world-cup-v1-e2e/</code>.
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'codercup.ai domain live; Amplify + GitHub auto-deploy',
    body: (
      <>
        Domain registered via Route53 (2-yr auto-renew). ACM cert
        issued + bound to Amplify. GitHub repo wired to auto-deploy on push
        to <code>main</code>. Site visible at{' '}
        <a href="https://codercup.ai">https://codercup.ai</a>.
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'platform',
    title: 'Public pages: /tests, /tests/[id], /vs, /reference, /methodology',
    body: (
      <>
        Five new credibility-and-transparency surfaces shipped:
        <ul>
          <li>
            <Link href="/tests">/tests</Link> — browseable test suite, 50 plans
            with per-agent verdict dots
          </li>
          <li>
            <Link href="/tests/34b726f4">/tests/[id]</Link> — per-plan deep
            dive with plan source + per-agent verdicts + deploy preview
          </li>
          <li>
            <Link href="/vs">/vs</Link> — cross-agent comparison matrix
          </li>
          <li>
            <Link href="/reference">/reference</Link> — working v2 Bettor&apos;s
            Edition demo (8 R16 cards, Monte Carlo simulator, EV picker)
          </li>
          <li>
            <Link href="/methodology">/methodology</Link> — full rubric with
            sample plan JSON disclosure
          </li>
        </ul>
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'task',
    title: 'v2 Bettor&apos;s Edition spec drafted (54 plans)',
    body: (
      <>
        Task spec expanded from a static bracket (v1) to a working
        prediction tool with odds widget, EV picker, Monte Carlo simulator,
        scenario explorer, community picks, i18n (en/es/pt), mobile-first
        responsive, security/SEO headers. v1 still locked for the current
        cohort; v2 registers at spec lock-in.{' '}
        <a
          href="https://github.com/TestSprite/CoderCup/blob/main/task-spec/world-cup-2026-v2.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Spec draft
        </a>
        .
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'platform',
    title: 'Rebrand: CoderCup → CoderCup',
    body: (
      <>
        Picked <code>codercup.ai</code> as the launch brand after rejecting
        <code>codearena.run</code> (LMArena namespace conflict, .run TLD
        less recognized) and <code>agentcup.ai</code> (too broad — we
        specifically test coding agents). Trophy SVG brand mark now used
        across nav, footer, favicon.
      </>
    ),
  },
  {
    date: '2026-05-26',
    tag: 'verdict',
    title: 'First cross-agent shipping verdict — agy 0.465, codex 0.424, claude 0.372',
    body: (
      <>
        Smoke shakedown across all 3 frontier agents on world-cup-v1.
        Surprising signal: claude-code in last place despite shipping the
        most source code (21 source files vs codex 16 vs agy 8) — the
        static-export-vs-dynamic-API tension in the spec hit claude hardest.
        Agy&apos;s redesigned routing (path-segment with{' '}
        <code>generateStaticParams</code>) was the static-export-correct
        answer. Full ranking on the{' '}
        <Link href="/">leaderboard</Link>; cross-agent matrix at{' '}
        <Link href="/vs">/vs</Link>.
      </>
    ),
  },
  {
    date: '2026-05-25',
    tag: 'task',
    title: 'world-cup-v1 suite locked at 50 plans',
    body: (
      <>
        v1 TestSprite plan set frozen for the first cohort: 18 surfaces, 12
        prediction integrity, 8 performance, 8 accessibility, 4 resilience.
        Plans registered into the CoderCup TestSprite project. v2 will
        additively extend after spec lock-in.
      </>
    ),
  },
];

const TAG_LABEL: Record<Entry['tag'], string> = {
  platform: 'Platform',
  task: 'Task spec',
  agent: 'Agents',
  rubric: 'Scoring rubric',
  verdict: 'Verdict',
  infra: 'Infra',
};

export function ChangelogClient() {
  // Group entries by date for visual rhythm
  const byDate = ENTRIES.reduce<Record<string, Entry[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <Nav />
      <article className="cl shell">
        <header>
          <div className="eyebrow">Changelog</div>
          <h1>
            The platform <em>keeps iterating.</em>
          </h1>
          <p className="lede">
            Reverse-chronological log of meaningful CoderCup events — task
            spec versions, new agents onboarded, scoring rubric calibrations,
            notable cross-agent verdicts. CoderCup is a continuously-running
            benchmark, not a launch-day event; this is the ongoing record.
          </p>
        </header>

        {dates.map((date) => (
          <section key={date} className="day">
            <div className="date">{date}</div>
            <div className="entries">
              {byDate[date].map((e, i) => (
                <article key={i} className="entry">
                  <div className="head">
                    <span className={`tag tag-${e.tag}`}>{TAG_LABEL[e.tag]}</span>
                    <h2>{e.title}</h2>
                  </div>
                  <div className="body">{e.body}</div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </article>
      <SiteFooter />

    </>
  );
}
