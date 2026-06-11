/**
 * Time-budget guard for driver child processes. SIGTERM at
 * `budgetMinutes - graceSeconds`; SIGKILL at exactly `budgetMinutes`.
 *
 * Drivers call attach(child) once after spawn. The returned handle can be
 * disarm()ed when the child exits cleanly so we don't kill an already-dead
 * process.
 */
import type { ChildProcess } from 'node:child_process';

const DEFAULT_GRACE_SECONDS = 30;

export interface TimeBudgetHandle {
  /** Disarm before the budget triggers (e.g. when the agent finished early). */
  disarm: () => void;
  /** True iff SIGTERM has already fired (the budget was exceeded). */
  exceeded: () => boolean;
}

export interface TimeBudgetOptions {
  budgetMinutes: number;
  graceSeconds?: number;
}

export function attach(
  child: ChildProcess,
  opts: TimeBudgetOptions,
): TimeBudgetHandle {
  const grace = opts.graceSeconds ?? DEFAULT_GRACE_SECONDS;
  const budgetMs = opts.budgetMinutes * 60_000;
  let exceededFlag = false;
  let killed = false;

  const sigtermTimer = setTimeout(() => {
    if (killed) return;
    exceededFlag = true;
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }, Math.max(0, budgetMs - grace * 1000));

  const sigkillTimer = setTimeout(() => {
    if (killed) return;
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }, budgetMs);

  return {
    disarm: () => {
      killed = true;
      clearTimeout(sigtermTimer);
      clearTimeout(sigkillTimer);
    },
    exceeded: () => exceededFlag,
  };
}
