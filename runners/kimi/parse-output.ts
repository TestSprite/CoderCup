/**
 * Translate Kimi Code CLI `-p` (headless) output into LiveEvent shapes.
 *
 * Unlike Codex there is no structured prelude and no `tokens used`
 * trailer: stdout is the assistant's prose, stderr carries
 * thinking/tool-progress noise. We buffer stdout into paragraph-sized
 * `agent_message` events (flushed on blank lines) and ignore stderr for
 * event purposes. Kimi exposes NO token counts on any surface — the
 * driver leaves tokens at 0 and the scoring pipeline imputes cost from
 * peer token volume on the same phase (docs/cost-methodology.md), so
 * unlike the codex parser there is no setTokens callback here.
 */
import type { LiveEvent } from '../contract/schema';

export const KIMI_DEFAULT_MODEL = 'kimi-k2.6';

export interface KimiParserCallbacks {
  onEvent: (event: LiveEvent) => void;
}

export interface KimiParser {
  parseLine: (line: string, stream: 'stdout' | 'stderr') => void;
  /** Flush any buffered partial paragraph (call after the CLI exits). */
  flush: () => void;
}

export function createKimiParser(callbacks: KimiParserCallbacks): KimiParser {
  let sessionStarted = false;
  let buffer: string[] = [];

  function ensureSession(): void {
    if (sessionStarted) return;
    sessionStarted = true;
    callbacks.onEvent({ kind: 'session_start', model_id: KIMI_DEFAULT_MODEL });
  }

  function flush(): void {
    if (buffer.length === 0) return;
    const text = buffer.join('\n').trim();
    buffer = [];
    if (!text) return;
    callbacks.onEvent({ kind: 'agent_message', text, truncated: false });
  }

  return {
    parseLine(line: string, stream: 'stdout' | 'stderr'): void {
      ensureSession();
      if (stream === 'stderr') return; // progress noise, not message content
      if (line.trim() === '') {
        flush();
        return;
      }
      buffer.push(line);
    },
    flush,
  };
}
