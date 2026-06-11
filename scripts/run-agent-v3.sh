#!/usr/bin/env bash
# run-agent-v3.sh — phase-aware agent runner for World Cup 2026 v3.2.
#
# Drives ONE agent through ONE phase of the v3 multi-phase event:
#   1. Resolve phase brief (label, budget, suite path) from a lookup table.
#   2. Spawn the agent CLI in --print mode against a per-phase workdir
#      with a 60min HARD wall-clock cap (SIGTERM at deadline-30s,
#      SIGKILL at deadline). The hard cap is independent of the
#      per-phase budget in the spec — P5 wants 75min, P3/P7/P8 want
#      60min, P1/P2/P4/P6/P9 want 45min, but the runner currently
#      caps all phases at 60min wall clock. Longer-budget phases will
#      need a future runner-level override; this script does NOT honor
#      them yet.
#   3. After CLI returns, check for phase-N-review.md in repo root.
#      Missing file → status=self_review_missing, skip scoring.
#   4. Parse the review checklist with a regex. Any unchecked item
#      WITHOUT a "Known gap:" suffix fails the self-review gate.
#      Failed gate → status=self_review_failed, skip scoring.
#   5. If self-review passes, deploy workdir/out to per-(agent, event)
#      Amplify app (reused across phases — NOT per-run). Resolve
#      app_id from public/fixtures/agents/<slug>.json .amplify_app.app_id.
#      Null → create app + write back. Non-null → reuse.
#   6. Score with TestSprite against the per-phase suite under
#      tests/world-cup-2026-v3/phase-<N>/. Aggregate verdicts.
#   7. Write manifest to s3://codearena-runs/runs/<run-id>/manifest.json
#      with phase + self_review + per_test_verdicts blocks.
#
# Usage:
#   ./scripts/run-agent-v3.sh <agent-slug> <phase-number>
#
# Example:
#   ./scripts/run-agent-v3.sh claude-code 1
#   ./scripts/run-agent-v3.sh codex 5
#
# Pre-reqs:
#   - Run from the runner EC2 (CLIs logged in there)
#   - Repo cloned to /home/ec2-user/CoderCup (or current cwd if local)
#   - jq + python3 + aws cli + zip on PATH
#   - testsprite CLI on PATH (for scoring step)
#
# Outputs:
#   /tmp/codearena-runs/<run-id>.log            (full stdout/stderr tee)
#   s3://codearena-public-data/runs/<run-id>/console.log  (mirrored)
#   s3://codearena-runs/runs/<run-id>/manifest.json       (manifest)
#
# Exit codes:
#   0   success (manifest written, regardless of scoring verdict)
#   1   bad args
#   2   missing pre-req (jq, python3, agent CLI)
#   3   unrecoverable infra error (e.g. AWS auth)

set -euo pipefail

# -----------------------------------------------------------------------------
# 0. Arg parsing + validation
# -----------------------------------------------------------------------------

AGENT_SLUG="${1:-}"
PHASE_N="${2:-}"

if [ -z "${AGENT_SLUG}" ] || [ -z "${PHASE_N}" ]; then
  echo "Usage: $0 <agent-slug> <phase-number>"
  echo "  <agent-slug>   ∈ {claude-code, codex, antigravity, qwen}"
  echo "  <phase-number> ∈ {1..10}"
  exit 1
fi

case "${AGENT_SLUG}" in
  claude-code|codex|antigravity|qwen|deepseek|kimi) ;;
  *)
    echo "ERROR: unknown agent slug '${AGENT_SLUG}'. Expected: claude-code, codex, antigravity, qwen, deepseek, kimi."
    exit 1
    ;;
esac

if ! [[ "${PHASE_N}" =~ ^([1-9]|10)$ ]]; then
  echo "ERROR: phase-number must be an integer 1..10 (got '${PHASE_N}')."
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. Phase metadata lookup
# -----------------------------------------------------------------------------
# Per task-spec/world-cup-2026-v3.md §3 (Phase loop, compressed reminder).
# Budgets are the SPEC budget; the runner currently caps all at HARD_CAP_MIN
# below (60 min). The spec-budget value is propagated to the agent INPUT.json
# so the agent knows the design-intended budget; the runner still kills early.
declare -A PHASE_BUDGETS=(
  [1]=45 [2]=45 [3]=60 [4]=45 [5]=75 [6]=45 [7]=60 [8]=60 [9]=45 [10]=60
)
declare -A PHASE_LABELS=(
  [1]="Landing page"
  [2]="Match details"
  [3]="Predictions"
  [4]="Lineups"
  [5]="Your analysis"
  [6]="Related news"
  [7]="Betting odds"
  [8]="Multi-language · i18n"
  [9]="Light/Dark · polish"
  [10]="Final polish · release"
)

PHASE_BUDGET="${PHASE_BUDGETS[${PHASE_N}]}"
PHASE_LABEL="${PHASE_LABELS[${PHASE_N}]}"

# HARD wall-clock cap, independent of the spec-budget. v3.2 has phases up to
# 75min but the runner doesn't honor that yet — see banner above. We'll lift
# this once we add per-phase override support to the runner.
HARD_CAP_MIN=60
HARD_CAP_SEC=$((HARD_CAP_MIN * 60))
GRACE_SEC=30  # SIGTERM at HARD_CAP - 30s; SIGKILL at HARD_CAP

# -----------------------------------------------------------------------------
# 2. Run identifiers + paths
# -----------------------------------------------------------------------------

TS="$(date -u +%Y%m%d-%H%M%S)"
RUN_ID="${AGENT_SLUG}-phase${PHASE_N}-${TS}"
TASK_SLUG="world-cup-2026-v3"
EVENT_SLUG="world-cup-2026"  # canonical event (drives Amplify reuse key)

# Resolve repo root: cwd of this script if invoked locally, /home/ec2-user/CoderCup on EC2.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Per-run scratch dir on the runner host
RUN_DIR="/tmp/codearena-runs/${RUN_ID}"
WORKDIR="${RUN_DIR}/workdir"
LOG="${RUN_DIR}/console.log"

mkdir -p "${WORKDIR}" "${RUN_DIR}"

# -----------------------------------------------------------------------------
# AWS / infra constants
# -----------------------------------------------------------------------------
# Defined HERE, before the workdir-seed block below references ${ACCOUNT_ID}
# and ${REGION}. Moving these later (their old home was §3) reintroduces the
# `run-agent-v3.sh: line N: ACCOUNT_ID: unbound variable` crash under `set -u`,
# which silently skips workdir seeding. Keep them above the seed block.
ACCOUNT_ID="${ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
export ACCOUNT_ID
REGION="us-east-1"
RUNS_BUCKET="codearena-runs-${ACCOUNT_ID}"
PUBLIC_BUCKET="codearena-public-data-${ACCOUNT_ID}"
DDB_TABLE="codearena-main"
SCORE_LAMBDA="codearena-score-runner"

# Tee everything from here on into LOG. The /live page on the FE
# tails this via the periodic S3 rsync below.
exec > >(tee -a "${LOG}") 2>&1

# ── Seed workdir from previous phase ──────────────────────────────────────
# Agents build on top of the previous phase's code so features accumulate
# rather than being rebuilt from scratch each phase.
if [ "${PHASE_N}" -gt 1 ]; then
  PREV_PHASE=$((PHASE_N - 1))
  PREV_KEY="s3://codearena-runs-${ACCOUNT_ID}/workdirs/${AGENT_SLUG}/phase-${PREV_PHASE}.tar.gz"
  echo "Checking for Phase ${PREV_PHASE} workdir seed: ${PREV_KEY}"
  if aws s3 ls "${PREV_KEY}" --region "${REGION}" >/dev/null 2>&1; then
    echo "=== Restoring Phase ${PREV_PHASE} workdir ==="
    aws s3 cp "${PREV_KEY}" "/tmp/prev-workdir-${RUN_ID}.tar.gz" --region "${REGION}" 2>/dev/null
    cd "${RUN_DIR}" && tar xzf "/tmp/prev-workdir-${RUN_ID}.tar.gz" 2>/dev/null
    FILE_COUNT=$(find "${WORKDIR}" -type f | wc -l)
    echo "  Restored ${FILE_COUNT} files from Phase ${PREV_PHASE}"
  else
    echo "  No seed found — starting from empty workdir"
  fi
fi

echo "=============================================================="
echo "  CoderCup v3 — phase runner"
echo "=============================================================="
echo "  run_id:       ${RUN_ID}"
echo "  agent:        ${AGENT_SLUG}"
echo "  phase:        ${PHASE_N} (${PHASE_LABEL})"
echo "  spec budget:  ${PHASE_BUDGET} min (per spec §3)"
echo "  runner cap:   ${HARD_CAP_MIN} min (HARD wall-clock kill)"
echo "  task slug:    ${TASK_SLUG}"
echo "  workdir:      ${WORKDIR}"
echo "  log:          ${LOG}"
echo "=============================================================="
echo

# -----------------------------------------------------------------------------
# 3. Agent fixture
# -----------------------------------------------------------------------------
# (AWS / infra constants — ACCOUNT_ID, REGION, *_BUCKET, etc. — are defined
#  earlier, above the workdir-seed block that depends on them.)

# Fixture file holding amplify_app.app_id for this agent. We read app_id,
# fall back to creating a new app if null, and rewrite the fixture so
# subsequent phases of the same agent reuse the same Amplify app.
AGENT_FIXTURE="${REPO_ROOT}/public/fixtures/agents/${AGENT_SLUG}.json"
if [ ! -f "${AGENT_FIXTURE}" ]; then
  echo "ERROR: agent fixture not found: ${AGENT_FIXTURE}"
  exit 3
fi

# -----------------------------------------------------------------------------
# 4. Build the agent input payload
# -----------------------------------------------------------------------------

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

INPUT_JSON="${RUN_DIR}/input.json"
cat > "${INPUT_JSON}" <<EOF
{
  "run_id": "${RUN_ID}",
  "agent_slug": "${AGENT_SLUG}",
  "task_slug": "${TASK_SLUG}",
  "phase": ${PHASE_N},
  "phase_label": "${PHASE_LABEL}",
  "task_spec_url": "https://codercup.ai/events/world-cup-2026",
  "phase_brief_url": "https://codercup.ai/api/phase-brief/${PHASE_N}",
  "time_budget_minutes": ${HARD_CAP_MIN},
  "self_review_file": "phase-${PHASE_N}-review.md",
  "environment": {
    "node_version": "20",
    "allowed_network": ["fixtures-feed.io", "registry.npmjs.org", "amplify.us-east-1.amazonaws.com", "news.api.org", "the-odds-api.com", "images.unsplash.com", "unsplash.com", "images.pexels.com", "pexels.com", "cdn.pixabay.com", "pixabay.com", "flagcdn.com", "upload.wikimedia.org"],
    "secrets": {}
  }
}
EOF
echo "input.json: $(wc -c <"${INPUT_JSON}") bytes"

# -----------------------------------------------------------------------------
# 5. Fetch the per-phase brief markdown
# -----------------------------------------------------------------------------
# The brief lives in task-spec/world-cup-2026-v3.md, parsed by the phase-brief.ts
# helper. For agents running headless without TS runtime, we fall back to a
# regex slice of the spec markdown — the agent gets a self-contained brief.

PHASE_BRIEF_MD="${RUN_DIR}/phase-${PHASE_N}-brief.md"
SPEC_PATH="${REPO_ROOT}/task-spec/world-cup-2026-v3.md"

if [ ! -f "${SPEC_PATH}" ]; then
  echo "ERROR: spec not found at ${SPEC_PATH}"
  exit 3
fi

# The spec uses '## <N+3>. Phase <N> · <label>' for phase-1 (heading "## 4.")
# through phase-9 (heading "## 12."). Slice from the matching `## N. Phase <PHASE_N> ·`
# heading down to (but excluding) the next top-level `## ` heading.
python3 - "${PHASE_N}" "${SPEC_PATH}" "${PHASE_BRIEF_MD}" <<'PY'
import re, sys
phase_n, spec_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(spec_path).read()
# Match heading: "## <anything>. Phase <phase_n> · <label>"
start_re = re.compile(rf'^## \d+\. Phase {phase_n} · .*$', re.M)
m = start_re.search(text)
if not m:
    sys.stderr.write(f"phase {phase_n} brief not found in spec\n")
    sys.exit(2)
start = m.start()
# Next top-level "## " heading after this one
next_re = re.compile(r'^## \d+\. ', re.M)
n = next_re.search(text, m.end())
end = n.start() if n else len(text)
open(out_path, 'w').write(text[start:end].strip() + "\n")
PY

echo "phase brief: $(wc -c <"${PHASE_BRIEF_MD}") bytes"

# -----------------------------------------------------------------------------
# 6. Compose the agent prompt
# -----------------------------------------------------------------------------

# Optional: PHASE_1_ISSUES_FILE env var — path to a markdown file with this
# agent's specific prior-phase failures. If set, copied into workdir as
# PHASE_1_ISSUES.md and inlined into the prompt so the agent sees its own
# regression list alongside the new-phase brief. Used for cumulative scoring.
PHASE_1_ISSUES_INLINE=""
if [ -n "${PHASE_1_ISSUES_FILE:-}" ] && [ -f "${PHASE_1_ISSUES_FILE}" ]; then
  cp "${PHASE_1_ISSUES_FILE}" "${WORKDIR}/PHASE_1_ISSUES.md"
  PHASE_1_ISSUES_INLINE=$(cat "${PHASE_1_ISSUES_FILE}")
  echo "PHASE_1_ISSUES.md staged in workdir ($(wc -c <"${WORKDIR}/PHASE_1_ISSUES.md") bytes)"
fi

# Per-phase design assets (convention over configuration). If the spec ships
# design-system files for this phase under task-spec/<slug>-assets/phase-N/, stage
# them into the workdir root so the agent can adopt them. Versioned in the repo
# alongside the spec; no env, no per-phase special-casing. The REQUIREMENT (what to
# do with the assets) lives in the phase brief, not here.
PHASE_ASSETS_DIR="${REPO_ROOT}/task-spec/${TASK_SLUG}-assets/phase-${PHASE_N}"
if [ -d "${PHASE_ASSETS_DIR}" ]; then
  cp "${PHASE_ASSETS_DIR}"/* "${WORKDIR}/" 2>/dev/null || true
  echo "phase-${PHASE_N} design assets staged: $(ls "${PHASE_ASSETS_DIR}" 2>/dev/null | tr '\n' ' ')"
fi

PROMPT_FULL="${RUN_DIR}/prompt-full.md"
cat > "${PROMPT_FULL}" <<EOF
You are competing in **CoderCup — World Cup Code Battle 2026** (v3.2 spec).
This run is **Phase ${PHASE_N}: ${PHASE_LABEL}**.

## Workflow

1. **Read the phase brief below carefully.** It describes the feature you must
   ship, the self-review checklist (machine-parsed by the runner), and the
   pass criteria.
2. **Implement the feature.** Write code in this workdir. Run
   \`npm install && npm run build\` yourself. Iterate until \`out/\`
   is produced cleanly.
3. **Write \`phase-${PHASE_N}-review.md\` in the workdir root**, copying the
   checklist template from the brief and checking off each item you've
   verified. Use \`- [x]\` for items you verified pass. Use \`- [ ]\` for
   items you couldn't verify (these FAIL the gate). Use
   \`- [ ] Known gap: <explanation>\` for items you admit failing — admitted
   gaps don't fail the gate (the runner accepts them as honest signal).
   **⚠️ THE FILE FORMAT IS MACHINE-PARSED — THIS IS LITERALLY HOW YOU PASS THE
   GATE.** \`phase-${PHASE_N}-review.md\` MUST consist of GitHub-style checkbox
   lines reproduced from the brief's checklist template — every checklist line
   begins \`- [x] \` (verified) or \`- [ ] \` (not verified). Do NOT write a prose
   report, and do NOT use \`### ✅ Completed Features\` headings or summary
   bullets in place of the checkboxes. A review file with ZERO \`- [ ]\`/\`- [x]\`
   lines is graded \`gate=empty\` → \`self_review_failed\` → your build is NOT
   deployed and you score ZERO, however good the code is. Copy the brief's
   checklist verbatim, then tick each box.
4. **Do NOT mark items checked that you didn't verify.** The runner re-runs
   every \`[x]\` item from the outside. False checks earn a self-review-failed
   verdict AND lose the gate-pass-rate side metric.

## Hard cap

You have **${HARD_CAP_MIN} minutes** of wall-clock budget. The runner will
SIGTERM your CLI at ${HARD_CAP_MIN}m - ${GRACE_SEC}s and SIGKILL at exactly
${HARD_CAP_MIN}m. Plan accordingly.

## Data integrity — REAL data only, NO mock

This is a **real forecasting benchmark**. You are genuinely predicting FIFA World
Cup 2026 outcomes, and your predictions will be checked against reality. Treat it
as if real money rode on your champion pick.

- **Never fabricate, mock, stub, randomise, or hard-code placeholder data** for
  anything with a real-world answer: the 48 qualified teams, the group draw, FIFA
  rankings, the 78-match schedule, kickoff times, venues, recent form, injuries,
  and above all your **predicted winners, scorelines, win-probabilities, and the
  champion**. "TBD", lorem-ipsum, random numbers, or copy-pasted dummy rows for
  these are an automatic fail.
- **You MUST run live web searches — do NOT rely on training memory.** Explicitly
  call your web-search tool by name before writing any real-world data:
  **Claude -> the \`WebSearch\` tool; Codex -> \`web_search\`; Antigravity -> the
  \`search_web\` tool.** Memory is stale and wrong (e.g. the 2026 draw,
  current FIFA ranking order). At minimum, search the web for: the real FIFA World
  Cup 2026 host nations + venues, the official group draw (which 4 teams in each of
  groups A–L), the 48 qualified teams, the match schedule, the **current** FIFA
  world ranking, squad/injury news, and betting-market odds. Cite the real source
  URLs your search returned. A page whose data you did not verify by search is a fail.
- **Verify and CORRECT any existing data in the seeded workdir.** Earlier phases may
  have used unverified/memory data. This phase, re-check the group draw, standings
  inputs, team list, rankings and schedule against fresh web-search results and FIX
  whatever is wrong — do not carry forward incorrect data.
- **Predict the whole tournament, end to end.** Predict every group-stage match,
  then **PROJECT each group's standings from those predicted results** — compute
  W/D/L, GF/GA/GD and points (win 3 / draw 1) and rank each table accordingly.
  **Never leave standings as all-zeros.** Carry the projected group qualifiers
  into the knockout bracket and predict it through to a single **champion**. The
  full chain — group results → projected standings → bracket → champion — must be
  your real, internally-consistent forecast.
- Structural scaffolding the brief **explicitly** permits (e.g. an empty tab
  container whose content ships in a later phase) is fine. Inventing — or
  zeroing-out — data that has a knowable or predictable answer is not.
- If a source is unreachable, fall back to the most accurate real data you already
  know and **say so in your reasoning** — never silently substitute fiction.

## Network — research is expected

Use your built-in web search / browse tools freely to research real World Cup 2026
data. For build-time data fetches and asset bundling these hosts are known-good:
\`fixtures-feed.io\`, \`registry.npmjs.org\`, \`amplify.us-east-1.amazonaws.com\`,
\`news.api.org\`, \`the-odds-api.com\`, plus the imagery hosts below.

**Imagery — fetch real assets, don't hand-draw decorative graphics.** Hand-rolled
SVG/CSS illustrations and emoji-as-graphics look amateurish and lose visual score.
When you need decorative or photographic imagery, fetch freely-licensed assets and
bundle them into \`public/\` at build time (not hot-linked):
\`images.unsplash.com\`, \`unsplash.com\`, \`images.pexels.com\`, \`pexels.com\`,
\`cdn.pixabay.com\`, \`pixabay.com\`, \`flagcdn.com\`, \`upload.wikimedia.org\`.
Exception: functional data-viz (bracket lines, formation pitch, sparklines, charts)
must still be coded as SVG/canvas — a photo can't represent data.

---

# Phase ${PHASE_N} brief (verbatim from task-spec/world-cup-2026-v3.md)

$(cat "${PHASE_BRIEF_MD}")

$( if [ -n "${PHASE_1_ISSUES_INLINE}" ]; then printf '%s\n' '---' '' '# Your prior-phase failures (cumulative scoring context)' '' '> Phase-2 grading runs BOTH the 16 phase-1 plans AND 16 new phase-2 plans.' '> Phase-1 failures listed below count against your cumulative correctness.' '> See PHASE_1_ISSUES.md in this workdir for the same info.' '' "${PHASE_1_ISSUES_INLINE}"; fi )
EOF

echo "prompt: $(wc -c <"${PROMPT_FULL}") bytes"
echo

# -----------------------------------------------------------------------------
# 7. Spawn agent CLI
# -----------------------------------------------------------------------------

echo "=== invoking ${AGENT_SLUG} CLI (hard cap ${HARD_CAP_MIN}m) ==="
START_MS=$(date +%s%3N)

# Background tee of LOG → S3 every 30s so /live can render mid-run.
# Stopped after CLI returns. Note: this is a best-effort mirror; if the
# instance loses network, the final upload still happens at end of run.
( while true; do
    sleep 30
    aws s3 cp "${LOG}" "s3://${PUBLIC_BUCKET}/runs/${RUN_ID}/console.log" \
      --region "${REGION}" --content-type text/plain --quiet 2>/dev/null || true
  done ) &
LOG_MIRROR_PID=$!

# `timeout --kill-after` does the SIGTERM-then-SIGKILL handoff we want:
#   - sends TERM at HARD_CAP_SEC - GRACE_SEC (via --signal=TERM)
#   - sends KILL at HARD_CAP_SEC (after --kill-after grace)
# But GNU timeout's exact arg order is `timeout [opts] DURATION CMD`.
# We use `timeout --kill-after=${GRACE_SEC}s ${HARD_CAP_SEC}s CMD` and rely
# on the default SIGTERM. Net effect: agent gets TERM at HARD_CAP, KILL 30s
# later. To get TERM at HARD_CAP-GRACE we'd need a wrapper; for now this
# margin is small enough not to matter (the gate is still HARD_CAP_MIN-ish).

AGENT_EXIT=0
case "${AGENT_SLUG}" in
  claude-code)
    # --output-format json: final stdout is a single JSON envelope carrying
    # usage{input_tokens,output_tokens,cache_*} + total_cost_usd. The agent
    # still executes tools and writes files to WORKDIR exactly as before; only
    # the stdout report shape changes (deploy + self-review read WORKDIR files,
    # not stdout). This is how we recover REAL token counts for the cost score.
    timeout --kill-after="${GRACE_SEC}s" "${HARD_CAP_SEC}s" \
      claude --print --output-format json --add-dir "${WORKDIR}" --dangerously-skip-permissions \
      --model claude-opus-4-8 \
      < "${PROMPT_FULL}" \
      > "${RUN_DIR}/agent.stdout" 2> "${RUN_DIR}/agent.stderr" \
      || AGENT_EXIT=$?
    DRIVER_ID="claude_code_session"
    MODEL_ID="claude-opus-4-8"
    ;;
  codex)
    # --json: stdout is JSONL events incl turn.completed.usage{input_tokens,
    #   cached_input_tokens,output_tokens,reasoning_output_tokens} → precise
    #   tiered cost (parsed below), comparable to CC's total_cost_usd.
    # -c model_reasoning_effort=high: run gpt-5.5 at FULL reasoning (not the
    #   default 'none'). The agent still writes files to WORKDIR; only stdout
    #   shape changes.
    timeout --kill-after="${GRACE_SEC}s" "${HARD_CAP_SEC}s" \
      codex exec --json -c tools.web_search=true -c model_reasoning_effort="high" \
      --skip-git-repo-check --cd "${WORKDIR}" --sandbox workspace-write \
      < "${PROMPT_FULL}" \
      > "${RUN_DIR}/agent.stdout" 2> "${RUN_DIR}/agent.stderr" \
      || AGENT_EXIT=$?
    DRIVER_ID="codex_cli"
    MODEL_ID="gpt-5.5"
    ;;
  antigravity)
    # agy --print writes to ~/.gemini/antigravity-cli/scratch ALWAYS (per
    # agy_cli_print_mode.md). --add-dir grants READ only. Symlink WORKDIR → scratch
    # BEFORE invoking so deliverables land where the deploy step looks.
    # SERIALIZE — only one agy run at a time across the runner (scratch is shared).
    AGY_BIN="/home/ec2-user/.local/bin/agy"
    SCRATCH="/home/ec2-user/.gemini/antigravity-cli/scratch"
    # agy writes to SCRATCH, so the prev-phase code the seed block restored into
    # WORKDIR must be MOVED into SCRATCH — NOT discarded. Wiping it (the old
    # `rm -rf "${WORKDIR}"`) made agy rebuild from zero every phase, which is why
    # antigravity never iterated and its saved tarball was an empty 151-byte stub.
    # PHASE_1_ISSUES.md was staged into WORKDIR above, so it rides along in the mv.
    rm -rf "${SCRATCH}"
    mkdir -p "$(dirname "${SCRATCH}")"
    if [ -d "${WORKDIR}" ] && [ ! -L "${WORKDIR}" ]; then
      mv "${WORKDIR}" "${SCRATCH}"        # seeded code (+ PHASE_1_ISSUES.md) → scratch
    else
      mkdir -p "${SCRATCH}"               # phase 1 / no seed: start clean
    fi
    rm -rf "${WORKDIR}"
    mkdir -p "$(dirname "${WORKDIR}")"
    ln -s "${SCRATCH}" "${WORKDIR}"
    PROMPT_TEXT="$(cat "${PROMPT_FULL}")"
    cd "${WORKDIR}" && timeout --kill-after="${GRACE_SEC}s" "${HARD_CAP_SEC}s" \
      "${AGY_BIN}" --print "${PROMPT_TEXT}" \
      --dangerously-skip-permissions \
      --print-timeout "${HARD_CAP_MIN}m" \
      > "${RUN_DIR}/agent.stdout" 2> "${RUN_DIR}/agent.stderr" \
      || AGENT_EXIT=$?
    cd - >/dev/null
    DRIVER_ID="antigravity_cli"
    MODEL_ID="gemini-3.5-flash-high"
    ;;
  qwen)
    # qwen-code CLI (Gemini-CLI fork) via OpenRouter (OpenAI-compatible). Auth comes
    # from ec2-user's ~/.bashrc env (OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL).
    #   --yolo            auto-approve all tool calls (headless; no human in the loop)
    #   --auth-type openai forces the OpenRouter path (the free qwen-oauth tier was
    #                     discontinued 2026-04-15; without this it retries oauth and fails)
    #   -o json           final stdout is a JSON event array whose `result` element
    #                     carries usage{input_tokens,output_tokens,cache_read_input_tokens}
    #                     → real token counts for the cost capture below.
    # qwen operates on cwd, so cd into WORKDIR like the others. Prompt is passed as a
    # positional arg (smoke-verified); it's well under ARG_MAX even with the brief inlined.
    cd "${WORKDIR}" && timeout --kill-after="${GRACE_SEC}s" "${HARD_CAP_SEC}s" \
      qwen --yolo --auth-type openai -o json --model "${OPENAI_MODEL:-qwen/qwen3-coder-next}" \
      "$(cat "${PROMPT_FULL}")" \
      > "${RUN_DIR}/agent.stdout" 2> "${RUN_DIR}/agent.stderr" \
      || AGENT_EXIT=$?
    cd - >/dev/null
    DRIVER_ID="qwen_code_cli"
    # qwen3-coder-next: 80B total / only 3B activated → ~order-of-magnitude faster
    # token throughput than the 480B/35B-active flagship, which DNF'd phase 1 by
    # running out the 60-min wall-clock cap. Agent-optimized, open-weight, cheaper.
    MODEL_ID="qwen3-coder-next"
    ;;
  deepseek)
    # Same Qwen Code harness, but the MODEL is DeepSeek (via OpenRouter). Controlled
    # comparison vs qwen3-coder-next: identical agent/prompt/cap, only the model差.
    # DeepSeek-V3.2 is the strongest cheap open-weight Chinese coder (0.23/0.34/M).
    cd "${WORKDIR}" && timeout --kill-after="${GRACE_SEC}s" "${HARD_CAP_SEC}s" \
      qwen --yolo --auth-type openai -o json --model "deepseek/deepseek-v3.2" \
      "$(cat "${PROMPT_FULL}")" \
      > "${RUN_DIR}/agent.stdout" 2> "${RUN_DIR}/agent.stderr" \
      || AGENT_EXIT=$?
    cd - >/dev/null
    DRIVER_ID="qwen_code_cli"   # harness = Qwen Code CLI; model = DeepSeek
    MODEL_ID="deepseek-v3.2"
    ;;
  kimi)
    # Kimi Code CLI (Moonshot FIRST-PARTY agent) + Kimi K2.6 — a vendor agent like
    # claude-code/codex/antigravity (the harness IS the product, not a generic
    # OSS shell). Authed via the Allegretto subscription (OAuth on the box; no env
    # key). -p = headless prompt mode: auto-approves tool calls, assistant text
    # → stdout, thinking/tool progress → stderr.
    KIMI_BIN="/home/ec2-user/.kimi-code/bin/kimi"
    cd "${WORKDIR}" && timeout --kill-after="${GRACE_SEC}s" "${HARD_CAP_SEC}s" \
      "${KIMI_BIN}" -p "$(cat "${PROMPT_FULL}")" \
      > "${RUN_DIR}/agent.stdout" 2> "${RUN_DIR}/agent.stderr" \
      || AGENT_EXIT=$?
    cd - >/dev/null
    DRIVER_ID="kimi_code_cli"
    MODEL_ID="kimi-k2.6"
    ;;
esac

END_MS=$(date +%s%3N)
WALL_MS=$((END_MS - START_MS))
WALL_MIN=$((WALL_MS / 60000))
ENDED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

kill "${LOG_MIRROR_PID}" 2>/dev/null || true
wait "${LOG_MIRROR_PID}" 2>/dev/null || true

# ── Cost capture: REAL tokens × current rate card (imputed cost) ──────────
# All three agents run on flat subscriptions (Claude Max / ChatGPT / Google AI
# Ultra), so none of them reports a real per-run billed USD. We capture REAL
# token counts from each CLI's own output and apply published API per-token
# rates as a single uniform yardstick across vendors. token × rate is the
# agreed method — what matters is that the TOKENS are measured, not invented.
PROMPT_TOKENS=0
COMPLETION_TOKENS=0
TOKEN_SOURCE="none"
COST_USD_DIRECT=""   # if set (e.g. CC's total_cost_usd), used verbatim over rate-card imputation
case "${AGENT_SLUG}" in
  claude-code)
    # claude --output-format json → {"usage":{input_tokens,output_tokens,
    #   cache_creation_input_tokens,cache_read_input_tokens}, "total_cost_usd"}.
    read PROMPT_TOKENS COMPLETION_TOKENS TOKEN_SOURCE < <(python3 - "${RUN_DIR}/agent.stdout" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    u = d.get("usage", {}) if isinstance(d, dict) else {}
    inp = (u.get("input_tokens", 0) or 0) + (u.get("cache_creation_input_tokens", 0) or 0) + (u.get("cache_read_input_tokens", 0) or 0)
    out = u.get("output_tokens", 0) or 0
    print(int(inp), int(out), "claude-json-usage" if (inp or out) else "none")
except Exception:
    print(0, 0, "none")
PY
) || true
    # Claude Code computes total_cost_usd with the correct cache-tier rates
    # (cache_read is ~0.1× input). Prefer it over flat-rate imputation, which
    # would massively overcount the cache-read-heavy input. token_source stays
    # claude-json-usage; cost just comes from the CLI's own accurate figure.
    COST_USD_DIRECT=$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("total_cost_usd") or "")
except Exception: print("")' "${RUN_DIR}/agent.stdout" 2>/dev/null || true)
    ;;
  codex)
    # --json stdout: sum usage across every turn.completed event, then price by
    # gpt-5.5 tier: non-cached input $5/M, cached_input $1.25/M, output +
    # reasoning_output $30/M. Sets COST_USD_DIRECT (cache-accurate, like CC).
    read PROMPT_TOKENS COMPLETION_TOKENS COST_USD_DIRECT TOKEN_SOURCE < <(python3 - "${RUN_DIR}/agent.stdout" <<'PY'
import json, sys
inp = cached = out = reason = 0
try:
    for line in open(sys.argv[1]):
        line = line.strip()
        if not (line.startswith("{") and '"usage"' in line):
            continue
        try:
            u = json.loads(line).get("usage") or {}
        except Exception:
            continue
        inp += u.get("input_tokens", 0) or 0
        cached += u.get("cached_input_tokens", 0) or 0
        out += u.get("output_tokens", 0) or 0
        reason += u.get("reasoning_output_tokens", 0) or 0
except Exception:
    pass
noncached = max(0, inp - cached)
usd = round(noncached/1e6*5.0 + cached/1e6*1.25 + (out+reason)/1e6*30.0, 4)
if inp or out:
    print(inp, out + reason, usd, "codex-json-tiered")
else:
    print(0, 0, 0, "none")
PY
) || true
    ;;
  antigravity)
    # agy --print may emit a JSON usage event (early-version behavior); capture
    # it if present. The quota%-delta path (AI Ultra $100/mo) is wired below once
    # the read mechanism is confirmed on the EC2 box.
    read PROMPT_TOKENS COMPLETION_TOKENS TOKEN_SOURCE < <(python3 - "${RUN_DIR}/agent.stdout" "${RUN_DIR}/agent.stderr" <<'PY'
import json, sys
inp = out = 0
for path in sys.argv[1:]:
    try:
        for line in open(path):
            line = line.strip()
            if not (line.startswith("{") and line.endswith("}")):
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            u = d.get("usage") or d.get("usageMetadata") or {}
            inp += (u.get("input_tokens") or u.get("promptTokenCount") or 0)
            out += (u.get("output_tokens") or u.get("candidatesTokenCount") or 0)
    except Exception:
        pass
print(int(inp), int(out), "agy-usage-event" if (inp or out) else "none")
PY
) || true
    # AGY_QUOTA_USD: set by the quota-delta probe (filled once confirmed).
    ;;
  qwen|deepseek)
    # qwen `-o json` stdout is a JSON event array; the trailing `result` element
    # carries cumulative usage{input_tokens, output_tokens, cache_read_input_tokens}.
    # (Same parser for the deepseek slug — it uses the same Qwen Code CLI output.)
    # input_tokens INCLUDES cache_read; we price all input at the qwen3-coder rate
    # below (slight overcount on cached tokens, but conservative and immaterial —
    # qwen's cost is pennies, so cost_score clamps to ~1.0 regardless).
    read PROMPT_TOKENS COMPLETION_TOKENS TOKEN_SOURCE < <(python3 - "${RUN_DIR}/agent.stdout" <<'PY'
import json, sys
inp = out = 0
src = "none"
try:
    txt = open(sys.argv[1]).read().strip()
    data = json.loads(txt)
    events = data if isinstance(data, list) else [data]
    result = None
    for e in events:
        if isinstance(e, dict) and e.get("type") == "result":
            result = e          # last result wins
    u = (result or {}).get("usage") or {}
    inp = int(u.get("input_tokens", 0) or 0)
    out = int(u.get("output_tokens", 0) or 0)
    if inp or out:
        src = "qwen-json-usage"
except Exception:
    pass
print(inp, out, src)
PY
) || true
    ;;
esac

# Impute USD from the current rate card (verified 2026-05-30 against vendor
# pricing pages; standard tier, <=200K context).
COST_USD=$(python3 - "${PROMPT_TOKENS}" "${COMPLETION_TOKENS}" "${MODEL_ID:-unknown}" "${COST_USD_DIRECT:-}" <<'PY'
import sys
RATES = {  # model_id: (input $/Mtok, output $/Mtok)
    "claude-opus-4-8": (5.0, 25.0),
    "gpt-5.5": (5.0, 30.0),
    "gemini-3.5-flash-high": (1.5, 9.0),
    "gemini-3.1-pro": (2.0, 12.0),
    "qwen3-coder": (0.22, 1.80),       # OpenRouter qwen/qwen3-coder (480B/35B-active flagship)
    "qwen3-coder-next": (0.11, 0.80),  # OpenRouter qwen/qwen3-coder-next (80B/3B-active, fast)
    "deepseek-v3.2": (0.229, 0.343),   # OpenRouter deepseek/deepseek-v3.2
    "kimi-k2.6": (0.95, 4.0),          # Moonshot Kimi K2.6 (Allegretto flat sub; cost imputed)
}
inp, out, model, direct = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
# A CLI-reported, cache-accurate USD (e.g. CC's total_cost_usd) takes
# precedence over flat rate-card imputation.
if direct:
    try:
        print(round(float(direct), 4)); sys.exit(0)
    except ValueError:
        pass
pin, pout = RATES.get(model, (10.0, 30.0))  # unknown → conservative
print(round(inp / 1e6 * pin + out / 1e6 * pout, 4))
PY
) || COST_USD=0
COST_USD=${COST_USD:-0}
echo "=== cost capture ==="
echo "model=${MODEL_ID:-unknown} source=${TOKEN_SOURCE} in_tokens=${PROMPT_TOKENS} out_tokens=${COMPLETION_TOKENS} usd=${COST_USD}"
echo

# ── Save workdir to S3 so next phase can build on this work ───────────────
echo "Saving workdir for Phase $((PHASE_N + 1)) seed..."
# -h dereferences the workdir symlink (agy points workdir → scratch; without -h
# this archives just the 151-byte symlink). Excluding the regenerable
# node_modules/.next keeps the seed lean and dodges nested-symlink bloat — the
# next phase's agent runs `npm install` per its prompt.
cd "${RUN_DIR}" && tar czhf "/tmp/phase-${PHASE_N}-workdir-${RUN_ID}.tar.gz" \
  --exclude='workdir/node_modules' --exclude='workdir/.next' workdir/ 2>/dev/null
SAVE_KEY="s3://codearena-runs-${ACCOUNT_ID}/workdirs/${AGENT_SLUG}/phase-${PHASE_N}.tar.gz"
aws s3 cp "/tmp/phase-${PHASE_N}-workdir-${RUN_ID}.tar.gz" "${SAVE_KEY}" \
  --region "${REGION}" 2>/dev/null \
  && echo "  Workdir saved: ${SAVE_KEY}" \
  || echo "  WARNING: workdir save failed"
rm -f "/tmp/phase-${PHASE_N}-workdir-${RUN_ID}.tar.gz" "/tmp/prev-workdir-${RUN_ID}.tar.gz" 2>/dev/null

echo
echo "agent exit:   ${AGENT_EXIT}"
echo "wall clock:   $((WALL_MS / 1000))s (${WALL_MIN} min)"
echo "stdout:       $(wc -c <"${RUN_DIR}/agent.stdout") bytes"
echo "stderr:       $(wc -c <"${RUN_DIR}/agent.stderr") bytes"

# Map exit code → status preliminary. May be overridden by self-review gate.
# timeout exits 124 on timeout, 137 on KILL.
if [ "${AGENT_EXIT}" = "124" ] || [ "${AGENT_EXIT}" = "137" ]; then
  STATUS="time_budget_exceeded"
elif [ "${AGENT_EXIT}" = "0" ]; then
  STATUS="completed"
else
  STATUS="driver_crashed"
fi
echo "preliminary status: ${STATUS}"
echo

# -----------------------------------------------------------------------------
# 8. Self-review gate
# -----------------------------------------------------------------------------
#
# Parse phase-${PHASE_N}-review.md:
#   - Missing file → status=self_review_missing, SKIP scoring
#   - File present, any `- [ ]` line WITHOUT "Known gap:" → self_review_failed
#   - All items checked or admitted as gaps → gate passes, proceed to scoring
#
# Regex: ^- \[([ x])\] (.+?)(?:\s+—\s+Known gap:.*)?$
# Heuristic: also accept `- [ ] Known gap: ...` (no preceding text) as an
# admitted-failure line; the spec's example template uses both forms.

REVIEW_FILE="${WORKDIR}/phase-${PHASE_N}-review.md"
SELF_REVIEW_JSON="${RUN_DIR}/self-review.json"

echo "=== self-review gate ==="

if [ ! -f "${REVIEW_FILE}" ]; then
  echo "MISSING: ${REVIEW_FILE}"
  STATUS="self_review_missing"
  cat > "${SELF_REVIEW_JSON}" <<EOF
{
  "submitted_iso": null,
  "checklist_total": 0,
  "checklist_passed": 0,
  "checklist_failed": 0,
  "known_gaps": [],
  "gate_result": "missing"
}
EOF
else
  python3 - "${REVIEW_FILE}" "${SELF_REVIEW_JSON}" <<'PY'
import json, re, sys, os, datetime
review_path, out_path = sys.argv[1], sys.argv[2]
text = open(review_path).read()
# Match checklist lines. Accept:
#   - [x] Item text
#   - [ ] Item text                          → failed
#   - [ ] Known gap: <desc>                  → admitted gap (counts as gap, not fail)
#   - [ ] Item text — Known gap: <desc>      → admitted gap
line_re = re.compile(r'^- \[([ x])\]\s+(.+?)\s*$', re.M)
known_gap_re = re.compile(r'(?i)\bknown gap\b\s*:?\s*(.*)$')

checklist = []
known_gaps = []
for m in line_re.finditer(text):
    box = m.group(1)
    body = m.group(2)
    is_gap = bool(known_gap_re.search(body))
    if is_gap:
        gap_match = known_gap_re.search(body)
        known_gaps.append({
            "raw": body,
            "description": gap_match.group(1) if gap_match else body,
        })
        # Admitted gaps DO NOT fail the gate.
        checklist.append({"checked": True, "body": body, "is_gap": True})
    else:
        checklist.append({"checked": box == "x", "body": body, "is_gap": False})

total = len([c for c in checklist if not c["is_gap"]])  # only real items count
passed = len([c for c in checklist if c["checked"] and not c["is_gap"]])
failed = len([c for c in checklist if not c["checked"] and not c["is_gap"]])

if total == 0 and len(checklist) == 0:
    gate_result = "empty"  # no checklist found — treat as failed
elif failed == 0:
    gate_result = "passed"
else:
    gate_result = "failed"

submitted_iso = datetime.datetime.utcfromtimestamp(
    os.path.getmtime(review_path)
).strftime("%Y-%m-%dT%H:%M:%SZ")

out = {
    "submitted_iso": submitted_iso,
    "checklist_total": total,
    "checklist_passed": passed,
    "checklist_failed": failed,
    "known_gaps": known_gaps,
    "gate_result": gate_result,
}
with open(out_path, "w") as f:
    json.dump(out, f, indent=2)
print(json.dumps(out, indent=2))
PY
  GATE_RESULT=$(python3 -c "import json; print(json.load(open('${SELF_REVIEW_JSON}')).get('gate_result',''))")
  if [ "${GATE_RESULT}" = "passed" ]; then
    echo "GATE: passed"
  else
    echo "GATE: ${GATE_RESULT}"
    STATUS="self_review_failed"
  fi
fi

# Mirror review file to S3 (always, even on fail — for the FE)
if [ -f "${REVIEW_FILE}" ]; then
  aws s3 cp "${REVIEW_FILE}" "s3://${PUBLIC_BUCKET}/runs/${RUN_ID}/phase-${PHASE_N}-review.md" \
    --region "${REGION}" --content-type text/markdown --quiet 2>/dev/null || true
fi
echo

# -----------------------------------------------------------------------------
# 9. Build + deploy (only if self-review gate passed)
# -----------------------------------------------------------------------------

DEPLOYED_URL=""
AMPLIFY_APP_ID=""

if [ "${STATUS}" = "self_review_missing" ] || [ "${STATUS}" = "self_review_failed" ]; then
  echo "=== skipping deploy (self-review did not pass) ==="
elif [ "${STATUS}" = "completed" ]; then
  echo "=== build + deploy ==="

  # Try npm build if package.json exists
  if [ -f "${WORKDIR}/package.json" ]; then
    cd "${WORKDIR}"
    npm install --silent 2>&1 | tail -3 || true
    npm run build 2>&1 | tail -10 || true
    cd - >/dev/null
  fi

  if [ ! -d "${WORKDIR}/out" ]; then
    echo "WARN: no out/ directory produced — agent didn't build a static bundle."
    STATUS="deliverable_invalid"
  else
    # Resolve existing app_id from the agent fixture (Amplify reuse).
    AMPLIFY_APP_ID=$(python3 -c "
import json
try:
    d = json.load(open('${AGENT_FIXTURE}'))
    print((d.get('amplify_app') or {}).get('app_id') or '')
except Exception:
    print('')
")
    APP_NAME="codearena-run-${AGENT_SLUG}-${EVENT_SLUG}"

    if [ -z "${AMPLIFY_APP_ID}" ]; then
      # Look it up by name first (fixture may be stale; the AWS-side name is the source of truth)
      AMPLIFY_APP_ID=$(aws amplify list-apps --region "${REGION}" --max-items 100 \
        --query "apps[?name=='${APP_NAME}'] | [0].appId" --output text 2>/dev/null || echo "")
      [ "${AMPLIFY_APP_ID}" = "None" ] && AMPLIFY_APP_ID=""
    fi

    if [ -z "${AMPLIFY_APP_ID}" ]; then
      echo "creating Amplify app ${APP_NAME}"
      AMPLIFY_APP_ID=$(aws amplify create-app --name "${APP_NAME}" --region "${REGION}" \
        --tags "Project=CoderCup,ManagedBy=ClaudeCode,AgentSlug=${AGENT_SLUG},EventSlug=${EVENT_SLUG}" \
        --custom-rules '[{"source":"/<*>","target":"/index.html","status":"404"}]' \
        --query 'app.appId' --output text 2>&1 || echo "")
      aws amplify create-branch --app-id "${AMPLIFY_APP_ID}" --branch-name main \
        --region "${REGION}" >/dev/null 2>&1 || true
      echo "created: ${AMPLIFY_APP_ID}"

      # Write back to fixture so next phase reuses the app
      python3 - "${AGENT_FIXTURE}" "${AMPLIFY_APP_ID}" <<'PY'
import json, sys
fixture_path, app_id = sys.argv[1], sys.argv[2]
d = json.load(open(fixture_path))
d.setdefault("amplify_app", {})
d["amplify_app"]["app_id"] = app_id
with open(fixture_path, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
PY
      echo "wrote app_id back to ${AGENT_FIXTURE}"
    else
      echo "reusing Amplify app: ${AMPLIFY_APP_ID}"
    fi

    # Zip out/ + start a deployment
    cd "${WORKDIR}/out"
    ZIP="/tmp/${RUN_ID}.zip"
    zip -r -q "${ZIP}" .
    echo "zip: $(wc -c <"${ZIP}") bytes"

    SLOT=$(aws amplify create-deployment --app-id "${AMPLIFY_APP_ID}" --branch-name main \
      --region "${REGION}" --query '{jobId:jobId,url:zipUploadUrl}' --output json)
    JOB_ID=$(echo "${SLOT}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])')
    UPLOAD_URL=$(echo "${SLOT}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')
    curl -s -X PUT -T "${ZIP}" "${UPLOAD_URL}" -H "Content-Type: application/zip" -o /dev/null
    aws amplify start-deployment --app-id "${AMPLIFY_APP_ID}" --branch-name main \
      --job-id "${JOB_ID}" --region "${REGION}" >/dev/null

    # Poll until SUCCEED/FAILED (cap at 10 min)
    for i in $(seq 1 60); do
      STATE=$(aws amplify get-job --app-id "${AMPLIFY_APP_ID}" --branch-name main \
        --job-id "${JOB_ID}" --region "${REGION}" --query 'job.summary.status' --output text 2>&1)
      [ "${STATE}" = "SUCCEED" ] && break
      [ "${STATE}" = "FAILED" ] || [ "${STATE}" = "CANCELLED" ] && break
      sleep 10
    done

    if [ "${STATE}" = "SUCCEED" ]; then
      DEFAULT_DOMAIN=$(aws amplify get-app --app-id "${AMPLIFY_APP_ID}" --region "${REGION}" \
        --query 'app.defaultDomain' --output text)
      DEPLOYED_URL="https://main.${DEFAULT_DOMAIN}"
      echo "deployed: ${DEPLOYED_URL}"
    else
      echo "deploy ended in state: ${STATE}"
      STATUS="deliverable_invalid"
    fi
    cd - >/dev/null
  fi
fi
echo

# -----------------------------------------------------------------------------
# 10. TestSprite scoring (only if deploy succeeded)
# -----------------------------------------------------------------------------

PER_TEST_VERDICTS_JSON="${RUN_DIR}/per-test-verdicts.json"
SCORE_JSON="${RUN_DIR}/score.json"
echo "[]" > "${PER_TEST_VERDICTS_JSON}"
echo "{}" > "${SCORE_JSON}"

if [ -n "${DEPLOYED_URL}" ] && [ "${STATUS}" = "completed" ]; then
  echo "=== testsprite scoring (phase-${PHASE_N}) ==="
  SUITE_DIR="${REPO_ROOT}/tests/world-cup-2026-v3/phase-${PHASE_N}"
  SUITE_INDEX="${SUITE_DIR}/suite-index.json"

  if [ ! -f "${SUITE_INDEX}" ]; then
    echo "WARN: no suite-index at ${SUITE_INDEX} — recording zero verdicts."
  else
    SUITE_OUT="${RUN_DIR}/testsprite"
    mkdir -p "${SUITE_OUT}"

    # Build list of synthetic test IDs from suite-index.categories.
    # Convention: world-cup-2026-v3-phase-<N>-<category>-<basename-without-ext>
    # The score-runner Lambda (or operator pre-registration) is responsible
    # for ensuring these IDs are registered on the TestSprite side.
    TEST_IDS=$(python3 - "${SUITE_INDEX}" "${PHASE_N}" <<'PY'
import json, sys, os
idx = json.load(open(sys.argv[1]))
phase = sys.argv[2]
cats = idx.get("categories") or {}
for category, files in cats.items():
    for f in files:
        base = os.path.splitext(f)[0]
        cat_slug = category.replace("/", "-")
        print(f"world-cup-2026-v3-phase-{phase}-{cat_slug}-{base}")
PY
)
    TOTAL=$(echo "${TEST_IDS}" | grep -c '.' || echo 0)
    echo "running ${TOTAL} plans against ${DEPLOYED_URL}"

    PARALLELISM=5
    run_one() {
      local tid="$1"
      testsprite test run "${tid}" --target-url "${DEPLOYED_URL}" \
        --wait --timeout 600 --output json \
        > "${SUITE_OUT}/${tid}.json" 2>/dev/null || true
    }
    i=0
    for tid in ${TEST_IDS}; do
      while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "${PARALLELISM}" ]; do
        sleep 0.5
      done
      i=$((i+1))
      echo "  [${i}/${TOTAL}] ${tid}"
      run_one "${tid}" &
    done
    wait

    # Aggregate per-test verdicts.
    python3 - "${SUITE_OUT}" "${PER_TEST_VERDICTS_JSON}" "${SCORE_JSON}" <<'PY'
import json, glob, os, sys
suite_out, verdicts_path, score_path = sys.argv[1], sys.argv[2], sys.argv[3]
verdicts = []
counts = {"passed": 0, "failed": 0, "inconclusive": 0, "error": 0}
for f in sorted(glob.glob(os.path.join(suite_out, "*.json"))):
    tid = os.path.splitext(os.path.basename(f))[0]
    try:
        text = open(f).read().strip()
        if not text:
            verdicts.append({"test_id": tid, "verdict": "error", "summary": "empty cli output"})
            counts["error"] += 1
            continue
        try:
            d = json.loads(text)
        except Exception:
            # fallback split (see scripts/run-suite.sh comment for context)
            d = None
            for chunk in text.replace("}\n{", "}|||{").split("|||"):
                try:
                    cand = json.loads(chunk.strip())
                    if cand.get("status") or cand.get("run"):
                        d = cand
                        break
                except Exception:
                    pass
            if d is None:
                verdicts.append({"test_id": tid, "verdict": "error", "summary": "parse error"})
                counts["error"] += 1
                continue
        run = d.get("run") or d
        status = (run.get("status") or d.get("status") or "unknown").lower()
        if status in ("passed", "pass", "succeed", "succeeded"):
            v = "passed"
        elif status in ("failed", "fail"):
            v = "failed"
        elif status in ("inconclusive", "skipped"):
            v = "inconclusive"
        else:
            v = "error"
        counts[v] = counts.get(v, 0) + 1
        verdicts.append({
            "test_id": tid,
            "verdict": v,
            "summary": run.get("failureKind") or status,
        })
    except Exception as e:
        verdicts.append({"test_id": tid, "verdict": "error", "summary": str(e)})
        counts["error"] += 1

with open(verdicts_path, "w") as f:
    json.dump(verdicts, f, indent=2)

total = len(verdicts)
correctness = (counts["passed"] / total) if total else 0.0
score = {
    "phase": int(os.environ.get("PHASE_N", "0")),
    "total_plans": total,
    "counts": counts,
    "correctness": round(correctness, 4),
    "composite": round(correctness, 4),  # Lambda will compute the real composite
}
with open(score_path, "w") as f:
    json.dump(score, f, indent=2)
print(json.dumps(score, indent=2))
PY
  fi
else
  echo "=== skipping testsprite scoring (no deploy / status=${STATUS}) ==="
fi
echo

# -----------------------------------------------------------------------------
# 11. Write final manifest + upload to S3
# -----------------------------------------------------------------------------

MANIFEST="${RUN_DIR}/manifest.json"
PHASE_N_ENV="${PHASE_N}" python3 - \
  "${MANIFEST}" "${RUN_ID}" "${AGENT_SLUG}" "${TASK_SLUG}" "${PHASE_N}" \
  "${STARTED_AT}" "${ENDED_AT}" "${STATUS}" \
  "${DEPLOYED_URL}" "${AMPLIFY_APP_ID}" "${DRIVER_ID:-unknown}" "${MODEL_ID:-unknown}" \
  "${SELF_REVIEW_JSON}" "${PER_TEST_VERDICTS_JSON}" "${SCORE_JSON}" "${WALL_MS}" \
  "${PROMPT_TOKENS:-0}" "${COMPLETION_TOKENS:-0}" "${COST_USD:-0}" "${TOKEN_SOURCE:-none}" <<'PY'
import json, sys, os
(
    manifest_path, run_id, agent_slug, task_slug, phase,
    started_at, ended_at, status,
    deployed_url, amplify_app_id, driver_id, model_id,
    self_review_path, per_test_path, score_path, wall_ms,
    prompt_tokens, completion_tokens, cost_usd, token_source,
) = sys.argv[1:21]

def load_or(path, default):
    try:
        if os.path.exists(path):
            return json.load(open(path))
    except Exception:
        pass
    return default

self_review = load_or(self_review_path, None)
per_test = load_or(per_test_path, [])
score = load_or(score_path, {})

m = {
    "schema_version": "1",
    "run_id": run_id,
    "agent_slug": agent_slug,
    "task_slug": task_slug,
    "event_slug": "world-cup-2026",
    "phase": int(phase),
    "started_at": started_at,
    "ended_at": ended_at,
    "status": status,
    "artifact": {
        "repo_url": "https://github.com/TestSprite/CodeArena-runs",
        "commit_sha": "0000000000000000000000000000000000000000",
        "deployed_app_url": deployed_url or "",
        "amplify_app_id": amplify_app_id or "",
    },
    "logs_url": f"s3://codearena-public-data-{os.environ.get('ACCOUNT_ID', '')}/runs/{run_id}/console.log",
    "transcript_url": f"s3://codearena-runs-{os.environ.get('ACCOUNT_ID', '')}/runs/{run_id}/agent.stdout",
    "driver_metadata": {
        "driver": driver_id,
        "model_id": model_id,
        "prompt_tokens": int(prompt_tokens),
        "completion_tokens": int(completion_tokens),
        "usd_imputed": float(cost_usd),
        "token_source": token_source,
        "tool_calls": 0,
        "wall_clock_ms": int(wall_ms),
        "notes": "run-agent-v3.sh; phase-aware; cost = real tokens x current rate card (all agents on flat subscriptions, imputed USD is the uniform yardstick)",
    },
    "self_review": self_review,
    "per_test_verdicts": per_test,
    "score": score,
}
with open(manifest_path, "w") as f:
    json.dump(m, f, indent=2)
print(json.dumps(m, indent=2)[:2000])
PY

# Upload manifest + agent stdout/stderr to S3
aws s3 cp "${MANIFEST}" "s3://${RUNS_BUCKET}/runs/${RUN_ID}/manifest.json" \
  --region "${REGION}" --content-type application/json >/dev/null
aws s3 cp "${RUN_DIR}/agent.stdout" "s3://${RUNS_BUCKET}/runs/${RUN_ID}/agent.stdout" \
  --region "${REGION}" --content-type text/plain >/dev/null
aws s3 cp "${RUN_DIR}/agent.stderr" "s3://${RUNS_BUCKET}/runs/${RUN_ID}/agent.stderr" \
  --region "${REGION}" --content-type text/plain >/dev/null
# Final mirror of console log to public bucket (overrides the periodic one).
aws s3 cp "${LOG}" "s3://${PUBLIC_BUCKET}/runs/${RUN_ID}/console.log" \
  --region "${REGION}" --content-type text/plain >/dev/null

echo "manifest:  s3://${RUNS_BUCKET}/runs/${RUN_ID}/manifest.json"
echo "console:   s3://${PUBLIC_BUCKET}/runs/${RUN_ID}/console.log"
echo "deployed:  ${DEPLOYED_URL:-<none>}"
echo "status:    ${STATUS}"
echo

# -----------------------------------------------------------------------------
# 12. Invoke score-runner Lambda (best-effort; no-op if Lambda not deployed)
# -----------------------------------------------------------------------------

echo "=== invoking ${SCORE_LAMBDA} ==="
PAYLOAD=$(cat <<EOF
{"Records":[{"s3":{"bucket":{"name":"${RUNS_BUCKET}"},"object":{"key":"runs/${RUN_ID}/manifest.json"}}}]}
EOF
)
aws lambda invoke --function-name "${SCORE_LAMBDA}" --region "${REGION}" \
  --cli-binary-format raw-in-base64-out --payload "${PAYLOAD}" \
  "/tmp/${RUN_ID}-lambda-out.json" >/dev/null 2>&1 || \
  echo "(lambda invoke skipped or failed — manifest is on S3, scoring can be re-run async)"

echo
echo "=============================================================="
echo "  DONE  ${RUN_ID}  status=${STATUS}"
echo "=============================================================="
