// Smoke test of the WireEvent type contract. The sample event below is a
// literal copy of one of the events emitted by scripts/live-emit.sh — if
// either side drifts, this fails to type-check. Caller can also use the
// runtime `isValidWireEvent` guard but we want a compile-time fence too.

import { describe, it, expect } from 'vitest';
import { isValidWireEvent, type WireEvent } from './LiveClient';

describe('WireEvent type', () => {
  it('a sample event satisfies WireEvent at compile time', () => {
    const sample: WireEvent = {
      ts: '2026-05-28T08:25:38Z',
      agent: 'claude-code',
      phase: 1,
      type: 'start',
      target: 'phase-1 · routes',
      meta: 'elapsed 0:00',
    };
    expect(sample.agent).toBe('claude-code');
    expect(isValidWireEvent(sample)).toBe(true);
  });

  it('the WireAgent union accepts all 3 v1 agents', () => {
    const a: WireEvent = {
      ts: '2026-05-28T08:25:38Z',
      agent: 'antigravity',
      phase: 1,
      type: 'write',
      target: 'app/page.tsx',
      meta: '',
    };
    const b: WireEvent = { ...a, agent: 'codex' };
    const c: WireEvent = { ...a, agent: 'claude-code' };
    expect([a.agent, b.agent, c.agent]).toEqual([
      'antigravity',
      'codex',
      'claude-code',
    ]);
  });

  it('the EventType union accepts all 10 wire types', () => {
    const types: WireEvent['type'][] = [
      'start',
      'read',
      'write',
      'bash',
      'build',
      'deploy',
      'gate-pass',
      'gate-fail',
      'score',
      'ship',
    ];
    expect(types).toHaveLength(10);
  });
});
