# CoderCup cost methodology — the unified `tokens × rate` algorithm

**One algorithm for all three agents.** Every agent runs on a flat subscription
(Claude Max, ChatGPT/Codex, Google AI Ultra), so **none of them produces a real
per-run billed USD.** We therefore impute cost as a single uniform yardstick:

```
usd = input_tokens  × input_rate_per_token
    + output_tokens × output_rate_per_token
cost_score = clamp(1 − usd / 50, 0, 1)
composite  = 0.7·correctness + 0.15·wall_score + 0.15·cost_score
```

The method is identical for all three — **the only thing that differs is where
each agent's REAL token count comes from.** What must never happen: inventing the
token count. Measure it (or, for antigravity, derive it from a measured signal);
never pull a token volume out of thin air.

## Rate card (verified 2026-05-30 against vendor pricing pages, standard tier ≤200K ctx)

| model | input $/Mtok | output $/Mtok |
|---|---|---|
| `claude-opus-4-8` (Claude Code) | 5.00 | 25.00 |
| `gpt-5.5` (Codex) | 5.00 | 30.00 |
| `gemini-3.1-pro` (Anti-Gravity) | 2.00 | 12.00 |

Re-verify monthly; bump the rate card in both `scripts/run-agent-v3.sh` (the
`RATES` map in the cost-capture block) and `scripts/build-agent-fixtures.mjs`.

## Per-agent token source

### Claude Code — direct, real
`claude --print --output-format json` emits a final JSON envelope with
`usage{input_tokens, output_tokens, cache_creation_input_tokens,
cache_read_input_tokens}` (and a `total_cost_usd` we could also read directly).
We sum input + cache tokens as input, and `output_tokens` as output.
`token_source = claude-json-usage`.

### Codex — direct, real (total only)
`codex exec` prints `tokens used\n<int>` (cumulative total) to stdout/stderr.
No per-direction split in exec mode → split 60/40 input/output (observed
agentic-coding ratio). `token_source = codex-tokens-used-60-40`.

### Anti-Gravity (agy) — token count is NOT directly capturable; derive it
The agy CLI exposes no per-run token usage through any supported surface
(stdout prints prose only; local transcripts carry no `usageMetadata`; the
model call does not pass through a capturable HTTP proxy). agy runs on a flat
subscription (model `gemini-3.1-pro-high`), so there is no per-token USD by
design, and the vendor's quota signal is not consumable in a way we consider
in-bounds for a benchmark harness.

**Working method (always yields a number):** impute agy's token
volume from the **mean of the two peers' REAL measured tokens on the identical
phase task**, then apply the gemini rate. Grounded in real measurements (peer
tokens) + published rate — labeled `token_source = agy-imputed-from-peers`. This
is the honest stand-in until the quota read is unblocked.

## Phase 1–3 note
Those runs predate the instrumentation above — no tokens were captured for ANY
agent, so cost is a uniform `$0 gap → cost_score 1.0` for all three (fair, not a
per-agent advantage). Real cost differentiation begins at phase 4 with the
instrumented `run-agent-v3.sh`. Do not back-fill 1–3 cost with invented numbers.
