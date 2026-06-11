import type {
  ScoreRow,
  LiveEvent,
  RunManifest,
} from '../../runners/contract/schema';

export type { ScoreRow, LiveEvent, RunManifest };

// In production the data lives on S3/CloudFront and is updated by the runner
// after each phase without requiring a git commit or Amplify redeploy.
// Locally (and in CI build previews) falls back to the committed /fixtures.
export const CDN_BASE =
  process.env.NEXT_PUBLIC_DATA_CDN_BASE ??
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://d3ckiyhxdozx1c.cloudfront.net/fixtures'
    : '/fixtures');

export interface LeaderboardRow {
  rank: number;
  agent_slug: string;
  agent_name: string;
  vendor: string;
  composite: number;
  components: ScoreRow['components'];
  side_metrics: ScoreRow['side_metrics'];
  official_run_id: string;
  deployed_app_url: string | null;
  detail_url: string;
  status?: 'completed' | 'DNF';
  /** ACM contest-score breakdown (per plan, across all phases). Optional —
   *  present once the leaderboard is scored with the ACM model. */
  acm_breakdown?: {
    first_try: number;
    solved_late: number;
    never_solved: number;
    regressions: number;
    total_plans: number;
  };
}

export interface LeaderboardJson {
  schema_version: '1' | '2';
  task_slug: string;
  task_name: string;
  last_updated_iso: string;
  rankings: LeaderboardRow[];
}

export interface RunSummary {
  run_id: string;
  task_slug: string;
  started_at: string;
  ended_at: string;
  status: RunManifest['status'];
  artifact: RunManifest['artifact'];
  driver_metadata: RunManifest['driver_metadata'];
  per_test_verdicts: Array<{
    test_id: string;
    name: string;
    verdict: 'passed' | 'failed' | 'inconclusive' | 'blocked';
    summary?: string;
    /** TestSprite-hosted run id; lets the FE link to the run viewer
     *  (https://testsprite.com/portal/.../runs/<id>) and resolve the
     *  artifact bundle (video.mp4 + screenshots + DOM diff). */
    testsprite_run_id?: string;
    /** Public URL of the captured run video (mp4). Populated by the
     *  artifact-pull pipeline; absent until then. */
    video_url?: string;
  }>;
  score: ScoreRow;
  transcript_inline?: string;
  transcript_truncated?: boolean;
}

export interface AgentJson {
  schema_version: '1';
  agent: {
    slug: string;
    name: string;
    vendor: string;
    driver_type: string;
    logo_url?: string;
    /** Optional — present on the World Cup cohort fixtures (added to
     *  surface vendor + model on /agents head-to-head + agent detail). */
    model_id?: string;
  };
  runs: RunSummary[];
}

// ─── Event schema (v2 — event-centric) ─────────────────────────────────────

export type EventState = 'planning' | 'dry-run' | 'live' | 'completed' | 'archived';

// One iteration of an event. An event has N iterations as the spec evolves
// and we re-run the same agent cohort.
export interface EventIteration {
  slug: string;                       // short slug within the event, e.g. "iteration-2"
  task_slug: string;                  // task spec version, e.g. "world-cup-2026-v2"
  display_name: string;
  state: EventState;
  starts_at_iso: string;
  ends_at_iso: string | null;
  participating_agents: string[];
}

// Event-level state distinct from iteration state. Used by /events catalog
// card grid + status strip + filter rail. iteration-level state stays the
// source of truth for /events/[slug] detail.
export type EventCatalogState = 'live' | 'active' | 'closed' | 'upcoming' | 'draft';
export type EventCategory = 'apps' | 'tools' | 'research';

// One Event = one topic / tournament. Holds 1..N iterations.
export interface Event {
  slug: string;
  display_name: string;
  ordinal: number;
  subtitle?: string;
  cover_image_url: string | null;
  iterations: EventIteration[];
  // Catalog fields — drive /events card grid, filter rail, status strip.
  category?: EventCategory;
  catalog_state?: EventCatalogState;
  card_title?: string;                  // shorter title for the card heading
  blurb?: string;                       // 1-2 sentence card description
  cohort_window_display?: string;       // "May 26 → Jul 19, 2026"
  agents_status_display?: string;       // "3 shipped · 4 pending"
  test_suite_display?: string;          // "world-cup-v1 · 50 plans"
  top_finisher?: {
    agent_slug: string;
    agent_name: string;
    composite: number;
  };
}

export interface EventsIndex {
  schema_version: '2';
  events: Event[];
}

// Legacy alias used widely in nav/footer/hero copy.
export interface EventSummary {
  event_slug: string;
  iteration_slug: string;
  task_slug: string;
  display_name: string;          // the full "Event #N · Topic · Iteration M" line
  event_display_name: string;    // just "Event #N · Topic"
  iteration_display_name: string;
  ordinal: number;
  iteration_number: number;
  state: EventState;
  starts_at_iso: string;
  ends_at_iso: string | null;
  participating_agents: string[];
  cover_image_url: string | null;
}

// Per-event detail file (under /events/<slug>/meta.json), still used by the
// per-event page. Kept simple — references the iterations from events.json.
export interface EventMeta extends Event {
  results_url: string;
  task_family_description?: string;
  iteration_metas?: Record<string, {
    spec_url: string;
    rubric_version: number;
    suite_version: number;
    cohort_description: string;
    live_url: string | null;
    state_history: Array<{
      state: EventState;
      transitioned_at_iso: string;
      by: string;
    }>;
  }>;
}

// ─── Live race-view payload (m4 piece-1) ──────────────────────────────────

export interface LiveRacePayload {
  schema_version: '1';
  event_slug: string;
  state: 'live';
  polled_at_iso: string;
  cohort_started_at_iso: string;
  time_budget_seconds: number;
  elapsed_seconds: number;
  agents: Array<{
    agent_slug: string;
    name: string;
    vendor: string;
    progress: number;
    composite_so_far: number;
    latest_action: string;
    file_count: number;
    cost_so_far_usd: number;
    leading: boolean;
  }>;
  recent_verdicts: Array<{
    timestamp_iso: string;
    agent_slug: string;
    test_id: string;
    verdict: 'passed' | 'failed' | 'inconclusive' | 'blocked';
    duration_seconds: number;
  }>;
}

// ─── Agent profile (multi-event aware; m3 piece-1) ───────────────────────

export type AgentStatus = 'pending' | 'ready' | 'competing' | 'idle' | 'archived';

export interface AgentEventEntry {
  event_slug: string;
  event_display_name: string;
  rank: number | null;
  composite: number | null;
  components: { correctness: number } | null;
  started_at_iso: string;
  duration_minutes: number;
  artifact_url: string | null;
  run_id: string;
  // Present on entries whose build completed but TestSprite hasn't graded yet,
  // or where the agent DNF'd entirely.
  verdicts_state?: 'pending' | 'done';
  status?: 'completed' | 'DNF';
  dnf_reason?: string;
}

export interface AgentProfile {
  schema_version: '1';
  agent: {
    slug: string;
    name: string;
    vendor: string;
    model_id: string;
    driver_type: string;
    status: AgentStatus;
    onboarded_at_iso: string;
    logo_url?: string;
  };
  career: {
    events_entered: number;
    lifetime_bugs_caught: number;
    lifetime_wall_clock_minutes: number;
    lifetime_imputed_usd: number;
  };
  events: AgentEventEntry[];
  latest_event_verdicts?: Array<{
    test_id: string;
    name: string;
    verdict: 'passed' | 'failed' | 'inconclusive' | 'blocked';
    category?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────

export async function fetchJson<T>(path: string): Promise<T> {
  const url = `${CDN_BASE}${path}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchJsonl<T>(path: string): Promise<T[]> {
  const url = `${CDN_BASE}${path}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const text = await res.text();
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((v): v is T => v !== null);
}
