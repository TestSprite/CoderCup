/**
 * Translate Antigravity (`agy`) CLI output into LiveEvent shapes.
 *
 * Antigravity v0.x (released 2026-05-19) is documented loosely. The
 * parser uses two strategies:
 *
 *   1. Lines that parse as JSON with a recognized shape -> structured
 *      events (tool_use, usage, model id).
 *   2. Otherwise prose coalescing into agent_message events (flushed
 *      on blank lines).
 *
 * Forward-compatible: as the CLI stabilizes (post-2026-06-18 Gemini CLI
 * deprecation), richer events can be wired up here without touching the
 * driver layer.
 */
import type { LiveEvent } from '../contract/schema';

export interface AgyParserCallbacks {
  onEvent: (event: LiveEvent) => void;
  recordIteration: () => void;
  setTokens: (prompt: number, completion: number) => void;
}

interface AgyStructuredEvent {
  type?: string;
  tool?: string;
  input?: Record<string, unknown>;
  text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    compute_units?: number;
  };
  model?: string;
  ok?: boolean;
  summary?: string;
}

export function createAgyParser(
  modelHint: string,
  callbacks: AgyParserCallbacks,
): (line: string, stream: 'stdout' | 'stderr') => void {
  let sessionStarted = false;
  let modelId = modelHint;
  let proseBuffer: string[] = [];

  function flushProse(): void {
    if (proseBuffer.length === 0) return;
    const text = proseBuffer.join('\n').trim();
    proseBuffer = [];
    if (text) {
      callbacks.onEvent({ kind: 'agent_message', text, truncated: false });
    }
  }

  return (line: string, _stream: 'stdout' | 'stderr'): void => {
    if (!sessionStarted) {
      sessionStarted = true;
      callbacks.onEvent({ kind: 'session_start', model_id: modelId });
    }

    const evt = tryJson(line);
    if (evt !== null) {
      flushProse();
      handleStructured(evt, callbacks, (newModel) => {
        modelId = newModel;
      });
      return;
    }

    if (line.trim() === '') {
      flushProse();
    } else {
      proseBuffer.push(line);
    }
  };
}

function tryJson(line: string): AgyStructuredEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    return JSON.parse(trimmed) as AgyStructuredEvent;
  } catch {
    return null;
  }
}

function handleStructured(
  evt: AgyStructuredEvent,
  cb: AgyParserCallbacks,
  setModel: (id: string) => void,
): void {
  if (evt.model && typeof evt.model === 'string') {
    setModel(evt.model);
  }

  if (evt.usage) {
    // Antigravity may report compute_units instead of raw tokens; if so
    // approximate via 5000 tokens/unit (m2-1 piece-4 design).
    const inputTokens =
      evt.usage.input_tokens ??
      (evt.usage.compute_units ? evt.usage.compute_units * 3000 : 0);
    const outputTokens =
      evt.usage.output_tokens ??
      (evt.usage.compute_units ? evt.usage.compute_units * 2000 : 0);
    cb.setTokens(inputTokens, outputTokens);
  }

  if (evt.type === 'tool_use' && evt.tool) {
    cb.recordIteration();
    cb.onEvent({
      kind: 'tool_call',
      tool: evt.tool,
      args: evt.input ?? {},
    });
    return;
  }

  if (evt.type === 'tool_result') {
    cb.onEvent({
      kind: 'tool_result',
      tool: evt.tool ?? 'unknown',
      ok: evt.ok !== false,
      summary: (evt.summary ?? evt.text ?? '').slice(0, 800),
    });
    return;
  }

  if (evt.type === 'message' && evt.text) {
    cb.onEvent({ kind: 'agent_message', text: evt.text, truncated: false });
    return;
  }
}
