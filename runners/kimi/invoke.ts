/**
 * Spawns Moonshot's Kimi Code CLI in headless prompt mode against the
 * runner EC2's account-logged-in Allegretto subscription session (OAuth
 * persisted on the box; no env key).
 *
 * `kimi -p <prompt>` auto-approves tool calls; the assistant's prose goes
 * to stdout, thinking/tool progress to stderr. There is no structured
 * event stream and no token-usage trailer in either stream —
 * parse-output.ts treats stdout as the message body and the cost
 * pipeline imputes token volume from peer agents on the same phase
 * (see docs/cost-methodology.md).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { attach, type TimeBudgetHandle } from '../shared/time-budget';

const KIMI_BIN = process.env.KIMI_BIN ?? 'kimi';

export interface InvokeKimiOptions {
  workdir: string;
  promptFile: string;
  timeBudgetMinutes: number;
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
  env?: Record<string, string>;
}

export interface InvokeKimiResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  budgetExceeded: boolean;
  stdoutBuffered: string;
}

export async function invokeKimi(
  opts: InvokeKimiOptions,
): Promise<InvokeKimiResult> {
  const fs = await import('node:fs/promises');
  const prompt = await fs.readFile(opts.promptFile, 'utf8');

  const child: ChildProcess = spawn(KIMI_BIN, ['-p', prompt], {
    cwd: opts.workdir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
  });

  const handle: TimeBudgetHandle = attach(child, {
    budgetMinutes: opts.timeBudgetMinutes,
  });

  let stdoutBuffer = '';
  pipeLines(child, 'stdout', (line) => {
    stdoutBuffer += line + '\n';
    opts.onLine(line, 'stdout');
  });
  pipeLines(child, 'stderr', (line) => opts.onLine(line, 'stderr'));

  return new Promise<InvokeKimiResult>((resolve) => {
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
