import { describe, expect, it } from 'vitest';
import { createBugDetector } from './bug-detector';

describe('createBugDetector', () => {
  it('returns null for short or empty text', () => {
    const d = createBugDetector();
    expect(d.observe('')).toBeNull();
    expect(d.observe('ok')).toBeNull();
    expect(d.observe('       ')).toBeNull();
    expect(d.count()).toBe(0);
  });

  it('catches a direct "found a bug" pattern and emits a bug_caught event', () => {
    const d = createBugDetector();
    const ev = d.observe('Found a bug in the fixtures parser — UTC vs local time mismatch.');
    expect(ev).not.toBeNull();
    expect(ev?.kind).toBe('bug_caught');
    expect(ev?.label).toMatch(/found-a-bug/);
    expect(ev?.excerpt).toContain('UTC vs local time');
    expect(d.count()).toBe(1);
  });

  it('catches "fixed the X regression" framing', () => {
    const d = createBugDetector();
    expect(d.observe('Fixed the stale-while-revalidate race in the SSR layer.')).not.toBeNull();
    expect(d.count()).toBe(1);
  });

  it('catches typed error signals (TypeError, off-by-one)', () => {
    const d = createBugDetector();
    expect(d.observe('Caught a TypeError in Bracket.tsx:42 when the away team is null.')).not.toBeNull();
    expect(d.observe('There was an off-by-one error in the bracket index lookup.')).not.toBeNull();
    expect(d.count()).toBe(2);
  });

  it('debounces consecutive mentions of the same bug', () => {
    const d = createBugDetector();
    const first = d.observe('Found a bug in the fixtures parser — UTC vs local time.');
    const second = d.observe('Found a bug in the fixtures parser — UTC vs local time. Will fix now.');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(d.count()).toBe(1);
  });

  it('counts two distinct bugs in two unrelated messages', () => {
    const d = createBugDetector();
    expect(d.observe('Caught a bug in the predict API: it 200s on unknown teams.')).not.toBeNull();
    expect(d.observe('Hit a null pointer in the OG image renderer.')).not.toBeNull();
    expect(d.count()).toBe(2);
  });

  it('does not false-positive on plain text without a trigger word', () => {
    const d = createBugDetector();
    expect(d.observe('Writing the bracket UI now. Will fetch the fixtures next.')).toBeNull();
    expect(d.observe('Reading the spec carefully so I get the time format right.')).toBeNull();
    expect(d.count()).toBe(0);
  });

  it('truncates excerpt to MAX_EXCERPT_CHARS', () => {
    const d = createBugDetector();
    const long = 'Found a bug: ' + 'x'.repeat(500);
    const ev = d.observe(long);
    expect(ev?.excerpt.length).toBeLessThanOrEqual(240);
  });

  it('reset() clears state', () => {
    const d = createBugDetector();
    d.observe('Found a bug in X.');
    expect(d.count()).toBe(1);
    d.reset();
    expect(d.count()).toBe(0);
    // After reset, the same message is treated as a fresh catch.
    expect(d.observe('Found a bug in X.')).not.toBeNull();
    expect(d.count()).toBe(1);
  });
});
