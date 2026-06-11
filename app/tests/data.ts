// Static-export-friendly catalog of the world-cup-2026-v3 phase suites.
// Mirrors tests/world-cup-2026-v3/<phase-N>/suite-index.json — kept in
// lockstep with the source-of-truth catalog by hand.
//
// Phases 1-6 are scored: landing (16), match details (16), predictions
// (20), lineups (16), analysis (22), related news (16) — 106 plans total.
// Phases 7-9 land just-in-time as each phase unlocks per the multi-phase spec.
//
// test_id is an 8-char hex generated deterministically per plan path. Phase
// 1 uses an early hand-assigned pattern (a1b2c3d4-style); Phase 2 onward
// uses the first 8 chars of sha1(plan_path) so new phases drop in without
// hex-collision bookkeeping. When the suite is submitted to TestSprite,
// those IDs are replaced by the engine-assigned UUIDs — until then, these
// stable IDs are how /tests/[id]/ permalinks resolve.

export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface TestEntry {
  test_id: string;
  category: string;
  /** Path RELATIVE to tests/world-cup-2026-v3/phase-<phase>/. */
  path: string;
  name: string;
  priority?: 'p0' | 'p1' | 'p2' | 'p3';
  phase: Phase;
}

export const TESTS: TestEntry[] = [
  // ─── Phase 1 · Landing page (16) ──────────────────────────────────────
  // routes (5) — interaction-driven navigation
  { test_id: 'a1b2c3d4', phase: 1, category: 'routes', path: 'routes/01-click-r16-cell-to-match.json', name: 'Clicking a Round-of-16 cell navigates from homepage to a match detail page', priority: 'p0' },
  { test_id: 'b2c3d4e5', phase: 1, category: 'routes', path: 'routes/02-groups-link-shows-all-12.json', name: 'Clicking the Groups navigation surfaces all twelve groups A through L', priority: 'p1' },
  { test_id: 'c3d4e5f6', phase: 1, category: 'routes', path: 'routes/03-team-row-to-match-detail.json', name: 'Clicking a Group A team row navigates to a page that names that team', priority: 'p1' },
  { test_id: 'd4e5f6a7', phase: 1, category: 'routes', path: 'routes/04-404-then-recover.json', name: 'Unknown match slug shows a 404 view and recovers via home link', priority: 'p1' },
  { test_id: 'e5f6a7b8', phase: 1, category: 'routes', path: 'routes/05-final-cell-loads.json', name: 'Clicking the Final cell reaches a match detail page labeled Final', priority: 'p0' },

  // data (4) — UI-rendered cardinality checks
  { test_id: 'f6a7b8c9', phase: 1, category: 'data', path: 'data/01-bracket-cardinality.json', name: 'Clicking one cell from each bracket stage reaches four distinct match pages', priority: 'p0' },
  { test_id: 'a7b8c9d0', phase: 1, category: 'data', path: 'data/02-group-row-count.json', name: 'Clicking a team row in Group A then in Group L lands on two distinct destinations', priority: 'p1' },
  { test_id: 'b8c9d0e1', phase: 1, category: 'data', path: 'data/03-three-match-pages-distinct.json', name: 'Three Round-of-16 cell clicks lead to three different match detail pages', priority: 'p0' },
  { test_id: 'c9d0e1f2', phase: 1, category: 'data', path: 'data/04-kickoff-and-venue-visible.json', name: 'Clicking a bracket cell reaches a match detail page that shows kickoff and venue', priority: 'p1' },

  // match-detail (3) — content assertions on match permalink pages
  { test_id: 'd0e1f2a3', phase: 1, category: 'match-detail', path: 'match-detail/01-stage-label-on-qf.json', name: 'Clicking a Quarterfinal cell reaches a match page labeled Quarterfinal', priority: 'p1' },
  { test_id: 'e1f2a3b4', phase: 1, category: 'match-detail', path: 'match-detail/02-group-letter-on-group-match.json', name: 'Clicking a Group A team row reaches a destination that surfaces Group A context', priority: 'p1' },
  { test_id: 'f2a3b4c5', phase: 1, category: 'match-detail', path: 'match-detail/03-five-permalinks-load.json', name: 'Five sequential bracket-cell clicks land on five distinct match detail pages', priority: 'p1' },

  // a11y (2) — keyboard + alt text
  { test_id: 'a3b4c5d6', phase: 1, category: 'a11y', path: 'a11y/01-keyboard-tab-focus.json', name: 'Keyboard Tab traversal surfaces visible focus on interactive elements', priority: 'p1' },
  { test_id: 'b4c5d6e7', phase: 1, category: 'a11y', path: 'a11y/02-flag-images-alt.json', name: 'Screen-reader users can identify each team flag in the bracket and group standings', priority: 'p1' },

  // visual (1) — hero + bracket layout
  { test_id: 'c5d6e7f8', phase: 1, category: 'visual', path: 'visual/01-hero-and-bracket-present.json', name: 'Homepage shows a hero heading at the top and the bracket section below', priority: 'p1' },
  { test_id: 'e7f8a9b0', phase: 1, category: 'visual', path: 'visual/02-flag-images-render.json', name: 'Homepage team flag images render the correct national flag, not broken or placeholder', priority: 'p1' },

  // seo (1) — sitemap reachability
  { test_id: 'd6e7f8a9', phase: 1, category: 'seo', path: 'seo/01-sitemap-lists-matches.json', name: 'A match URL listed in sitemap.xml renders real match content when visited', priority: 'p1' },

  // ─── Phase 2 · Match details (16) ─────────────────────────────────────
  // permalinks (5) — match/<id> SSR detail loads + nav
  { test_id: '76b70d4a', phase: 2, category: 'permalinks', path: 'permalinks/01-match-permalink-loads.json', name: 'Sample match permalink loads with team names visible', priority: 'p0' },
  { test_id: '0e20fda2', phase: 2, category: 'permalinks', path: 'permalinks/02-match-permalink-kickoff.json', name: 'Match detail page shows kickoff time', priority: 'p0' },
  { test_id: 'c366e7cd', phase: 2, category: 'permalinks', path: 'permalinks/03-match-permalink-venue.json', name: 'Match detail page shows venue host city', priority: 'p1' },
  { test_id: 'c4da4156', phase: 2, category: 'permalinks', path: 'permalinks/04-match-permalink-round.json', name: 'Match detail page shows the round or group label', priority: 'p1' },
  { test_id: '4ecd7108', phase: 2, category: 'permalinks', path: 'permalinks/05-match-permalink-back-nav.json', name: 'Match detail page has a back-to-bracket link', priority: 'p2' },

  // details-data (4) — content rendered in the initial HTML
  { test_id: 'bfab9939', phase: 2, category: 'details-data', path: 'details-data/01-team-name-rendered.json', name: 'Both team names render as readable text on match page', priority: 'p0' },
  { test_id: '98805948', phase: 2, category: 'details-data', path: 'details-data/02-team-flags-present.json', name: 'Both team flag images render the correct flags on the match detail page', priority: 'p0' },
  { test_id: 'c4363884', phase: 2, category: 'details-data', path: 'details-data/03-kickoff-iso-or-local.json', name: 'Kickoff timestamp is rendered in human-readable form', priority: 'p1' },
  { test_id: 'dc9c837d', phase: 2, category: 'details-data', path: 'details-data/04-stage-badge.json', name: 'Match page renders a stage badge for the fixture', priority: 'p1' },

  // seo (3) — sitemap + meta tags
  { test_id: '4b9666eb', phase: 2, category: 'seo', path: 'seo/01-sitemap-lists-matches.json', name: 'Sitemap lists at least 80 URLs spanning index, groups, and matches', priority: 'p1' },
  { test_id: 'f5caec55', phase: 2, category: 'seo', path: 'seo/02-og-title-matches.json', name: 'Match page og:title contains both team names', priority: 'p1' },
  { test_id: '80c60cee', phase: 2, category: 'seo', path: 'seo/03-canonical-url.json', name: 'Match page exposes a canonical link tag matching the URL', priority: 'p2' },

  // security (2) — response headers
  { test_id: 'b94fcaa3', phase: 2, category: 'security', path: 'security/01-csp-header.json', name: 'Match page response includes a Content-Security-Policy header', priority: 'p1' },
  { test_id: 'be3ead77', phase: 2, category: 'security', path: 'security/02-xfo-or-frame-ancestors.json', name: 'Match page response includes X-Frame-Options or frame-ancestors', priority: 'p2' },

  // errors (2) — 404 + malformed slug
  { test_id: 'f403e327', phase: 2, category: 'errors', path: 'errors/01-unknown-match-404.json', name: 'Unknown match id returns HTTP 404 with rendered page', priority: 'p0' },
  { test_id: '0bb58201', phase: 2, category: 'errors', path: 'errors/02-malformed-id-graceful.json', name: 'Malformed match id renders a graceful error page', priority: 'p1' },

  // ─── Phase 3 · Predictions (20) ───────────────────────────────────────
  // prediction-shape (5) — the Prediction block is the phase deliverable
  { test_id: '99f267fc', phase: 3, category: 'prediction-shape', path: 'prediction-shape/01-prediction-block-visible.json', name: 'Match page renders a Prediction block', priority: 'p0' },
  { test_id: 'd973bac2', phase: 3, category: 'prediction-shape', path: 'prediction-shape/02-winner-named.json', name: 'Prediction block names a winner or a draw', priority: 'p0' },
  { test_id: 'eb7e0acc', phase: 3, category: 'prediction-shape', path: 'prediction-shape/03-scoreline-rendered.json', name: 'Prediction block renders a concrete scoreline', priority: 'p0' },
  { test_id: '93986189', phase: 3, category: 'prediction-shape', path: 'prediction-shape/04-probability-bars.json', name: 'Prediction block shows probability bars with percentages', priority: 'p1' },
  { test_id: '5c440984', phase: 3, category: 'prediction-shape', path: 'prediction-shape/05-probability-sum.json', name: 'Probability values sum to approximately 1.0', priority: 'p1' },

  // prediction-invariants (6) — the math is non-negotiable
  { test_id: '065b46e6', phase: 3, category: 'prediction-invariants', path: 'prediction-invariants/01-no-team-plays-itself.json', name: 'No prediction has a team predicted to play itself', priority: 'p0' },
  { test_id: '4879d4e3', phase: 3, category: 'prediction-invariants', path: 'prediction-invariants/02-scoreline-sane.json', name: 'Predicted scoreline values stay within a sane 0 to 9 range', priority: 'p0' },
  { test_id: '55cf53a7', phase: 3, category: 'prediction-invariants', path: 'prediction-invariants/03-knockout-no-draw.json', name: 'Knockout-stage predictions never declare a draw winner', priority: 'p1' },
  { test_id: '890bb57e', phase: 3, category: 'prediction-invariants', path: 'prediction-invariants/04-knockout-tie-resolves.json', name: 'Tied knockout predictions surface an extra-time or penalties resolution', priority: 'p1' },
  { test_id: 'fc0b0802', phase: 3, category: 'prediction-invariants', path: 'prediction-invariants/05-group-allows-draw.json', name: 'Group-stage predictions allow draw as a valid winner', priority: 'p2' },
  { test_id: 'fcec9b10', phase: 3, category: 'prediction-invariants', path: 'prediction-invariants/06-reasoning-present.json', name: 'Prediction block includes a reasoning paragraph', priority: 'p1' },

  // champion-lock (3) — champion locked at SIGSTART
  { test_id: '97b547a5', phase: 3, category: 'champion-lock', path: 'champion-lock/01-final-has-champion.json', name: 'Final match page surfaces the predicted champion', priority: 'p0' },
  { test_id: '3b3b15b8', phase: 3, category: 'champion-lock', path: 'champion-lock/02-champion-is-fifa-team.json', name: 'Champion pick is one of the 48 FIFA 2026 teams', priority: 'p0' },
  { test_id: 'e52a9ce0', phase: 3, category: 'champion-lock', path: 'champion-lock/03-champion-on-landing.json', name: 'Champion prediction is reachable from the landing page', priority: 'p2' },

  // bracket-progression (3) — predictions are internally consistent across rounds
  { test_id: 'fee3b060', phase: 3, category: 'bracket-progression', path: 'bracket-progression/01-bracket-cardinality.json', name: 'Bracket shows the expected number of cells per knockout round', priority: 'p0' },
  { test_id: '96654b5e', phase: 3, category: 'bracket-progression', path: 'bracket-progression/02-predicted-finalists-from-sf.json', name: 'Predicted finalists derive from predicted semi-final winners', priority: 'p1' },
  { test_id: '0d537cbc', phase: 3, category: 'bracket-progression', path: 'bracket-progression/03-favorite-progresses.json', name: 'Top-probability R16 team also appears in QF predictions', priority: 'p2' },

  // visible (3) — predictions are surfaced, not buried
  { test_id: '8554e3fe', phase: 3, category: 'visible', path: 'visible/01-prediction-above-fold.json', name: 'Prediction block is visible above the fold on desktop', priority: 'p1' },
  { test_id: 'a22f763e', phase: 3, category: 'visible', path: 'visible/02-prediction-on-match-card.json', name: 'Bracket match cards surface the predicted winner', priority: 'p2' },
  { test_id: 'd378613d', phase: 3, category: 'visible', path: 'visible/03-prediction-mobile-readable.json', name: 'Prediction block renders cleanly at 360px viewport', priority: 'p1' },

  // ─── Phase 4 · Lineups (16) ───────────────────────────────────────────
  { test_id: '6fae00d5', phase: 4, category: 'lineups/tab-present', path: 'lineups/tab-present/01-tab-visible-on-match-page.json', name: "Lineups tab is visible and opens a populated lineups panel on a match page", priority: 'p0' },
  { test_id: 'c0612d24', phase: 4, category: 'lineups/tab-present', path: 'lineups/tab-present/02-tab-keyboard-accessible.json', name: "Lineups tab is reachable and activatable by keyboard", priority: 'p0' },
  { test_id: '57aa56c0', phase: 4, category: 'lineups/tab-present', path: 'lineups/tab-present/03-section-reachable-by-scroll.json', name: "Lineups content is reachable by scrolling the match page", priority: 'p0' },
  { test_id: 'c9ba423b', phase: 4, category: 'lineups/starting-xi', path: 'lineups/starting-xi/01-home-team-eleven-players.json', name: "Home team starting XI lists exactly eleven players", priority: 'p1' },
  { test_id: '4ad8e8d9', phase: 4, category: 'lineups/starting-xi', path: 'lineups/starting-xi/02-away-team-eleven-players.json', name: "Away team starting XI lists exactly eleven players", priority: 'p1' },
  { test_id: 'f2b88ced', phase: 4, category: 'lineups/starting-xi', path: 'lineups/starting-xi/03-player-names-nonempty.json', name: "Every starting XI player has a non-empty name and a valid position", priority: 'p1' },
  { test_id: 'e6d7ea9a', phase: 4, category: 'lineups/starting-xi', path: 'lineups/starting-xi/04-player-list-structured.json', name: "Rendered starting XI is a structured list of distinct named rows", priority: 'p1' },
  { test_id: 'e18fdd56', phase: 4, category: 'lineups/formation', path: 'lineups/formation/01-formation-label-valid-pattern.json', name: "Home formation label matches a valid formation pattern and sums to ten", priority: 'p1' },
  { test_id: '1af79901', phase: 4, category: 'lineups/formation', path: 'lineups/formation/02-both-teams-have-formation.json', name: "Both teams' formation labels render as visible text on the match page", priority: 'p1' },
  { test_id: '7e560a50', phase: 4, category: 'lineups/formation', path: 'lineups/formation/03-pitch-diagram-present.json', name: "Formation pitch diagram renders at least twenty-two position markers", priority: 'p1' },
  { test_id: '005cabd2', phase: 4, category: 'lineups/injuries', path: 'lineups/injuries/01-player-status-note-visible.json', name: "At least one player status note is surfaced on the match lineups", priority: 'p1' },
  { test_id: 'bee6fabd', phase: 4, category: 'lineups/injuries', path: 'lineups/injuries/02-status-vocabulary-standard.json', name: "Every injury entry uses a standard severity from a fixed vocabulary", priority: 'p1' },
  { test_id: '40910766', phase: 4, category: 'lineups/head-check', path: 'lineups/head-check/01-no-player-in-both-teams.json', name: "No player appears in both teams' starting lineups", priority: 'p1' },
  { test_id: '9c5bcc57', phase: 4, category: 'lineups/head-check', path: 'lineups/head-check/02-exactly-eleven-per-team.json', name: "Starting XI count is exactly eleven per team across a sample of matches", priority: 'p1' },
  { test_id: '449fe93d', phase: 4, category: 'lineups/responsive', path: 'lineups/responsive/01-lineups-at-360px.json', name: "Lineups render at a 360px viewport without horizontal scroll", priority: 'p2' },
  { test_id: 'e503e765', phase: 4, category: 'lineups/responsive', path: 'lineups/responsive/02-formation-diagram-mobile.json', name: "Formation pitch diagram stays legible inside the viewport at 360px", priority: 'p2' },

  // ─── Phase 5 · Your analysis (22) ─────────────────────────────────────
  { test_id: '1002bd9d', phase: 5, category: 'analysis/tab-present', path: 'analysis/tab-present/01-analysis-tab-visible-on-match-page.json', name: "Analysis tab is visible on a match detail page", priority: 'p0' },
  { test_id: 'd6374855', phase: 5, category: 'analysis/tab-present', path: 'analysis/tab-present/02-analysis-panel-opens-on-click.json', name: "Clicking the Analysis tab opens an analysis panel with content", priority: 'p0' },
  { test_id: 'b718e96b', phase: 5, category: 'analysis/paragraph-count', path: 'analysis/paragraph-count/01-analysis-has-at-least-three-paragraphs.json', name: "Analysis panel contains at least three paragraphs", priority: 'p1' },
  { test_id: 'c390e0f8', phase: 5, category: 'analysis/paragraph-count', path: 'analysis/paragraph-count/02-analysis-has-at-most-five-paragraphs.json', name: "Analysis panel contains no more than five paragraphs", priority: 'p2' },
  { test_id: '984d3723', phase: 5, category: 'analysis/paragraph-count', path: 'analysis/paragraph-count/03-two-different-matches-both-have-analysis.json', name: "Two different match detail pages both show analysis content", priority: 'p0' },
  { test_id: '971b9b72', phase: 5, category: 'analysis/paragraph-length', path: 'analysis/paragraph-length/01-each-paragraph-has-at-least-200-chars.json', name: "Each analysis paragraph is at least 200 characters long", priority: 'p1' },
  { test_id: '2fe592af', phase: 5, category: 'analysis/paragraph-length', path: 'analysis/paragraph-length/02-each-paragraph-has-at-most-600-chars.json', name: "Each analysis paragraph is no longer than 600 characters", priority: 'p2' },
  { test_id: '28f4e3e4', phase: 5, category: 'analysis/paragraph-length', path: 'analysis/paragraph-length/03-analysis-text-is-substantive-not-boilerplate.json', name: "Analysis text appears substantive and match-specific, not generic boilerplate", priority: 'p0' },
  { test_id: '961f7f2f', phase: 5, category: 'analysis/citation-density', path: 'analysis/citation-density/01-analysis-has-inline-citation-markers.json', name: "Analysis paragraphs contain inline citation markers", priority: 'p0' },
  { test_id: 'eddf8322', phase: 5, category: 'analysis/citation-density', path: 'analysis/citation-density/02-references-panel-is-present.json', name: "A References panel or section is present after the analysis text", priority: 'p0' },
  { test_id: 'ea3ec100', phase: 5, category: 'analysis/anchor-resolves', path: 'analysis/anchor-resolves/01-citation-marker-links-to-reference.json', name: "Clicking a citation marker scrolls to or highlights the corresponding reference", priority: 'p1' },
  { test_id: '92417ba9', phase: 5, category: 'analysis/anchor-resolves', path: 'analysis/anchor-resolves/02-reference-entries-show-source-url.json', name: "Reference entries display a source URL or link", priority: 'p1' },
  { test_id: '882fbc33', phase: 5, category: 'analysis/anchor-resolves', path: 'analysis/anchor-resolves/03-reference-count-matches-citation-count.json', name: "The number of references matches the number of unique inline citations", priority: 'p2' },
  { test_id: '4f149cc4', phase: 5, category: 'analysis/url-liveness', path: 'analysis/url-liveness/01-first-reference-url-is-reachable.json', name: "The first reference URL is a valid reachable web address", priority: 'p0' },
  { test_id: 'da588297', phase: 5, category: 'analysis/url-liveness', path: 'analysis/url-liveness/02-reference-urls-use-https.json', name: "All visible reference URLs use HTTPS", priority: 'p2' },
  { test_id: '3181e59f', phase: 5, category: 'analysis/url-liveness', path: 'analysis/url-liveness/03-reference-links-are-clickable.json', name: "Reference source links are clickable anchor tags", priority: 'p1' },
  { test_id: 'd7a6b064', phase: 5, category: 'analysis/freshness', path: 'analysis/freshness/01-analysis-text-references-2026-context.json', name: "Analysis text references 2026 World Cup context", priority: 'p1' },
  { test_id: 'f9b40a52', phase: 5, category: 'analysis/freshness', path: 'analysis/freshness/02-analysis-does-not-use-placeholder-dates.json', name: "Analysis text does not contain placeholder dates or lorem ipsum", priority: 'p0' },
  { test_id: 'bf5a7e5d', phase: 5, category: 'analysis/uniqueness', path: 'analysis/uniqueness/01-two-matches-have-different-analysis-text.json', name: "Two different match pages show different analysis text", priority: 'p0' },
  { test_id: 'c296eb06', phase: 5, category: 'analysis/uniqueness', path: 'analysis/uniqueness/02-analysis-text-mentions-the-match-teams.json', name: "Analysis text mentions the specific teams playing in the match", priority: 'p0' },
  { test_id: '5d1d2f97', phase: 5, category: 'analysis/no-paywall', path: 'analysis/no-paywall/01-analysis-content-is-visible-without-login.json', name: "Analysis content is fully visible without requiring login or signup", priority: 'p0' },
  { test_id: '48a80339', phase: 5, category: 'analysis/no-paywall', path: 'analysis/no-paywall/02-analysis-loads-without-external-popups.json', name: "Analysis panel loads without intrusive external popups or overlays", priority: 'p2' },

  // ─── Phase 6 · Related news (16) ──────────────────────────────────────
  { test_id: 'e729c6a5', phase: 6, category: 'news/section-present', path: 'news/section-present/01-related-news-tab-is-visible.json', name: "Related news tab or section is visible on a match detail page", priority: 'p0' },
  { test_id: '66057bf3', phase: 6, category: 'news/section-present', path: 'news/section-present/02-news-panel-opens-on-click.json', name: "Clicking the News tab reveals a populated news panel", priority: 'p0' },
  { test_id: '281e4631', phase: 6, category: 'news/section-present', path: 'news/section-present/03-news-panel-shows-at-least-three-cards.json', name: "News panel shows at least three news cards", priority: 'p0' },
  { test_id: '82e5c365', phase: 6, category: 'news/card-structure', path: 'news/card-structure/01-each-news-card-has-a-title.json', name: "Each news card has a readable article title", priority: 'p0' },
  { test_id: 'f95a5319', phase: 6, category: 'news/card-structure', path: 'news/card-structure/02-each-news-card-shows-source-and-date.json', name: "Each news card shows a source name and publication date", priority: 'p1' },
  { test_id: '064918d4', phase: 6, category: 'news/card-structure', path: 'news/card-structure/03-each-news-card-has-a-clickable-link.json', name: "Each news card is a clickable link to the source article", priority: 'p1' },
  { test_id: '8cb01707', phase: 6, category: 'news/freshness', path: 'news/freshness/01-news-dates-are-within-seven-days.json', name: "News cards show dates within the last 7 days", priority: 'p1' },
  { test_id: '5554f53e', phase: 6, category: 'news/freshness', path: 'news/freshness/02-news-content-is-not-from-2022-tournament.json', name: "News articles do not reference only the 2022 World Cup", priority: 'p1' },
  { test_id: '5a617531', phase: 6, category: 'news/freshness', path: 'news/freshness/03-news-panel-does-not-show-placeholder-articles.json', name: "News panel does not show placeholder or fake article titles", priority: 'p0' },
  { test_id: 'ee76f69e', phase: 6, category: 'news/head-check', path: 'news/head-check/01-news-source-urls-use-https.json', name: "News source URLs in cards use HTTPS", priority: 'p1' },
  { test_id: '63191734', phase: 6, category: 'news/head-check', path: 'news/head-check/02-news-urls-point-to-real-domains.json', name: "News URLs point to real recognizable domains", priority: 'p1' },
  { test_id: '14ab189a', phase: 6, category: 'news/source-diversity', path: 'news/source-diversity/01-news-cards-come-from-multiple-sources.json', name: "News cards come from at least two different source domains", priority: 'p1' },
  { test_id: '5f4598b6', phase: 6, category: 'news/source-diversity', path: 'news/source-diversity/02-different-matches-show-different-news.json', name: "Different match pages show different news article sets", priority: 'p1' },
  { test_id: '17dedd7f', phase: 6, category: 'news/coverage', path: 'news/coverage/01-news-mentions-match-teams.json', name: "News card titles mention the match teams or relevant football terms", priority: 'p0' },
  { test_id: '7f34d27d', phase: 6, category: 'news/coverage', path: 'news/coverage/02-news-panel-loads-without-error.json', name: "News panel loads without visible error states or broken UI", priority: 'p0' },
  { test_id: '080921b2', phase: 6, category: 'news/coverage', path: 'news/coverage/03-news-accessible-without-scroll-depth.json', name: "News cards are accessible without excessive scrolling", priority: 'p2' },
  // --- phases 7-9 (appended) ---
  { test_id: '26948a3c', phase: 7, category: "odds/accessibility", path: "odds/accessibility/01-bars-have-text-labels.json", name: "Probability bars carry text labels, not color alone", priority: 'p1' },
  { test_id: '7ebfbe4e', phase: 7, category: "odds/accessibility", path: "odds/accessibility/02-odds-tab-keyboard-reachable.json", name: "Betting Odds tab is reachable and activatable by keyboard", priority: 'p2' },
  { test_id: 'ef8d2ef1', phase: 7, category: "odds/accessibility", path: "odds/accessibility/03-responsible-gambling-disclaimer.json", name: "Responsible-gambling / 18+ disclaimer is present on the Odds surface", priority: 'p1' },
  { test_id: 'bbfd3f6a', phase: 7, category: "odds/agent-consistency", path: "odds/agent-consistency/01-agent-implied-matches-phase3.json", name: "Agent implied probability on the Odds tab matches the phase-3 prediction", priority: 'p1' },
  { test_id: '04d072b9', phase: 7, category: "odds/agent-consistency", path: "odds/agent-consistency/02-favorite-aligns-with-prediction.json", name: "Lowest-odds favorite aligns with the agent's predicted winner", priority: 'p2' },
  { test_id: '9fb475ef', phase: 7, category: "odds/math-consensus", path: "odds/math-consensus/01-consensus-sums-to-one.json", name: "Market consensus probabilities sum to 1.0", priority: 'p0' },
  { test_id: 'a288bf28', phase: 7, category: "odds/math-consensus", path: "odds/math-consensus/02-consensus-equals-mean-of-devigged.json", name: "Consensus equals the arithmetic mean of de-vigged book probabilities", priority: 'p0' },
  { test_id: 'b739eb1b', phase: 7, category: "odds/math-consensus", path: "odds/math-consensus/03-consensus-not-decimal-average-trap.json", name: "Consensus is computed on probabilities, not by averaging decimal odds", priority: 'p1' },
  { test_id: 'eafed6f6', phase: 7, category: "odds/math-devig", path: "odds/math-devig/01-devigged-probs-sum-to-one.json", name: "Each book's de-vigged probabilities sum to 1.0", priority: 'p0' },
  { test_id: '15031e45', phase: 7, category: "odds/math-devig", path: "odds/math-devig/02-raw-implied-shows-vig.json", name: "Raw implied probabilities sum above 1.0 (the vig is real)", priority: 'p0' },
  { test_id: '95cac437', phase: 7, category: "odds/math-devig", path: "odds/math-devig/03-devig-is-normalized-raw.json", name: "De-vigged probability equals raw implied normalized by the overround", priority: 'p0' },
  { test_id: '3d20cbf1', phase: 7, category: "odds/math-devig", path: "odds/math-devig/04-devig-holds-across-sampled-matches.json", name: "De-vig sum-to-one holds across multiple sampled matches", priority: 'p0' },
  { test_id: 'ee8e48f6', phase: 7, category: "odds/staleness-badge", path: "odds/staleness-badge/01-badge-present-when-odds-stale.json", name: "Staleness warning appears when the oldest book is over six hours old", priority: 'p1' },
  { test_id: '98505d3b', phase: 7, category: "odds/staleness-badge", path: "odds/staleness-badge/02-no-badge-when-odds-fresh.json", name: "No staleness warning on a match whose odds are fresh", priority: 'p2' },
  { test_id: 'f4a64dee', phase: 7, category: "odds/three-books", path: "odds/three-books/01-at-least-three-books-per-match.json", name: "Every match offers at least three bookmaker lines", priority: 'p0' },
  { test_id: '395915a8', phase: 7, category: "odds/three-books", path: "odds/three-books/02-bookmakers-are-real-named-sources.json", name: "Bookmakers are real named sportsbooks, not invented placeholders", priority: 'p0' },
  { test_id: '93526d01', phase: 7, category: "odds/ui-rendered", path: "odds/ui-rendered/01-odds-tab-renders-book-table.json", name: "Odds tab renders a per-book table with concrete decimal values", priority: 'p0' },
  { test_id: '212ef504', phase: 7, category: "odds/ui-rendered", path: "odds/ui-rendered/02-consensus-and-agent-rows-rendered.json", name: "Consensus row and agent implied row both render with percentages", priority: 'p0' },
  { test_id: '15ac5948', phase: 7, category: "odds/ui-rendered", path: "odds/ui-rendered/03-probability-bars-match-consensus.json", name: "Probability bars render and their widths track the consensus values", priority: 'p1' },
  { test_id: '7fbf7c05', phase: 8, category: "data-authenticity", path: "data-authenticity/01-no-mock-or-tbd-data-anywhere.json", name: "No mock, TBD, or placeholder data anywhere in the rendered product", priority: 'p0' },
  { test_id: '09cdfc4d', phase: 8, category: "data-authenticity", path: "data-authenticity/02-group-standings-projected-not-zeroed.json", name: "Group standings are projected from predictions, not all-zero placeholders", priority: 'p1' },
  { test_id: '7b3c1dfa', phase: 8, category: "data-authenticity", path: "data-authenticity/03-predictions-real-and-varied-champion-named.json", name: "Match predictions are real and varied and a real champion is named", priority: 'p1' },
  { test_id: 'ee3270d4', phase: 8, category: "i18n/date-localization", path: "i18n/date-localization/01-time-text-differs-by-locale.json", name: "Match kickoff time renders with locale-specific month names", priority: 'p0' },
  { test_id: '9b9ea0a4', phase: 8, category: "i18n/date-localization", path: "i18n/date-localization/02-portuguese-date-distinct.json", name: "Portuguese date formatting is distinct from English", priority: 'p1' },
  { test_id: 'abe61549', phase: 8, category: "i18n/html-lang", path: "i18n/html-lang/01-html-lang-matches-locale.json", name: "html lang attribute matches the selected locale", priority: 'p0' },
  { test_id: '46c830e1', phase: 8, category: "i18n/html-lang", path: "i18n/html-lang/02-hreflang-alternates-present.json", name: "Head lists hreflang alternates for all three locales", priority: 'p1' },
  { test_id: '55476971', phase: 8, category: "i18n/locale-switcher", path: "i18n/locale-switcher/01-switcher-present-in-nav.json", name: "Locale switcher is present in the nav and offers all three languages", priority: 'p0' },
  { test_id: 'ac413c70', phase: 8, category: "i18n/locale-switcher", path: "i18n/locale-switcher/02-switcher-preserves-path.json", name: "Switching language preserves the current path", priority: 'p0' },
  { test_id: '8b1f1caf', phase: 8, category: "i18n/locale-switcher", path: "i18n/locale-switcher/03-selected-locale-persists-across-navigation.json", name: "Selected locale persists across in-app navigation", priority: 'p1' },
  { test_id: '2115ab44', phase: 8, category: "i18n/no-leakage", path: "i18n/no-leakage/01-spanish-chrome-actually-translated.json", name: "Spanish page chrome reads in Spanish, not English", priority: 'p0' },
  { test_id: '0c994ee1', phase: 8, category: "i18n/no-leakage", path: "i18n/no-leakage/02-portuguese-data-labels-translated.json", name: "Portuguese match page translates data labels, not just nav", priority: 'p0' },
  { test_id: '0efb6279', phase: 8, category: "i18n/no-leakage", path: "i18n/no-leakage/03-no-english-ui-strings-on-es-page.json", name: "No hardcoded English UI strings leak onto a Spanish page", priority: 'p1' },
  { test_id: '7ba08921', phase: 8, category: "i18n/number-localization", path: "i18n/number-localization/01-decimal-separator-differs-by-locale.json", name: "Decimal numbers use locale-correct separators", priority: 'p0' },
  { test_id: '7aaf6631', phase: 8, category: "i18n/number-localization", path: "i18n/number-localization/02-portuguese-number-separator.json", name: "Portuguese decimals use a comma separator", priority: 'p1' },
  { test_id: 'e1ea05c9', phase: 8, category: "i18n/regression", path: "i18n/regression/01-prior-features-work-in-non-default-locale.json", name: "Prior-phase features remain functional in a non-default locale", priority: 'p1' },
  { test_id: '6da9c3a3', phase: 8, category: "i18n/regression", path: "i18n/regression/02-graceful-fallback-no-blank-text.json", name: "Missing translations fall back gracefully without blank or broken text", priority: 'p2' },
  { test_id: '6b927cc7', phase: 8, category: "i18n/routes-exist", path: "i18n/routes-exist/01-three-locale-roots-return-200.json", name: "All three locale root routes return 200", priority: 'p0' },
  { test_id: '70a1234e', phase: 8, category: "i18n/routes-exist", path: "i18n/routes-exist/02-localized-match-routes-resolve.json", name: "Match detail pages resolve under es and pt locale prefixes", priority: 'p0' },
  { test_id: '34a49ad6', phase: 8, category: "i18n/routes-exist", path: "i18n/routes-exist/03-groups-page-under-all-locales.json", name: "Group standings page exists under all three locales", priority: 'p1' },
  { test_id: '6a528dec', phase: 8, category: "i18n/string-coverage", path: "i18n/string-coverage/01-locale-files-exist-and-nonempty.json", name: "All three locale translation files exist and are non-empty", priority: 'p0' },
  { test_id: '5be707af', phase: 8, category: "i18n/string-coverage", path: "i18n/string-coverage/02-locale-files-share-key-shape.json", name: "Locale files share an identical key shape", priority: 'p1' },
  { test_id: '43df244c', phase: 8, category: "i18n/string-coverage", path: "i18n/string-coverage/03-values-not-equal-to-keys.json", name: "Translation values are real text, not key-name placeholders", priority: 'p1' },
  { test_id: '9278b473', phase: 8, category: "i18n/string-coverage", path: "i18n/string-coverage/04-no-raw-keys-leak-in-rendered-page.json", name: "No raw i18n keys or untranslated placeholders leak into the rendered page", priority: 'p0' },
  { test_id: '6aca7e69', phase: 9, category: "a11y/dom", path: "a11y/dom/01-images-have-alt-and-lang-set.json", name: "All images have non-empty alt text and the document lang is set", priority: 'p1' },
  { test_id: '21481a1d', phase: 9, category: "a11y/dom", path: "a11y/dom/02-focus-visible-on-interactive.json", name: "Interactive elements show a visible focus ring on keyboard focus", priority: 'p1' },
  { test_id: 'd95902e3', phase: 9, category: "brand/matchday", path: "brand/matchday/01-branded-matchday-with-favicon.json", name: "The product is branded \"Matchday\" with its favicon", priority: 'p1' },
  { test_id: '6824a1bb', phase: 9, category: "completeness/both-modes", path: "completeness/both-modes/01-landing-features-render-both-modes.json", name: "Landing bracket and group standings render correctly in both light and dark", priority: 'p0' },
  { test_id: 'b8297382', phase: 9, category: "completeness/both-modes", path: "completeness/both-modes/02-match-page-features-render-both-modes.json", name: "Match page prediction, lineup and odds render correctly in both light and dark", priority: 'p0' },
  { test_id: '9a1e10fa', phase: 9, category: "errors/404-html", path: "errors/404-html/01-unknown-match-returns-404-styled.json", name: "Unknown match route returns HTTP 404 with a styled page", priority: 'p1' },
  { test_id: 'd0648268', phase: 9, category: "errors/404-json", path: "errors/404-json/01-unknown-api-returns-404-json.json", name: "Unknown API match returns 404 JSON with error and code", priority: 'p2' },
  { test_id: '308430d3', phase: 9, category: "perf/dom", path: "perf/dom/01-images-sized-no-layout-shift.json", name: "Images declare dimensions to avoid layout shift", priority: 'p2' },
  { test_id: '5e9ea8bb', phase: 9, category: "theme/contrast", path: "theme/contrast/01-light-mode-aa-contrast.json", name: "Light mode body and heading text meet WCAG AA contrast", priority: 'p1' },
  { test_id: 'f3dc123a', phase: 9, category: "theme/contrast", path: "theme/contrast/02-dark-mode-aa-contrast.json", name: "Dark mode body and heading text meet WCAG AA contrast", priority: 'p1' },
  { test_id: '919aa246', phase: 9, category: "theme/system-pref", path: "theme/system-pref/01-dark-pref-renders-dark.json", name: "With prefers-color-scheme dark, the site renders in dark mode on first paint", priority: 'p0' },
  { test_id: 'df7c159e', phase: 9, category: "theme/system-pref", path: "theme/system-pref/02-light-pref-renders-light.json", name: "With prefers-color-scheme light, the site renders in light mode", priority: 'p1' },
  { test_id: 'fdb02b2f', phase: 9, category: "theme/toggle-persists", path: "theme/toggle-persists/01-toggle-flips-theme.json", name: "The nav theme toggle visibly flips between light and dark", priority: 'p0' },
  { test_id: 'f1493bf5', phase: 9, category: "theme/toggle-persists", path: "theme/toggle-persists/02-choice-persists-reload-and-nav.json", name: "Theme choice persists across navigation and a hard reload via localStorage", priority: 'p0' },
  { test_id: 'ecd468cb', phase: 9, category: "theme/token-adoption", path: "theme/token-adoption/01-surface-text-colors-from-token-palette.json", name: "Surface, border and text colors come from the provided token palette", priority: 'p0' },
  { test_id: '06201361', phase: 9, category: "theme/token-adoption", path: "theme/token-adoption/02-light-and-dark-bg-actually-differ.json", name: "Light and dark are two real themes, not a CSS invert", priority: 'p0' },
  // --- phase 10 (appended) ---
  { test_id: '10ee0b7f', phase: 10, category: "bracket", path: "bracket/01-knockout-bracket-design.json", name: "Knockout bracket matches the editorial design (flag chips, rank badges, green winner, champion panel)", priority: 'p1' },
  { test_id: '7872fba8', phase: 10, category: "consistency/champion", path: "consistency/champion/01-champion-agrees-across-surfaces.json", name: "Predicted champion is identical on the Final page, the bracket, and the landing", priority: 'p0' },
  { test_id: '2410b338', phase: 10, category: "consistency/champion", path: "consistency/champion/02-champion-is-real-nation.json", name: "The predicted champion is a real qualified nation, not a placeholder", priority: 'p1' },
  { test_id: '75e63de9', phase: 10, category: "consistency/groups", path: "consistency/groups/01-group-top2-match-bracket-qualifiers.json", name: "Each group’s top-2 standings match the teams advancing in the bracket", priority: 'p1' },
  { test_id: '71144427', phase: 10, category: "consistency/prose", path: "consistency/prose/01-no-prose-contradiction.json", name: "No prose/reasoning sentence contradicts the structured prediction", priority: 'p0' },
  { test_id: '36847d06', phase: 10, category: "consistency/scoreline", path: "consistency/scoreline/01-winner-matches-scoreline.json", name: "Each predicted winner is the higher-scored side (no winner/scoreline contradiction)", priority: 'p1' },
  { test_id: '46e64e80', phase: 10, category: "data-authenticity/no-tbd", path: "data-authenticity/no-tbd/01-no-placeholder-on-landing-and-match.json", name: "No TBD/placeholder data on the landing or a match page", priority: 'p0' },
  { test_id: '7c13e0e8', phase: 10, category: "data-authenticity/no-tbd", path: "data-authenticity/no-tbd/02-no-placeholder-in-es-pt-locales.json", name: "No placeholder/untranslated data in the es and pt locales", priority: 'p1' },
  { test_id: 'a6144450', phase: 10, category: "hero/branded", path: "hero/branded/01-real-hero-image-present.json", name: "Landing shows a real photographic/generated hero image, not a flat fill or SVG", priority: 'p0' },
  { test_id: '6a94dac6', phase: 10, category: "hero/branded", path: "hero/branded/02-hero-title-is-dom-text.json", name: "The hero title \"FIFA World Cup 2026 Predictions (AI)\" is real DOM text over the image", priority: 'p0' },
  { test_id: '247ca6fb', phase: 10, category: "hero/contrast", path: "hero/contrast/01-hero-title-aa-contrast-both-modes.json", name: "Hero title meets WCAG AA contrast over the image in light and dark", priority: 'p1' },
  { test_id: '4862bc36', phase: 10, category: "regression/prior", path: "regression/prior/01-landing-ssr-teams.json", name: "Regression: landing still SSRs real team names", priority: 'p0' },
  { test_id: 'f41dd68f', phase: 10, category: "regression/prior", path: "regression/prior/02-match-prediction-block.json", name: "Regression: /match still shows the prediction block", priority: 'p0' },
  { test_id: '03f5e6fd', phase: 10, category: "regression/prior", path: "regression/prior/03-odds-tab.json", name: "Regression: the odds tab still renders", priority: 'p1' },
  { test_id: '145c274c', phase: 10, category: "regression/prior", path: "regression/prior/04-i18n-locale-routes.json", name: "Regression: en/es/pt locale routes still resolve", priority: 'p1' },
  { test_id: '4cff15dc', phase: 10, category: "theme", path: "theme/01-light-is-default.json", name: "Light theme is the default on first load", priority: 'p1' },
];

/** Look up which phase a testId belongs to. Falls back to null when unknown
 *  — callers should treat that as "not in any current phase catalog". */
export function phaseFromTestId(testId: string): Phase | null {
  const t = TESTS.find((x) => x.test_id === testId);
  return t ? t.phase : null;
}

export interface TestEntryWithPath extends TestEntry {
  /** Repo-relative path including phase dir, e.g.
   *  `tests/world-cup-2026-v3/phase-2/permalinks/01-match-permalink-loads.json`. */
  repo_path: string;
}

export function withRepoPath(t: TestEntry): TestEntryWithPath {
  return { ...t, repo_path: `tests/world-cup-2026-v3/phase-${t.phase}/${t.path}` };
}

/** Verdict names from TestSprite are silently truncated at ~60 chars. A
 *  data.ts entry with the full plan name + an agent fixture verdict with
 *  the truncated form must still join. Returns true when either side is a
 *  prefix of the other (case-insensitive) or they're exactly equal. */
export function planNameMatches(verdictName: string | undefined, planName: string | undefined): boolean {
  if (!verdictName || !planName) return false;
  if (verdictName === planName) return true;
  const v = verdictName.toLowerCase();
  const p = planName.toLowerCase();
  // Most common case: verdict.name was truncated, plan name is the full form.
  return p.startsWith(v) || v.startsWith(p);
}

export function groupByCategory(phase?: Phase): Record<string, TestEntry[]> {
  const out: Record<string, TestEntry[]> = {};
  for (const t of TESTS) {
    if (phase !== undefined && t.phase !== phase) continue;
    if (!out[t.category]) out[t.category] = [];
    out[t.category].push(t);
  }
  return out;
}

/** Tests grouped first by phase, then by category. The /tests page renders
 *  Phase 1 sections, then Phase 2 sections, so the order is predictable
 *  regardless of catalog edits. */
export function groupByPhaseAndCategory(): Array<{
  phase: Phase;
  categories: Array<{ key: string; tests: TestEntry[] }>;
}> {
  const phases: Phase[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return phases.map((phase) => {
    const grouped = groupByCategory(phase);
    const orderedKeys = PHASE_CATEGORY_ORDER[phase] ?? Object.keys(grouped);
    const categories: Array<{ key: string; tests: TestEntry[] }> = [];
    for (const k of orderedKeys) {
      if (grouped[k] && grouped[k].length > 0) {
        categories.push({ key: k, tests: grouped[k] });
      }
    }
    return { phase, categories };
  });
}

export const PHASE_CATEGORY_ORDER: Record<Phase, string[]> = {
  1: ['routes', 'data', 'match-detail', 'a11y', 'visual', 'seo'],
  2: ['permalinks', 'details-data', 'seo', 'security', 'errors'],
  3: [
    'prediction-shape',
    'prediction-invariants',
    'champion-lock',
    'bracket-progression',
    'visible',
  ],
  4: [
    'lineups/tab-present',
    'lineups/starting-xi',
    'lineups/formation',
    'lineups/injuries',
    'lineups/head-check',
    'lineups/responsive',
  ],
  5: [
    'analysis/tab-present',
    'analysis/paragraph-count',
    'analysis/paragraph-length',
    'analysis/citation-density',
    'analysis/anchor-resolves',
    'analysis/url-liveness',
    'analysis/freshness',
    'analysis/uniqueness',
    'analysis/no-paywall',
  ],
  6: [
    'news/section-present',
    'news/card-structure',
    'news/freshness',
    'news/head-check',
    'news/source-diversity',
    'news/coverage',
  ],
  7: ["odds/accessibility", "odds/agent-consistency", "odds/math-consensus", "odds/math-devig", "odds/staleness-badge", "odds/three-books", "odds/ui-rendered"],
  8: ["data-authenticity", "i18n/date-localization", "i18n/html-lang", "i18n/locale-switcher", "i18n/no-leakage", "i18n/number-localization", "i18n/regression", "i18n/routes-exist", "i18n/string-coverage"],
  9: ["a11y/dom", "brand/matchday", "completeness/both-modes", "errors/404-html", "errors/404-json", "perf/dom", "theme/contrast", "theme/system-pref", "theme/toggle-persists", "theme/token-adoption"],
  10: ["hero/branded", "hero/contrast", "consistency/champion", "consistency/scoreline", "consistency/groups", "consistency/prose", "data-authenticity/no-tbd", "bracket", "theme", "regression/prior"],
};

export const PHASE_META: Record<Phase, { label: string; feature: string }> = {
  1: { label: 'Phase 1 · Landing page', feature: 'Bracket UI, 12 group standings, FIFA-style hero' },
  2: { label: 'Phase 2 · Match details', feature: '78 /match/<id> SSR permalinks with teams, flags, kickoff, venue, round' },
  3: { label: 'Phase 3 · Predictions', feature: 'Per-match winner + scoreline + probability bars + reasoning; KO tie resolution; champion locked at SIGSTART' },
  4: { label: 'Phase 4 · Lineups', feature: 'Lineups tab — predicted XI (11 per team), formation label + pitch diagram, per-player injury/suspension notes' },
  5: { label: 'Phase 5 · Your analysis', feature: 'Analysis tab — 3-5 paragraphs per match with inline citations resolving to a References panel; no boilerplate; 200-600 chars/paragraph' },
  6: { label: 'Phase 6 · Related news', feature: 'News section — ≥3 fresh items per match with title, source, date, and HEAD-checked URL; source diversity across domains' },
  7: { label: "Phase 7 · Betting odds", feature: "Odds tab — implied probabilities + consensus row + agent-vs-market consistency" },
  8: { label: "Phase 8 · Multi-language i18n", feature: "en/es/pt locale routes, persisted switcher, real translation, no placeholder data" },
  9: { label: "Phase 9 · Matchday polish", feature: "Design-token skin + light/dark + completeness, graceful 404, a11y, perf" },
  10: { label: "Phase 10 · Final polish · release", feature: "Branded hero image + AA contrast, cross-surface consistency (champion/scoreline/groups/prose), no-TBD authenticity, editorial bracket, light-default theme, prior-phase regression" },
};

export const CATEGORY_META: Record<string, { weight: string; description: string; phase?: Phase }> = {
  // Phase 1
  routes: {
    phase: 1,
    weight: 'Routes · 5',
    description:
      "Interaction-driven navigation: R16 cell clicks, Groups nav, team-row navigation, 404 recovery, Final cell. Each plan walks a click sequence and asserts the destination URL distinct from the start.",
  },
  data: {
    phase: 1,
    weight: 'Data · 4',
    description:
      "UI-rendered cardinality checks: bracket stages reach distinct pages, group rows differ, three R16 clicks yield three pages, kickoff + venue visible on match detail.",
  },
  'match-detail': {
    phase: 1,
    weight: 'Match Detail · 3',
    description:
      "Content assertions on match permalink pages — stage label on QF, group letter on group matches, five permalinks load.",
  },
  a11y: {
    phase: 1,
    weight: 'Accessibility · 2',
    description:
      "Keyboard Tab focus visibility and non-empty alt text on flag images.",
  },
  visual: {
    phase: 1,
    weight: 'Visual · 1',
    description:
      "Hero treatment in the top viewport and bracket section visible below.",
  },
  // Phase 2 — `seo` is reused but expands to 3 plans in phase 2; the entry
  // below is the phase-2 description. Phase 1's seo (1 plan) shares the
  // catalog key, but the phase-aware grouping in groupByPhaseAndCategory
  // keeps the two from colliding visually.
  permalinks: {
    phase: 2,
    weight: 'Permalinks · 5',
    description:
      "Each /match/<id> SSR route returns 200 with team names, kickoff, venue, round, and a back-to-bracket link rendered into the initial HTML.",
  },
  'details-data': {
    phase: 2,
    weight: 'Details data · 4',
    description:
      "Match-page payload checks: both team names, both flag images with alt, kickoff timestamp, stage badge — all rendered server-side.",
  },
  seo: {
    // SEO appears in BOTH phases. Phase 1 = 1 sitemap plan; phase 2 = 3
    // plans (sitemap with 80+ URLs, og:title, canonical). The phase-aware
    // grouping passes the phase number when picking a description string,
    // so we keep this entry on phase 2 (where it carries more weight).
    phase: 2,
    weight: 'SEO · 3',
    description:
      "Sitemap completeness (≥80 URLs spanning index, groups, matches), per-match og:title containing both team names, and canonical link tag matching the URL.",
  },
  security: {
    phase: 2,
    weight: 'Security · 2',
    description:
      "Response-header hygiene: Content-Security-Policy and either X-Frame-Options or frame-ancestors directive on every match page.",
  },
  errors: {
    phase: 2,
    weight: 'Errors · 2',
    description:
      "Unknown match id returns HTTP 404 with a rendered error page; malformed slug input lands on a graceful error page (not a stack trace).",
  },
  // Phase 3 — Predictions. Categories mirror the phase-3 suite-index keys.
  'prediction-shape': {
    phase: 3,
    weight: 'Prediction shape · 5',
    description:
      "The Prediction block is the phase deliverable: a match page renders it with a named winner (or draw), a concrete scoreline, probability bars with percentages, and probabilities that sum to approximately 1.0.",
  },
  'prediction-invariants': {
    phase: 3,
    weight: 'Invariants · 6',
    description:
      "The math is non-negotiable: no team is predicted to play itself, scorelines stay within a sane 0–9 range, knockout predictions never declare a draw, tied knockouts resolve via extra-time/penalties, group stages may draw, and every prediction carries a reasoning paragraph.",
  },
  'champion-lock': {
    phase: 3,
    weight: 'Champion lock · 3',
    description:
      "The champion is locked at SIGSTART: the Final match page surfaces the predicted champion, the pick is one of the 48 FIFA 2026 teams, and the champion is reachable from the landing page.",
  },
  'bracket-progression': {
    phase: 3,
    weight: 'Bracket progression · 3',
    description:
      "Predictions are internally consistent across rounds: the bracket shows the expected cell count per knockout round, predicted finalists derive from predicted semi-final winners, and a top-probability R16 team also appears in the QF predictions.",
  },
  visible: {
    phase: 3,
    weight: 'Visible · 3',
    description:
      "Predictions are surfaced, not buried: the block sits above the fold on desktop, bracket match cards surface the predicted winner, and the block renders cleanly at a 360px viewport.",
  },
  // Phase 4 — Lineups. Categories namespaced under `lineups/`.
  'lineups/tab-present': {
    phase: 4,
    weight: 'Tab present · 3',
    description:
      "The Lineups tab is the phase deliverable: visible on /match pages and opening a populated panel, reachable and activatable by keyboard, and present in the document when reached by scrolling.",
  },
  'lineups/starting-xi': {
    phase: 4,
    weight: 'Starting XI · 4',
    description:
      "Predicted XI is real structured data: exactly 11 players per team (home and away), every player a non-empty name with a valid position, and the rendered list is distinct named rows rather than a text blob.",
  },
  'lineups/formation': {
    phase: 4,
    weight: 'Formation · 3',
    description:
      "Formation label matches a valid pattern whose digits sum to ten, both teams carry a visible formation label, and a pitch diagram renders at least twenty-two position markers.",
  },
  'lineups/injuries': {
    phase: 4,
    weight: 'Injuries · 2',
    description:
      "At least one player status note is surfaced on the match lineups, and every injury entry uses a severity drawn from a fixed standard vocabulary.",
  },
  'lineups/head-check': {
    phase: 4,
    weight: 'Head check · 2',
    description:
      "Cross-team consistency: no single player appears in both teams' starting lineups, and starting XI cardinality is exactly eleven per team across a sample of matches.",
  },
  'lineups/responsive': {
    phase: 4,
    weight: 'Responsive · 2',
    description:
      "At a 360px viewport the lineups render without horizontal scroll and the formation pitch diagram stays legible inside the viewport.",
  },
  // Phase 5 — Your analysis. Categories namespaced under `analysis/`.
  'analysis/tab-present': {
    phase: 5,
    weight: 'Tab present · 2',
    description:
      "The Analysis tab is visible on a match detail page and opens a panel with real content when clicked.",
  },
  'analysis/paragraph-count': {
    phase: 5,
    weight: 'Paragraph count · 3',
    description:
      "The analysis panel contains at least three and no more than five paragraphs, and two different match pages both show analysis content.",
  },
  'analysis/paragraph-length': {
    phase: 5,
    weight: 'Paragraph length · 3',
    description:
      "Each analysis paragraph is between 200 and 600 characters, and the text reads as substantive and match-specific rather than generic boilerplate.",
  },
  'analysis/citation-density': {
    phase: 5,
    weight: 'Citations · 2',
    description:
      "Analysis paragraphs carry inline citation markers, and a References panel or section follows the analysis text.",
  },
  'analysis/anchor-resolves': {
    phase: 5,
    weight: 'Anchors resolve · 3',
    description:
      "Clicking a citation marker scrolls to or highlights its reference, reference entries display a source URL, and the reference count matches the unique inline citations.",
  },
  'analysis/url-liveness': {
    phase: 5,
    weight: 'URL liveness · 3',
    description:
      "The first reference URL is a reachable web address, all visible reference URLs use HTTPS, and reference source links are clickable anchor tags.",
  },
  'analysis/freshness': {
    phase: 5,
    weight: 'Freshness · 2',
    description:
      "Analysis text references 2026 World Cup context and contains no placeholder dates or lorem ipsum.",
  },
  'analysis/uniqueness': {
    phase: 5,
    weight: 'Uniqueness · 2',
    description:
      "Two different match pages show different analysis text, and the analysis mentions the specific teams playing in the match.",
  },
  'analysis/no-paywall': {
    phase: 5,
    weight: 'No paywall · 2',
    description:
      "Analysis content is fully visible without requiring login or signup, and the panel loads without intrusive external popups or overlays.",
  },
  // Phase 6 — Related news. Categories namespaced under `news/`.
  'news/section-present': {
    phase: 6,
    weight: 'Section present · 3',
    description:
      "A Related news tab or section is visible on a match detail page, opens a populated panel on click, and shows at least three news cards.",
  },
  'news/card-structure': {
    phase: 6,
    weight: 'Card structure · 3',
    description:
      "Each news card has a readable article title, shows a source name and publication date, and is a clickable link to the source article.",
  },
  'news/freshness': {
    phase: 6,
    weight: 'Freshness · 3',
    description:
      "News cards show dates within the last seven days, do not reference only the 2022 tournament, and contain no placeholder or fake article titles.",
  },
  'news/head-check': {
    phase: 6,
    weight: 'Head check · 2',
    description:
      "News source URLs use HTTPS and point to real recognizable domains.",
  },
  'news/source-diversity': {
    phase: 6,
    weight: 'Source diversity · 2',
    description:
      "News cards come from at least two different source domains, and different match pages show different news article sets.",
  },
  'news/coverage': {
    phase: 6,
    weight: 'Coverage · 3',
    description:
      "News card titles mention the match teams or relevant football terms, the panel loads without visible error states, and cards are accessible without excessive scrolling.",
  },
  "odds/accessibility": { phase: 7, weight: "Accessibility · 3", description: "3 plans: Probability bars carry text labels, not color alone; Betting Odds tab is reachable and activatable by keyboard; Responsible-gambling / 18+ disclaimer is present on the Odds surface" },
  "odds/agent-consistency": { phase: 7, weight: "Agent Consistency · 2", description: "2 plans: Agent implied probability on the Odds tab matches the phase-3 prediction; Lowest-odds favorite aligns with the agent's predicted winner" },
  "odds/math-consensus": { phase: 7, weight: "Math Consensus · 3", description: "3 plans: Market consensus probabilities sum to 1.0; Consensus equals the arithmetic mean of de-vigged book probabilities; Consensus is computed on probabilities, not by averaging decimal odds" },
  "odds/math-devig": { phase: 7, weight: "Math Devig · 4", description: "4 plans: Each book's de-vigged probabilities sum to 1.0; Raw implied probabilities sum above 1.0 (the vig is real); De-vigged probability equals raw implied normalized by the overround; …" },
  "odds/staleness-badge": { phase: 7, weight: "Staleness Badge · 2", description: "2 plans: Staleness warning appears when the oldest book is over six hours old; No staleness warning on a match whose odds are fresh" },
  "odds/three-books": { phase: 7, weight: "Three Books · 2", description: "2 plans: Every match offers at least three bookmaker lines; Bookmakers are real named sportsbooks, not invented placeholders" },
  "odds/ui-rendered": { phase: 7, weight: "Ui Rendered · 3", description: "3 plans: Odds tab renders a per-book table with concrete decimal values; Consensus row and agent implied row both render with percentages; Probability bars render and their widths track the consensus values" },
  "data-authenticity": { phase: 8, weight: "Data Authenticity · 3", description: "3 plans: No mock, TBD, or placeholder data anywhere in the rendered product; Group standings are projected from predictions, not all-zero placeholders; Match predictions are real and varied and a real champion is named" },
  "i18n/date-localization": { phase: 8, weight: "Date Localization · 2", description: "2 plans: Match kickoff time renders with locale-specific month names; Portuguese date formatting is distinct from English" },
  "i18n/html-lang": { phase: 8, weight: "Html Lang · 2", description: "2 plans: html lang attribute matches the selected locale; Head lists hreflang alternates for all three locales" },
  "i18n/locale-switcher": { phase: 8, weight: "Locale Switcher · 3", description: "3 plans: Locale switcher is present in the nav and offers all three languages; Switching language preserves the current path; Selected locale persists across in-app navigation" },
  "i18n/no-leakage": { phase: 8, weight: "No Leakage · 3", description: "3 plans: Spanish page chrome reads in Spanish, not English; Portuguese match page translates data labels, not just nav; No hardcoded English UI strings leak onto a Spanish page" },
  "i18n/number-localization": { phase: 8, weight: "Number Localization · 2", description: "2 plans: Decimal numbers use locale-correct separators; Portuguese decimals use a comma separator" },
  "i18n/regression": { phase: 8, weight: "Regression · 2", description: "2 plans: Prior-phase features remain functional in a non-default locale; Missing translations fall back gracefully without blank or broken text" },
  "i18n/routes-exist": { phase: 8, weight: "Routes Exist · 3", description: "3 plans: All three locale root routes return 200; Match detail pages resolve under es and pt locale prefixes; Group standings page exists under all three locales" },
  "i18n/string-coverage": { phase: 8, weight: "String Coverage · 4", description: "4 plans: All three locale translation files exist and are non-empty; Locale files share an identical key shape; Translation values are real text, not key-name placeholders; …" },
  "a11y/dom": { phase: 9, weight: "Dom · 2", description: "2 plans: All images have non-empty alt text and the document lang is set; Interactive elements show a visible focus ring on keyboard focus" },
  "brand/matchday": { phase: 9, weight: "Matchday · 1", description: "1 plan: The product is branded \"Matchday\" with its favicon" },
  "completeness/both-modes": { phase: 9, weight: "Both Modes · 2", description: "2 plans: Landing bracket and group standings render correctly in both light and dark; Match page prediction, lineup and odds render correctly in both light and dark" },
  "errors/404-html": { phase: 9, weight: "404 Html · 1", description: "1 plan: Unknown match route returns HTTP 404 with a styled page" },
  "errors/404-json": { phase: 9, weight: "404 Json · 1", description: "1 plan: Unknown API match returns 404 JSON with error and code" },
  "perf/dom": { phase: 9, weight: "Dom · 1", description: "1 plan: Images declare dimensions to avoid layout shift" },
  "theme/contrast": { phase: 9, weight: "Contrast · 2", description: "2 plans: Light mode body and heading text meet WCAG AA contrast; Dark mode body and heading text meet WCAG AA contrast" },
  "theme/system-pref": { phase: 9, weight: "System Pref · 2", description: "2 plans: With prefers-color-scheme dark, the site renders in dark mode on first paint; With prefers-color-scheme light, the site renders in light mode" },
  "theme/toggle-persists": { phase: 9, weight: "Toggle Persists · 2", description: "2 plans: The nav theme toggle visibly flips between light and dark; Theme choice persists across navigation and a hard reload via localStorage" },
  "theme/token-adoption": { phase: 9, weight: "Token Adoption · 2", description: "2 plans: Surface, border and text colors come from the provided token palette; Light and dark are two real themes, not a CSS invert" },
  "hero/branded": { phase: 10, weight: "Hero Branded · 2", description: "2 plans: Landing shows a real photographic/generated hero image, not a flat fill or SVG; The hero title \"FIFA World Cup 2026 Predictions (AI)\" is real DOM text over the image" },
  "hero/contrast": { phase: 10, weight: "Hero Contrast · 1", description: "1 plan: Hero title meets WCAG AA contrast over the image in light and dark" },
  "consistency/champion": { phase: 10, weight: "Champion · 2", description: "2 plans: Predicted champion is identical on the Final page, the bracket, and the landing; The predicted champion is a real qualified nation, not a placeholder" },
  "consistency/scoreline": { phase: 10, weight: "Scoreline · 1", description: "1 plan: Each predicted winner is the higher-scored side (no winner/scoreline contradiction)" },
  "consistency/groups": { phase: 10, weight: "Groups · 1", description: "1 plan: Each group’s top-2 standings match the teams advancing in the bracket" },
  "consistency/prose": { phase: 10, weight: "Prose · 1", description: "1 plan: No prose/reasoning sentence contradicts the structured prediction" },
  "data-authenticity/no-tbd": { phase: 10, weight: "No TBD · 2", description: "2 plans: No TBD/placeholder data on the landing or a match page; No placeholder/untranslated data in the es and pt locales" },
  bracket: { phase: 10, weight: "Bracket · 1", description: "1 plan: Knockout bracket matches the editorial design (flag chips, rank badges, green winner, champion panel)" },
  theme: { phase: 10, weight: "Theme · 1", description: "1 plan: Light theme is the default on first load" },
  "regression/prior": { phase: 10, weight: "Regression · 4", description: "4 plans: landing still SSRs real team names; /match still shows the prediction block; the odds tab still renders; en/es/pt locale routes still resolve" },
};

/** Override description when phase 1's `seo` row needs to read distinctly
 *  from phase 2's `seo` row in CATEGORY_META. Phase 1 seo is a single
 *  sitemap-reachability plan; we render this string instead of the
 *  CATEGORY_META.seo (phase-2) description when the phase-1 section
 *  is being shown. */
export const PHASE1_SEO_OVERRIDE = {
  weight: 'SEO · 1',
  description:
    "A match URL listed in sitemap.xml renders real match content when visited.",
};
