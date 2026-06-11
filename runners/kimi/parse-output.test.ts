import { describe, expect, it, vi } from 'vitest';
import { createKimiParser, KIMI_DEFAULT_MODEL } from './parse-output';
import type { LiveEvent } from '../contract/schema';

function collect() {
  const events: LiveEvent[] = [];
  const parser = createKimiParser({ onEvent: (e) => events.push(e) });
  return { events, parser };
}

describe('createKimiParser', () => {
  it('emits session_start once, on the first line of either stream', () => {
    const { events, parser } = collect();
    parser.parseLine('Reading the task spec…', 'stderr');
    parser.parseLine('Here is the plan.', 'stdout');
    const starts = events.filter((e) => e.kind === 'session_start');
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ model_id: KIMI_DEFAULT_MODEL });
  });

  it('buffers stdout into paragraph-sized agent_message events', () => {
    const { events, parser } = collect();
    parser.parseLine('First paragraph line one.', 'stdout');
    parser.parseLine('First paragraph line two.', 'stdout');
    parser.parseLine('', 'stdout');
    parser.parseLine('Second paragraph.', 'stdout');
    parser.flush();

    const messages = events.filter((e) => e.kind === 'agent_message');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      text: 'First paragraph line one.\nFirst paragraph line two.',
      truncated: false,
    });
    expect(messages[1]).toMatchObject({ text: 'Second paragraph.' });
  });

  it('ignores stderr content for events (thinking/tool progress noise)', () => {
    const { events, parser } = collect();
    parser.parseLine('[tool] write_file out/index.html', 'stderr');
    parser.parseLine('thinking…', 'stderr');
    parser.flush();
    expect(events.filter((e) => e.kind === 'agent_message')).toHaveLength(0);
  });

  it('flush() is idempotent and skips whitespace-only buffers', () => {
    const { events, parser } = collect();
    parser.parseLine('   ', 'stdout'); // whitespace-only line flushes nothing
    parser.flush();
    parser.flush();
    expect(events.filter((e) => e.kind === 'agent_message')).toHaveLength(0);
  });

  it('emits no token information (kimi exposes none; cost is imputed downstream)', () => {
    const { events, parser } = collect();
    parser.parseLine('Done.', 'stdout');
    parser.flush();
    expect(events.find((e) => e.kind === 'usage_snapshot')).toBeUndefined();
  });
});
