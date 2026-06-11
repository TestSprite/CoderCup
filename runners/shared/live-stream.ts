/**
 * LiveStream - per-run JSONL emitter that mirrors a local append-only file
 * to s3://codearena-public-data-<account>/runs/<run-id>/live.jsonl every
 * `flush_interval_ms` (default 2000).
 *
 * Each agent driver (claude_code / codex / antigravity) instantiates one of
 * these at run start, calls .emit() on every event, and .close() at run end.
 * The scoring Lambda (m2-2 piece-2) also instantiates one against the same
 * S3 key to interleave testsprite_probe_* events with the agent's events on
 * a single timeline — this is the "穿插显示 testsprite" UX (m2-1 piece-5).
 *
 * Safety:
 * - Public bucket → every event passes through `sanitize()` first:
 *     • agent_message.text truncated to MAX_TEXT_BYTES (2KB)
 *     • tool_call.args JSON-serialized cap at MAX_ARGS_BYTES (2KB)
 *     • kind is allowlisted against the LiveEvent union (unknown → throw)
 * - Local file is the source of truth; S3 PUT is best-effort. Repeated PUT
 *   failures bump a CloudWatch metric but never block the agent.
 *
 * See docs/codearena-v1/m2-1-drivers/piece-5-live-jsonl-stream.md for the
 * design rationale (append-via-overwrite-PUT strategy, public-bucket
 * safety, polling-cost math).
 */
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { LiveEvent } from '../contract/schema';

const ALLOWED_KINDS = new Set<LiveEvent['kind']>([
  'session_start',
  'agent_message',
  'tool_call',
  'tool_result',
  'file_change',
  'deploy_started',
  'deploy_complete',
  'testsprite_probe_started',
  'testsprite_probe_result',
  'usage_snapshot',
  'bug_caught',
  'session_end',
]);

const MAX_TEXT_BYTES = 2 * 1024;
const MAX_ARGS_BYTES = 2 * 1024;
const MAX_SUMMARY_BYTES = 1 * 1024;
const DEFAULT_FLUSH_INTERVAL_MS = 2_000;

export interface LiveStreamOptions {
  runId: string;
  localPath: string;
  s3Bucket: string;
  s3Key: string;
  s3Client?: S3Client;
  flushIntervalMs?: number;
  region?: string;
}

export class LiveStream {
  private readonly runId: string;
  private readonly localPath: string;
  private readonly s3Bucket: string;
  private readonly s3Key: string;
  private readonly s3Client: S3Client;
  private readonly flushIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private dirtySinceLastFlush = false;
  private uploadFailures = 0;
  private closed = false;
  private initialized = false;

  constructor(opts: LiveStreamOptions) {
    this.runId = opts.runId;
    this.localPath = opts.localPath;
    this.s3Bucket = opts.s3Bucket;
    this.s3Key = opts.s3Key;
    this.s3Client =
      opts.s3Client ?? new S3Client({ region: opts.region ?? 'us-east-1' });
    this.flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }

  /**
   * Idempotent — first call schedules the background uploader; subsequent
   * calls noop. Drivers don't have to call this explicitly; emit() auto-inits.
   */
  async start(): Promise<void> {
    if (this.initialized) return;
    await mkdir(dirname(this.localPath), { recursive: true });
    this.timer = setInterval(
      () => void this.flushIfDirty(),
      this.flushIntervalMs,
    );
    this.initialized = true;
  }

  /**
   * Append one event to the local JSONL file. Synchronous-feeling for the
   * caller (the file write is buffered by node:fs but ordering is preserved
   * because we serialize via appendFile). Adds a `ts` field if absent.
   */
  async emit(event: LiveEvent): Promise<void> {
    if (this.closed)
      throw new Error('LiveStream.emit() called after close()');
    if (!this.initialized) await this.start();

    const sanitized = sanitize(event);
    const stamped = sanitized.ts
      ? sanitized
      : { ...sanitized, ts: new Date().toISOString() };

    const line = JSON.stringify(stamped) + '\n';
    await appendFile(this.localPath, line, 'utf8');
    this.dirtySinceLastFlush = true;
  }

  /**
   * Final flush + S3 PUT. Cleans up the background timer. Repeated close()
   * is safe — second call is a noop.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flushIfDirty(/* force */ true);
  }

  /**
   * Background-timer body. Reads the whole local file and PUTs it to S3,
   * overwriting any prior version. The append-via-overwrite-PUT pattern is
   * deliberate per piece-5 — S3 has no native append.
   */
  private async flushIfDirty(force = false): Promise<void> {
    if (!this.dirtySinceLastFlush && !force) return;
    try {
      await stat(this.localPath);
    } catch {
      // local file doesn't exist yet (no emits happened) — nothing to flush
      return;
    }

    try {
      const body = await readFile(this.localPath);
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: this.s3Key,
          Body: body,
          ContentType: 'application/jsonl',
          CacheControl: 'public, max-age=60, s-maxage=60',
        }),
      );
      this.dirtySinceLastFlush = false;
      this.uploadFailures = 0;
    } catch (err) {
      this.uploadFailures += 1;
      // Don't throw — uploader is best-effort; local file is source of truth.
      // Five consecutive failures = warrants CloudWatch alarm; the driver's
      // top-level metric publisher (m2-1 piece-2/3/4 driver glue) picks
      // uploadFailures up and emits CoderCup/Runner/LiveStreamUploadFailures.
      if (this.uploadFailures >= 5) {
        // eslint-disable-next-line no-console
        console.warn(
          `[live-stream] ${this.uploadFailures} consecutive S3 PUT failures for run ${this.runId}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Exposed for the driver glue to surface in CloudWatch metrics + final
   * manifest notes if uploads were degraded during the run.
   */
  get failureCount(): number {
    return this.uploadFailures;
  }
}

/**
 * Validate + truncate the event per the public-bucket safety policy. Throws
 * if the kind is not in the allowlist — drivers must NOT smuggle structured
 * data the user wasn't supposed to see into a world-readable bucket.
 */
/** Internal-but-exported for unit tests — this is the public-bucket
 * safety boundary; the test suite locks the truncation behaviors. */
export function sanitize(event: LiveEvent): LiveEvent {
  if (!ALLOWED_KINDS.has(event.kind)) {
    throw new Error(
      `LiveStream.emit() rejected unknown event kind: ${String((event as { kind?: string }).kind)}`,
    );
  }

  if (event.kind === 'agent_message') {
    return truncateText(event);
  }
  if (event.kind === 'tool_call') {
    return truncateArgs(event);
  }
  if (event.kind === 'tool_result') {
    return truncateToolResult(event);
  }
  if (event.kind === 'testsprite_probe_result') {
    return truncateProbeResult(event);
  }
  if (event.kind === 'bug_caught') {
    return truncateBugCaught(event);
  }
  return event;
}

function byteLen(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

function truncateText(
  e: Extract<LiveEvent, { kind: 'agent_message' }>,
): LiveEvent {
  if (byteLen(e.text) <= MAX_TEXT_BYTES) return e;
  let cut = MAX_TEXT_BYTES;
  while (cut > 0 && byteLen(e.text.slice(0, cut)) > MAX_TEXT_BYTES) cut -= 1;
  return { ...e, text: e.text.slice(0, cut), truncated: true };
}

function truncateArgs(
  e: Extract<LiveEvent, { kind: 'tool_call' }>,
): LiveEvent {
  const serialized = JSON.stringify(e.args);
  if (byteLen(serialized) <= MAX_ARGS_BYTES) return e;
  return {
    ...e,
    args: { _truncated: true, _preview: serialized.slice(0, MAX_ARGS_BYTES) },
  };
}

function truncateToolResult(
  e: Extract<LiveEvent, { kind: 'tool_result' }>,
): LiveEvent {
  if (byteLen(e.summary) <= MAX_SUMMARY_BYTES) return e;
  let cut = MAX_SUMMARY_BYTES;
  while (cut > 0 && byteLen(e.summary.slice(0, cut)) > MAX_SUMMARY_BYTES)
    cut -= 1;
  return { ...e, summary: e.summary.slice(0, cut) + '…' };
}

function truncateProbeResult(
  e: Extract<LiveEvent, { kind: 'testsprite_probe_result' }>,
): LiveEvent {
  if (byteLen(e.summary) <= MAX_SUMMARY_BYTES) return e;
  let cut = MAX_SUMMARY_BYTES;
  while (cut > 0 && byteLen(e.summary.slice(0, cut)) > MAX_SUMMARY_BYTES)
    cut -= 1;
  return { ...e, summary: e.summary.slice(0, cut) + '…' };
}

function truncateBugCaught(
  e: Extract<LiveEvent, { kind: 'bug_caught' }>,
): LiveEvent {
  // The bug-detector already caps excerpt at 240 chars but this is a
  // belt-and-suspenders guard against any future caller that bypasses it.
  if (byteLen(e.excerpt) <= MAX_SUMMARY_BYTES) return e;
  let cut = MAX_SUMMARY_BYTES;
  while (cut > 0 && byteLen(e.excerpt.slice(0, cut)) > MAX_SUMMARY_BYTES)
    cut -= 1;
  return { ...e, excerpt: e.excerpt.slice(0, cut) + '…' };
}
