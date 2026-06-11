#!/usr/bin/env python3
"""Aggregate the suite-run ledgers for multiple agent deployments and
produce a side-by-side comparison report.

Usage:
    ./scripts/compare-arena-runs.py \\
        claude-code:/tmp/suite-run-CLAUDE_TS \\
        codex:/tmp/suite-run-CODEX_TS \\
        antigravity:/tmp/suite-run-AGY_TS
"""
import json
import glob
import os
import re
import sys


def load_ledger(rundir):
    """Read every per-test JSON in rundir, parse status + step counts."""
    results = []
    for f in sorted(glob.glob(f"{rundir}/*.json")):
        test_id = os.path.basename(f).replace(".json", "")
        # Skip the ledger.jsonl itself
        if test_id == "ledger":
            continue
        try:
            with open(f) as fp:
                text = fp.read().strip()
            if not text:
                results.append({"test_id": test_id, "status": "cli-empty-output"})
                continue
            try:
                d = json.loads(text)
            except Exception:
                d = None
                for chunk in text.replace("}\n{", "}|||{").split("|||"):
                    try:
                        cand = json.loads(chunk.strip())
                        if cand.get("status") or cand.get("run"):
                            d = cand
                            break
                    except Exception:
                        continue
                if d is None:
                    results.append({"test_id": test_id, "status": "parse-error"})
                    continue
            run = d.get("run") or d
            results.append({
                "test_id": test_id,
                "status": run.get("status") or d.get("status") or "unknown",
                "passed": (run.get("stepSummary") or {}).get("passedCount", 0),
                "failed": (run.get("stepSummary") or {}).get("failedCount", 0),
                "failureKind": run.get("failureKind"),
            })
        except Exception as e:
            results.append({"test_id": test_id, "status": "parse-error", "err": str(e)})
    return results


def aggregate(results):
    """Return composite-correctness-style summary."""
    buckets = {}
    for r in results:
        buckets[r["status"]] = buckets.get(r["status"], 0) + 1
    passed = buckets.get("passed", 0)
    failed = buckets.get("failed", 0)
    blocked = buckets.get("blocked", 0) + buckets.get("inconclusive", 0)
    empty = buckets.get("cli-empty-output", 0) + buckets.get("parse-error", 0)
    total = len(results)
    definite = passed + failed
    # Per scoring rubric: correctness = passed / (passed + failed)
    correctness = (passed / definite) if definite > 0 else 0.0
    return {
        "total": total,
        "passed": passed,
        "failed": failed,
        "blocked": blocked,
        "empty": empty,
        "correctness": correctness,
        "buckets": buckets,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: compare-arena-runs.py <agent>:<rundir> ...")
        sys.exit(1)

    agents = []
    for arg in sys.argv[1:]:
        if ":" not in arg:
            print(f"  bad arg: {arg}; expected <agent>:<rundir>")
            continue
        name, rundir = arg.split(":", 1)
        results = load_ledger(rundir)
        agents.append({
            "name": name,
            "rundir": rundir,
            "results": results,
            "agg": aggregate(results),
        })

    print(f"# Arena cross-agent comparison — {len(agents)} agents × 34-plan suite")
    print()
    print("## Composite-correctness ranking")
    print()
    print("| Agent | passed | failed | blocked | empty | total | correctness | composite (0.5×c) |")
    print("|---|---|---|---|---|---|---|---|")
    sorted_agents = sorted(agents, key=lambda a: -a["agg"]["correctness"])
    for a in sorted_agents:
        ag = a["agg"]
        comp_share = 0.5 * ag["correctness"]
        print(
            f"| **{a['name']}** | {ag['passed']} | {ag['failed']} | {ag['blocked']} | {ag['empty']} | "
            f"{ag['total']} | **{ag['correctness']:.3f}** | {comp_share:.3f} |"
        )
    print()
    print("(composite share = 0.5 × correctness — the leaderboard composite also adds 0.3 × bugs + 0.2 × efficiency)")
    print()

    # Per-plan matrix: each plan ID → status per agent
    all_test_ids = set()
    for a in agents:
        for r in a["results"]:
            all_test_ids.add(r["test_id"])
    sorted_ids = sorted(all_test_ids)

    print("## Per-plan verdicts")
    print()
    print("| testId | " + " | ".join(a["name"] for a in agents) + " |")
    print("|---|" + "|".join("---" for _ in agents) + "|")
    for tid in sorted_ids:
        row = [tid[:8]]
        for a in agents:
            status = next(
                (r["status"] for r in a["results"] if r["test_id"] == tid),
                "—",
            )
            symbol = {
                "passed": "✓",
                "failed": "✗",
                "blocked": "·",
                "inconclusive": "·",
                "cli-empty-output": "○",
                "parse-error": "?",
            }.get(status, status)
            row.append(symbol)
        print("| " + " | ".join(row) + " |")
    print()
    print("Legend: ✓ passed · ✗ failed · · blocked/inconclusive · ○ no CLI output · ? parse error")


if __name__ == "__main__":
    main()
