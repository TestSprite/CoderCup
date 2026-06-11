/**
 * Heuristic that scans an agent_message stream for "I caught a bug"
 * moments and tallies them for the manifest's driver_metadata
 * .bugs_caught_this_task field (see runners/contract/schema.ts).
 *
 * v1 is pure pattern-match: phrases like "found a bug", "caught a bug",
 * "fixing the X bug", "spotted an issue", "noticed a regression", etc.,
 * each count as one bug catch. Adjacent-message debounce de-duplicates
 * sequential mentions of the same fix.
 *
 * NOT a structured signal — the agent doesn't emit a typed "bug_caught"
 * event itself, so this is approximate. A v2 (when agents support
 * structured signals) lets the agent assert `bug_caught:LABEL` directly.
 * Until then, the heuristic is what populates the scoring input.
 *
 * Use:
 *   const detector = createBugDetector();
 *   for each agent_message event { const ev = detector.observe(text); if (ev) emit(ev); }
 *   const total = detector.count();
 *
 * The returned ev (if any) is a `bug_caught` LiveEvent ready to emit
 * onto live.jsonl. The detector's internal count is what the driver
 * writes to driver_metadata.bugs_caught_this_task at session_end.
 */
import type { LiveEvent } from '../contract/schema';

const PATTERNS: ReadonlyArray<RegExp> = [
  // Direct catches: "Found a bug", "caught the X issue", "spotted a race condition"
  /\b(?:found|caught|spotted|noticed|hit|surfaced|uncovered)\s+(?:an?\s+|the\s+)?(?:[a-z][a-z0-9'-]*\s+){0,4}(?:bug|issue|regression|defect|problem|race|leak|crash|panic|deadlock)\b/i,
  // Fix-in-progress / fix-just-happened framing
  /\b(?:fixing|fixed|patching|patched|resolving|resolved)\s+(?:an?\s+|the\s+)?(?:[a-z][a-z0-9'-]*\s+){0,4}(?:bug|issue|regression|defect|problem|race|leak|crash|panic|deadlock)\b/i,
  // "There's a bug in X" / "X has a bug"
  /\bthere'?s\s+an?\s+(?:bug|issue|regression|defect|problem)\b/i,
  /\bhas\s+an?\s+(?:bug|issue|regression|defect|problem)\b/i,
  // The classic "wait, X is wrong" self-correction
  /\b(?:wait|actually|hmm)[, ]+(?:[a-z']{1,8}\s+){0,4}(?:wrong|incorrect|broken|off|buggy)\b/i,
  // Typed error signals
  /\b(?:TypeError|ReferenceError|RangeError|null pointer|undefined behavior|NaN|off[- ]by[- ]one)\b/,
];

const DEBOUNCE_OVERLAP_CHARS = 40;
const MAX_EXCERPT_CHARS = 240;

export interface BugDetector {
  /**
   * Observe one agent_message text. Returns a `bug_caught` LiveEvent
   * if this is the first new bug catch since the last one (debounced
   * against the previous message's substring overlap); returns null
   * otherwise.
   */
  observe(text: string, ts?: string): Extract<LiveEvent, { kind: 'bug_caught' }> | null;
  /** Total bug catches since detector creation. */
  count(): number;
  /** Drop in-memory state; tests use this. */
  reset(): void;
}

export function createBugDetector(): BugDetector {
  let total = 0;
  let lastTriggerText: string | null = null;

  return {
    observe(text, ts) {
      if (!text) return null;
      const trimmed = text.trim();
      if (trimmed.length < 8) return null;

      let matched: RegExpMatchArray | null = null;
      for (const re of PATTERNS) {
        matched = trimmed.match(re);
        if (matched) break;
      }
      if (!matched) return null;

      // Debounce: if this trigger and the previous one share their
      // first DEBOUNCE_OVERLAP_CHARS character prefix, treat as the
      // same bug being re-mentioned (Claude tends to restate before
      // fixing).
      if (lastTriggerText) {
        const overlap = Math.min(
          DEBOUNCE_OVERLAP_CHARS,
          lastTriggerText.length,
          trimmed.length,
        );
        if (
          overlap > 0 &&
          lastTriggerText.slice(0, overlap) === trimmed.slice(0, overlap)
        ) {
          return null;
        }
      }
      lastTriggerText = trimmed;
      total += 1;

      const label = (matched[0] ?? 'bug')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      const excerpt = trimmed.slice(0, MAX_EXCERPT_CHARS);

      return {
        ts,
        kind: 'bug_caught',
        label: label || 'bug',
        excerpt,
      };
    },
    count() {
      return total;
    },
    reset() {
      total = 0;
      lastTriggerText = null;
    },
  };
}
