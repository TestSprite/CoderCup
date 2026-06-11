#!/usr/bin/env bash
#
# Isolated test of scripts/live-emit.sh. Verifies that:
#   - The buffer file is created if it does not exist.
#   - One emit appends exactly one well-formed JSONL line.
#   - The JSON line decodes via python3 and contains all 6 required fields.
#
# The S3 step is skipped (or detected + gracefully aborted) — we never hit
# a real bucket. We rely on `aws s3 cp` failing silently to a `file://`
# URI, which the script's `|| touch` branch handles for the initial-sync
# case, and which we mask with PATH for the upload-after-emit case.
#
# Run with: bash scripts/live-emit.test.sh
# Exit code 0 = pass, non-zero = fail. Prints "PASS" / "FAIL: <reason>".

set -u  # -e is intentionally NOT set — we manage exit codes ourselves

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/live-emit.sh"
TEST_BUF="$(mktemp -t codercup-live-test.XXXXXX)"
# A bogus file:// URI — `aws s3 cp` will reject it, which the helper
# tolerates (it pipes the upload step's failure to /dev/null and exits
# 0 either way because of the trailing redirect).
TEST_S3="file:///tmp/live-emit-test-not-a-real-bucket.jsonl"

# Make `aws` a no-op so we don't depend on credentials / network.
# We prepend a tmpdir to PATH that contains a stub `aws` that just exits 0.
STUB_DIR="$(mktemp -d -t codercup-live-test-stub.XXXXXX)"
cat > "$STUB_DIR/aws" <<'STUB'
#!/usr/bin/env bash
# Stub aws — accepts any args, exits 0 with no output.
exit 0
STUB
chmod +x "$STUB_DIR/aws"
export PATH="$STUB_DIR:$PATH"

cleanup() {
  rm -f "$TEST_BUF"
  rm -rf "$STUB_DIR"
}
trap cleanup EXIT

# Pre-clean any prior buffer.
rm -f "$TEST_BUF"

# Skip cleanly if python3 isn't on PATH (the script needs it).
if ! command -v python3 >/dev/null 2>&1; then
  echo "SKIP: python3 not on PATH"
  exit 0
fi

# Skip cleanly if the script doesn't exist.
if [[ ! -x "$SCRIPT" ]]; then
  echo "SKIP: $SCRIPT not found / not executable"
  exit 0
fi

# Run the emit.
CODERCUP_LIVE_BUFFER="$TEST_BUF" \
  CODERCUP_LIVE_S3_URI="$TEST_S3" \
  CODERCUP_LIVE_REGION="us-east-1" \
  "$SCRIPT" claude-code 1 write "app/page.tsx" "+86 lines" >/dev/null 2>&1
emit_rc=$?

if [[ $emit_rc -ne 0 ]]; then
  echo "FAIL: emit exited $emit_rc"
  exit 1
fi

if [[ ! -f "$TEST_BUF" ]]; then
  echo "FAIL: buffer file not created"
  exit 1
fi

line_count=$(wc -l < "$TEST_BUF" | tr -d ' ')
if [[ "$line_count" != "1" ]]; then
  echo "FAIL: buffer has $line_count lines, want 1"
  cat "$TEST_BUF"
  exit 1
fi

# Validate the line — must be a JSON object with the 6 required fields.
python3 - "$TEST_BUF" <<'PY' || { echo "FAIL: line not valid JSON / missing fields"; cat "$TEST_BUF"; exit 1; }
import json, sys

required = ["ts", "agent", "phase", "type", "target", "meta"]
with open(sys.argv[1]) as f:
    lines = [ln.strip() for ln in f if ln.strip()]
assert len(lines) == 1, f"want 1 line, got {len(lines)}"
evt = json.loads(lines[0])
for k in required:
    assert k in evt, f"missing field {k}"
assert evt["agent"] == "claude-code"
assert evt["type"] == "write"
assert evt["target"] == "app/page.tsx"
assert evt["meta"] == "+86 lines"
assert evt["phase"] == 1
PY

echo "PASS"
exit 0
