#!/usr/bin/env python3
"""Compare agent iteration runs side-by-side. Reads /tmp/iterate-<agent>-*/
output dirs and produces a markdown table plus per-run detail.

Usage:
    ./scripts/compare-agents.py /tmp/iterate-claude-code-20260525-190754 /tmp/iterate-codex-20260525-190903
"""
import json
import glob
import os
import re
import statistics
import sys


def load_runs(rundir):
    runs = []
    for meta_path in sorted(glob.glob(f"{rundir}/run-*.meta.json")):
        n = int(re.search(r"run-(\d+)", meta_path).group(1))
        with open(meta_path) as f:
            meta = json.load(f)
        stdout_path = meta_path.replace(".meta.json", ".stdout")
        stderr_path = meta_path.replace(".meta.json", ".stderr")
        meta["n"] = n
        meta["stdout"] = (
            open(stdout_path).read().strip() if os.path.exists(stdout_path) else ""
        )
        meta["stderr"] = (
            open(stderr_path).read().strip() if os.path.exists(stderr_path) else ""
        )
        # Patch codex token count (script's parser missed the two-line format)
        if "iterate-codex-" in rundir and meta.get("tokens_total", 0) == 0:
            m = re.search(r"^tokens used\s*\n\s*([\d,]+)", meta["stderr"], re.MULTILINE)
            if m:
                meta["tokens_total"] = int(m.group(1).replace(",", ""))
        # Extract the agent's prediction JSON from stdout
        body = meta["stdout"]
        if "iterate-claude-code" in rundir:
            # claude --output-format json wraps the response in a top-level
            # {"result": "<text>", "usage": {...}, ...} envelope.
            try:
                envelope = json.loads(body)
                body = envelope.get("result", "")
            except Exception:
                pass
        body = body.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        try:
            meta["prediction"] = json.loads(body)
            meta["schema_ok"] = (
                isinstance(meta["prediction"].get("predicted_score"), str)
                and 0 <= meta["prediction"].get("win_probability_brazil", -1) <= 1
                and len(meta["prediction"].get("reasoning", "")) >= 20
            )
        except Exception:
            meta["prediction"] = None
            meta["schema_ok"] = False
        runs.append(meta)
    return runs


def stats(values):
    if not values:
        return {"mean": 0, "median": 0, "min": 0, "max": 0, "stdev": 0}
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "stdev": statistics.stdev(values) if len(values) > 1 else 0,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: compare-agents.py <rundir1> [<rundir2> ...]")
        sys.exit(1)

    agents = []
    for rundir in sys.argv[1:]:
        name = (
            os.path.basename(rundir)
            .replace("iterate-", "")
            .rsplit("-", 2)[0]
        )
        runs = load_runs(rundir)
        if not runs:
            print(f"  (no runs in {rundir})")
            continue
        wall = [r["elapsed_ms"] / 1000 for r in runs]
        tokens = [r.get("tokens_total", 0) for r in runs]
        schema_ok = sum(1 for r in runs if r["schema_ok"])
        agents.append(
            {
                "name": name,
                "runs": len(runs),
                "wall": stats(wall),
                "tokens": stats(tokens),
                "schema_ok": schema_ok,
                "raw": runs,
            }
        )

    print(f"# Agent performance comparison — {len(agents)} agents × N iterations")
    print()
    print(f"Task: predict Brazil vs Croatia R16 (regulation scoreline + P(Brazil) + reasoning).")
    print(f"Schema gate: predicted_score is 'N-M[suffix]', win_probability_brazil ∈ [0,1], reasoning ≥ 20 chars.")
    print()
    print("## Aggregate")
    print()
    print("| Agent | N | Wall clock (s) | Tokens | Schema-pass | P(Brazil) range | Score range |")
    print("|---|---|---|---|---|---|---|")
    for a in agents:
        probs = [r["prediction"].get("win_probability_brazil") for r in a["raw"] if r.get("prediction")]
        scores = [r["prediction"].get("predicted_score") for r in a["raw"] if r.get("prediction")]
        prob_range = (
            f"{min(probs):.2f}–{max(probs):.2f}" if probs else "n/a"
        )
        score_set = sorted(set(scores))
        score_str = ", ".join(score_set) if score_set else "n/a"
        print(
            f"| **{a['name']}** | {a['runs']} | "
            f"mean {a['wall']['mean']:.1f} (σ {a['wall']['stdev']:.1f}, range {a['wall']['min']:.1f}–{a['wall']['max']:.1f}) | "
            f"mean {int(a['tokens']['mean'])} (range {int(a['tokens']['min'])}–{int(a['tokens']['max'])}) | "
            f"{a['schema_ok']}/{a['runs']} | "
            f"{prob_range} | "
            f"{score_str} |"
        )
    print()

    print("## Per-run detail")
    for a in agents:
        print(f"\n### {a['name']}")
        print()
        print("| # | Wall (s) | Tokens | Score | P(Brazil) | Schema |")
        print("|---|---|---|---|---|---|")
        for r in a["raw"]:
            pred = r.get("prediction") or {}
            print(
                f"| {r['n']} | {r['elapsed_ms']/1000:.1f} | "
                f"{r.get('tokens_total', 0)} | "
                f"{pred.get('predicted_score', 'n/a')} | "
                f"{pred.get('win_probability_brazil', 'n/a')} | "
                f"{'✓' if r['schema_ok'] else '✗'} |"
            )


if __name__ == "__main__":
    main()
