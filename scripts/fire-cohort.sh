#!/usr/bin/env bash
# fire-cohort.sh — kick off all three agents in parallel against ONE phase.
#
# Usage:
#   ./scripts/fire-cohort.sh <phase-number>
#
# Each agent's run-agent-v3.sh runs as a background job. Per-agent stdout
# tees into /tmp/codearena-cohort-<phase>-<ts>/<agent>.log so you can tail
# any one without blocking the others. After all three exit, prints a
# summary table reading each agent's manifest from S3.
#
# Exit code: 0 if all three completed (any STATUS), 1 if a launcher itself
# failed.

set -euo pipefail

PHASE_N="${1:-}"
if [ -z "${PHASE_N}" ] || ! [[ "${PHASE_N}" =~ ^[1-9]$ ]]; then
  echo "Usage: $0 <phase-number>  (1..9)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date -u +%Y%m%d-%H%M%S)"
COHORT_DIR="/tmp/codearena-cohort-phase${PHASE_N}-${TS}"
mkdir -p "${COHORT_DIR}"

AGENTS=(claude-code codex antigravity)

echo "=============================================================="
echo "  CoderCup v3 cohort fire — phase ${PHASE_N}"
echo "=============================================================="
echo "  cohort dir: ${COHORT_DIR}"
echo "  agents:     ${AGENTS[*]}"
echo
echo "Launching ${#AGENTS[@]} agents in parallel…"
echo

# Launch each agent in background; tee its log into the cohort dir.
declare -A PIDS
for agent in "${AGENTS[@]}"; do
  LOG_FILE="${COHORT_DIR}/${agent}.log"
  ( "${SCRIPT_DIR}/run-agent-v3.sh" "${agent}" "${PHASE_N}" 2>&1 ) > "${LOG_FILE}" &
  PIDS[${agent}]=$!
  echo "  ${agent}: PID ${PIDS[${agent}]}, log ${LOG_FILE}"
done
echo

# Wait for all three. We do NOT fail-fast on any one — every agent gets
# a chance to write its manifest.
declare -A EXITS
for agent in "${AGENTS[@]}"; do
  if wait "${PIDS[${agent}]}"; then
    EXITS[${agent}]=0
  else
    EXITS[${agent}]=$?
  fi
  echo "  ${agent}: launcher exit=${EXITS[${agent}]}"
done
echo

# -----------------------------------------------------------------------------
# Summary table: read each agent's last-written manifest from /tmp scratch.
# We grep the agent's log for its run_id, then pull /tmp/codearena-runs/<id>/manifest.json.
# -----------------------------------------------------------------------------
echo "=============================================================="
echo "  Summary  (phase ${PHASE_N})"
echo "=============================================================="
printf "  %-13s  %-22s  %-50s  %s\n" "agent" "status" "deploy_url" "composite"
printf "  %-13s  %-22s  %-50s  %s\n" "-----" "------" "----------" "---------"
for agent in "${AGENTS[@]}"; do
  LOG_FILE="${COHORT_DIR}/${agent}.log"
  # Extract run_id from the launcher log
  RUN_ID=$(grep -oE "${agent}-phase${PHASE_N}-[0-9]{8}-[0-9]{6}" "${LOG_FILE}" | head -1 || echo "")
  if [ -z "${RUN_ID}" ]; then
    printf "  %-13s  %-22s  %-50s  %s\n" "${agent}" "no_run_id" "-" "-"
    continue
  fi
  MANIFEST="/tmp/codearena-runs/${RUN_ID}/manifest.json"
  if [ ! -f "${MANIFEST}" ]; then
    printf "  %-13s  %-22s  %-50s  %s\n" "${agent}" "no_manifest" "-" "-"
    continue
  fi
  STATUS=$(python3 -c "import json; print(json.load(open('${MANIFEST}'))['status'])" 2>/dev/null || echo "?")
  URL=$(python3 -c "import json; print(json.load(open('${MANIFEST}'))['artifact'].get('deployed_app_url','-') or '-')" 2>/dev/null || echo "-")
  COMP=$(python3 -c "import json; s=json.load(open('${MANIFEST}')).get('score') or {}; print(s.get('composite','-'))" 2>/dev/null || echo "-")
  printf "  %-13s  %-22s  %-50s  %s\n" "${agent}" "${STATUS}" "${URL}" "${COMP}"
done
echo
echo "Cohort dir: ${COHORT_DIR}"
echo "Tail any agent:  tail -f ${COHORT_DIR}/<agent>.log"
