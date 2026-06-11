import { describe, expect, it } from 'vitest';
import { createCodexParser } from './parse-output';
import type { LiveEvent } from '../contract/schema';

function feed(lines: string[]): {
  events: LiveEvent[];
  prompt: number;
  completion: number;
} {
  const events: LiveEvent[] = [];
  let prompt = 0;
  let completion = 0;
  const parser = createCodexParser({
    onEvent: (e) => events.push(e),
    setTokens: (p, c) => {
      prompt = p;
      completion = c;
    },
  });
  for (const line of lines) parser(line, 'stdout');
  return { events, prompt, completion };
}

describe('createCodexParser', () => {
  it('emits session_start with the prelude-declared model', () => {
    const { events } = feed([
      'OpenAI Codex v0.133.0',
      '--------',
      'workdir: /tmp/xyz',
      'model: gpt-5.5',
      'provider: openai',
      '--------',
      'user',
      'hi',
      'codex',
      'hello',
      'tokens used',
      '120',
    ]);
    expect(events[0]).toEqual({ kind: 'session_start', model_id: 'gpt-5.5' });
  });

  it('falls back to the default model id when the prelude omits one', () => {
    const { events } = feed([
      'OpenAI Codex v0.133.0',
      '--------',
      'workdir: /tmp/xyz',
      '--------',
      'user',
      'hi',
      'codex',
      'hello',
    ]);
    expect(events[0]).toEqual({ kind: 'session_start', model_id: 'gpt-5.5' });
  });

  it('captures the codex response block as a single agent_message', () => {
    const { events } = feed([
      'OpenAI Codex v0.133.0',
      '--------',
      'model: gpt-5.5',
      '--------',
      'user',
      'plan the build',
      'codex',
      'Step 1: scaffold.',
      'Step 2: write tests.',
      'tokens used',
      '50',
    ]);
    const messages = events.filter((e) => e.kind === 'agent_message');
    expect(messages).toHaveLength(1);
    const text = (messages[0] as Extract<LiveEvent, { kind: 'agent_message' }>).text;
    expect(text).toContain('Step 1: scaffold.');
    expect(text).toContain('Step 2: write tests.');
  });

  it('splits the total token count 60/40 prompt/completion', () => {
    const { prompt, completion } = feed([
      'OpenAI Codex v0.133.0',
      '--------',
      'model: gpt-5.5',
      '--------',
      'user',
      'q',
      'codex',
      'a',
      'tokens used',
      '1000',
    ]);
    expect(prompt).toBe(600);
    expect(completion).toBe(400);
    expect(prompt + completion).toBe(1000);
  });

  it('ignores invalid token count lines', () => {
    const { prompt, completion } = feed([
      'OpenAI Codex v0.133.0',
      '--------',
      'model: gpt-5.5',
      '--------',
      'user',
      'q',
      'codex',
      'a',
      'tokens used',
      'not-a-number',
    ]);
    expect(prompt).toBe(0);
    expect(completion).toBe(0);
  });

  it('drops empty codex blocks (no agent_message emitted)', () => {
    const { events } = feed([
      'OpenAI Codex v0.133.0',
      '--------',
      'model: gpt-5.5',
      '--------',
      'user',
      'q',
      'codex',
      'tokens used',
      '10',
    ]);
    const messages = events.filter((e) => e.kind === 'agent_message');
    expect(messages).toHaveLength(0);
  });
});
