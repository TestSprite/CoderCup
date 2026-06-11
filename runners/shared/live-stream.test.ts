import { describe, expect, it } from 'vitest';
import { sanitize } from './live-stream';
import type { LiveEvent } from '../contract/schema';

describe('sanitize', () => {
  it('throws on unknown event kinds (allowlist guard)', () => {
    const bad = { kind: 'rogue_kind', payload: 'arbitrary' } as unknown as LiveEvent;
    expect(() => sanitize(bad)).toThrow(/rejected unknown event kind/);
  });

  it('passes through session_start unchanged', () => {
    const e: LiveEvent = { kind: 'session_start', model_id: 'sonnet-4-5' };
    expect(sanitize(e)).toEqual(e);
  });

  it('truncates agent_message.text past MAX_TEXT_BYTES (2KB)', () => {
    const giant = 'A'.repeat(5000);
    const e: LiveEvent = { kind: 'agent_message', text: giant, truncated: false };
    const out = sanitize(e) as Extract<LiveEvent, { kind: 'agent_message' }>;
    expect(out.text.length).toBeLessThanOrEqual(2048);
    expect(out.truncated).toBe(true);
  });

  it('leaves agent_message under the cap untouched (truncated stays false)', () => {
    const e: LiveEvent = { kind: 'agent_message', text: 'short note', truncated: false };
    const out = sanitize(e) as Extract<LiveEvent, { kind: 'agent_message' }>;
    expect(out.text).toBe('short note');
    expect(out.truncated).toBe(false);
  });

  it('replaces tool_call.args with a preview blob when JSON exceeds MAX_ARGS_BYTES', () => {
    const huge = { blob: 'B'.repeat(3000) };
    const e: LiveEvent = { kind: 'tool_call', tool: 'write', args: huge };
    const out = sanitize(e) as Extract<LiveEvent, { kind: 'tool_call' }>;
    expect(out.args._truncated).toBe(true);
    expect(typeof out.args._preview).toBe('string');
  });

  it('truncates tool_result.summary with an elision marker', () => {
    const long = 'X'.repeat(2000);
    const e: LiveEvent = {
      kind: 'tool_result',
      tool: 'shell',
      ok: false,
      summary: long,
    };
    const out = sanitize(e) as Extract<LiveEvent, { kind: 'tool_result' }>;
    expect(out.summary.length).toBeLessThan(long.length);
    expect(out.summary.endsWith('…')).toBe(true);
  });

  it('truncates bug_caught.excerpt past MAX_SUMMARY_BYTES', () => {
    const long = 'C'.repeat(2000);
    const e: LiveEvent = {
      kind: 'bug_caught',
      label: 'leak',
      excerpt: long,
    };
    const out = sanitize(e) as Extract<LiveEvent, { kind: 'bug_caught' }>;
    expect(out.excerpt.length).toBeLessThan(long.length);
    expect(out.excerpt.endsWith('…')).toBe(true);
    expect(out.label).toBe('leak'); // label NOT touched
  });

  it('preserves bug_caught.excerpt under the cap untouched (no elision marker)', () => {
    const e: LiveEvent = {
      kind: 'bug_caught',
      label: 'utc-vs-local',
      excerpt: 'Caught a UTC vs local time mismatch in lib/fixtures.ts',
    };
    const out = sanitize(e) as Extract<LiveEvent, { kind: 'bug_caught' }>;
    expect(out.excerpt).toBe('Caught a UTC vs local time mismatch in lib/fixtures.ts');
    expect(out.excerpt.endsWith('…')).toBe(false);
  });

  it('truncates testsprite_probe_result.summary identically to tool_result', () => {
    const long = 'D'.repeat(2000);
    const e: LiveEvent = {
      kind: 'testsprite_probe_result',
      test_id: 't-001',
      verdict: 'failed',
      summary: long,
    };
    const out = sanitize(e) as Extract<LiveEvent, { kind: 'testsprite_probe_result' }>;
    expect(out.summary.endsWith('…')).toBe(true);
  });
});
