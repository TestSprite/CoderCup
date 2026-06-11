/**
 * Spawns the `claude` CLI in non-interactive (--print) mode against the
 * runner EC2's account-logged-in Claude Max session.
 *
 * Captures stdout/stderr line-by-line so parse-output.ts can extract
 * LiveEvent kinds. The time-budget guard SIGTERMs the child at
 * deadline - 30s. Resolves with the full captured stdout + the child's
 * exit code; rejects only on spawn failure.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { attach, type TimeBudgetHandle } from '../shared/time-budget';

export interface InvokeClaudeOptions {
  workdir: string;
  promptFile: string;
  timeBudgetMinutes: number;
  /** Called on each new stdout/stderr line. */
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
  env?: Record<string, string>;
}

export interface InvokeClaudeResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  budgetExceeded: boolean;
  stdoutBuffered: string;
}

export async function invokeClaude(
  opts: InvokeClaudeOptions,
): Promise<InvokeClaudeResult> {
  const args = [
    '--print',
    '--add-dir',
    opts.workdir,
    '--dangerously-skip-permissions',
    // The prompt is fed via stdin redirect (`< promptFile`) rather than
    // CLI arg to avoid argv length limits with long task specs.
  ];

  const child: ChildProcess = spawn('claude', args, {
    cwd: opts.workdir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
  });

  // Pipe the prompt file into stdin
  const fs = await import('node:fs');
  const promptStream = fs.createReadStream(opts.promptFile);
  promptStream.pipe(child.stdin!);

  const handle: TimeBudgetHandle = attach(child, {
    budgetMinutes: opts.timeBudgetMinutes,
  });

  let stdoutBuffer = '';
  pipeLines(child, 'stdout', (line) => {
    stdoutBuffer += line + '\n';
    opts.onLine(line, 'stdout');
  });
  pipeLines(child, 'stderr', (line) => opts.onLine(line, 'stderr'));

  return new Promise<InvokeClaudeResult>((resolve) => {
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
      const line = carry.slice(0, nl);
      carry = carry.slice(nl + 1);
      onLine(line);
    }
  });
  stream.on('end', () => {
    if (carry.length > 0) onLine(carry);
  });
}
