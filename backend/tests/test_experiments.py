"""Batch experiments: reproducibility, aggregation math, exports, API endpoint.

Reproducibility note: every run metric is deterministic for a given
(scenario, algorithm, seed) EXCEPT ``planning_ms`` — a wall-clock measurement
taken inside the planner (``time.perf_counter``). Reproducibility assertions
therefore compare all fields with planning_ms neutralized; that single field
is timing data, not simulation state.
"""

from __future__ import annotations

import csv
import dataclasses
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.experiments import metrics, runner
from app.experiments.export import RUNS_COLUMNS, SUMMARY_COLUMNS, write_exports
from app.main import app

SCENARIO = "static-basic"
ALGORITHMS = ["astar", "apf"]
SEEDS = [1, 2, 3]


@pytest.fixture(scope="module")
def batch_runs() -> list[runner.RunRecord]:
    return runner.run_batch(SCENARIO, ALGORITHMS, SEEDS)


def _without_planning_ms(records: list[runner.RunRecord]) -> list[runner.RunRecord]:
    return [dataclasses.replace(record, planning_ms=0.0) for record in records]


# -- runner ---------------------------------------------------------------


def test_batch_run_is_reproducible(batch_runs: list[runner.RunRecord]) -> None:
    """Same (scenario, algorithms, seeds) -> identical run metrics."""
    again = runner.run_batch(SCENARIO, ALGORITHMS, SEEDS)
    assert [r.algorithm for r in again] == [r.algorithm for r in batch_runs]
    assert [r.seed for r in again] == [r.seed for r in batch_runs]
    assert _without_planning_ms(again) == _without_planning_ms(batch_runs)


def test_batch_records_are_well_formed(batch_runs: list[runner.RunRecord]) -> None:
    """Every (algorithm, seed) pair ran exactly once with a data outcome."""
    assert [(r.algorithm, r.seed) for r in batch_runs] == [
        (algorithm, seed) for algorithm in ALGORITHMS for seed in SEEDS
    ]
    for record in batch_runs:
        assert record.outcome in metrics.OUTCOME_KEYS
        assert record.sim_time > 0.0
        assert record.distance_traveled >= 0.0
        assert record.collision_count >= 0
        assert record.replans >= 0
    # A* on the static preset must actually reach the goal: the engine's honest
    # verdict, not an assumed one.
    astar = [r for r in batch_runs if r.algorithm == "astar"]
    assert all(record.outcome == "reached_goal" for record in astar)
    # APF steers directly off the field: no planner, so no planning time and
    # no replans can exist.
    apf = [r for r in batch_runs if r.algorithm == "apf"]
    assert all(record.planning_ms == 0.0 and record.replans == 0 for record in apf)


def test_validate_batch_request_rejects_bad_input() -> None:
    with pytest.raises(runner.SessionError) as excinfo:
        runner.validate_batch_request("no-such-scenario", ["astar"], [1])
    assert excinfo.value.code == "unknown_scenario"
    with pytest.raises(runner.SessionError) as excinfo:
        runner.validate_batch_request(SCENARIO, ["dijkstra"], [1])
    assert excinfo.value.code == "unknown_algorithm"
    with pytest.raises(runner.SessionError) as excinfo:
        runner.validate_batch_request(SCENARIO, [], [1])
    assert excinfo.value.code == "invalid_request"
    with pytest.raises(runner.SessionError) as excinfo:
        runner.validate_batch_request(SCENARIO, ["astar"] * 5, [1])
    assert excinfo.value.code == "invalid_request"
    with pytest.raises(runner.SessionError) as excinfo:
        runner.validate_batch_request(SCENARIO, ["astar"], list(range(21)))
    assert excinfo.value.code == "invalid_request"


# -- aggregation ----------------------------------------------------------


def test_summary_math_includes_failures() -> None:
    """success_rate and all means are computed over ALL runs, failures too."""
    records = [
        runner.RunRecord("apf", 1, "reached_goal", 10.0, 16.0, 0, 0.0, 0),
        runner.RunRecord("apf", 2, "stuck", 6.0, 3.0, 1, 0.0, 0),
        runner.RunRecord("apf", 3, "timeout", 120.0, 20.0, 0, 40.0, 5),
    ]
    (summary,) = metrics.summarize(records)
    assert summary.algorithm == "apf"
    assert summary.runs == 3
    assert summary.success_rate == pytest.approx(1 / 3)
    assert summary.mean_sim_time == pytest.approx((10.0 + 6.0 + 120.0) / 3)
    assert summary.median_sim_time == pytest.approx(10.0)
    assert summary.mean_distance == pytest.approx((16.0 + 3.0 + 20.0) / 3)
    assert summary.total_collisions == 1
    assert summary.mean_collisions == pytest.approx(1 / 3)
    assert summary.mean_planning_ms == pytest.approx(40.0 / 3)
    assert summary.mean_replans == pytest.approx(5 / 3)
    assert summary.outcome_counts == {
        "reached_goal": 1,
        "collided": 0,
        "timeout": 1,
        "stuck": 1,
        "planning_failed": 0,
    }


def test_summary_matches_batch_runs(batch_runs: list[runner.RunRecord]) -> None:
    summaries = metrics.summarize(batch_runs)
    assert [s.algorithm for s in summaries] == ALGORITHMS
    for summary in summaries:
        records = [r for r in batch_runs if r.algorithm == summary.algorithm]
        assert summary.runs == len(records) == len(SEEDS)
        reached = sum(1 for r in records if r.outcome == "reached_goal")
        assert summary.success_rate == pytest.approx(reached / len(records))
        assert summary.total_collisions == sum(r.collision_count for r in records)
        assert sum(summary.outcome_counts.values()) == summary.runs
    # Outcome counts must reproduce the observed runs exactly.
    for record in batch_runs:
        summary = next(s for s in summaries if s.algorithm == record.algorithm)
        assert summary.outcome_counts[record.outcome] >= 1


# -- export ---------------------------------------------------------------


def test_export_writes_expected_files_and_columns(
    batch_runs: list[runner.RunRecord], tmp_path: Path
) -> None:
    summaries = metrics.summarize(batch_runs)
    paths = write_exports(
        batch_runs, summaries, SCENARIO, ALGORITHMS, SEEDS, base_dir=tmp_path
    )
    assert paths.runs_csv.is_file()
    assert paths.summary_csv.is_file()
    assert paths.results_json.is_file()
    assert paths.output_dir.name.startswith(f"{SCENARIO}_")

    with paths.runs_csv.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    assert rows[0] == RUNS_COLUMNS
    assert len(rows) == 1 + len(batch_runs)
    first = dict(zip(RUNS_COLUMNS, rows[1]))
    assert first["algorithm"] == batch_runs[0].algorithm
    assert int(first["seed"]) == batch_runs[0].seed
    assert first["outcome"] == batch_runs[0].outcome
    assert float(first["sim_time"]) == pytest.approx(batch_runs[0].sim_time)
    assert float(first["distance_traveled"]) == pytest.approx(
        batch_runs[0].distance_traveled
    )
    assert int(first["collision_count"]) == batch_runs[0].collision_count
    assert float(first["planning_ms"]) == pytest.approx(batch_runs[0].planning_ms)
    assert int(first["replans"]) == batch_runs[0].replans

    with paths.summary_csv.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    assert rows[0] == SUMMARY_COLUMNS
    assert len(rows) == 1 + len(summaries)
    by_algorithm = {row[0]: dict(zip(SUMMARY_COLUMNS, row)) for row in rows[1:]}
    for summary in summaries:
        row = by_algorithm[summary.algorithm]
        assert int(row["runs"]) == summary.runs
        assert float(row["success_rate"]) == pytest.approx(summary.success_rate)
        assert int(row["count_reached_goal"]) == summary.outcome_counts["reached_goal"]
        assert int(row["count_stuck"]) == summary.outcome_counts["stuck"]
        assert int(row["count_timeout"]) == summary.outcome_counts["timeout"]
        assert int(row["count_collided"]) == summary.outcome_counts["collided"]
        assert (
            int(row["count_planning_failed"])
            == summary.outcome_counts["planning_failed"]
        )

    with paths.results_json.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    assert set(payload) == {"metadata", "runs", "summary"}
    metadata = payload["metadata"]
    assert metadata["scenario"] == SCENARIO
    assert metadata["algorithms"] == ALGORITHMS
    assert metadata["seeds"] == SEEDS
    assert metadata["run_count"] == len(batch_runs)
    assert metadata["generated_at"]
    assert metadata["code_version"]
    assert len(payload["runs"]) == len(batch_runs)
    assert len(payload["summary"]) == len(summaries)
    assert payload["summary"][0]["outcome_counts"]["reached_goal"] >= 0


# -- API endpoint ---------------------------------------------------------


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_batch_endpoint_runs_aggregates_and_exports(client: TestClient) -> None:
    response = client.post(
        "/api/experiments/batch",
        json={"scenario_id": SCENARIO, "algorithms": ["astar"], "seeds": [1]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scenario_id"] == SCENARIO
    assert body["algorithms"] == ["astar"]
    assert body["seeds"] == [1]
    assert len(body["runs"]) == 1
    run = body["runs"][0]
    assert set(run) == {
        "algorithm",
        "seed",
        "outcome",
        "sim_time",
        "distance_traveled",
        "collision_count",
        "planning_ms",
        "replans",
    }
    assert run["outcome"] == "reached_goal"
    assert len(body["summary"]) == 1
    summary = body["summary"][0]
    assert summary["algorithm"] == "astar"
    assert summary["runs"] == 1
    assert summary["success_rate"] == pytest.approx(1.0)
    assert set(summary["outcome_counts"]) == set(metrics.OUTCOME_KEYS)
    assert set(body["files"]) == {"runs_csv", "summary_csv", "results_json"}
    output_dir = Path(body["output_dir"])
    try:
        assert output_dir.is_dir()
        for name in body["files"].values():
            assert (output_dir / name).is_file()
    finally:
        # The test created this timestamped export dir; remove it again.
        shutil.rmtree(output_dir, ignore_errors=True)


def test_batch_endpoint_unknown_algorithm_returns_error_body(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/experiments/batch",
        json={"scenario_id": SCENARIO, "algorithms": ["dijkstra"], "seeds": [1]},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "unknown_algorithm"
    assert body["error"]["message"]


def test_batch_endpoint_unknown_scenario_returns_error_body(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/experiments/batch",
        json={"scenario_id": "no-such-scenario", "algorithms": ["astar"], "seeds": [1]},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "unknown_scenario"


def test_batch_endpoint_enforces_size_caps(client: TestClient) -> None:
    response = client.post(
        "/api/experiments/batch",
        json={
            "scenario_id": SCENARIO,
            "algorithms": ["astar", "apf", "hybrid", "astar", "apf"],
            "seeds": [1],
        },
    )
    assert response.status_code == 422
    response = client.post(
        "/api/experiments/batch",
        json={"scenario_id": SCENARIO, "algorithms": ["astar"], "seeds": list(range(21))},
    )
    assert response.status_code == 422
