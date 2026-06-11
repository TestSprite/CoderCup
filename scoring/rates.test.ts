import { describe, expect, it } from 'vitest';
import { imputedCost, RATE_CARD } from './rates';

describe('imputedCost', () => {
  it('computes cost for Claude Sonnet 4.7 (100k in + 50k out)', () => {
    const { usd, was_unknown_model } = imputedCost(
      'claude-sonnet-4.7',
      100_000,
      50_000,
    );
    // 100k * $0.000003 + 50k * $0.000015 = $0.30 + $0.75 = $1.05
    expect(usd).toBeCloseTo(1.05, 4);
    expect(was_unknown_model).toBe(false);
  });

  it('returns conservative fallback for an unknown model_id', () => {
    const { usd, was_unknown_model, rate_used } = imputedCost(
      'unreleased-model-x',
      1000,
      500,
    );
    expect(was_unknown_model).toBe(true);
    expect(usd).toBeGreaterThan(0);
    expect(rate_used).toBe(RATE_CARD.unknown);
  });

  it('Gemini Flash is cheaper than Gemini Pro for the same input', () => {
    const flash = imputedCost('gemini-3.5-flash', 50_000, 25_000).usd;
    const pro = imputedCost('gemini-3-pro', 50_000, 25_000).usd;
    expect(flash).toBeLessThan(pro);
  });

  it('every published rate carries a recent last_verified_iso', () => {
    const now = Date.now();
    for (const [model_id, rate] of Object.entries(RATE_CARD)) {
      if (model_id === 'unknown') continue;
      const verified_at = new Date(rate.last_verified_iso).getTime();
      const days_old = (now - verified_at) / 86_400_000;
      expect(days_old).toBeLessThan(60);
    }
  });
});
