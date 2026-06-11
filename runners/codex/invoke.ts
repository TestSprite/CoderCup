/**
 * Spawns OpenAI's `codex exec --skip-git-repo-check <prompt>` against
 * the runner EC2's account-logged-in ChatGPT Pro session (m2-0 piece-2).
 *
 * Codex v0.133.0 emits a structured prelude + prose body + "tokens used"
 * trailer in --print/exec mode (no JSON event stream by default).
 * parse-output.ts handles the extraction. Codex's `-p` flag aliases
 * `--profile` (NOT --print), so we use the explicit `exec` subcommand.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { attach, type TimeBudgetHandle } from '../shared/time-budget';

export interface InvokeCodexOptions {
  workdir: string;
  promptFile: string;
  timeBudgetMinutes: number;
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
  env?: Record<string, string>;
}

export interface InvokeCodexResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  budgetExceeded: boolean;
  stdoutBuffered: string;
}

export async function invokeCodex(
  opts: InvokeCodexOptions,
): Promise<InvokeCodexResult> {
  const fs = await import('node:fs/promises');
  const prompt = await fs.readFile(opts.promptFile, 'utf8');

  const child: ChildProcess = spawn(
    'codex',
    ['exec', '--skip-git-repo-check', prompt],
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

  return new Promise<InvokeCodexResult>((resolve) => {
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
