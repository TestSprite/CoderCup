/**
 * Score computation. Given a RunManifest + a TestSprite verdict, produces
 * a ScoreRow using the locked 0.5/0.3/0.2 rubric (m2-2 piece-2 design).
 */
import { imputedCost } from '../rates';
import {
  SCORING_CALIBRATION,
  composite,
  clamp01,
} from '../../runners/contract/schema';
import type {
  RunManifest,
  ScoreRow,
} from '../../runners/contract/schema';
import type { TestSpriteVerdict } from './testsprite-client';

export interface ComputeScoreInput {
  manifest: RunManifest;
  verdict: TestSpriteVerdict;
  // For lifetime-bugs-caught - the caller queries DDB for prior runs first
  // and passes the sum; this function just composes it.
  lifetimeBugsBefore: number;
}

export function computeScore(input: ComputeScoreInput): ScoreRow {
  const { manifest, verdict, lifetimeBugsBefore } = input;
  const dm = manifest.driver_metadata;

  // Correctness from TestSprite suite pass rate. Per the scoring spec
  // (docs/codearena-v1/m2-2-scoring/piece-1-rate-card.md and the public
  // methodology section), inconclusive verdicts (timeout / blocked /
  // network blip) are excluded from the denominator — only definite
  // passed/failed count toward correctness. The previous implementation
  // used verdict.total (= passed+failed+inconclusive), which silently
  // penalised agents for upstream flakiness.
  const definite = verdict.passed + verdict.failed;
  const correctness =
    definite > 0 ? clamp01(verdict.passed / definite) : 0;

  // Bugs caught — surfaced + fixed by the agent during the run. Retained
  // as a raw side-metric (and rolled into `lifetime_bugs_caught`) but no
  // longer a component of the composite per the 2026-05-28 simplification:
  // the cohort runner doesn't reliably populate this field, so making it a
  // composite weight had the effect of silently zeroing 30% of the score.
  const bugsThisTask = dm.bugs_caught_this_task ?? 0;

  // Imputed cost from token count × public rate.
  const promptTokens = dm.prompt_tokens ?? 0;
  const completionTokens = dm.completion_tokens ?? 0;
  const { usd } = imputedCost(dm.model_id, promptTokens, completionTokens);

  // Manifests with non-completed status get correctness zeroed (we
  // couldn't measure it). Cost / wall-clock side-metrics still reflect
  // the spend up to the failure.
  const isCompleted = manifest.status === 'completed';
  const finalCorrectness = isCompleted ? correctness : 0;

  // Wall-clock minutes from manifest timestamps
  const wallClockMinutes = Math.max(
    1,
    Math.round(
      (new Date(manifest.ended_at).getTime() -
        new Date(manifest.started_at).getTime()) /
        60_000,
    ),
  );

  const finalComposite = composite(
    { correctness: finalCorrectness },
    wallClockMinutes,
    usd,
  );

  return {
    agent_slug: manifest.agent_slug,
    task_slug: manifest.task_slug,
    run_id: manifest.run_id,
    composite: finalComposite,
    components: {
      correctness: finalCorrectness,
    },
    side_metrics: {
      prediction_accuracy_at_t: 0,
      lifetime_bugs_caught: lifetimeBugsBefore + bugsThisTask,
      raw: {
        bugs_caught_this_task: bugsThisTask,
        usd_spent_this_task: Math.round(usd * 100) / 100,
        tokens_total: promptTokens + completionTokens,
        iterations: dm.tool_calls ?? 0,
        wall_clock_minutes: wallClockMinutes,
      },
    },
    computed_at: new Date().toISOString(),
  };
}

// Re-export for caller convenience
export { SCORING_CALIBRATION };
