"""Pydantic transport models for the batch experiment API.

Note: no ``from __future__ import annotations`` here — FastAPI resolves these
models' annotations eagerly (see .trellis/spec/backend/error-handling.md).
Python 3.11 handles the ``X | Y`` unions natively at runtime.
"""

from pydantic import BaseModel, Field

from app.experiments.runner import MAX_ALGORITHMS, MAX_SEEDS


class BatchExperimentRequest(BaseModel):
    """POST /api/experiments/batch body.

    The size caps are enforced here (FastAPI answers 422 for malformed
    bodies, the documented convention); scenario/algorithm existence is a
    domain check answered with the structured 400 error body.
    """

    scenario_id: str
    algorithms: list[str] = Field(min_length=1, max_length=MAX_ALGORITHMS)
    seeds: list[int] = Field(min_length=1, max_length=MAX_SEEDS)


class ExperimentRunOut(BaseModel):
    """One completed headless run (mirrors runner.RunRecord)."""

    algorithm: str
    seed: int
    outcome: str  # reached_goal | collided | timeout | stuck | planning_failed
    sim_time: float
    distance_traveled: float
    collision_count: int
    planning_ms: float
    replans: int


class ExperimentSummaryOut(BaseModel):
    """One algorithm aggregated across all requested seeds."""

    algorithm: str
    runs: int
    success_rate: float
    mean_sim_time: float
    median_sim_time: float
    mean_distance: float
    total_collisions: int
    mean_collisions: float
    mean_planning_ms: float
    mean_replans: float
    outcome_counts: dict[str, int]


class BatchExperimentOut(BaseModel):
    """POST /api/experiments/batch response: both data levels + export info."""

    scenario_id: str
    algorithms: list[str]
    seeds: list[int]
    runs: list[ExperimentRunOut]
    summary: list[ExperimentSummaryOut]
    output_dir: str
    files: dict[str, str]  # runs_csv | summary_csv | results_json -> file name
