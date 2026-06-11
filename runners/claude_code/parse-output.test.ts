import { describe, expect, it, vi } from 'vitest';
import type { LiveEvent } from '../contract/schema';
import { createParser } from './parse-output';

interface CapturedCallbacks {
  events: LiveEvent[];
  iterations: number;
  tokens: { prompt: number; completion: number };
}

function captureParser(model: string) {
  const captured: CapturedCallbacks = {
    events: [],
    iterations: 0,
    tokens: { prompt: 0, completion: 0 },
  };
  const handle = createParser(model, {
    onEvent: (e) => captured.events.push(e),
    recordIteration: () => (captured.iterations += 1),
    setTokens: (p, c) => (captured.tokens = { prompt: p, completion: c }),
  });
  return { handle, captured };
}

describe('createParser', () => {
  it('emits a session_start on the first line', () => {
    const { handle, captured } = captureParser('claude-sonnet-4.7');
    handle('hello there', 'stdout');
    expect(captured.events[0]).toEqual({
      kind: 'session_start',
      model_id: 'claude-sonnet-4.7',
    });
  });

  it('coalesces prose lines into one agent_message on blank-line flush', () => {
    const { handle, captured } = captureParser('claude-sonnet-4.7');
    handle('first line of an answer', 'stdout');
    handle('second line of the same answer', 'stdout');
    handle('', 'stdout'); // flush
    const messages = captured.events.filter((e) => e.kind === 'agent_message');
    expect(messages).toHaveLength(1);
    expect((messages[0] as Extract<LiveEvent, { kind: 'agent_message' }>).text).toContain(
      'first line',
    );
    expect((messages[0] as Extract<LiveEvent, { kind: 'agent_message' }>).text).toContain(
      'second line',
    );
  });

  it('extracts tool_call from stream-json assistant blocks', () => {
    const { handle, captured } = captureParser('claude-sonnet-4.7');
    const evt = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'I will edit the file.' },
          {
            type: 'tool_use',
            name: 'Edit',
            input: { path: 'app/api/predict/route.ts' },
          },
        ],
      },
    });
    handle(evt, 'stdout');
    const toolCalls = captured.events.filter((e) => e.kind === 'tool_call');
    expect(toolCalls).toHaveLength(1);
    expect((toolCalls[0] as Extract<LiveEvent, { kind: 'tool_call' }>).tool).toBe('Edit');
    expect(captured.iterations).toBe(1);
  });

  it('records token usage from stream-json usage blocks', () => {
    const { handle, captured } = captureParser('claude-sonnet-4.7');
    const evt = JSON.stringify({
      type: 'assistant',
      usage: { input_tokens: 45_000, output_tokens: 12_000 },
      message: { content: [{ type: 'text', text: 'final' }] },
    });
    handle(evt, 'stdout');
    expect(captured.tokens).toEqual({ prompt: 45_000, completion: 12_000 });
  });

  it('ignores malformed JSON-like lines and treats them as prose', () => {
    const { handle, captured } = captureParser('claude-sonnet-4.7');
    handle('{this is not actually json}', 'stdout');
    handle('', 'stdout');
    const messages = captured.events.filter((e) => e.kind === 'agent_message');
    expect(messages).toHaveLength(1);
    expect((messages[0] as Extract<LiveEvent, { kind: 'agent_message' }>).text).toContain(
      '{this is not actually json}',
    );
  });
});
