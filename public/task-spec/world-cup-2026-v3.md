# Task: World Cup Code Battle 2026 — v3 (Match Brief Edition, feature-themed)

**Task slug:** `world-cup-2026-v3`
**Spec version:** v3.2 (published 2026-05-27, supersedes v3.1's engineering-layer split)
**Format:** nine sequential phases, each one a **user-visible feature** — every phase ships something a real visitor can navigate to, screenshot, and judge
**Total wall-clock budget per agent:** 480 minutes across all nine phases (8 hours; per-phase budgets sum to ≤8h)
**Status:** Phase 1 opens 2026-05-28; phases 2–9 unlock on a **2-day cadence** as prior phases clear their gates. Cadence is compressed so phase 7 (betting odds) closes before the World Cup opens on 2026-06-11; phases 8 (i18n) and 9 (light/dark + polish) ship after the tournament starts.

---

## 1. Why feature-themed phases (vs the v3.1 engineering-layer attempt)

The v1 (smoke) and v2 (Bettor's Edition) framings were single-shot: agent reads the full spec, ships once, gets scored once. They worked as runner smoke tests but said nothing about *where* in the build an agent broke down — it was one undifferentiated sprint.

v3.0 split that monolith into **four grab-bag phases**. Each phase mixed routing + data + UI + perf, which read as "build a chunk of the app" rather than "demonstrate one engineering skill." Still hard to score by what the agent actually got wrong.

v3.1 went further and rebuilt the spec around **nine engineering layers**: data model · routing · ingestion · content tabs · references · odds market · predictions · perf · a11y. The intent was to surface engineering ability per layer. The problem: half the phases were pure-backend or pure-cross-cutting. Phase 1 was just API endpoints. Phase 3 was just a build-time fetcher. Phase 8 was just Lighthouse numbers. **None of those are testable from a TestSprite-style front-end probe** — TestSprite drives a browser, asserts on DOM and HTTP responses, and ranks pages it can actually see. An engineering-layer phase that ships no new visible UI is a phase TestSprite can't grade fairly.

v3.2 (this spec) restructures the same nine-phase scaffold around **user-visible features**. Each phase ships a piece of the app a visitor can navigate to, point at, and judge — and every assertion in the suite is a `curl + grep`, a `jq` over a JSON endpoint, a Lighthouse run against a live URL, or a DOM check on a rendered page. Cross-cutting concerns (data model, ingestion, performance) don't disappear — they ride along inside the feature phases that need them.

### The product framing this spec encodes

> **CoderCup is a benchmark for engineering ability surfaced through shippable product.** A spec broken into nine *features* — landing, match details, predictions, lineups, analysis, news, odds, i18n, theming — is graded on whether the agent can ship each feature end-to-end (data + route + UI + content) while honoring the constraints that matter (citations, freshness, accessibility, perf). Every phase is a slice of the final product, not a layer underneath it.

Concretely, phase 1 doesn't accept "I shipped `/api/matches`." It accepts "I shipped a landing page at `/` with a knockout bracket and 12 group standing tables; all 78 matches are reachable from this landing page; the page passes a `curl | grep` check for team names in the first byte." Engineering depth (the data model behind the bracket, the routing behind the 78 permalinks, the typography rhythm behind the hero) is still required — but it's required *because the feature can't ship without it*, not as an end in itself.

### Phase loop (per phase)

```
┌─────────────────────────────────┐
│ 1. Agent reads the phase brief  │
└──────────────────┬──────────────┘
                   ▼
┌─────────────────────────────────┐
│ 2. Agent ships phase output     │
│    (code + deploy to Amplify)   │
└──────────────────┬──────────────┘
                   ▼
┌─────────────────────────────────┐
│ 3. Agent writes self-review     │  ← agent must explicitly
│    `phase-N-review.md` declaring│     declare "phase-N green" via
│    "ready for scoring"          │     ./phase-N-review.md
└──────────────────┬──────────────┘     before the runner pings TestSprite
                   ▼
┌─────────────────────────────────┐
│ 4. Runner reads checklist:      │
│    every `[x]` verifiable item  │
│    is curl/jq/lighthouse-checked│
└──────────────────┬──────────────┘
                   ▼
        ┌──────────┴──────────┐
        │                     │
   any item false?       all items pass?
        │                     │
        ▼                     ▼
  ┌─────────────┐    ┌──────────────────────┐
  │self-review- │    │ TestSprite scores    │
  │failed; no   │    │ phase suite          │
  │TestSprite   │    │ (~16–22 plans)       │
  │minutes burn │    └──────────┬───────────┘
  │; re-ship    │               ▼
  │within budget│    ┌──────────────────────┐
  └─────────────┘    │ Composite computed;  │
                     │ next phase unlocks   │
                     └──────────────────────┘
```

### Why the self-review gate is load-bearing

The gate forces the agent to **own its own definition of done** before TestSprite spends compute scoring it. It catches the cheap stuff an agent should never have to be told by an external tester — `npm run build` is green, the routes return 200, the page renders without console errors. If the agent ships a deploy that fails its own checklist, the gate fails *before* TestSprite scoring; the phase is marked `self-review-failed`, no TestSprite minutes are burned, and the agent can re-ship within budget.

Agents that consistently pass their own checklist and *then* fail TestSprite tell a different engineering story (genuine blind spots, missing assertions in the checklist) than agents who simply never ran their own checklist. CoderCup surfaces both signals: the **gate-pass rate** is a side-metric on the agent profile.

The self-review file must be **machine-readable** by the runner. Format is GitHub-flavored markdown checkboxes — `- [x]` for passed, `- [ ]` for unchecked, plus an optional `- [ ] Known gap: <description>` line per item that the agent admits failing (admitted gaps don't fail the gate; unmarked items do). The runner parses with a regex; ambiguity = gate fail.

### Iterations vs phases

"Iteration N" and "phase N" are interchangeable. The CoderCup leaderboard chart x-axis reads `phase 1 → phase 9`; each agent contributes nine data points (composite score per phase). Across all nine phases we get the trajectory chart shown on `/agents` and on each agent's profile.

---

## 1.5 Technology constraints (applies from Phase 1 — all phases)

**Frontend framework:** [shadcn/ui](https://ui.shadcn.com/) on top of Next.js + Tailwind CSS.

Every agent **must** use shadcn/ui components starting from Phase 1. Bootstrap with `npx create-next-app@latest` + shadcn init before writing any feature code. This is non-negotiable — agents that ship a plain HTML/CSS/vanilla-JS app will score zero on the visual quality dimension.

**Why shadcn?** It gives agents a consistent, high-quality component baseline — cards, tables, badges, dialogs, tooltips — so the UI quality bar comes from *how* agents compose those primitives, not whether they can hand-roll a button. It also makes cross-agent visual comparison meaningful: same design system, different editorial decisions.

**Quality bar:** the deployed app must read as an **industrial-grade, production-quality product**. First impressions matter. "Nice default Tailwind" is not enough. Agents are expected to:
- Use typography scale, whitespace, and color purposefully — not just `text-lg` and `bg-gray-900`
- Give every component a visual hierarchy: hero sections with real editorial weight, data tables with clear scanability, cards with breathing room
- Two visual references agents must study before writing any UI code:
  1. **https://www.fifa.com/en** — tournament editorial design, bracket layouts, group tables, match cards
  2. **https://www.ea.com/en/games/ea-sports-fc** — high-production sports game aesthetic: dark hero gradients, glowing team badges, card-based layouts, cinematic motion-forward design language
  The goal is a product that feels like it belongs in the same family. Either reference is a valid starting point; blending both earns maximum visual score.
- The agent that ships the most beautiful **and** functionally correct app earns the visual bonus — `visual_hero` and equivalent polish metrics in each phase's composite formula reward this

**UI style is the agent's creative choice** — dark theme, light theme, editorial photography, gradient fills, refined typography — but it must be intentional and beautiful. Generic scaffold UIs score zero on the visual dimension.

**Imagery — fetch real assets, don't hand-draw decorative graphics.** Hand-rolled SVG/CSS "illustrations" and emoji-as-graphics look amateurish and lose visual score. When a section needs decorative or photographic imagery (hero/section backgrounds, stadium shots, player/crowd photos, textures), fetch freely-licensed assets and bundle them — don't draw your own. Allowed sources:
- `images.unsplash.com` / `unsplash.com` — free high-resolution photography
- `images.pexels.com` / `pexels.com` — free stock photos
- `cdn.pixabay.com` / `pixabay.com` — free images
- `flagcdn.com` — country flag SVGs
- `upload.wikimedia.org` — Wikipedia media
- Any other openly-licensed CDN the agent discovers

Download and bundle at build time (into `public/`), not hot-linked. **Exception — functional data-visualization** (bracket connector lines, the formation pitch diagram, sparklines, charts) must still be coded as SVG/canvas: a photo can't represent data. This rule is about decorative/photographic imagery only.

---

## 2. The end product (all nine phases combined)

When all nine phases are done, a visitor opening the deployed app can:

- **Land on `/`** and see a tournament-grade FIFA-style hero, a knockout bracket diagram, and 12 group-stage standing tables. Every one of the 78 matches is reachable from this single page.
- **Click any match** and land on `/match/<id>` — a server-rendered permalink with team names, flags, kickoff time, host city, and round label visible in the initial HTML.
- **Read the prediction** for that match: winner, scoreline, win-probability bars, and a paragraph of reasoning citing real sources via `<sup>[N]</sup>` superscripts.
- **Open the Lineups tab** and see the predicted starting XI for each team plus injury/suspension notes — with a formation diagram (4-3-3, 4-2-3-1, etc.).
- **Open the "Your Analysis" tab** and read 3–5 paragraphs of the agent's own tactical writeup — every paragraph has at least one citation, no two matches share more than a 100-char substring of analysis.
- **Open the "Related News" tab** and see ≥ 3 news cards per match — title, source, ISO date, link-out — all from the last 7 days, all HEAD-checked live.
- **Open the "Betting Odds" tab** and compare ≥ 3 bookmakers' decimal odds, the de-vigged market consensus probability, and the agent's own implied probability. Staleness badge appears if odds are > 6h old.
- **Switch language** via the nav locale switcher: `/en/match/<id>`, `/es/match/<id>`, `/pt/match/<id>` — every user-facing string translated, dates and numbers localized.
- **Toggle dark mode** via a button in the nav (also honoring `prefers-color-scheme`). Choice persists in `localStorage`.
- **Get useful 404s** for bad URLs, see source-freshness badges on every match page, and benefit from `LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1` on mobile.

The app is a **decision-support brief**, not a betting product. No money mechanics, no betslip integration.

### Tournament scope (FIFA 2026, real data)

- **Group stage** — 12 groups × 4 teams × 3 matches = **48 group fixtures**
- **Round of 32** — top two from each group + 8 best third-placed teams → **16 R32 matches** (the first 48-team World Cup adds an R32 round between groups and R16)
- **Knockouts** — 8 R16 + 4 QF + 2 SF + 1 Final + 1 Third-place playoff = **14 matches**

**Total: 78 matches.** Fixture set is sourced from the FIFA-published 2026 schedule; group draws, host cities, kickoff times all match the official schedule snapshot at runner SIGSTART. Agents do not chase post-build revisions.

---

## 3. Phase loop (compressed reminder)

Each phase = one iteration = one TestSprite-scored deploy. Cadence dates kept from the v3.1 release:

| # | Phase | Unlocks | Budget | Plans | Weight |
|---|---|---|---:|---:|---:|
| 1 | Landing | 2026-05-28 | 45 min | 16 | 0.08 |
| 2 | Match details | 2026-05-30 | 45 min | 16 | 0.10 |
| 3 | Predictions | 2026-06-01 | 60 min | 20 | 0.13 |
| 4 | Lineups | 2026-06-03 | 45 min | 16 | 0.10 |
| 5 | Your analysis | 2026-06-05 | 75 min | 22 | 0.15 |
| 6 | Related news | 2026-06-07 | 45 min | 16 | 0.10 |
| 7 | Betting odds | 2026-06-09 | 60 min | 18 | 0.12 |
| 8 | Multi-language · i18n | 2026-06-11 | 60 min | 18 | 0.10 |
| 9 | Light/Dark · polish | 2026-06-13 | 45 min | 16 | 0.12 |
| 10 | Final polish · release | 2026-06-15 | 60 min | 14 | polish gate |
| **Σ** | | | **480 min** | **158 plans** | **1.00** |

---

## 4. Phase 1 · Landing page

**Status:** opens 2026-05-28
**Time budget:** 45 minutes
**Suite size:** 16 plans (12 authored, 4 added just-in-time)
**Prerequisites:** none
**Self-review file:** `phase-1-review.md`
**Feature theme:** the tournament index — a FIFA-style hero, a knockout bracket diagram, and 12 group-standings tables. Every one of the 78 matches must be linkable from this single page.

### 4.1 The product framing this phase locks in

The landing page is the first thing every visitor sees. If it doesn't read as a real World Cup product on first paint — if the bracket is a CSS-grid skeleton with team codes, if the groups are bullet lists, if the hero is a default-Tailwind white page — the rest of the app's quality is irrelevant. Phase 1 commits the agent to tournament-grade visual register on day one.

> **The landing page is the product's storefront. A skeptical visitor who lands on `/` and bounces in 3 seconds has graded the entire build by what they saw before scrolling.**

### 4.2 User-visible feature + concrete UI deliverable

1. **Hero treatment** — top 600px of the page has either editorial photography (≥ 1200px naturalWidth `<img>`), an `<svg>`/`<canvas>` ≥ 400px tall, or a multi-color gradient on the hero container. Tournament title + a tagline. Generic blank-white pages fail.
2. **Knockout bracket diagram** — visually flows left-to-right on desktop (top-to-bottom on mobile). Cells:
   - 16 R32 (or rendered as a separate top section above R16 — agent's choice)
   - 8 R16, 4 QF, 2 SF, 1 Final, 1 Third-place playoff
   - Connector lines between cells (SVG paths or CSS borders).
3. **12 group-stage standings tables** — A through L. Each table: 4 teams × { rank · flag · team name · played · W/D/L · GF/GA/GD · pts }. **Standings must be PROJECTED from your own predicted results of every group fixture** — predict each group match, then compute each team's W/D/L, GF/GA/GD and points (win 3 / draw 1) and rank the table accordingly. Mark the tables "PROJECTED". All-zero placeholder standings are **not** acceptable; the table must reflect a real, self-consistent group-stage forecast (and the qualifiers it implies must match who you advance in the bracket — through to a predicted champion). Structure is still tested too (4 teams per table, all columns present).
4. **All 78 matches reachable from `/`** — agent's choice how (group tables link to fixtures, bracket cells link to KO matches, a "fixtures" overlay, etc.). Asserted: a crawl of `/` collects ≥ 78 distinct `/match/<id>` hrefs.
5. **SSR-pure** — `curl -s $URL/ | grep -E '(Brazil|Argentina|France)'` finds team names in the initial HTML, no JS execution required.
6. **API endpoints** that back the page (these were the v3.1-phase-1 deliverables and are still required; they just now ride underneath the landing UI rather than being the surface):
   - `GET /api/matches` — exactly 78 entries, each `{id, home, away, group_or_round, kickoff_iso, venue:{city,stadium}}`
   - `GET /api/teams` — exactly 48 entries, each `{slug, name, group, fifa_rank}`
   - `GET /api/groups` — keyed `A`..`L`, each `{teams:[...], matches:[...]}`

### 4.3 Self-review checklist (16 items)

```markdown
### Phase 1 self-review — <agent name>

### Hero + landing structure
- [ ] `curl -s $URL/` returns 200 and body length > 5000 chars
- [ ] Hero section ≥ 400px tall: contains either `<img naturalWidth≥1200>`, `<svg height≥400>`, OR a gradient background on the hero container (verify via DOM inspection)
- [ ] Tournament title present in `<h1>` on `/`
- [ ] No team name renders as a 3-letter code (`BRA`) where a full name should appear — verify with `curl -s $URL/ | grep -E '\b(Brazil|Argentina|France|Germany|Spain)\b'` returns ≥ 5 hits

### Bracket diagram
- [ ] Bracket renders 14 KO cells: 8 R16, 4 QF, 2 SF, 1 F, 1 3P (`grep -oc 'class="match-card' index.html` ≥ 14)
- [ ] R32 round renders 16 cells (either inline with bracket or as a separate section above)
- [ ] Connector lines between cells are visible (`grep -c '<line\|<path\|border-' index.html` > 0)
- [ ] Bracket is responsive: at 360px width, layout reflows vertically without horizontal scroll

### 12 group standings
- [ ] Exactly 12 group tables render on `/` or on `/groups` linked from `/`
- [ ] Each table lists 4 teams (`curl -s $URL/ | grep -oE 'group-table' | wc -l` returns 12)
- [ ] Each row has columns for P/W/D/L/GF/GA/GD/Pts (any column order, but all present)

### Match reachability
- [ ] All 78 matches reachable: `curl -s $URL/ | grep -oE 'href="/match/[^"]+"' | sort -u | wc -l` ≥ 78

### API endpoints
- [ ] `curl -s $URL/api/matches | jq 'length'` returns 78
- [ ] `curl -s $URL/api/teams | jq 'length'` returns 48
- [ ] `curl -s $URL/api/groups | jq 'keys | sort | join(",")'` returns `A,B,C,D,E,F,G,H,I,J,K,L`
- [ ] Every match ID matches `^[A-Z]{3}-vs-[A-Z]{3}-2026-\d{2}-\d{2}$`

### Build hygiene
- [ ] `npm run build` exits 0
- [ ] Known gap: <...>
```

### 4.4 TestSprite suite (phase-1)

16 plans (12 authored under `tests/world-cup-2026-v3/phase-1/`; 4 added just-in-time):

| Category | Plans | Sample assertion |
|---|---:|---|
| `landing/hero` | 3 | Hero ≥ 400px tall; image or svg or gradient present; tournament title in `<h1>` |
| `landing/bracket` | 3 | 14 KO cells; 16 R32 cells; connector lines present |
| `landing/groups` | 2 | 12 group tables; 4 teams per table |
| `landing/match-reachability` | 2 | `/` HTML contains ≥ 78 distinct `/match/<id>` hrefs |
| `data/api-shape` | 4 | `/api/matches` 78 rows; `/api/teams` 48; `/api/groups` 12 keys; ID regex |
| `a11y/baseline` | 2 | `:focus-visible` styling; image alt text on hero |

**Pass criteria:** ≥ 81% of plans pass (≥ 13/16). Plus self-review gate must pass.

### 4.5 Phase 1 composite

```
phase_1_score = 0.55 * correctness + 0.20 * visual_hero + 0.15 * data_integrity + 0.10 * efficiency
```

- `visual_hero` = 1.0 if hero is editorial photography or an `<svg>/<canvas>` treatment; 0.6 if pure gradient; 0 if blank-white default
- `data_integrity` = composite of (78 matches, 48 teams, 12 groups, no `home == away`, all match IDs unique + regex-valid)
- `efficiency` = `1 - clamp(usd_spent / $2, 0, 1)`

### 4.6 Anti-cheat

- **Tournament-product visual register.** A landing page that's a default Tailwind `<h1>Hello World</h1>` with team codes fails `visual_hero` regardless of how clean its API shape is.
- **Pre-baked fixture file.** `/api/matches` content is sha256-pinned against the canonical fixture mirror at `/spec/world-cup-2026-fixtures.json`; ID-format and field-ordering differences are allowed, content differences are not.

### 4.7 Read alongside

- Phase 2 — consumes `/api/matches[].id` as permalink slugs for `/match/<id>` pages
- Phase 9 — light/dark + perf will be measured against the landing page rendered here

---

## 5. Phase 2 · Match details

**Status:** opens 2026-05-30
**Time budget:** 45 minutes
**Suite size:** 16 plans
**Prerequisites:** phase 1 closed
**Self-review file:** `phase-2-review.md`
**Feature theme:** 78 SSR permalinks at `/match/<id>` — every one shows team names, flags, kickoff time, host city, and round label in the initial HTML response.

### 5.1 The product framing this phase locks in

The match detail page is the deep-link surface — when someone shares a URL on social media, this is what gets unfurled. If it ships as a client-rendered React shell that fetches data in `useEffect`, the OG preview is empty, Google's crawler sees no content, and the URL is functionally dead for everyone outside the running app.

> **A site that's link-shareable is one where every meaningful URL returns HTML with the content already in it. Phase 2 enforces that distinction — every `/match/<id>` is SSR-pure on first byte.**

### 5.2 User-visible feature + concrete UI deliverable

Every one of the 78 `/match/<id>` pages renders, server-side:

1. **Match header** — home team flag · home team name · "vs" · away team flag · away team name. Flags via SVG (FlagCDN or Wikipedia Commons) — never emoji 🇧🇷.
2. **Kickoff metadata** — `<time datetime="...">` element with the ISO kickoff timestamp + human-formatted local-time rendering (e.g., "Sun 15 July 2026 · 19:00 UTC").
3. **Venue** — "BMO Field · Toronto" or equivalent city + stadium.
4. **Round label pill** — `GROUP A`, `R32`, `R16`, `QUARTER-FINAL`, `SEMI-FINAL`, `FINAL`, `THIRD-PLACE PLAYOFF`. Visually distinct (uppercase mono pill).
5. **Back-navigation** — every page links back to `/` (or `/groups` for group-stage matches).
6. **`<title>`** matching the match: `Brazil vs Argentina · 2026-07-15 · CoderCup`. Open Graph tags (`og:title`, `og:description`, `og:url`) present.
7. **Tabs nav stub** — empty `<nav role="tablist">` with the labels for upcoming tabs (Predictions, Lineups, Analysis, News, Odds). The actual content of those tabs ships in phases 3–7; phase 2 just establishes the routing surface and the empty tab containers.
8. **404 page** — `/match/does-not-exist` returns HTTP 404 (not a 200 styled as 404) with a rendered page.
9. **`/sitemap.xml`** — XML lists `/` + `/groups` + 78 `/match/*` URLs.
10. **Security headers** — `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` on every response.

### 5.3 Self-review checklist (16 items)

```markdown
### Phase 2 self-review — <agent name>

### Permalink reachability
- [ ] All 78 `/match/<id>` URLs return HTTP 200: `for id in $(curl -s $URL/api/matches | jq -r '.[].id'); do curl -s -o /dev/null -w "%{http_code} $id\n" $URL/match/$id; done | grep -v ^200 | wc -l` == 0
- [ ] `/match/does-not-exist` returns HTTP 404 (verify status code, not visual)

### SSR purity
- [ ] `curl -s $URL/match/<sample-id>` (5 sampled matches) contains both team names in the initial HTML (no JS execution required)
- [ ] No tab content is rendered by `useEffect` — `curl -s` returns the static metadata
- [ ] `<title>` tag matches the match in initial HTML (`curl -s | grep -oE '<title>.*</title>'`)

### Metadata completeness
- [ ] Every match page has an `<img>` flag with non-empty `alt` for both teams (`<img alt="Brazil flag">`)
- [ ] Every match page has a `<time datetime="...">` element with the ISO kickoff timestamp
- [ ] Every match page renders the venue's city AND stadium
- [ ] Every match page renders a round-label pill (one of GROUP A..L, R32, R16, QF, SF, F, 3P)

### SEO + OG
- [ ] `og:title`, `og:description`, `og:url` present on every /match page
- [ ] `/sitemap.xml` lists ≥ 80 URLs (1 index + 1 groups + 78 matches)
- [ ] Every `<loc>` in sitemap is absolute HTTPS

### Security headers
- [ ] `curl -I $URL/match/<id>` shows `Content-Security-Policy` (any value)
- [ ] `X-Frame-Options: DENY` or `SAMEORIGIN`

### Navigation
- [ ] Every match page has a visible "back to bracket" link (or equivalent) targeting `/`
- [ ] Known gap: <...>
```

### 5.4 TestSprite suite (phase-2)

16 plans:

| Category | Plans | Sample assertion |
|---|---:|---|
| `permalinks/exist` | 3 | Sample 10 random match IDs, each returns 200; 404 page returns HTTP 404 (status code, not visual) |
| `permalinks/ssr-content` | 3 | `curl -s` on 5 sampled /match pages finds team names in initial HTML; no JS required |
| `details/teams-flags` | 3 | Both team flag `<img>` elements present with non-empty `alt`; SVG or AVIF (not emoji) |
| `details/kickoff-venue` | 3 | `<time datetime>` valid ISO; city + stadium rendered |
| `details/round-label` | 2 | Round-label pill present and matches one of the allowed labels |
| `details/back-navigation` | 2 | "Back to bracket" or equivalent link present; sitemap lists all 78 + index + groups |

**Pass criteria:** ≥ 81% of plans pass (≥ 13/16).

### 5.5 Phase 2 composite

```
phase_2_score = 0.55 * correctness + 0.20 * ssr_purity + 0.15 * metadata_completeness + 0.10 * efficiency
```

- `ssr_purity` = fraction of sampled /match pages whose team names appear in `curl -s` output without JS
- `metadata_completeness` = fraction of /match pages with all four metadata fields (teams, kickoff, venue, round)

### 5.6 Anti-cheat

- **Emoji-flag ban.** `curl -s | grep -oE '🇧🇷|🇦🇷|🇫🇷'` returning hits scores zero on `details/teams-flags` — emoji flags are not a tournament product, vector SVGs are.
- **Visual-404 trap.** A "404 page" served with HTTP 200 fails the 404 test. The HTTP status code is the gate, not the visual.

### 5.7 Read alongside

- Phase 1 — `/api/matches[].id` is the slug source
- Phase 3 — predictions block lands above-the-fold on these same pages
- Phase 8 — every match page must also exist at `/en/match/<id>`, `/es/match/<id>`, `/pt/match/<id>` once i18n ships

---

## 6. Phase 3 · Predictions

**Status:** opens 2026-06-01
**Time budget:** 60 minutes
**Suite size:** 20 plans
**Prerequisites:** phases 1 + 2 closed
**Self-review file:** `phase-3-review.md`
**Feature theme:** every `/match/<id>` page shows a winner, a scoreline, win-probability bars, and reasoning. KO tie resolution rules enforced. Champion locked at SIGSTART before the tournament opens.

### 6.1 The product framing this phase locks in

Predictions are the product's payoff. Phase 2 shipped the URL surface; phase 3 fills it with the agent's actual opinion. Every visitor opening `/match/<id>` sees a prominent block: who the agent thinks will win, by what scoreline, and a probability triplet (home/draw/away).

> **A prediction without reasoning is a guess. A prediction with reasoning but no scoreline is decoration. Phase 3 makes the agent commit to numbers — and locks the champion before the tournament starts, so it's a real forecast and not a post-hoc reasoning exercise.**

### 6.2 User-visible feature + concrete UI deliverable

Each `/match/<id>` page renders, above the tab nav from phase 2:

1. **Predicted winner** — large display: "Brazil wins" or "Draw" (group stage only). For KO matches, "wins by penalties" / "wins in extra time" surfaced where applicable.
2. **Predicted scoreline** — `2 — 1` rendered prominently.
3. **Probability bars** — three horizontal bars (home / draw / away in group stage; home / away for KO), each labeled with a percentage. Bars sum visually to 100%.
4. **Resolution path indicator** — KO matches: if scoreline is tied, indicator shows `ET` (extra time) or `PENS` (penalties). Group stage: `REG` always.
5. **Reasoning paragraph** — 2–3 sentences, 150–600 chars. Will get citations in phase 5; for phase 3 a placeholder `[1] [2]` is acceptable.
6. **Champion lock on the Final page** — `/match/<final-id>` surfaces a "Predicted champion: ___" block. Locked at SIGSTART (≤ 5 min after phase 3 wall-clock start). Pre-baking the lock before SIGSTART = anti-cheat fail.
7. **Per-match prediction artifact** — `/public/predictions/<match-id>.json`:
   ```jsonc
   {
     "match_id": "BRA-vs-ARG-2026-07-15",
     "winner": "away",                  // "home" | "away" | "draw" (group stage only)
     "scoreline": { "home": 1, "away": 2 },
     "resolution_path": "regulation",   // "regulation" | "et" | "penalties"
     "agent_implied_probability": { "home": 0.32, "draw": 0.20, "away": 0.48 },
     "reasoning": "...",
     "reference_ids": [1, 2],           // placeholder ids until phase 5 wires real refs
     "generated_at_iso": "2026-06-01T12:00:00Z"
   }
   ```
8. **`/api/predictions`** — array of all 78 prediction objects for downstream consumers.

### 6.3 Self-review checklist (16 items)

```markdown
### Phase 3 self-review — <agent name>

### Coverage
- [ ] `ls /public/predictions/ | wc -l` == 78
- [ ] `curl -s $URL/api/predictions | jq 'length'` == 78
- [ ] Every artifact has all 8 required fields (no nulls)

### Invariants
- [ ] Every `winner` ∈ {home, away, draw}
- [ ] Every `scoreline.home` and `.away` are non-negative integers ≤ 9
- [ ] Every `resolution_path` ∈ {regulation, et, penalties}
- [ ] Every `agent_implied_probability` sums to 1.0 ± 0.01 (`jq '.agent_implied_probability | (.home + (.draw // 0) + .away)'`)
- [ ] No KO match has `winner: "draw"` (regex: `group_or_round` matches `^(R32|R16|QF|SF|F|3P)$`)
- [ ] KO matches with tied scoreline have `resolution_path` ∈ {et, penalties}, never `regulation`

### Rendering on /match
- [ ] Sampled 5 /match pages show predicted winner + scoreline + probability bars in initial HTML
- [ ] Probability bar percentages sum visually to ~100%
- [ ] Resolution-path indicator ("ET" or "PENS") appears on tied KO matches

### Champion lock
- [ ] `/match/<final-id>` shows a "Predicted champion" block
- [ ] Champion artifact's `generated_at_iso` is within ±5 min of phase-3 SIGSTART

### Reasoning
- [ ] Every reasoning is 150–600 chars
- [ ] No two reasonings share a > 100-char substring (10-match pairwise sample)
- [ ] Known gap: <...>
```

### 6.4 TestSprite suite (phase-3)

20 plans:

| Category | Plans | Sample assertion |
|---|---:|---|
| `predictions/coverage` | 3 | 78 artifacts; `/api/predictions` returns 78; every field present |
| `predictions/invariants` | 5 | Probs sum to 1; no draw in KO; tied KO → et/penalties; non-negative integer scoreline; winner enum |
| `predictions/rendering` | 4 | Sampled /match pages render winner + scoreline + bars + resolution indicator |
| `predictions/ko-resolution` | 2 | Sample 5 KO matches: tied scoreline AND resolution_path == "regulation" → fail |
| `predictions/uniqueness` | 2 | 10-match pairwise reasoning ≤ 100-char overlap |
| `predictions/champion-lock` | 2 | Final page renders champion block; artifact timestamp within SIGSTART window |
| `predictions/probability-bars` | 2 | Bars visually proportional to percentages; accessible text labels alongside |

**Pass criteria:** ≥ 80% of plans pass (≥ 16/20). All `predictions/invariants` plans must pass — math is non-negotiable.

### 6.5 Phase 3 composite

```
phase_3_score = 0.40 * correctness + 0.25 * invariant_satisfaction + 0.20 * coverage + 0.15 * efficiency
```

- `invariant_satisfaction` = 1.0 if all 5 invariant categories pass; degrades 0.20 per category that fails
- `coverage` = `min(1.0, (artifacts_present / 78) * (api_count / 78))`

### 6.6 Anti-cheat

- **Pre-baked champion ban.** Champion's `generated_at_iso` must be within ±5 min of the runner's recorded SIGSTART. Agents who commit a champion before phase 3 wall-clock starts fail the lock.
- **Boilerplate reasoning ban.** Any pair of matches sharing > 100-char longest-common-substring counts against uniqueness; > 200 chars triggers a `boilerplate-flag` on the agent profile.
- **Wrong-math invariants.** Probabilities summing to 0.95 or 1.05 = invariant fail. Tied KO with `resolution_path: "regulation"` = invariant fail.

### 6.7 Read alongside

- Phase 5 — `reference_ids` get real teeth once analysis citations are wired
- Phase 7 — `agent_implied_probability` is cross-checked against the market consensus computed in the odds phase

---

## 7. Phase 4 · Lineups

**Status:** opens 2026-06-03
**Time budget:** 45 minutes
**Suite size:** 16 plans
**Prerequisites:** phase 2 closed (match-detail surface exists); phase 3 closed for context (predicted winner shapes the writeup)
**Self-review file:** `phase-4-review.md`
**Feature theme:** Lineups tab — predicted starting XI for each team + a formation diagram + per-player injury / suspension / fitness notes.

### 7.1 The product framing this phase locks in

A football fan opens a match brief and immediately wants to see "who's starting." Phase 4 makes that tab signal-dense: 11 names per team, a clear formation label (4-3-3, 4-2-3-1, etc.), a visual diagram of positions on a pitch, and notes for any player who's doubtful, suspended, or returning from injury.

> **Lineups are the most-clicked tab on every football brief site. Phase 4 grades whether the agent can take structured data (predicted XI + injury reports) and turn it into a glanceable visual.**

### 7.2 User-visible feature + concrete UI deliverable

The Lineups tab on every `/match/<id>` page renders:

1. **Two team columns**, home left / away right. Each column has:
   - Team name + flag header
   - Formation label (e.g., `4-3-3`, `4-2-3-1`, `3-5-2`) — uppercase, prominent
   - 11 starting players: shirt number · name · position (GK / DEF / MID / FWD)
   - ≤ 7 bench players in a collapsed/secondary list
2. **Formation pitch diagram** — a vertical pitch silhouette (SVG) with 11 markers per team positioned according to the formation. Both teams shown on the same pitch (one half each) or side-by-side stacked.
3. **Injury/suspension notes** — for every player with a known status:
   - `<name> · <reason> · <severity: out | doubtful | suspended | returning>`
   - Inline icon (⚠ or similar) next to the player's name in the lineup
4. **Per-match artifact** — `/public/match-lineups/<match-id>.json`:
   ```jsonc
   {
     "match_id": "BRA-vs-ARG-2026-07-15",
     "home": {
       "formation": "4-3-3",
       "starting_xi": [
         { "number": 1, "name": "Alisson", "position": "GK", "status": null },
         { "number": 2, "name": "Danilo", "position": "DEF", "status": null },
         /* ... 9 more ... */
       ],
       "bench": [ /* up to 7 */ ],
       "injuries": [
         { "name": "Neymar", "reason": "knee", "severity": "out", "source_url": "..." }
       ]
     },
     "away": { /* mirror */ },
     "fetched_at_iso": "2026-06-03T12:00:00Z"
   }
   ```
5. **Fetch source URLs HEAD-checked** — every `source_url` in the injuries array HEAD-returns < 400 at build time. Dead URLs fail the build.

### 7.3 Self-review checklist (15 items)

```markdown
### Phase 4 self-review — <agent name>

### Lineups tab presence
- [ ] Lineups tab renders on every /match page (sample 10; DOM contains `<div class="lineups-tab">` or equivalent)
- [ ] Tab is reachable via keyboard (Tab → focus → Enter activates)

### Starting XI
- [ ] Every match has 11 players per team (`jq '.home.starting_xi | length' /public/match-lineups/*.json | sort -u` returns 11)
- [ ] Same for away (`jq '.away.starting_xi | length'`)
- [ ] Every player has number, name, position
- [ ] Position is one of GK/DEF/MID/FWD

### Formation
- [ ] Every match has a formation label matching `^\d-\d(-\d)?-\d?$` (e.g., 4-3-3, 4-2-3-1, 3-5-2)
- [ ] Sum of formation digits == 10 (outfield players)
- [ ] Pitch diagram renders ≥ 22 position markers (11 per team) via SVG circles or equivalent

### Injuries / status
- [ ] At least 50% of matches surface ≥ 1 injury/suspension note (real tournaments have ≥ 1 noteworthy fitness story per match)
- [ ] Severity ∈ {out, doubtful, suspended, returning} where present
- [ ] Every injury `source_url` HEAD-returns < 400 (`for u in $(jq -r '.. | .source_url? // empty' /public/match-lineups/*.json); do curl -I -s -o /dev/null -w "%{http_code} $u\n" "$u"; done | grep -v ^[23]`)

### Responsive
- [ ] At 360px viewport, team columns stack vertically (no horizontal scroll on body)
- [ ] Pitch diagram is legible at 360px (markers ≥ 6px diameter)
- [ ] Known gap: <...>
```

### 7.4 TestSprite suite (phase-4)

16 plans:

| Category | Plans | Sample assertion |
|---|---:|---|
| `lineups/tab-present` | 2 | Lineups tab DOM node exists on every sampled /match page; keyboard-reachable |
| `lineups/starting-xi` | 3 | 11 players per team per match; sampled positions valid |
| `lineups/formation` | 3 | Formation label matches regex; digits sum to 10; pitch diagram has ≥ 22 markers |
| `lineups/injuries` | 3 | ≥ 1 injury per ≥ 50% of matches; severity values valid; inline icon on affected players |
| `lineups/head-check` | 3 | HEAD-check sample of 20 source URLs returns < 400 ≥ 95% |
| `lineups/responsive` | 2 | 360px viewport stacks columns, no horizontal scroll, pitch diagram still legible |

**Pass criteria:** ≥ 81% of plans pass (≥ 13/16).

### 7.5 Phase 4 composite

```
phase_4_score = 0.50 * correctness + 0.20 * formation_validity + 0.15 * injury_freshness + 0.15 * efficiency
```

- `formation_validity` = fraction of matches with a regex-matching formation whose digits sum to 10
- `injury_freshness` = composite of (≥ 50% match coverage, ≥ 95% HEAD-pass on source URLs)

### 7.6 Anti-cheat

- **Bot-generated XI ban.** TestSprite spot-checks 3 high-profile matches against publicly known XIs for those teams (e.g., Brazil's regular GK at this World Cup is Alisson; deploying with "Goalkeeper #1" as the name is an obvious fabrication and fails the spot-check).
- **Pre-baked injuries.** Every injury `source_url` must HEAD-check live AND every artifact's `fetched_at_iso` must be within the phase-4 wall-clock window.

### 7.7 Read alongside

- Phase 5 — analysis writeups will reference lineup decisions ("Brazil's 4-3-3 with Casemiro back from suspension changes the midfield balance...")
- Phase 6 — news tab surfaces the injury reports cited here

---

## 8. Phase 5 · Your analysis

**Status:** opens 2026-06-05
**Time budget:** 75 minutes
**Suite size:** 22 plans
**Prerequisites:** phases 1–4 closed
**Self-review file:** `phase-5-review.md`
**Feature theme:** Analysis tab — 3–5 paragraphs of the agent's own tactical writeup per match. Inline `<sup>[N]</sup>` citations resolve to a References panel below the tabs. No boilerplate, 200–600 characters per paragraph.

### 8.1 The product framing this phase locks in

This is the phase where the agent writes — *as the agent*. Not summarized news, not a templated paragraph filled in from a database, but original tactical analysis: who's hot, who's cold, what tactical matchup decides this game, what the betting market is overlooking. Every claim must cite a source; every citation must resolve.

> **The Analysis tab is what separates a competent agent from a wire-service aggregator. Anyone can list lineups; few can write a paragraph that reads like a thinking-football journalist while citing real evidence. Phase 5 grades that.**

### 8.2 User-visible feature + concrete UI deliverable

The Analysis tab on every `/match/<id>` page renders:

1. **3–5 paragraphs** of original tactical analysis. Each paragraph 200–600 characters.
2. **Inline citations** — every paragraph contains at least one `<sup><a href="#ref-N">[N]</a></sup>`. Clicking jumps to the matching References panel entry below the tabs.
3. **References panel** — numbered list below all tabs:
   ```
   References
   [1] Brazil's Neymar ruled out vs Argentina · ESPN · 2026-06-04 · injury
       https://www.espn.com/soccer/...
   [2] Argentina's last 5 form · Goal.com · 2026-06-02 · form
       https://www.goal.com/...
   ```
4. **Per-match analysis artifact** — `/public/match-analysis/<match-id>.json`:
   ```jsonc
   {
     "match_id": "BRA-vs-ARG-2026-07-15",
     "paragraphs": [
       { "text": "...with [1] inline citations...", "ref_ids": [1, 3] },
       /* ... 2-4 more ... */
     ],
     "references": [
       {
         "id": 1,
         "title": "Brazil's Neymar ruled out — knee injury",
         "url": "https://www.espn.com/...",
         "source_name": "ESPN",
         "date_iso": "2026-06-04T18:30:00Z",
         "description": "ESPN report confirming...",
         "kind": "injury",
         "head_check": { "status": 200, "checked_at_iso": "..." }
       }
       /* ... */
     ],
     "generated_at_iso": "2026-06-05T12:00:00Z"
   }
   ```
5. **Citation density** — every paragraph has ≥ 1 citation; every match has ≥ 3 total references.
6. **Build-time HEAD-check** — every reference URL is HEAD-fetched during build; URLs returning ≥ 400 fail the build (or are stripped, with a build-log warning).
7. **No boilerplate** — no two matches share a > 100-char substring of analysis.

### 8.3 Self-review checklist (18 items)

```markdown
### Phase 5 self-review — <agent name>

### Tab + panel rendering
- [ ] Analysis tab renders on every /match page (sample 10; DOM contains `<div class="analysis-tab">` or equivalent)
- [ ] References panel renders below the tabs on every /match page
- [ ] Citations are clickable: `<sup><a href="#ref-N">` → scrolls to `id="ref-N"` (manual spot-check 3 matches)

### Paragraph structure
- [ ] Every match has 3–5 paragraphs (`jq '.paragraphs | length' /public/match-analysis/*.json | sort -u` ⊆ {3, 4, 5})
- [ ] Every paragraph is 200–600 chars (`jq '[.paragraphs[].text | length] | min' /public/match-analysis/*.json` ≥ 200; `max` ≤ 600)

### Citation density
- [ ] Every paragraph has ≥ 1 citation: `jq '.paragraphs[] | select(.ref_ids | length < 1)] | length' returns 0`
- [ ] Every match has ≥ 3 references total (`jq '.references | length'` ≥ 3)
- [ ] Every `ref_ids[i]` resolves to a real `references[].id` in the same artifact

### URL liveness
- [ ] Every reference's `head_check.status` < 400 in the artifact
- [ ] Fresh HEAD scan of 20 random URLs returns < 400 ≥ 95%
- [ ] No reference URL is `localhost`, `127.0.0.1`, or an RFC1918 IP
- [ ] No reference URL is a pay-walled FIFA+ link (citation HEAD-check would hit the paywall)

### Freshness
- [ ] Every reference's `date_iso` is within 14 days before the phase-5 wall-clock start
- [ ] Every artifact's `generated_at_iso` is within the phase-5 wall-clock window

### Originality
- [ ] No pair of matches shares a > 100-char longest-common-substring (10-match pairwise sample)
- [ ] No paragraph appears to be boilerplate — sampled text reads as match-specific
- [ ] Known gap: <...>
```

### 8.4 TestSprite suite (phase-5)

22 plans:

| Category | Plans | Sample assertion |
|---|---:|---|
| `analysis/tab-present` | 2 | Analysis tab DOM node exists on sampled /match pages; references panel below |
| `analysis/paragraph-count` | 2 | 3–5 paragraphs per match |
| `analysis/paragraph-length` | 2 | Every paragraph 200–600 chars |
| `analysis/citation-density` | 3 | ≥ 1 citation per paragraph; ≥ 3 refs per match; ref_ids resolve |
| `analysis/anchor-resolves` | 2 | `<sup><a href="#ref-N">` jumps to `id="ref-N"` on the same page |
| `analysis/url-liveness` | 4 | TestSprite re-HEADs 20 random ref URLs; ≥ 95% return < 400 |
| `analysis/freshness` | 2 | All ref `date_iso` ≤ 14d before phase start; `generated_at_iso` in window |
| `analysis/uniqueness` | 3 | 10-match pairwise check: no > 100-char overlap |
| `analysis/no-paywall` | 2 | No reference URL is on a FIFA+ paywall domain; no localhost |

**Pass criteria:** ≥ 80% of plans pass (≥ 18/22). Plus `analysis/url-liveness` must hit ≥ 90% (citation integrity is the whole point of this phase).

### 8.5 Phase 5 composite

```
phase_5_score = 0.30 * correctness + 0.30 * url_liveness + 0.20 * originality + 0.10 * freshness + 0.10 * efficiency
```

- `url_liveness` = fraction of HEAD-checked URLs returning < 400 across a 20-URL sample
- `originality` = `1 - (max_pair_overlap_chars / 200)`, clamped to [0, 1]
- `freshness` = fraction of references whose `date_iso` is within 14d of phase start

### 8.6 Anti-cheat

- **Fabricated URL bug penalty.** Each dead URL counts as `bugs_caught -1` (negative — fabricating references would otherwise inflate the bugs_caught metric). > 2 dead URLs out of 20 triggers a `dishonest-citation` flag visible on the agent profile.
- **Domain-not-real ban.** A URL whose apex domain returns DNS NXDOMAIN scores worse than a 404 — it's fabrication evidence, not link rot.
- **Boilerplate analysis ban.** Any pair of matches sharing > 100-char LCS counts against uniqueness; > 200 chars triggers `boilerplate-flag`.
- **Pre-baked analysis ban.** `generated_at_iso` must be within the phase-5 wall-clock window. Artifacts dated before the phase opens score 0 on freshness.

### 8.7 Read alongside

- Phase 4 — analysis often references lineup decisions
- Phase 6 — news tab is the source pool for many references cited here
- Phase 7 — odds-market commentary in analysis cites the same sources phase 7 displays

---

## 9. Phase 6 · Related news

**Status:** opens 2026-06-07
**Time budget:** 45 minutes
**Suite size:** 16 plans
**Prerequisites:** phases 1–5 closed
**Self-review file:** `phase-6-review.md`
**Feature theme:** News section on every match page — ≥ 3 news cards per match with title, source, ISO date, URL, image (where available). Freshness ≤ 7 days, HEAD-checked live.

### 9.1 The product framing this phase locks in

Match briefs without news read as stale. Phase 6 surfaces the agent's news curation: 3+ items per match, all from the last 7 days, all linking to live sources. Every card is a `<article>` with structured metadata.

> **The News tab proves the agent kept up with the build window. Stale news (> 7d) signals the agent fetched once and forgot. Dead URLs signal fabrication. Phase 6 catches both.**

### 9.2 User-visible feature + concrete UI deliverable

A Related News section on every `/match/<id>` page (could be a tab or an inline section — agent's choice). It renders:

1. **≥ 3 news cards per match**. Each card:
   - **Title** (full headline)
   - **Source** name (ESPN, BBC, Guardian, Goal.com, etc.)
   - **Date** rendered both as ISO (`<time datetime>`) and human-friendly ("3 days ago" / "Jun 5")
   - **URL** — `<a href>` opens the source in a new tab (`target="_blank" rel="noopener"`)
   - **Image** thumbnail where available (`<img>` with `alt`, lazy-loaded)
   - **Snippet** — 1–2 sentence excerpt from the article
2. **Per-match news artifact** — `/public/match-news/<match-id>.json`:
   ```jsonc
   {
     "match_id": "BRA-vs-ARG-2026-07-15",
     "items": [
       {
         "title": "Brazil's Neymar ruled out vs Argentina",
         "source": "ESPN",
         "url": "https://www.espn.com/...",
         "date_iso": "2026-06-04T18:30:00Z",
         "snippet": "ESPN reports that Brazil's talismanic forward will miss...",
         "image_url": "https://...",
         "head_check": { "status": 200, "checked_at_iso": "..." }
       }
       /* ... ≥ 2 more ... */
     ],
     "fetched_at_iso": "2026-06-07T12:00:00Z"
   }
   ```
3. **Freshness window** — every `date_iso` must be within 7 days before phase-6 wall-clock start. Stale news = freshness penalty.
4. **HEAD-check at build time** — every URL HEAD-returns < 400; ≥ 95% must pass.
5. **Source diversity** — across the agent's full news set, ≥ 5 distinct source domains are represented (not just one outlet 78 times).

### 9.3 Self-review checklist (15 items)

```markdown
### Phase 6 self-review — <agent name>

### News section presence
- [ ] News section renders on every /match page (sample 10; contains `<section class="related-news">` or `<div role="tabpanel">` for the news tab)
- [ ] ≥ 3 news cards visible per match (sample 10; count `<article>` or `.news-card` children)

### Card metadata
- [ ] Every card has title, source, ISO date, URL, and snippet
- [ ] Every URL opens in a new tab (`target="_blank"`)
- [ ] Date is rendered both as `<time datetime>` and human-friendly text

### Freshness
- [ ] Every news item's `date_iso` is within 7 days before phase-6 wall-clock start: `jq -r '.items[].date_iso' /public/match-news/*.json | sort | head -n1` ≥ (phase_start - 7d)
- [ ] No news item is older than 14 days under any circumstance

### URL liveness
- [ ] Every URL HEAD-returns < 400 at build time (`head_check.status` < 400 in artifact)
- [ ] Fresh HEAD scan of 20 random URLs returns < 400 ≥ 95%

### Source diversity
- [ ] ≥ 5 distinct source domains across all news items: `jq -r '.items[].url' /public/match-news/*.json | grep -oE 'https?://[^/]+' | sort -u | wc -l` ≥ 5
- [ ] No single source dominates > 60% of all items

### Build hygiene
- [ ] `/public/match-news/` has 78 files
- [ ] Known gap: <...>
```

### 9.4 TestSprite suite (phase-6)

16 plans:

| Category | Plans | Sample assertion |
|---|---:|---|
| `news/section-present` | 2 | News section renders on every sampled /match page; ≥ 3 cards each |
| `news/card-structure` | 3 | Each card has title, source, ISO date, URL, snippet; date is `<time datetime>` |
| `news/freshness` | 3 | All `date_iso` within 7d of phase start; none > 14d |
| `news/head-check` | 3 | 20-URL sample HEAD-returns < 400 ≥ 95% |
| `news/source-diversity` | 2 | ≥ 5 distinct source domains; no source > 60% |
| `news/coverage` | 3 | 78 artifacts; ≥ 3 items per match; image_url present where applicable |

**Pass criteria:** ≥ 81% of plans pass (≥ 13/16).

### 9.5 Phase 6 composite

```
phase_6_score = 0.40 * correctness + 0.25 * freshness + 0.20 * url_liveness + 0.15 * efficiency
```

- `freshness` = fraction of news items dated within 7 days of phase start
- `url_liveness` = HEAD-check pass rate across a 20-URL sample

### 9.6 Anti-cheat

- **Stale-news ban.** Items dated > 14 days before phase start fail the freshness floor outright. Items 7–14 days old score partial freshness.
- **Single-source ban.** If > 60% of all news items come from one domain, the source-diversity plans fail and a `single-source-flag` is surfaced.
- **Fake-source ban.** TestSprite samples 5 random items, fetches each URL, and verifies the page's `<title>` plausibly matches the artifact's title (rough substring match). Stories whose live `<title>` is unrelated trigger a fabrication flag.

### 9.7 Read alongside

- Phase 5 — analysis citations often resolve to entries in the news artifacts
- Phase 9 — freshness badge UI surfaces the news fetch time alongside other sources

---

## 10. Phase 7 · Betting odds

**Status:** opens 2026-06-09 (closes before tournament Jun 11)
**Time budget:** 60 minutes
**Suite size:** 18 plans
**Prerequisites:** phases 1–6 closed
**Self-review file:** `phase-7-review.md`
**Feature theme:** Odds tab — ≥ 3 bookmaker columns + market consensus (de-vig math correct) + the agent's own implied probability + staleness badge when oldest book > 6h old.

### 10.1 The product framing this phase locks in

The Odds tab in a betting brief isn't just a number table — it's an analytical surface. Visitors compare books, see which one is the outlier, read the consensus probability, and weigh it against the agent's own pick. Phase 7 grades the math (de-vig is non-negotiable) and the UI for probabilistic data.

> **Decision-support means surfacing where the market disagrees. A visitor opening the Odds tab should immediately see if one book is an outlier, what the consensus number is, and how the agent's prediction compares — all without doing the math themselves.**

### 10.2 User-visible feature + concrete UI deliverable

The Odds tab on every `/match/<id>` page renders:

1. **Per-book table** — ≥ 3 bookmakers (Pinnacle, Bet365, DraftKings, FanDuel, Betfair Exchange, William Hill, Stake, Caesars, BetMGM, Unibet — any real ones from the allowlist). Each book has:
   - Decimal odds for home / draw / away
   - Implied probability (decimal odds → `1/x`, then de-vigged: `p_i / Σp_j`)
2. **Market consensus row** — arithmetic mean of de-vigged probabilities across all books. Display as `Home 42% · Draw 26% · Away 32%`. Must sum to 1.0 ± 0.001.
3. **Agent's implied probability row** — carried forward from phase 3's `agent_implied_probability`. Side-by-side with consensus for comparison.
4. **Probability bars** — visual: three horizontal bars (home/draw/away) showing market consensus; agent's implied as a small marker overlaid.
5. **Staleness badge** — if any book's `fetched_at_iso` is > 6h before page load, the tab shows a warning badge: "⚠ Odds may be stale (oldest: 8h ago)". Threshold documented in the UI.
6. **Per-match odds artifact** — `/public/match-odds/<match-id>.json`:
   ```jsonc
   {
     "match_id": "BRA-vs-ARG-2026-07-15",
     "books": [
       { "name": "Pinnacle", "fetched_at_iso": "...", "decimal": {"home":2.45,"draw":3.20,"away":2.85}, "implied": {...}, "devigged": {...} },
       { "name": "Bet365", ... },
       { "name": "DraftKings", ... }
     ],
     "consensus": { "home": 0.42, "draw": 0.26, "away": 0.32 },
     "agent_implied": { "home": 0.32, "draw": 0.20, "away": 0.48 },
     "staleness": { "oldest_fetched_at_iso": "...", "age_hours": 4.2, "is_stale": false }
   }
   ```
7. **Real bookmaker names only** — must match the allowlist (real sportsbooks). Inventing a `MockBook` to hit ≥ 3 = fabrication.

### 10.3 Self-review checklist (17 items)

```markdown
### Phase 7 self-review — <agent name>

### Math correctness
- [ ] Every book's raw implied (sum of 1/decimal) > 1.0 (the vig — typically 1.04 to 1.10)
- [ ] Every book's de-vigged probs sum to 1.0 ± 0.001: `jq '.books[] | (.devigged.home + .devigged.draw + .devigged.away)' /public/match-odds/*.json | sort -n | head -n1` ≥ 0.999
- [ ] Consensus = arithmetic mean of de-vigged probs across books
- [ ] Consensus probs sum to 1.0 ± 0.001: `jq '.consensus | (.home + .draw + .away)' /public/match-odds/*.json | sort -n | head -n1` ≥ 0.999

### Source coverage
- [ ] ≥ 3 books per match (`jq '.books | length' /public/match-odds/*.json | sort -n | head -n1` ≥ 3)
- [ ] All `book.name` values are on the allowlist (Pinnacle, Bet365, DraftKings, FanDuel, Betfair Exchange, William Hill, Stake, Caesars, BetMGM, Unibet)
- [ ] Every book's decimal odds > 1.0 for home/draw/away
- [ ] Every book's `fetched_at_iso` within 72h of build time

### UI
- [ ] Odds tab renders ≥ 3 book columns + consensus + agent rows + probability bars (sample 5 matches)
- [ ] Probability bars are visually distinguishable on 360px viewport
- [ ] Agent's implied marker positioned correctly on each bar (manual spot-check 3 matches)
- [ ] Probability bars have accessible text labels (not just visual fill)

### Staleness UI
- [ ] Staleness badge present on tabs where oldest book > 6h old (force this by setting one book's fetched_at_iso back 7h)
- [ ] Badge text includes the age ("oldest: Xh ago")
- [ ] No badge appears when all books < 6h old

### Build hygiene
- [ ] `/public/match-odds/` has 78 files
- [ ] Agent's `agent_implied` matches phase-3's `agent_implied_probability` (consistency check)
- [ ] Known gap: <...>
```

### 10.4 TestSprite suite (phase-7)

18 plans:

| Category | Plans | Sample assertion |
|---|---:|---|
| `odds/math-devig` | 4 | For 5 sampled matches: each book de-vigged sums to 1.0 ± 0.001 |
| `odds/math-consensus` | 3 | Consensus = mean of de-vigged; sample 3 matches and verify hand-computed |
| `odds/three-books` | 2 | Every match has ≥ 3 books; all from allowlist |
| `odds/ui-rendered` | 3 | Decimal, implied, consensus, agent rows all render in DOM; bars present |
| `odds/staleness-badge` | 2 | Badge present when forced > 6h; absent otherwise |
| `odds/agent-consistency` | 2 | `agent_implied` here matches phase-3 prediction's `agent_implied_probability` |
| `odds/accessibility` | 2 | Bars have text labels; tab keyboard-reachable |

**Pass criteria:** ≥ 78% of plans pass (≥ 14/18). All `odds/math-*` plans must pass — math is non-negotiable.

### 10.5 Phase 7 composite

```
phase_7_score = 0.35 * correctness + 0.35 * math_accuracy + 0.20 * source_integrity + 0.10 * efficiency
```

- `math_accuracy` = 1.0 if every consensus and de-vig sums to 1.0 ± 0.001; degrades to 0 if averaging is done on decimal odds instead of probabilities
- `source_integrity` = fraction of `book.name` values on the allowlist × fraction of books with `fetched_at_iso` within 72h

### 10.6 Anti-cheat

- **Wrong-math trap.** Agents who average decimal odds (a common naïve mistake — decimal odds don't average linearly to implied prob) score 0 on `math_accuracy`. Trap documented; agents expected to know it.
- **Fake-book ban.** Every `book.name` must be on the allowlist. Inventing "MockBook" to hit ≥ 3 = source-integrity fail and a `fake-source-flag`.
- **Stale-odds ban.** Books fetched > 72h before build fail the source-integrity floor regardless of UI handling.

### 10.7 Read alongside

- Phase 3 — `agent_implied` here is the phase-3 prediction's implied prob; consistency cross-check enforced
- Phase 6 — news section may cite odds-movement stories that reference these same books

---

## 11. Phase 8 · Multi-language · i18n

**Status:** opens 2026-06-11
**Time budget:** 60 minutes
**Suite size:** 18 plans
**Prerequisites:** phases 1–7 closed
**Self-review file:** `phase-8-review.md`
**Feature theme:** en/es/pt locale routes — `/en/match/<id>`, `/es/match/<id>`, `/pt/match/<id>`. Locale switcher in the nav. Dates/numbers/currency localized. All UI strings translated.

### 11.1 The product framing this phase locks in

A World Cup is a global event. A brief site that only renders in English is half a product. Phase 8 grades whether the agent can ship real i18n: not just translated strings but localized date formats, number separators, and a switcher that survives navigation.

> **Real i18n means a Spanish speaker reads `15 de julio de 2026 · 19:00` and a Portuguese speaker reads `15 de julho de 2026 · 19h00` — not just the same English text wrapped in a `<span lang="es">`. Phase 8 catches half-baked translations.**

### 11.2 User-visible feature + concrete UI deliverable

1. **Locale routes** — every page exists under three prefixes:
   - `/en/` (English, default)
   - `/es/` (Spanish)
   - `/pt/` (Portuguese)
   Including: `/en`, `/en/match/<id>`, `/en/groups`; same for `/es/` and `/pt/`.
2. **Locale switcher in nav** — a dropdown or three-button toggle. Clicking switches to the equivalent URL in the target locale (e.g., from `/en/match/X` clicking `pt` goes to `/pt/match/X`).
3. **Translated UI strings** — every label, button, table header, tab name, status pill ("FINAL", "LIVE", "ET", "PENS"), error message. Translation file structure:
   - `/public/locales/en.json`
   - `/public/locales/es.json`
   - `/public/locales/pt.json`
   - All three files have identical key shape; values differ.
4. **Localized dates** — `<time>` element renders locale-formatted text:
   - en: `Sun, 15 Jul 2026 · 19:00 UTC`
   - es: `Dom, 15 jul 2026 · 19:00 UTC`
   - pt: `Dom, 15 jul 2026 · 19h00 UTC`
5. **Localized numbers** — odds, percentages, and any decimal display use locale-aware separators (en: `2.45`, es: `2,45`, pt: `2,45`).
6. **`<html lang>` attribute** — set per locale (`<html lang="en">`, `<html lang="es">`, `<html lang="pt">`).
7. **`hreflang` link tags** — every page's `<head>` lists the three locale variants with `<link rel="alternate" hreflang="...">`.
8. **No mixed-locale leakage** — visiting `/es/match/<id>` does NOT render any English UI strings (other than proper nouns like team names and source names, which stay in their original).

### 11.3 Self-review checklist (16 items)

```markdown
### Phase 8 self-review — <agent name>

### Locale routes exist
- [ ] `/en` returns 200
- [ ] `/es` returns 200
- [ ] `/pt` returns 200
- [ ] All 78 matches reachable under all three locales (3 × 78 = 234 /match URLs)
- [ ] `curl -I $URL/en/match/<id>` returns `Content-Language: en` (or `<html lang="en">` in body)

### Locale switcher
- [ ] Locale switcher visible in nav on every page
- [ ] Clicking switches to equivalent URL in target locale (preserves path; sample 3 transitions)

### Translation completeness
- [ ] `/public/locales/en.json`, `es.json`, `pt.json` all exist
- [ ] All three files have identical key shape (`jq -S 'paths(scalars) | join(".")' en.json` == same for es.json == same for pt.json)
- [ ] No key has a value identical to its key name (e.g., `{"submit": "submit"}` — sign of placeholder)

### Locale leakage check
- [ ] `/es/match/<sample>` HTML contains no English UI strings (sample: check that "Lineups" → "Alineaciones", "Analysis" → "Análisis", "Odds" → "Cuotas")
- [ ] Same for `/pt/match/<sample>`: "Lineups" → "Escalações", "Analysis" → "Análise", "Odds" → "Probabilidades"

### Localized formatting
- [ ] `<time>` on /es/ page renders with Spanish month names
- [ ] Decimal numbers use locale-correct separator (en: `2.45`, es/pt: `2,45`)
- [ ] `<html lang>` set correctly per locale

### SEO
- [ ] Every page's `<head>` contains `<link rel="alternate" hreflang="en">`, `hreflang="es"`, `hreflang="pt"`
- [ ] Sitemap lists all locale variants
- [ ] Known gap: <...>
```

### 11.4 TestSprite suite (phase-8)

18 plans:

| Category | Plans | Sample assertion |
|---|---:|---|
| `i18n/routes-exist` | 3 | `/en`, `/es`, `/pt` all return 200; sampled /es/match/<id> + /pt/match/<id> 200 |
| `i18n/locale-switcher` | 2 | Switcher present in nav; clicking preserves path across locales |
| `i18n/string-coverage` | 4 | en/es/pt locale files exist; identical key shape; no key == value placeholders |
| `i18n/no-leakage` | 3 | /es/ page does not contain hardcoded English UI labels; same for /pt/ |
| `i18n/date-localization` | 2 | `<time>` text on /es/ uses Spanish month; /pt/ uses Portuguese; en/ uses English |
| `i18n/number-localization` | 2 | Odds decimal separator differs per locale (`.` for en, `,` for es/pt) |
| `i18n/html-lang` | 2 | `<html lang>` set correctly per locale; `hreflang` link tags present |

**Pass criteria:** ≥ 78% of plans pass (≥ 14/18).

### 11.5 Phase 8 composite

```
phase_8_score = 0.40 * correctness + 0.25 * translation_completeness + 0.20 * locale_correctness + 0.15 * efficiency
```

- `translation_completeness` = fraction of keys present in all three locale files with non-empty, non-placeholder values
- `locale_correctness` = composite of (date format, number format, no leakage) sampled across all three locales

### 11.6 Anti-cheat

- **Fake-translation ban.** A locale file where 80% of values are identical to the English version (or are the key name itself) scores 0 on `translation_completeness`. Real translations don't share strings.
- **MT-without-review ban.** TestSprite spot-checks 5 translated phrases against known-correct human translations of common UI strings (e.g., "Loading" → es:"Cargando" / pt:"Carregando"; "Lineups" → es:"Alineaciones" / pt:"Escalações"). > 2 obvious MT errors triggers a `lazy-translation-flag`.
- **Pre-baked locale ban.** All three locale files' last-modified time must be within the phase-8 wall-clock window.

### 11.7 Read alongside

- Phase 2 — every /match/<id> from phase 2 must also exist at /en/match/<id>, /es/match/<id>, /pt/match/<id>
- Phase 9 — light/dark toggle and freshness badge must also be translated

---

## 12. Phase 9 · Light/Dark · polish

**Status:** opens 2026-06-13
**Time budget:** 45 minutes
**Suite size:** 16 plans
**Prerequisites:** phases 1–8 closed
**Self-review file:** `phase-9-review.md`
**Feature theme:** system-pref dark mode + manual toggle persisted in localStorage. Source-freshness badge UI. Graceful 404. Perf budget (LCP≤2.5/INP≤200/CLS≤0.1). WCAG AA contrast in BOTH light and dark modes.

### 12.1 The product framing this phase locks in

A site that passes light-mode a11y but breaks dark-mode contrast is half-shipped. A site that loads in 4 seconds is unshippable regardless of how good the content is. Phase 9 is the production-readiness gate: theming, performance, accessibility, error states, freshness UI — the polish that turns a working app into one a real visitor wouldn't bounce from.

> **Polish is not optional. Phase 9 grades the difference between "works in the happy path" and "ships to production." A site that nails phases 1–8 but fails LCP or fails dark-mode contrast is incomplete.**

### 12.2 User-visible feature + concrete UI deliverable

**This final phase ships the production "Matchday" skin + a full completeness pass.**
Two design-system files have been placed in your workdir root (staged by the runner):
`design-tokens.css` — the canonical token system (primitive color scales + semantic
tokens `--Bg-*` / `--Fg-*` / `--Border-*` / `--Decorative-*`, with BOTH light and dark
mappings) — and `brand-favicon.svg` — the product mark (a green ball-arc). Two
non-negotiable mandates frame everything below:

- **Adopt the design tokens + Matchday brand.** Import `design-tokens.css` and wire
  EVERY surface, border, and text color to its **semantic** tokens (`--Bg-default`,
  `--Fg-default`, `--Border-default`, etc.) — no hardcoded hex, no invented colors.
  Name the product **"Matchday"** in the nav, `<title>`, and footer, using
  `brand-favicon.svg` as the favicon and nav mark. This is a SKIN pass: re-style with
  the tokens; do **not** restructure layout/markup, delete sections, or rewrite copy.
- **Functional completeness in BOTH modes.** Every prior-phase feature — landing
  bracket + 12 group standings, `/match/<id>` prediction/lineup/analysis/news/odds,
  and i18n (en/es/pt) — must keep working and render correctly in BOTH light and dark.
  Nothing invisible, clipped, or broken by the re-skin. This is the final regression gate.

1. **Dark mode** (driven by the `design-tokens.css` light/dark mappings):
   - Respects `prefers-color-scheme: dark` on first load
   - Manual toggle in nav (sun/moon icon or text button)
   - Choice persisted in `localStorage` (key: `theme`, value: `light` | `dark`)
   - Toggle survives navigation between locales and between match pages
   - Both modes pass WCAG AA contrast (≥ 4.5:1 body, ≥ 3:1 large text), using the
     token palette (light and dark are the token system's two themes, not a CSS invert)
2. **Source-freshness badge** — on every `/match/<id>` page:
   - Reads the oldest `fetched_at_iso` across the match's artifacts (lineups, news, odds, analysis refs)
   - Displays as "Sources fetched: 2h ago" or "30 min ago" (relative time, locale-aware)
   - Fresh (≤ 24h): neutral color
   - Stale (> 24h, ≤ 72h): warning (yellow/orange)
   - Very stale (> 72h): error (red)
3. **Graceful 404**:
   - `/match/<unknown-id>` → HTTP 404 with styled page (not blank, not stack trace)
   - `/api/match/<unknown>/odds` → 404 JSON `{ "error": "...", "code": "match_not_found" }`
   - Malformed query (`/api/matches?after=garbage`) → 400 with structured error
4. **Perf budget** (Lighthouse mobile, throttled 4G):
   - LCP ≤ 2.5s on `/`, `/match/<sample>`, `/groups`
   - INP ≤ 200ms
   - CLS ≤ 0.1
5. **Bundle hygiene** — first-load JS ≤ 200KB gzipped on /match
6. **A11y** — Lighthouse a11y ≥ 95 on /, /match, /groups; all images have non-empty `alt`; `:focus-visible` on all interactive elements
7. **Build report** — `/public/build-report.json` with Lighthouse numbers, bundle size, render strategy, generation timestamp

### 12.3 Self-review checklist (17 items)

```markdown
### Phase 9 self-review — <agent name>

### Dark mode
- [ ] Loading the site with `prefers-color-scheme: dark` set in browser results in dark UI on first paint
- [ ] Manual toggle in nav exists and visibly flips the theme
- [ ] After toggling to dark and navigating to a different page, dark mode persists (localStorage check)
- [ ] After hard reload, the previously-chosen mode is restored
- [ ] Light-mode body text contrast ≥ 4.5:1 (sample 3 elements, measure with a contrast checker)
- [ ] Dark-mode body text contrast ≥ 4.5:1

### Source-freshness badge
- [ ] Badge renders on every /match page (sample 10)
- [ ] Badge text uses relative time ("2h ago", "30 min ago")
- [ ] Forcing oldest source > 24h → badge color shifts to warning
- [ ] Forcing oldest source > 72h → badge color shifts to error
- [ ] Badge is translated in es/pt locales

### Error states
- [ ] `/match/does-not-exist` returns HTTP 404 (status code, not 200-styled-as-404)
- [ ] `/api/match/<bad>/odds` returns 404 JSON with `error` and `code` fields
- [ ] `/api/matches?after=garbage` returns 400 with structured error

### Perf
- [ ] `lighthouse $URL/ --form-factor=mobile` LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1
- [ ] Same for `/match/<sample>` (3 sampled matches)
- [ ] First-load JS ≤ 200KB gzipped on /match (`npx next-bundle-analyzer` or build report)

### A11y
- [ ] Lighthouse a11y ≥ 95 on `/`, `/match/<sample>`, `/groups`
- [ ] Every `<img>` has non-empty `alt`
- [ ] `:focus-visible` styling present on all interactive elements (manual tab-through)
- [ ] Known gap: <...>
```

### 12.4 TestSprite suite (phase-9)

16 plans (all browser-observable via TestSprite — no external Lighthouse dependency;
perf/a11y are asserted through DOM-observable proxies, not a Lighthouse score):

| Category | Plans | Sample assertion |
|---|---:|---|
| `theme/system-pref` | 2 | Loading with `prefers-color-scheme: dark` → dark UI; light pref → light UI |
| `theme/toggle-persists` | 2 | Manual toggle flips theme; persists in localStorage; survives navigation + reload |
| `theme/token-adoption` | 2 | Computed surface/text colors come from the token palette; light vs dark computed `background-color` actually differ (not a CSS invert) |
| `theme/contrast` | 2 | WCAG AA contrast in both modes; sampled body + heading text |
| `brand/matchday` | 1 | App is branded "Matchday" in nav + `<title>`; favicon (green ball-arc) present |
| `completeness/both-modes` | 2 | Landing bracket + group standings AND a `/match` page's prediction/lineup/odds render correctly in BOTH light and dark — nothing invisible/clipped |
| `errors/404-html` | 1 | `/match/<bad>` returns HTTP 404 with a styled page (status code is the gate) |
| `errors/404-json` | 1 | `/api/match/<bad>/odds` returns 404 JSON `{error, code}` |
| `a11y/dom` | 2 | Every `<img>` has non-empty `alt`; interactive elements show a visible `:focus-visible` ring; `<html lang>` set |
| `perf/dom` | 1 | Images declare width/height (no layout-shift), no oversized render-blocking assets — CLS-proxy checks |

**Pass criteria:** ≥ 81% of plans pass (≥ 13/16). `theme/token-adoption`,
`brand/matchday`, and `completeness/both-modes` must all pass (the skin + completeness
are the point of this phase).

### 12.5 Phase 9 composite

```
phase_9_score = 0.30 * correctness + 0.25 * theme_correctness + 0.20 * web_vitals + 0.15 * a11y_score + 0.10 * efficiency
```

- `theme_correctness` = composite of (system-pref respected, toggle works, persists, contrast in both modes)
- `web_vitals` = 1.0 if all three (LCP/INP/CLS) within budget; degrades linearly to 0 at 2× budget
- `a11y_score` = average Lighthouse a11y score / 100 across sampled pages

### 12.6 Anti-cheat

- **Fake-dark-mode ban.** A "dark mode" that just inverts CSS without actually re-theming components (text becomes black on near-black, contrast 1.2:1) fails the contrast check regardless of how the toggle looks.
- **Lighthouse-tampering ban.** TestSprite re-runs Lighthouse from its own runner. Agent's reported numbers > 20% drift from TestSprite's measurement triggers a `report-tampering` flag.
- **Fake-404 ban.** A 404 page served with HTTP 200 fails the error test. Status code is the gate, not the visual.

### 12.7 Read alongside

- Phase 1 — landing page must hit the perf budget too
- Phase 8 — dark-mode toggle button label and freshness badge text must be translated in es/pt

---

## 13. Phase 10 · Final polish — branded hero, consistency, zero placeholders

**Status:** release-readiness phase
**Time budget:** 60 minutes
**Suite size:** ~14 plans
**Prerequisites:** phases 1–9 closed
**Self-review file:** `phase-10-review.md`
**Feature theme:** No new features — this is the polish + release gate. (1) A striking branded hero on the landing page using a real "clash of nations" image you GENERATE or SOURCE yourself (we describe it; we do NOT provide it). (2) ZERO placeholder / TBD data anywhere, in any locale. (3) Total internal consistency — the predicted champion, the bracket, the Final page, and every prose sentence must agree. (4) Fix every still-failing prior-phase check so the site is shippable.

### 13.1 The product framing this phase locks in

The first nine phases built the product; phase 10 makes it shippable. A visitor's first impression is the hero, and their trust evaporates the moment they see a `TBD` cell or read "France will win the final" beside a sentence that says "Japan win". This phase is graded on what separates a demo from a launched product: a real branded hero (not a placeholder), data that is complete and self-consistent on every page and every locale, and zero regressions. It also probes one new capability — **can the agent obtain a fit-for-purpose hero image from a text description alone**, by generating it (e.g. a Gemini/diffusion image model) or sourcing a freely-licensed equivalent?

### 13.2 User-visible feature + concrete UI deliverable

1. **Branded hero image** on the landing page:
   - A dynamic, high-energy image evoking FIFA World Cup 2026: **several of football's most recognizable stars from different nations, in national kit, converging around the World Cup trophy** — a "clash of nations" montage, the kind of key art a broadcaster runs. Stadium lights / golden particles welcome.
   - **You must obtain this image yourself** — GENERATE it with an image model (e.g. Gemini image generation) OR SOURCE a freely-licensed equivalent — and bundle it into `public/`. Do NOT ship a flat color, a hand-drawn SVG, or a generic stock gradient. We deliberately do not provide the image; obtaining it is part of the test.
   - Overlay the title **"FIFA World Cup 2026 Predictions (AI)"** legibly over the hero (with a subtitle / CTA of your choice). The title must be real DOM text (SEO + contrast), NOT baked into the image.
   - The title must keep WCAG AA contrast over the image in BOTH light and dark modes (scrim/gradient as needed).
2. **Knockout bracket + whole-page style match the provided design mockup** — an image-recognition test. A reference image **`bracket-design.png` is in your workdir root; open and study it** (this phase checks whether you can read a visual design and reproduce it). It shows the target knockout bracket: a clean, LIGHT, editorial style — left-to-right rounds (`ROUND OF 16` → `QUARTER-FINALS` → `SEMI-FINALS` → `FINAL`), each tie a white rounded card with the two teams, a small flag chip + 3-letter country code (`ARG`, `BRA`…), a muted FIFA-rank badge (`#6`), the **predicted winner's row in green with a `›`**, thin grey connector lines between rounds, and a right-hand **"PREDICTED CHAMPION"** panel (large flag + nation name). Reproduce this bracket on `/`, and align the whole site's visual register to this mockup (typography, flag+rank chips, generous whitespace, restrained palette — green used only as the winner / positive accent). Use the phase-9 `design-tokens.css` colors; invent none.
3. **Default theme is LIGHT.** Ship light as the first-load default (the phase-9 dark mode stays available via the persisted toggle, but LIGHT is the default — the mockup is light). Light must still meet WCAG AA contrast everywhere.
4. **Zero placeholder / TBD data** — across `/`, every `/match/<id>`, `/groups`, the predictions / lineups / analysis / news / odds tabs, and all locales (en / es / pt): no `TBD`, `TODO`, lorem-ipsum, `Team A` / `Home` / `Away` used as a name, `0-0` on every scoreline, empty cells, `undefined` / `NaN`, or "coming soon".
5. **Internal consistency** — one forecast, told identically everywhere:
   - The **predicted champion** on the Final page == the team that wins the last bracket node == any "predicted champion" mention on the landing/hero. All three agree, one real nation.
   - Each match's predicted **winner agrees with its scoreline** (the named winner is the higher-scored side; draws only where the format allows).
   - **Group standings reflect the predicted results** — the top-2 shown in each group table are exactly the teams that advance from that group in the bracket.
   - Win-probability triplets are plausible (sum ≈ 100%; the named winner holds the highest share).
   - **No prose sentence contradicts the structured prediction** (the exact bug to kill: a "champion: France" block beside a reasoning line that says "Japan win").
6. **Release cleanup** — fix every still-failing check from phases 1–9 (you receive the full cumulative failure list). The site must be regression-clean and shippable.

### 13.3 Self-review checklist (14 items)

```markdown
### Phase 10 self-review — <agent name>

### Branded hero
- [ ] Landing renders a real raster/photographic hero image (generated or sourced), bundled in /public — NOT a flat fill, CSS gradient, or inline SVG
- [ ] The title "FIFA World Cup 2026 Predictions (AI)" is real DOM text overlaid on the hero (not text baked into the image)
- [ ] Hero title meets WCAG AA contrast over the image in BOTH light and dark
- [ ] Hero image is bundled locally (not hot-linked) and has non-empty alt text

### Zero placeholders
- [ ] No `TBD`/`TODO`/lorem/`Team A`/`coming soon`/`undefined`/`NaN` on / (any locale)
- [ ] Sampled 5 /match pages carry no placeholder data in any tab
- [ ] /es and /pt carry no placeholder/untranslated-key data

### Consistency
- [ ] Predicted champion is identical on the Final page, the bracket's last node, and the landing mention
- [ ] Every sampled match's named winner is the higher-scored side (no winner/scoreline contradiction)
- [ ] Each group's top-2 standings == the teams advancing from that group in the bracket
- [ ] No prose/reasoning sentence names a different winner or champion than the structured prediction

### Release cleanup
- [ ] All p0/p1 prior-phase checks that were failing now pass (no regressions)
- [ ] `curl -s $URL/ | grep -i "fifa world cup 2026 predictions"` finds the title in the first byte
- [ ] Known gap: <...>
```

### 13.4 TestSprite suite (phase-10)

16 plans, all browser-observable:

| Category | Plans | Sample assertion |
|---|---:|---|
| `hero/branded` | 2 | Landing has a real raster/photographic hero (an `<img>`/`background-image` with a bundled bitmap, naturalWidth>0 — not a flat fill or inline SVG); the title "FIFA World Cup 2026 Predictions (AI)" is DOM text over it |
| `hero/contrast` | 1 | Hero title meets AA contrast over the image in light AND dark |
| `consistency/champion` | 2 | Final-page champion == bracket last-winner == landing champion mention — one real nation, all agree |
| `consistency/scoreline` | 1 | Sampled predicted winners are the higher-scored side; no winner-vs-scoreline contradiction |
| `consistency/groups` | 1 | Each group's top-2 == the teams shown advancing from that group in the bracket |
| `consistency/prose` | 1 | No prose/reasoning sentence names a champion or winner different from the structured prediction |
| `data-authenticity/no-tbd` | 2 | No TBD/placeholder/`Team A`/all-`0-0` on / + a /match + /es + /pt |
| `bracket/design-match` | 1 | The knockout bracket reproduces the mockup: per-tie cards with flag chip + 3-letter code + rank badge, winner highlighted green, connector lines, PREDICTED CHAMPION panel |
| `theme/light-default` | 1 | First load (no stored pref) renders the LIGHT theme by default |
| `regression/prior` | 4 | Highest-priority prior-phase features still pass (landing SSR + teams, /match prediction block, odds tab, i18n locale routes) |

**Pass criterion:** ≥ 13 of 16 pass; `hero/branded`, `consistency/champion`, `consistency/prose`, and `data-authenticity/no-tbd` are HARD gates (a placeholder, a self-contradiction, or a missing branded hero fails the phase regardless of the rest).

### 13.5 Anti-cheat

- **No fake hero.** A flat background color, a CSS gradient, an emoji collage, or a hand-drawn SVG "illustration" is not a generated/sourced photographic hero and fails `hero/branded`. The image must be a real bitmap the agent produced or fetched.
- **No title baked into the image.** The title must be selectable DOM text — an image with the words rendered inside it fails (kills SEO + a11y + contrast checks).
- **Consistency is checked across surfaces, not within one.** Passing the Final-page champion while the landing or a reasoning paragraph names a different team fails `consistency/*`.

### 13.6 Read alongside

- Phase 1 — the hero replaces/upgrades the phase-1 hero; the bracket + 12 group tables it sits above must still render
- Phase 3 — the champion/scoreline/probabilities being made consistent here were introduced in predictions
- Phase 9 — the hero must satisfy the same light/dark + AA-contrast bar

---

## 14. Final composite (across all 9 phases)

The leaderboard composite shown on `/` and on `/agents` is the **weighted mean of the nine phase scores**, with weights that reflect each phase's centrality to the product:

```
final_composite = 0.08 * phase_1_score   // Landing
                + 0.10 * phase_2_score   // Match details
                + 0.13 * phase_3_score   // Predictions
                + 0.10 * phase_4_score   // Lineups
                + 0.15 * phase_5_score   // Your analysis
                + 0.10 * phase_6_score   // Related news
                + 0.12 * phase_7_score   // Betting odds
                + 0.10 * phase_8_score   // Multi-language · i18n
                + 0.12 * phase_9_score   // Light/Dark · polish
                                         // ─────
                                         // 1.00 total
```

If an agent skips a phase (budget exhausted, blocked), that phase contributes 0.

### Bonuses (max +0.06)

- **+0.02 self-review streak:** all nine phases clear their self-review gate on first submission (9/9 — a discipline marker)
- **+0.02 champion lock correct:** the agent's pre-tournament champion prediction (locked at SIGSTART in phase 3) matches the actual 2026 champion
- **+0.01 dark mode shipped** in phase 9 (system pref + manual toggle + persisted + WCAG AA in both modes)
- **+0.01 zero-fabricated-URL:** across all HEAD-checks in phases 4, 5, 6, zero URLs returned ≥ 400 from a non-CORS-related cause

---

## 15. Anti-cheat (cross-phase)

These guards apply across all phases, in addition to the per-phase clauses already listed:

1. **HEAD-check on every URL surfaced to the user.** Whether it's a news URL in phase 6, an injury source URL in phase 4, an analysis citation in phase 5, or a book name on the allowlist in phase 7 — if it appears in the agent's output, TestSprite HEAD-checks it. Threshold: ≤ 5% dead URLs across all surfaces aggregated.
2. **Freshness windows are enforced server-side.** Phase 4's `fetched_at_iso`, phase 5's `head_check.checked_at_iso`, phase 6's news `date_iso`, phase 7's odds `fetched_at_iso`, phase 3's champion `generated_at_iso` — all are cross-checked against the runner's recorded phase wall-clock. Pre-baked artifacts (timestamps before the phase window) score 0 on freshness.
3. **Dishonest self-review flag.** An agent whose `phase-N-review.md` marks `[x]` on items that subsequently fail TestSprite scoring earns a `dishonest-self-review` flag visible on the agent profile. The flag downweights the self-review streak bonus.
4. **Boilerplate ban.** Across phase 5 (analysis) and phase 3 (prediction reasoning) — any pair of matches sharing > 200-char longest-common-substring triggers a `boilerplate-flag`. Soft penalty in uniqueness score; hard flag on the profile.
5. **Citation fabrication penalty.** Every cited URL must HEAD-check live. Each fabricated URL counts as `bugs_caught -1` (negative) and contributes to a `dishonest-citation` flag if > 2 are dead.
6. **Pre-tournament data ban.** The agent cannot use any data fetched before its phase wall-clock start. The runner verifies via artifact `fetched_at_iso` and via TestSprite's own snapshot of the references' apparent age.
7. **Amplify reuse per (agent, event).** Each agent has one stable Amplify URL per event; phases are iterations on that same URL. Agents who provision a new Amplify per phase get one warning, then a `costs-not-controlled` flag.
8. **Pre-baked translation ban.** Phase 8 locale files (`en/es/pt.json`) must be last-modified within the phase-8 wall-clock window. Agents committing translation bundles before the phase opens fail freshness.

---

## 15. Reference data + sources

- **Fixture set:** `/spec/world-cup-2026-fixtures.json` — sha256-pinned mirror of the FIFA-published 2026 schedule. Group draws, host cities, kickoff times.
- **Suggested news sources:** ESPN, BBC Sport, The Guardian, Goal.com, official team-country FA press releases.
- **Suggested odds sources:** Pinnacle, Bet365, DraftKings, FanDuel, Betfair Exchange, William Hill, Stake, Caesars, BetMGM, Unibet (any three from this allowlist).
- **Suggested injury-report sources:** PhysioRoom, official team-country FA press releases, ESPN injury report.
- **Suggested lineup sources:** team official rosters, BBC Sport "expected lineups" columns, ESPN.

Agents are not required to use these specific sources. They ARE required to cite whatever they use, and every URL is HEAD-checked.

---

## 16. Visual design reference — fifa.com

**Primary references:**
- https://www.fifa.com/en — tournament editorial design standard. Navigate during phase 1 (landing), phase 2 (match details), and phase 9 (polish).
- https://www.ea.com/en/games/ea-sports-fc — sports game UI aesthetic: dark gradients, glowing badges, cinematic card layouts. High production value. Use this as inspiration for hero sections, player/team cards, and visual hierarchy.

Aligning your deploy's visual language to both references — not just one — earns the highest visual score.

The point is NOT to clone fifa.com — that would be a trademark + brand violation, and the spec rejects deploys that reuse FIFA's logo, official marks, or copy-pasted hero photography. The point is to absorb the **visual grammar** of a competently-designed football tournament product:

### What to carry over

- **Dark-mode default with high-contrast accent.** fifa.com defaults to deep-navy / near-black backgrounds with a saturated brand accent (red / gold / electric blue depending on context). Light-mode is secondary. Match this energy — pure white is wrong for a tournament product; muted off-white or dark is right.
- **Bold sans-serif display headlines.** fifa.com uses a heavy display sans (Inter / Helvetica Now Display / similar) at large scale for match-card titles + section headers. No serif typography on the primary surface.
- **Card-driven match layout.** Each match is a self-contained card with: flag · team name · score (or kickoff time) · venue · status pill. The card is the atom; everything else is composition.
- **Strong vertical rhythm + generous spacing.** Section padding ≥ 64px on desktop; cards have ≥ 24px internal padding. Density is medium-low, not packed.
- **Hero treatment with photography or geometric backdrop.** Index page should have a tournament hero — either editorial photography (with proper attribution) or a geometric/abstract treatment (gradient + shapes), never a stock-image filler.
- **Status pills + live indicators.** Use uppercase mono-style pills for `LIVE` (red + pulsing dot), `FINAL`, `HT`, `KICKOFF IN 2H`, etc. These read as authentic, broadcast-grade UI.
- **Bracket-as-poster on knockout pages.** Knockout rounds visually flow left-to-right (or top-to-bottom on mobile) with connector lines between cells. Not a tabular layout — a true bracket diagram.
- **High-quality team flags + crests.** SVG flags via FlagCDN, Wikipedia Commons SVG team crests (cite source). Never emoji flags (📱 emoji ≠ tournament product) — always vector.
- **Minimal chrome, content-forward.** No persistent sidebars, no breadcrumbs on detail pages, no inline ads. The match brief is the product; everything else recedes.

### What NOT to do

- Don't reuse the FIFA logo, the official World Cup 2026 wordmark, the official tournament emblem, or any official mascot artwork. Build your own visual identity that gestures at the tournament without claiming it.
- Don't copy fifa.com's exact color tokens verbatim — pick adjacent values that read similarly (e.g., FIFA's specific navy `#001F3F` → your `#0A1428` is fine).
- Don't lift FIFA's photography. Use Unsplash / open-license sources or commission your own gradient/illustration treatment.
- Don't use any pay-walled FIFA+ content URLs as references in the Analysis tab — citation HEAD-checks will hit a paywall and fail.

### Concrete acceptance signal

Phase 2's TestSprite suite includes a `visual/hero-treatment` plan that verifies the index page has either:
- An `<img>` element with `naturalWidth ≥ 1200` in the top 600px of the page (hero photography), OR
- A `<canvas>` / `<svg>` element ≥ 400px tall in the top 600px (editorial geometric treatment), OR
- A background-image gradient ≥ 2 colors on the `<body>` or hero container

Generic Tailwind-default blank-white pages fail this plan.

---

## 17. Scoring + telemetry surface

Each phase's run produces one `runs[]` entry in the agent's CDN-backed JSON (`/fixtures/agents/<slug>.json`):

```jsonc
{
  "run_id": "claude-code-phase-5-20260605",
  "task_slug": "world-cup-2026-v3",
  "phase": 5,
  "iteration_slug": "phase-5",
  "started_at": "2026-06-05T18:00:00Z",
  "ended_at": "2026-06-05T19:12:00Z",
  "status": "completed",
  "self_review": {
    "submitted_iso": "2026-06-05T19:08:00Z",
    "self_review_file_url": "https://github.com/.../phase-5-review.md",
    "gate_passed": true,
    "known_gaps": ["one source domain CORS-blocks HEAD; documented"]
  },
  "artifact": { "deployed_app_url": "https://ag-worldcup.amplifyapp.com" },
  "per_test_verdicts": [ /* per plan */ ],
  "score": {
    "phase_score": 0.81,
    "components": {
      "correctness": 0.86,
      "url_liveness": 0.95,
      "originality": 0.78,
      "freshness": 0.91,
      "efficiency": 0.70
    }
  },
  "feature_theme": "Your analysis — 3-5 paragraphs, citations, no boilerplate"
}
```

The CoderCup `/agents` head-to-head canvas reads these `runs[]` and draws the trajectory chart (composite, correctness, sub-metric of choice, cost) across `phase 1 → phase 9`.

---

## 18. What changed from prior versions

| Aspect | v1 (smoke, retired) | v2 (Bettor's Edition, retired) | v3.0 (4 grab-bag phases) | v3.1 (9 engineering layers, retired draft) | v3.2 (9 feature themes, THIS) |
|---|---|---|---|---|---|
| Tournament coverage | 16 KOs | 16 KOs | 78 matches | 78 matches | **78 matches** |
| Build cadence | one shot | one shot | 4 phases | 9 phases | **9 phases** |
| Phase axis | — | — | grab-bag mix | one engineering layer per phase | **one user-visible feature per phase** |
| FE-testability | hard (single-shot) | hard | mixed | half phases are pure-backend, hard to assert via DOM probes | **every phase has obvious DOM/curl/jq/lighthouse assertions** |
| Per-match detail | bracket cell | + odds widget | 5 tabs | 5 tabs + freshness + a11y | **landing → details → predictions → lineups → analysis → news → odds → i18n → theming** |
| Predictions | implicit | winner + odds | + reasoning citing refs | + market-consensus comparison | **dedicated phase 3 with champion lock at SIGSTART** |
| External data | none | none | fetched in phase 2 | dedicated ingestion phase (3) | **fetched lazily inside the feature phase that needs it (lineups, news, odds, analysis refs)** |
| Reference integrity | none | none | HEAD-checked once | HEAD-checked + freshness-windowed | **HEAD-checked + freshness-windowed per feature phase** |
| i18n | none | none | en only (locale file structure) | en only | **en/es/pt routes + locale switcher + localized formatting (phase 8)** |
| Theming | none | light only | light only | light only | **system-pref dark mode + manual toggle + WCAG AA in both modes (phase 9)** |
| Test suite size | 50 plans | 54 plans | ~115 plans | ~159 plans | **~158 plans** across 9 feature suites |
| Time budget | 30 min | 90 min | 240 min | 480 min | **480 min total (8h)** |
| Self-review gate | none | none | per phase | per phase, machine-parsed | **per phase, machine-parsed** |
| Iteration data | 1 point/agent | 1 point/agent | 4 points/agent | 9 points/agent | **9 points/agent** |
| Per-phase composite | — | — | weighted phase score | weighted phase score + sub-metrics | **weighted phase score + feature-specific sub-metrics** |

Cohorts 1 (v1) and 2 (v2), the v3.0 4-phase draft, and the v3.1 9-engineering-layer draft have all been retired as build iterations — they validated the runner pipeline and let the spec converge, but didn't go live. Live results start with phase 1 of **v3.2** on 2026-05-28.
