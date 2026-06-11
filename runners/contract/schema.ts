/**
 * Runner contract for CoderCup.
 *
 * Every agent driver — claude_code_session, codex_cli, vertex_gemini_api, and any
 * future entrants — consumes a TaskRunInput and produces a RunManifest. The
 * scoring pipeline reads manifests; it does not care which driver produced
 * them.
 *
 * Schemas are TypeScript-first; the JSON Schema mirrors at the bottom of this
 * file are what runners in other languages (or in a sandbox without the TS
 * toolchain) validate against.
 */

export type DriverId =
  | 'claude_code_session'
  | 'codex_cli'
  | 'antigravity_cli'
  | 'kimi_code_cli'
  | 'qwen_code_cli';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'time_budget_exceeded'
  | 'driver_crashed'
  | 'deliverable_invalid';

export interface TaskRunInput {
  run_id: string;
  agent_slug: string;
  task_slug: string;
  task_spec_url: string;
  time_budget_minutes: number;
  environment: {
    node_version: '20' | '22';
    allowed_network: string[];
    secrets: Record<string, string>;
  };
  deliverable: {
    type: 'deployed_web_app';
    must_expose: string[];
  };
}

export interface RunManifest {
  schema_version: '1';
  run_id: string;
  agent_slug: string;
  task_slug: string;
  started_at: string;
  ended_at: string;
  status: RunStatus;
  artifact: {
    repo_url: string;
    commit_sha: string;
    deployed_app_url: string;
  };
  logs_url: string;
  transcript_url: string;
  driver_metadata: {
    driver: DriverId;
    model_id: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    tool_calls?: number;
    /** Count of bugs the agent itself surfaced and fixed during the
     * run. Populated by the driver at session_end by counting the
     * `bug_caught` LiveEvents it emitted (heuristic pattern match on
     * agent_message text — see runners/shared/bug-detector.ts).
     *
     * Per the locked methodology (see docs/codearena-v1/m2-2-scoring
     * + scoring/score-runner/compute.ts): bugsToScore(n) =
     * clamp01(n / 20) — higher is better, capped at the calibration
     * ceiling. Catching zero bugs scores 0; catching 20+ scores 1. */
    bugs_caught_this_task?: number;
    notes?: string;
  };
}

export interface ScoreRow {
  agent_slug: string;
  task_slug: string;
  run_id: string;
  composite: number;
  /**
   * Score components in [0,1]. Simplified 2026-05-28 — dropped `bugs`
   * (cohort runner doesn't emit bug counts) and `efficiency` (was a
   * derived 0-1 score that was always 0 in practice). Wall-clock and
   * cost are now raw side-metrics (minutes / USD), not 0-1 components.
   * Composite collapses to correctness when wall-clock and cost are
   * not yet captured (current state).
   */
  components: {
    correctness: number;
  };
  side_metrics: {
    prediction_accuracy_at_t: number;
    lifetime_bugs_caught: number;
    raw: {
      bugs_caught_this_task: number;
      usd_spent_this_task: number;
      tokens_total: number;
      iterations: number;
      wall_clock_minutes: number;
    };
  };
  computed_at: string;
}

/**
 * Live JSONL event shapes. Drivers emit these via `runners/shared/live-stream.ts`
 * (m2-1 piece-5) into `s3://codearena-public-data/runs/<run-id>/live.jsonl`.
 * The score-runner Lambda (m2-2 piece-2) also appends `testsprite_probe_*`
 * events into the same stream — see m2-1 piece-5 design doc for the
 * "intersperse TestSprite" mechanic.
 *
 * Each event carries a `ts` ISO 8601 timestamp added by LiveStream.emit().
 * Any change to this union should also update LiveReplay's dispatch
 * (`app/components/LiveReplay.tsx`).
 */
export type LiveEvent =
  | { ts?: string; kind: 'session_start'; model_id: string }
  | { ts?: string; kind: 'agent_message'; text: string; truncated: boolean }
  | {
      ts?: string;
      kind: 'tool_call';
      tool: string;
      args: Record<string, unknown>;
    }
  | {
      ts?: string;
      kind: 'tool_result';
      tool: string;
      ok: boolean;
      summary: string;
    }
  | {
      ts?: string;
      kind: 'file_change';
      path: string;
      added: number;
      removed: number;
    }
  | { ts?: string; kind: 'deploy_started'; target: string; app_id: string }
  | { ts?: string; kind: 'deploy_complete'; url: string }
  | { ts?: string; kind: 'testsprite_probe_started'; test_id: string }
  | {
      ts?: string;
      kind: 'testsprite_probe_result';
      test_id: string;
      verdict: 'passed' | 'failed' | 'inconclusive';
      summary: string;
    }
  | {
      ts?: string;
      kind: 'bug_caught';
      /** Short label / id for the bug (e.g. "utc-vs-local-time"). Drivers
       * synthesize from the trigger message text. */
      label: string;
      /** Verbatim quote (truncated to 240 chars) of the agent message
       * that surfaced the bug, for the FE detail-page receipts. */
      excerpt: string;
    }
  | {
      ts?: string;
      kind: 'usage_snapshot';
      prompt_tokens: number;
      completion_tokens: number;
      iterations: number;
      usd_imputed: number;
    }
  | { ts?: string; kind: 'session_end'; tokens_used: number; reason: string };

/**
 * Composite formula (simplified 2026-05-28).
 *
 * The previous 0.5·correctness + 0.3·bugs + 0.2·efficiency blend
 * was retired because (a) the cohort runner never emitted real
 * bug counts (`bugs` was always 0), and (b) `efficiency` was a
 * 0-1 transform of imputed cost that was likewise always 0 with
 * the current driver telemetry. Two of three weights were
 * therefore silently zeroing out and the composite degenerated
 * to 0.5·correctness anyway — confusing rather than informative.
 *
 * The current shape is a weighted blend over correctness, a
 * wall-clock penalty, and a cost penalty. Wall-clock and cost
 * weights only apply when the corresponding telemetry is captured;
 * when both are null (Phase 1, current state) the composite
 * collapses to `correctness`.
 */
export const COMPOSITE_WEIGHTS = {
  correctness: 0.7,
  wall_clock: 0.15,
  cost: 0.15,
} as const;

export const SCORING_CALIBRATION = {
  /** Wall-clock minutes that maps to 0 on the wall-clock sub-score
   *  (longer runs penalised, capped). Per-phase budget upper bound. */
  max_wall_clock_minutes: 75,
  /** USD imputed cost that maps to 0 on the cost sub-score.
   *  Calibrated to ~twice the cheapest plausible 240-minute run. */
  max_usd_cost: 50,
} as const;

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function wallClockToScore(minutes: number): number {
  return clamp01(1 - minutes / SCORING_CALIBRATION.max_wall_clock_minutes);
}

export function costToScore(usd: number): number {
  return clamp01(1 - usd / SCORING_CALIBRATION.max_usd_cost);
}

/**
 * Compute the composite. `wall_clock_minutes` and `usd` are
 * optional — pass `null`/`undefined` (or 0) when telemetry is
 * unavailable, and that component is dropped from the weighted
 * blend so the remaining weights renormalise. When BOTH are
 * absent the composite equals correctness.
 */
export function composite(
  c: ScoreRow['components'],
  wall_clock_minutes?: number | null,
  usd?: number | null,
): number {
  const hasWall =
    typeof wall_clock_minutes === 'number' && wall_clock_minutes > 0;
  const hasCost = typeof usd === 'number' && usd > 0;

  let weightSum = COMPOSITE_WEIGHTS.correctness;
  let blended = c.correctness * COMPOSITE_WEIGHTS.correctness;
  if (hasWall) {
    blended += wallClockToScore(wall_clock_minutes!) * COMPOSITE_WEIGHTS.wall_clock;
    weightSum += COMPOSITE_WEIGHTS.wall_clock;
  }
  if (hasCost) {
    blended += costToScore(usd!) * COMPOSITE_WEIGHTS.cost;
    weightSum += COMPOSITE_WEIGHTS.cost;
  }
  return weightSum > 0 ? blended / weightSum : 0;
}

export const TASK_RUN_INPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'codearena.runner.input.v1',
  type: 'object',
  required: [
    'run_id',
    'agent_slug',
    'task_slug',
    'task_spec_url',
    'time_budget_minutes',
    'environment',
    'deliverable',
  ],
  properties: {
    run_id: { type: 'string', format: 'uuid' },
    agent_slug: { type: 'string' },
    task_slug: { type: 'string' },
    task_spec_url: { type: 'string', format: 'uri' },
    time_budget_minutes: { type: 'integer', minimum: 1 },
    environment: {
      type: 'object',
      required: ['node_version', 'allowed_network', 'secrets'],
      properties: {
        node_version: { type: 'string', enum: ['20', '22'] },
        allowed_network: { type: 'array', items: { type: 'string' } },
        secrets: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    deliverable: {
      type: 'object',
      required: ['type', 'must_expose'],
      properties: {
        type: { type: 'string', const: 'deployed_web_app' },
        must_expose: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

export const RUN_MANIFEST_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'codearena.runner.manifest.v1',
  type: 'object',
  required: [
    'schema_version',
    'run_id',
    'agent_slug',
    'task_slug',
    'started_at',
    'ended_at',
    'status',
    'artifact',
    'logs_url',
    'transcript_url',
    'driver_metadata',
  ],
  properties: {
    schema_version: { type: 'string', const: '1' },
    run_id: { type: 'string', format: 'uuid' },
    agent_slug: { type: 'string' },
    task_slug: { type: 'string' },
    started_at: { type: 'string', format: 'date-time' },
    ended_at: { type: 'string', format: 'date-time' },
    status: {
      type: 'string',
      enum: [
        'queued',
        'running',
        'completed',
        'time_budget_exceeded',
        'driver_crashed',
        'deliverable_invalid',
      ],
    },
    artifact: {
      type: 'object',
      required: ['repo_url', 'commit_sha', 'deployed_app_url'],
      properties: {
        repo_url: { type: 'string', format: 'uri' },
        commit_sha: { type: 'string' },
        deployed_app_url: { type: 'string', format: 'uri' },
      },
    },
    logs_url: { type: 'string' },
    transcript_url: { type: 'string' },
    driver_metadata: {
      type: 'object',
      required: ['driver', 'model_id'],
      properties: {
        driver: {
          type: 'string',
          enum: [
            'claude_code_session',
            'codex_cli',
            'antigravity_cli',
            'kimi_code_cli',
            'qwen_code_cli',
          ],
        },
        model_id: { type: 'string' },
        prompt_tokens: { type: 'integer', minimum: 0 },
        completion_tokens: { type: 'integer', minimum: 0 },
        tool_calls: { type: 'integer', minimum: 0 },
        notes: { type: 'string' },
      },
    },
  },
} as const;
