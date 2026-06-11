/**
 * Rate card mapping driver_metadata.model_id -> per-token USD rate.
 *
 * Used by the score-runner Lambda (m2-2 piece-2) to compute `usd_imputed`
 * for the leaderboard's `efficiency` dimension. Imputed cost = uniform
 * yardstick across vendors with different billing models (subscription
 * vs API). See docs/codearena-v1/m2-2-scoring/piece-1-rate-card.md.
 *
 * Maintenance: re-verify rates monthly. Update `last_verified_iso` when
 * you confirm against the vendor's pricing page.
 */

export interface ModelRate {
  /** Per-token USD price for input (prompt) tokens. */
  input_usd_per_token: number;
  /** Per-token USD price for output (completion) tokens. */
  output_usd_per_token: number;
  /** When this rate was last verified against the vendor's pricing page. */
  last_verified_iso: string;
  /** URL where the rate was sourced from. */
  source_url: string;
}

/**
 * Source pages publish prices as "$X per million tokens" — divide by 1e6
 * to get the per-token figure. last_verified_iso records the day a human
 * (or this build agent) confirmed the rate against the vendor page.
 */
export const RATE_CARD: Record<string, ModelRate> = {
  // ----- Anthropic -----
  'claude-sonnet-4.7': {
    input_usd_per_token: 0.000003, // $3 / MTok
    output_usd_per_token: 0.000015, // $15 / MTok
    last_verified_iso: '2026-05-25',
    source_url: 'https://www.anthropic.com/pricing#api',
  },
  'claude-opus-4.7': {
    input_usd_per_token: 0.000015, // $15 / MTok
    output_usd_per_token: 0.000075, // $75 / MTok
    last_verified_iso: '2026-05-25',
    source_url: 'https://www.anthropic.com/pricing#api',
  },
  'claude-haiku-4.5': {
    input_usd_per_token: 0.0000008, // $0.80 / MTok
    output_usd_per_token: 0.000004, // $4 / MTok
    last_verified_iso: '2026-05-25',
    source_url: 'https://www.anthropic.com/pricing#api',
  },

  // ----- OpenAI -----
  'gpt-5-codex': {
    input_usd_per_token: 0.000005, // $5 / MTok
    output_usd_per_token: 0.00002, // $20 / MTok
    last_verified_iso: '2026-05-25',
    source_url: 'https://platform.openai.com/docs/pricing',
  },
  'gpt-5.5': {
    input_usd_per_token: 0.000005,
    output_usd_per_token: 0.000025,
    last_verified_iso: '2026-05-25',
    source_url: 'https://platform.openai.com/docs/pricing',
  },

  // ----- Google -----
  'gemini-3.5-flash': {
    input_usd_per_token: 0.0000003,
    output_usd_per_token: 0.0000015,
    last_verified_iso: '2026-05-25',
    source_url: 'https://cloud.google.com/vertex-ai/generative-ai/pricing',
  },
  'gemini-3-pro': {
    input_usd_per_token: 0.0000025,
    output_usd_per_token: 0.000012,
    last_verified_iso: '2026-05-25',
    source_url: 'https://cloud.google.com/vertex-ai/generative-ai/pricing',
  },

  // ----- Moonshot -----
  'kimi-k2.6': {
    input_usd_per_token: 0.00000095, // $0.95 / MTok
    output_usd_per_token: 0.000004, // $4 / MTok
    last_verified_iso: '2026-06-07',
    source_url: 'https://platform.moonshot.ai/docs/pricing',
  },

  // ----- Fallback for unrecognized model_ids -----
  // Intentionally on the conservative high end: an unknown model gets a
  // higher imputed cost, which biases its efficiency score DOWN slightly
  // and surfaces the missing rate as a signal to add it.
  unknown: {
    input_usd_per_token: 0.00001,
    output_usd_per_token: 0.00003,
    last_verified_iso: '2026-05-25',
    source_url: 'self-imputed conservative default',
  },
};

export interface ImputedCostResult {
  usd: number;
  rate_used: ModelRate;
  was_unknown_model: boolean;
}

export function imputedCost(
  model_id: string,
  prompt_tokens: number,
  completion_tokens: number,
): ImputedCostResult {
  const known = RATE_CARD[model_id];
  const rate = known ?? RATE_CARD['unknown'];
  const usd =
    rate.input_usd_per_token * prompt_tokens +
    rate.output_usd_per_token * completion_tokens;
  return {
    usd,
    rate_used: rate,
    was_unknown_model: !known,
  };
}
