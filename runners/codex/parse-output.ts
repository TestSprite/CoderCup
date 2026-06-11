/**
 * Translate Codex CLI v0.133.0 output into LiveEvent shapes.
 *
 * Codex's `exec --skip-git-repo-check <prompt>` emits a fixed prelude,
 * the prompt echo, then the `codex` block with the response, then a
 * `tokens used` line. The format is documented from a live invocation
 * (m2-0 piece-2 install session 2026-05-25):
 *
 *   OpenAI Codex v0.133.0
 *   --------
 *   workdir: ...
 *   model: gpt-5.5
 *   provider: openai
 *   approval: never
 *   sandbox: workspace-write [workdir, /tmp, $TMPDIR]
 *   reasoning effort: none
 *   reasoning summaries: none
 *   session id: <uuid>
 *   --------
 *   user
 *   <prompt>
 *   codex
 *   <response>
 *   tokens used
 *   <int>
 *
 * v1 doesn't try to extract granular tool-call events (Codex's --exec
 * mode bundles them into the response prose). Future Codex versions
 * with structured streaming would let us emit tool_call events here.
 */
import type { LiveEvent } from '../contract/schema';

export interface CodexParserCallbacks {
  onEvent: (event: LiveEvent) => void;
  setTokens: (prompt: number, completion: number) => void;
}

type Section = 'prelude' | 'user' | 'codex' | 'tokens' | 'done';

export function createCodexParser(
  callbacks: CodexParserCallbacks,
): (line: string, stream: 'stdout' | 'stderr') => void {
  let section: Section = 'prelude';
  let sessionStarted = false;
  let modelIdEmitted = false;
  let modelId = 'gpt-5.5';
  let codexBuffer: string[] = [];

  function flushCodex(): void {
    if (codexBuffer.length === 0) return;
    const text = codexBuffer.join('\n').trim();
    codexBuffer = [];
    if (!text) return;
    callbacks.onEvent({ kind: 'agent_message', text, truncated: false });
  }

  return (line: string, _stream: 'stdout' | 'stderr'): void => {
    if (!sessionStarted) {
      sessionStarted = true;
      callbacks.onEvent({ kind: 'session_start', model_id: modelId });
    }

    // Prelude: extract model and watch for the second `--------` boundary
    if (section === 'prelude') {
      if (!modelIdEmitted && line.startsWith('model:')) {
        const id = line.replace(/^model:\s*/, '').trim();
        if (id) {
          modelId = id;
          modelIdEmitted = true;
        }
      }
      if (line === 'user') {
        section = 'user';
      }
      return;
    }

    if (section === 'user') {
      // The user echo block runs until `codex` header on its own line
      if (line === 'codex') {
        section = 'codex';
      }
      return;
    }

    if (section === 'codex') {
      if (line === 'tokens used') {
        flushCodex();
        section = 'tokens';
        return;
      }
      codexBuffer.push(line);
      return;
    }

    if (section === 'tokens') {
      const n = Number(line.trim());
      if (Number.isFinite(n) && n > 0) {
        // Codex's "tokens used" is total; split estimate
        // (no per-direction breakdown in --exec). Conservative 60/40
        // input/output split based on observed runs.
        const promptEst = Math.round(n * 0.6);
        const completionEst = n - promptEst;
        callbacks.setTokens(promptEst, completionEst);
      }
      section = 'done';
      return;
    }
  };
}
