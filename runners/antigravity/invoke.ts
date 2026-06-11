/**
 * Spawns Google's `agy --print <prompt>` against the runner EC2's
 * account-logged-in Google AI Ultra session (m2-0 piece-2). Note: binary
 * name is `agy`, NOT `antigravity` (verified 2026-05-25).
 *
 * Antigravity CLI is brand-new (released 2026-05-19 at Google I/O); output
 * format is less stable than Claude/Codex. parse-output.ts tries
 * stream-json first, falls back to prose coalescing.
 *
 * Antigravity uses a compute-budget model (refreshes every 5h) rather
 * than per-token billing. Driver-side `usd_imputed` is computed via
 * scoring/rates.ts using the model_id reported by `agy` (typically
 * gemini-3.5-flash or gemini-3-pro).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { attach, type TimeBudgetHandle } from '../shared/time-budget';

export interface InvokeAgyOptions {
  workdir: string;
  promptFile: string;
  timeBudgetMinutes: number;
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
  env?: Record<string, string>;
}

export interface InvokeAgyResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  budgetExceeded: boolean;
  stdoutBuffered: string;
}

export async function invokeAgy(
  opts: InvokeAgyOptions,
): Promise<InvokeAgyResult> {
  // Warmup probe per piece-4 design - 30s timeout on a trivial prompt
  // to validate `agy` is on PATH + auth session is alive BEFORE
  // burning a 4h time budget.
  const warmupOk = await warmupProbe();
  if (!warmupOk) {
    return {
      exitCode: 127,
      signal: null,
      budgetExceeded: false,
      stdoutBuffered: 'WARMUP_PROBE_FAILED: agy not on PATH or not logged in',
    };
  }

  const fs = await import('node:fs/promises');
  const prompt = await fs.readFile(opts.promptFile, 'utf8');

  const child: ChildProcess = spawn(
    'agy',
    [
      '--print',
      '--add-dir',
      opts.workdir,
      '--dangerously-skip-permissions',
      prompt,
    ],
    {
      cwd: opts.workdir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...opts.env },
    },
  );

  const handle: TimeBudgetHandle = attach(child, {
    budgetMinutes: opts.timeBudgetMinutes,
  });

  let stdoutBuffer = '';
  pipeLines(child, 'stdout', (line) => {
    stdoutBuffer += line + '\n';
    opts.onLine(line, 'stdout');
  });
  pipeLines(child, 'stderr', (line) => opts.onLine(line, 'stderr'));

  return new Promise<InvokeAgyResult>((resolve) => {
    child.on('exit', (code, signal) => {
      handle.disarm();
      resolve({
        exitCode: code,
        signal,
        budgetExceeded: handle.exceeded(),
        stdoutBuffered: stdoutBuffer,
      });
    });
    child.on('error', () => {
      handle.disarm();
      resolve({
        exitCode: null,
        signal: null,
        budgetExceeded: handle.exceeded(),
        stdoutBuffered: stdoutBuffer,
      });
    });
  });
}

/**
 * 30-second warmup probe - validates `agy` is on PATH + auth works.
 * Resolves true if the probe returns a non-empty response within 30s.
 */
async function warmupProbe(): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn('agy', ['--print', 'reply with just the word pong'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let resolved = false;
    const settle = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* */
      }
      resolve(ok);
    };
    const timer = setTimeout(() => settle(false), 30_000);
    child.stdout?.on('data', (d) => {
      out += d.toString();
      if (out.length > 4) {
        clearTimeout(timer);
        settle(true);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      settle(code === 0 && out.length > 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      settle(false);
    });
  });
}

function pipeLines(
  child: ChildProcess,
  which: 'stdout' | 'stderr',
  onLine: (line: string) => void,
): void {
  const stream = which === 'stdout' ? child.stdout : child.stderr;
  if (!stream) return;
  let carry = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    carry += chunk;
    let nl: number;
    while ((nl = carry.indexOf('\n')) !== -1) {
      onLine(carry.slice(0, nl));
      carry = carry.slice(nl + 1);
    }
  });
  stream.on('end', () => {
    if (carry.length > 0) onLine(carry);
  });
}
