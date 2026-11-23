"""CSV / JSON export of batch experiment results. Stdlib csv/json only.

Outputs (into ``backend/exports/{scenario_id}_{yyyymmdd_hhmmss}/``):

- ``runs.csv``      one row per run (flat metrics)
- ``summary.csv``   one row per algorithm (aggregates, outcome counts flattened)
- ``results.json``  both levels + metadata (scenario, algorithms, seeds,
  generated_at, code version hint)
"""

from __future__ import annotations

import csv
import dataclasses
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.experiments.metrics import AlgorithmSummary
from app.experiments.runner import RunRecord

RUNS_COLUMNS: list[str] = [
    "algorithm",
    "seed",
    "outcome",
    "sim_time",
    "distance_traveled",
    "collision_count",
    "planning_ms",
    "replans",
]

SUMMARY_COLUMNS: list[str] = [
    "algorithm",
    "runs",
    "success_rate",
    "mean_sim_time",
    "median_sim_time",
    "mean_distance",
    "total_collisions",
    "mean_collisions",
    "mean_planning_ms",
    "mean_replans",
    "count_reached_goal",
    "count_collided",
    "count_timeout",
    "count_stuck",
    "count_planning_failed",
]

RESULTS_JSON_NAME = "results.json"
RUNS_CSV_NAME = "runs.csv"
SUMMARY_CSV_NAME = "summary.csv"


@dataclasses.dataclass(frozen=True, slots=True)
class ExportPaths:
    output_dir: Path
    runs_csv: Path
    summary_csv: Path
    results_json: Path


def backend_root() -> Path:
    """``backend/`` directory (exports live under ``backend/exports/``)."""
    return Path(__file__).resolve().parents[2]


def code_version() -> str:
    """Best-effort version hint: short git hash of the backend repo."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=backend_root(),
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "unknown"


def _unique_dir(candidate: Path) -> Path:
    """``{scenario}_{timestamp}`` may collide within one second — disambiguate."""
    if not candidate.exists():
        return candidate
    for index in range(1, 1000):
        suffixed = candidate.with_name(f"{candidate.name}_{index}")
        if not suffixed.exists():
            return suffixed
    raise RuntimeError(f"could not find a free export directory under {candidate.parent}")


def write_exports(
    runs: list[RunRecord],
    summaries: list[AlgorithmSummary],
    scenario_id: str,
    algorithms: list[str],
    seeds: list[int],
    *,
    base_dir: Path | None = None,
) -> ExportPaths:
    """Write runs.csv / summary.csv / results.json and return their paths."""
    exports_root = Path(base_dir) if base_dir is not None else backend_root() / "exports"
    exports_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = _unique_dir(exports_root / f"{scenario_id}_{stamp}")
    output_dir.mkdir(parents=True)

    runs_csv = output_dir / RUNS_CSV_NAME
    with runs_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(RUNS_COLUMNS)
        for record in runs:
            writer.writerow([getattr(record, column) for column in RUNS_COLUMNS])

    summary_csv = output_dir / SUMMARY_CSV_NAME
    with summary_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(SUMMARY_COLUMNS)
        for summary in summaries:
            counts = summary.outcome_counts
            row = [
                summary.algorithm,
                summary.runs,
                summary.success_rate,
                summary.mean_sim_time,
                summary.median_sim_time,
                summary.mean_distance,
                summary.total_collisions,
                summary.mean_collisions,
                summary.mean_planning_ms,
                summary.mean_replans,
                counts.get("reached_goal", 0),
                counts.get("collided", 0),
                counts.get("timeout", 0),
                counts.get("stuck", 0),
                counts.get("planning_failed", 0),
            ]
            writer.writerow(row)

    results_json = output_dir / RESULTS_JSON_NAME
    payload = {
        "metadata": {
            "scenario": scenario_id,
            "algorithms": list(algorithms),
            "seeds": list(seeds),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "code_version": code_version(),
            "run_count": len(runs),
        },
        "runs": [dataclasses.asdict(record) for record in runs],
        "summary": [dataclasses.asdict(summary) for summary in summaries],
    }
    with results_json.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)

    return ExportPaths(
        output_dir=output_dir,
        runs_csv=runs_csv,
        summary_csv=summary_csv,
        results_json=results_json,
    )
