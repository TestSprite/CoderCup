#!/usr/bin/env bash
#
# seed-live.sh — populate s3://codearena-public-data/live/world-cup-2026/
#                cohort-3.jsonl with the phase-1 cohort's real history so
#                the /live page replays a finished real run, not demo data.
#
# Reads the actual phase-1 scratch dirs at /tmp/codercup-runs/<agent>-phase-1/
# and walks each file's mtime to build a per-write event stream in true time
# order. Falls back gracefully if the scratch dirs are missing — emits an
# empty buffer so /live shows its honest "phase has not started" empty state.
#
# Data sources (in order of priority):
#   1. /tmp/codercup-runs/<agent>-phase-1/ — file mtimes + line counts
#      drive write events.
#   2. phase-1-review.md per scratch dir — drives the gate-pass event meta
#      (counted [x] items).
#   3. public/fixtures/leaderboard.json — drives ship URLs (real
#      per-(agent, event) Amplify reuse pattern) AND score event composite
#      values per agent (`composite` field from each ranking).
#   4. public/fixtures/agents/<slug>.json — drives the score event meta
#      (pass/fail/blocked counts from `per_test_verdicts`).
#
# Idempotent: rerunning overwrites the same object. Safe to invoke from
# any host with AWS creds that can PUT to the seed key.
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUFFER="${CODERCUP_LIVE_BUFFER:-/tmp/codercup-live-buffer.jsonl}"
ACCOUNT_ID="${ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
S3_URI="${CODERCUP_LIVE_S3_URI:-s3://codearena-public-data-${ACCOUNT_ID}/live/world-cup-2026/cohort-3.jsonl}"
AWS_REGION="${CODERCUP_LIVE_REGION:-us-east-1}"
SCRATCH_BASE="${CODERCUP_RUNS_BASE:-/tmp/codercup-runs}"

python3 - "$BUFFER" "$SCRATCH_BASE" "$REPO_ROOT" <<'PY'
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

buffer_path = sys.argv[1]
scratch_base = sys.argv[2]
repo_root = sys.argv[3]

# Build the seed from real scratch dirs if present. If they're not (e.g.
# this is being run from a fresh checkout or a different host), emit an
# empty buffer and let /live show its honest empty state.
agents = [
    ("claude-code", "claude-code-phase-1"),
    ("codex",       "codex-phase-1"),
    ("antigravity", "antigravity-phase-1"),
]

EXCLUDE_DIRS = {"node_modules", ".next", "out"}
EXCLUDE_FILES = {
    "package-lock.json",
    "next-env.d.ts",
    "tsconfig.json",
    "next.config.js",
    "global.d.ts",
}

def gather_writes(scratch_dir):
    """Walk the scratch dir; return list of (mtime, rel_path, line_count)."""
    rows = []
    if not os.path.isdir(scratch_dir):
        return rows
    for root, dirs, files in os.walk(scratch_dir):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f in EXCLUDE_FILES:
                continue
            fp = os.path.join(root, f)
            try:
                mt = os.path.getmtime(fp)
                rel = os.path.relpath(fp, scratch_dir)
                try:
                    with open(fp, "rb") as fh:
                        lines = sum(1 for _ in fh)
                except OSError:
                    lines = 0
                rows.append((mt, rel, lines))
            except OSError:
                pass
    rows.sort()
    return rows

def count_checked(review_path):
    """Count `[x]` checked items in the phase-1-review.md, used as the
    gate-pass meta string."""
    try:
        with open(review_path, "r", encoding="utf-8") as fh:
            return sum(1 for line in fh if "[x]" in line)
    except OSError:
        return 0

# Load real ship URLs + composite scores from the leaderboard (post-grade).
ship_urls = {}
composites = {}
try:
    leaderboard = Path(repo_root) / "public/fixtures/leaderboard.json"
    with open(leaderboard, "r", encoding="utf-8") as fh:
        data = json.load(fh)
        for entry in data.get("rankings", []):
            slug = entry.get("agent_slug")
            url = entry.get("deployed_app_url")
            comp = entry.get("composite")
            verdicts = entry.get("phase_1_verdicts", {})
            if slug and url:
                ship_urls[slug] = url
            if slug and comp is not None:
                composites[slug] = {
                    "composite": comp,
                    "passed": verdicts.get("passed", 0),
                    "failed": verdicts.get("failed", 0),
                    "blocked": verdicts.get("blocked", 0),
                }
except OSError:
    pass

# Collect per-agent telemetry.
agent_data = {}
all_mtimes = []
for slug, dir_name in agents:
    scratch_dir = os.path.join(scratch_base, dir_name)
    writes = gather_writes(scratch_dir)
    review_path = os.path.join(scratch_dir, "phase-1-review.md")
    review_count = count_checked(review_path)
    review_mtime = None
    if os.path.exists(review_path):
        try:
            review_mtime = os.path.getmtime(review_path)
        except OSError:
            pass
    agent_data[slug] = {
        "writes": writes,
        "review_count": review_count,
        "review_mtime": review_mtime,
    }
    all_mtimes.extend(mt for mt, _, _ in writes)
    if review_mtime:
        all_mtimes.append(review_mtime)

# If we have no telemetry at all → emit empty buffer so /live falls into
# its honest empty state ("Cohort 3 · Phase 2 hasn't started yet").
if not all_mtimes:
    with open(buffer_path, "w", encoding="utf-8") as fh:
        fh.write("")
    print("no scratch dirs found — emitting empty buffer", file=sys.stderr)
    sys.exit(0)

# Pin t0 to the earliest real mtime across all agents.
t0_epoch = min(all_mtimes)
t0_dt = datetime.fromtimestamp(t0_epoch, tz=timezone.utc)

def offset_iso(epoch):
    """Convert real-clock epoch to ISO at offset from t0."""
    delta = epoch - t0_epoch
    return (t0_dt + timedelta(seconds=delta)).strftime("%Y-%m-%dT%H:%M:%SZ")

events = []

def emit(epoch, agent, type_, target, meta=""):
    events.append({
        "ts": offset_iso(epoch),
        "agent": agent,
        "phase": 1,
        "type": type_,
        "target": target,
        "meta": meta,
        "_sort": epoch,
    })

# start event: anchored to each agent's first write.
for slug, _ in agents:
    writes = agent_data[slug]["writes"]
    if writes:
        emit(writes[0][0] - 1, slug, "start", "phase-1 · landing page", "elapsed 0:00")

# write events: one per real file mtime.
for slug, _ in agents:
    for mt, rel, lines in agent_data[slug]["writes"]:
        # Skip the spec.md read-only — it's the input, not a write.
        if rel in ("spec.md", "fixtures.json"):
            continue
        meta = f"+{lines} lines" if lines > 0 else "binary / empty"
        emit(mt, slug, "write", rel, meta)

# gate-pass: phase-1-review.md mtime + real [x] count.
for slug, _ in agents:
    rm = agent_data[slug]["review_mtime"]
    rc = agent_data[slug]["review_count"]
    if rm and rc:
        emit(rm, slug, "gate-pass", "phase-1-review.md", f"{rc} items checked")

# score: TestSprite composites from the (now-graded) leaderboard.
# Each agent's score event lands ~15-30s after their gate-pass; together
# they trigger the /live phase-complete banner.
for slug, _ in agents:
    rm = agent_data[slug]["review_mtime"]
    comp = composites.get(slug)
    if not rm or not comp:
        continue
    composite = comp["composite"]
    meta = (
        f"pass {comp['passed']} · "
        f"fail {comp['failed']} · "
        f"blocked {comp['blocked']}"
    )
    emit(rm + 15, slug, "score", f"composite {composite:.3f}", meta)

# ship: last mtime + real Amplify URL.
for slug, _ in agents:
    writes = agent_data[slug]["writes"]
    rm = agent_data[slug]["review_mtime"]
    url = ship_urls.get(slug)
    if not writes or not url:
        continue
    # Treat the latest mtime (write OR review) as the ship moment.
    last_epoch = max(writes[-1][0], rm or 0)
    first_epoch = writes[0][0]
    elapsed_s = int(last_epoch - first_epoch)
    em = elapsed_s // 60
    es = elapsed_s % 60
    emit(last_epoch + 1, slug, "ship", url, f"elapsed {em}:{es:02d}")

# Re-sort by epoch (already in events as _sort) so the JSONL is in true time order.
events.sort(key=lambda e: e["_sort"])
for e in events:
    e.pop("_sort", None)

with open(buffer_path, "w", encoding="utf-8") as fh:
    for e in events:
        fh.write(json.dumps(e, separators=(",", ":")))
        fh.write("\n")

print(f"wrote {len(events)} real-data events to {buffer_path}", file=sys.stderr)
PY

# If the buffer is empty (no scratch dirs available), still upload it so
# S3 reflects the honest "no data" state.
aws s3 cp "$BUFFER" "$S3_URI" \
  --region "$AWS_REGION" \
  --content-type application/jsonl \
  --cache-control 'public, max-age=60, s-maxage=60' \
  --no-progress

LINE_COUNT=$(wc -l < "$BUFFER" | tr -d ' ')
echo "seed-live: uploaded $LINE_COUNT events to $S3_URI" >&2
