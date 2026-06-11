/**
 * Per-phase brief loader for World Cup 2026 v3.2.
 *
 * Extracts the brief for one phase (1..9) from the canonical spec markdown
 * at task-spec/world-cup-2026-v3.md. The spec layout is:
 *
 *   ## 4. Phase 1 · Landing page       ← phase 1 (heading "## 4.")
 *   ### 4.1 The product framing this phase locks in
 *   ### 4.2 User-visible feature + concrete UI deliverable
 *   ### 4.3 Self-review checklist (N items)
 *   ### 4.4 TestSprite suite (phase-1)
 *   ### 4.5 Phase 1 composite
 *   ### 4.6 Anti-cheat
 *   ### 4.7 Read alongside
 *
 *   ## 5. Phase 2 · Match details      ← phase 2 (heading "## 5.")
 *   ...
 *
 * Phase N has top-level heading `## (N+3). Phase N · <label>`. Subsections
 * use `### (N+3).<sub>` for the agent-facing fields. We slice from the
 * phase heading down to (but excluding) the next `## ` heading, then split
 * subsections by their `### N.<sub>` patterns.
 *
 * The fields we expose follow the spec's deliverable / self-review /
 * pass-criteria / anti-cheat split — the agent driver wraps these into its
 * prompt; the runner uses `selfReview` as the template the agent must copy
 * into phase-N-review.md.
 *
 * The runner's bash script (scripts/run-agent-v3.sh) does the equivalent
 * extraction in pure Python because it can't bring in a TS runtime cheaply.
 * This TS helper is the canonical reference; drivers calling out of the
 * Node side (e.g. claude_code/driver.ts, codex/driver.ts) use it directly.
 */
import { readFileSync } from 'node:fs';

export interface PhaseBrief {
  /** 1..9 */
  phase: number;
  /** Spec label, e.g. "Landing page", "Match details". */
  label: string;
  /** Per-spec time budget. NOTE: the runner caps at 60 min independently. */
  minutes: number;
  /** The §X.2 "User-visible feature + concrete UI deliverable" section. */
  deliverable: string;
  /** The §X.3 "Self-review checklist (N items)" template (markdown). */
  selfReview: string;
  /** The §X.5 "Phase N composite" formula + weights. */
  passCriteria: string;
  /** The §X.6 "Anti-cheat" clauses. */
  antiCheat: string;
}

/** Per-phase budget in minutes, from spec §3 (Phase loop, compressed reminder). */
const PHASE_BUDGETS: Record<number, number> = {
  1: 45,
  2: 45,
  3: 60,
  4: 45,
  5: 75,
  6: 45,
  7: 60,
  8: 60,
  9: 45,
};

/**
 * Load the brief for `phase` from the spec markdown at `specPath`.
 * Throws if the phase heading isn't found or required subsections are absent.
 */
export function loadPhaseBrief(phase: number, specPath: string): PhaseBrief {
  if (!Number.isInteger(phase) || phase < 1 || phase > 9) {
    throw new Error(
      `loadPhaseBrief: phase must be 1..9 (got ${String(phase)})`,
    );
  }

  const text = readFileSync(specPath, 'utf8');

  // -- 1. Slice the phase section out of the spec.
  // Match "## <num>. Phase <phase> · <label>"
  const phaseHeadingRe = new RegExp(
    `^## (\\d+)\\. Phase ${phase} · (.+)$`,
    'm',
  );
  const m = phaseHeadingRe.exec(text);
  if (!m) {
    throw new Error(
      `loadPhaseBrief: phase-${phase} heading not found in ${specPath}`,
    );
  }
  const sectionNumber = Number(m[1]); // e.g. 4 for phase 1
  const label = m[2].trim();
  const start = m.index;

  // Find the NEXT "## <n>. " heading — that's where this phase ends.
  // We search after the matched heading to avoid the heading itself.
  const tail = text.slice(m.index + m[0].length);
  const nextRe = /^## \d+\. /m;
  const nextMatch = nextRe.exec(tail);
  const sliceEnd =
    nextMatch !== null ? m.index + m[0].length + nextMatch.index : text.length;
  const section = text.slice(start, sliceEnd);

  // -- 2. Within the slice, extract the four numbered subsections.
  // §X.2 deliverable, §X.3 self-review, §X.5 pass-criteria, §X.6 anti-cheat.
  // Subsections are `### <sectionNumber>.<sub> <title>`.
  const deliverable = extractSubsection(section, sectionNumber, 2);
  const selfReview = extractSubsection(section, sectionNumber, 3);
  const passCriteria = extractSubsection(section, sectionNumber, 5);
  const antiCheat = extractSubsection(section, sectionNumber, 6);

  return {
    phase,
    label,
    minutes: PHASE_BUDGETS[phase],
    deliverable,
    selfReview,
    passCriteria,
    antiCheat,
  };
}

/**
 * Pull the contents of `### <sectionNumber>.<sub> ...` from `section`,
 * stopping at the next `### <sectionNumber>.<sub+1> ...` (or the next
 * `## ` top-level heading). The returned string starts with the heading
 * line itself (so callers can preserve it in the prompt) and ends without
 * a trailing newline.
 *
 * Returns an empty string if the subsection isn't present — some phases
 * skip §X.5 or §X.6, and callers shouldn't crash on that.
 */
function extractSubsection(
  section: string,
  sectionNumber: number,
  sub: number,
): string {
  const startRe = new RegExp(`^### ${sectionNumber}\\.${sub} .+$`, 'm');
  const startMatch = startRe.exec(section);
  if (!startMatch) return '';
  const startIdx = startMatch.index;

  // Find the next `### <sectionNumber>.<n>` for any n > sub, or the next `## `.
  // The simplest correct match: any `### <sectionNumber>.<digit>` AFTER our
  // start, OR any `## ` AFTER our start.
  const afterStart = section.slice(startIdx + startMatch[0].length);
  const nextSubRe = new RegExp(`^### ${sectionNumber}\\.\\d+ `, 'm');
  const nextTopRe = /^## \d+\. /m;

  let endRel = afterStart.length;
  const nextSub = nextSubRe.exec(afterStart);
  const nextTop = nextTopRe.exec(afterStart);
  if (nextSub !== null && nextSub.index < endRel) endRel = nextSub.index;
  if (nextTop !== null && nextTop.index < endRel) endRel = nextTop.index;

  const slice = afterStart.slice(0, endRel);
  return (startMatch[0] + slice).trimEnd();
}
