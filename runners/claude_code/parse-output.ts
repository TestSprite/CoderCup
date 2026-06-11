/**
 * Translate Claude Code CLI output lines into LiveEvent shapes.
 *
 * Claude Code --print mode emits plain text by default. Newer versions
 * support --output-format json (or stream-json) which surfaces structured
 * tool-call / tool-result events. This parser handles both:
 *
 *   1. If the line is valid JSON with a `type` field, treat it as a
 *      structured stream-json event and translate (richer extraction).
 *   2. Otherwise treat the line as opaque prose - aggregate into one
 *      agent_message event per heuristic boundary (blank lines).
 *
 * The richer JSON mode is preferred; the prose fallback ensures we still
 * emit at least one `agent_message` + a `session_end` even when the CLI
 * gives us text only.
 *
 * v1 limitations:
 *   - Tool call args are JSON-stringified blindly; LiveStream.sanitize
 *     handles truncation if they exceed 2 KB.
 *   - Token counts are extracted from `usage` blocks in stream-json events
 *     if present; otherwise rolled up at session_end via the UsageMeter's
 *     setTokens path.
 */
import type { LiveEvent } from '../contract/schema';

export interface ParserCallbacks {
  onEvent: (event: LiveEvent) => void;
  recordIteration: () => void;
  setTokens: (prompt: number, completion: number) => void;
}

interface StreamJsonEvent {
  type?: string;
  subtype?: string;
  message?: {
    role?: string;
    content?: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name: string; input: unknown }
    >;
  };
  usage?: { input_tokens?: number; output_tokens?: number };
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export function createParser(
  modelId: string,
  callbacks: ParserCallbacks,
): (line: string, stream: 'stdout' | 'stderr') => void {
  let sessionStarted = false;
  let sessionEnded = false;
  let proseBuffer: string[] = [];

  function flushProse(): void {
    if (proseBuffer.length === 0) return;
    const text = proseBuffer.join('\n').trim();
    proseBuffer = [];
    if (!text) return;
    callbacks.onEvent({ kind: 'agent_message', text, truncated: false });
  }

  return (line: string, _stream: 'stdout' | 'stderr'): void => {
    if (!sessionStarted) {
      sessionStarted = true;
      callbacks.onEvent({ kind: 'session_start', model_id: modelId });
    }

    // Try structured stream-json parse first.
    const evt = tryJson(line);
    if (evt !== null) {
      flushProse();
      handleStreamJson(evt, callbacks);
      return;
    }

    // Plain-prose fallback. Coalesce non-empty lines into a single
    // agent_message; flush on a blank line.
    if (line.trim() === '') {
      flushProse();
    } else {
      proseBuffer.push(line);
    }
  };

  // Note: callers should also invoke a final flush via the returned
  // function with an empty line at end-of-stream, OR explicitly call
  // sessionEnd() once invoke.ts resolves. driver.ts handles the latter.
}

function tryJson(line: string): StreamJsonEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    return JSON.parse(trimmed) as StreamJsonEvent;
  } catch {
    return null;
  }
}

function handleStreamJson(evt: StreamJsonEvent, cb: ParserCallbacks): void {
  // Token-usage events
  if (evt.usage) {
    cb.setTokens(evt.usage.input_tokens ?? 0, evt.usage.output_tokens ?? 0);
  }

  // Assistant content blocks
  if (evt.type === 'assistant' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === 'text') {
        cb.onEvent({
          kind: 'agent_message',
          text: block.text,
          truncated: false,
        });
      } else if (block.type === 'tool_use') {
        cb.recordIteration();
        cb.onEvent({
          kind: 'tool_call',
          tool: block.name,
          args:
            (block.input as Record<string, unknown> | undefined) ?? {},
        });
      }
    }
    return;
  }

  // Tool result event
  if (evt.type === 'user' && evt.tool_use_id) {
    cb.onEvent({
      kind: 'tool_result',
      tool: 'unknown', // Anthropic's stream-json doesn't always echo the tool name; we may need a tool_use_id -> name map
      ok: !evt.is_error,
      summary:
        typeof evt.content === 'string'
          ? evt.content.slice(0, 800)
          : JSON.stringify(evt.content).slice(0, 800),
    });
  }

  // Other event types (init, result) currently ignored - driver.ts emits
  // the canonical session_end after invoke completes.
}
