import { describe, expect, it } from 'vitest';
import { UsageMeter } from './usage-meter';

describe('UsageMeter', () => {
  it('records iterations cumulatively', () => {
    const m = new UsageMeter('claude-sonnet-4.7');
    m.recordIteration();
    m.recordIteration();
    m.recordIteration();
    expect(m.snapshot().iterations).toBe(3);
  });

  it('setTokens takes the maximum on monotonic CLI reports', () => {
    const m = new UsageMeter('claude-sonnet-4.7');
    m.setTokens(50_000, 20_000);
    m.setTokens(80_000, 30_000);
    m.setTokens(80_000, 28_000); // stale-lower output: ignored
    const snap = m.snapshot();
    expect(snap.promptTokens).toBe(80_000);
    expect(snap.completionTokens).toBe(30_000);
  });

  it('addTokens accumulates for the per-tool-call estimate path', () => {
    const m = new UsageMeter('claude-sonnet-4.7');
    m.addTokens(1000, 200);
    m.addTokens(500, 100);
    const snap = m.snapshot();
    expect(snap.promptTokens).toBe(1500);
    expect(snap.completionTokens).toBe(300);
  });

  it('snapshot.usdImputed comes from the rate card', () => {
    const m = new UsageMeter('claude-sonnet-4.7');
    m.setTokens(100_000, 50_000);
    // 100k * $0.000003 + 50k * $0.000015 = $1.05
    expect(m.snapshot().usdImputed).toBeCloseTo(1.05, 4);
  });
});
