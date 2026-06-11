#!/usr/bin/env bash
#
# live-emit.sh — emit a single CoderCup "live" event to S3.
#
# Usage:
#   ./scripts/live-emit.sh <agent> <phase> <type> <target> [meta]
#
# Behavior:
#   1. Build a JSONL line with current ISO timestamp + the supplied fields,
#      using python3 (jq is not on the runner host).
#   2. Append it to /tmp/codercup-live-buffer.jsonl (creating the file if
#      it does not exist).
#   3. Upload the full buffer to S3, overwriting the prior object so the
#      CDN sees the cumulative stream.
#
# The buffer is the source of truth for the in-flight cohort run. Each
# sub-agent invokes this helper ~30+ times per phase, so we keep the path
# short: under 1 second per invocation on a warm aws-cli.
#
# DO NOT shell-concatenate <target> / [meta] into the JSON — they can
# contain quotes / backslashes. The python3 builder handles escaping.
#
# Allowed <type> values (UI-mappable in app/live/LiveClient.tsx):
#   start | read | write | bash | build | deploy
#   gate-pass | gate-fail | score | ship
#

set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "usage: live-emit.sh <agent> <phase> <type> <target> [meta]" >&2
  exit 2
fi

AGENT="$1"
PHASE="$2"
TYPE="$3"
TARGET="$4"
META="${5:-}"

BUFFER="${CODERCUP_LIVE_BUFFER:-/tmp/codercup-live-buffer.jsonl}"
ACCOUNT_ID="${ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
S3_URI="${CODERCUP_LIVE_S3_URI:-s3://codearena-public-data-${ACCOUNT_ID}/live/world-cup-2026/cohort-3.jsonl}"
AWS_REGION="${CODERCUP_LIVE_REGION:-us-east-1}"

# Ensure buffer file exists. If it doesn't, pull the current S3 state first
# so we don't clobber events emitted from other machines (local seed, other
# agents, etc.). First-touch from each host syncs down; subsequent appends
# stay local + push up.
if [[ ! -f "$BUFFER" ]]; then
  aws s3 cp "$S3_URI" "$BUFFER" --region "$AWS_REGION" --no-progress 2>/dev/null \
    || touch "$BUFFER"
fi

# Build the JSON line via python3 — safe escaping for target/meta.
LINE="$(
  AGENT="$AGENT" PHASE="$PHASE" TYPE="$TYPE" TARGET="$TARGET" META="$META" \
  python3 -c '
import json
import os
from datetime import datetime, timezone

evt = {
    "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "agent": os.environ["AGENT"],
    "phase": int(os.environ["PHASE"]),
    "type": os.environ["TYPE"],
    "target": os.environ["TARGET"],
    "meta": os.environ["META"],
}
print(json.dumps(evt, separators=(",", ":")))
'
)"

# Append to the local buffer first (so we never lose an event if S3
# upload fails — the next emit will re-upload the cumulative file).
printf '%s\n' "$LINE" >> "$BUFFER"

# Push the full buffer to S3 (overwrite). --no-progress keeps stdout clean.
aws s3 cp "$BUFFER" "$S3_URI" \
  --region "$AWS_REGION" \
  --content-type application/jsonl \
  --cache-control 'public, max-age=60, s-maxage=60' \
  --no-progress >/dev/null

echo "live-emit: $TYPE $TARGET" >&2
