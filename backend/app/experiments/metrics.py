"""Aggregate batch run records into per-algorithm summaries.

Failure visibility rule: EVERY run — reached, collided, timeout, stuck or
planning-failed — stays in every aggregate. ``success_rate`` and all means
are computed over ALL runs of the algorithm, never over survivors only, and
per-outcome counts are reported explicitly so failures stay visible.
"""

from __future__ import annotations

import dataclasses
import statistics

from app.experiments.runner import OUTCOME_PLANNING_FAILED, RunRecord
from app.simulation.world import RunStatus

# Canonical outcome keys, fixed order, always present (0 if never observed)
# so consumers get a stable shape.
OUTCOME_KEYS: list[str] = [
    status.value for status in RunStatus if status is not RunStatus.RUNNING
] + [OUTCOME_PLANNING_FAILED]


@dataclasses.dataclass(frozen=True, slots=True)
class AlgorithmSummary:
    """One algorithm aggregated across all its seeds."""

    algorithm: str
    runs: int
    success_rate: float  # reached_goal / runs (over ALL runs incl. failures)
    mean_sim_time: float
    median_sim_time: float
    mean_distance: float
    total_collisions: int
    mean_collisions: float
    mean_planning_ms: float
    mean_replans: float
    outcome_counts: dict[str, int]


def summarize(runs: list[RunRecord]) -> list[AlgorithmSummary]:
    """Aggregate runs per algorithm, preserving first-appearance order."""
    order: list[str] = []
    grouped: dict[str, list[RunRecord]] = {}
    for record in runs:
        if record.algorithm not in grouped:
            grouped[record.algorithm] = []
            order.append(record.algorithm)
        grouped[record.algorithm].append(record)

    summaries: list[AlgorithmSummary] = []
    for algorithm in order:
        records = grouped[algorithm]
        count = len(records)
        counts = {key: 0 for key in OUTCOME_KEYS}
        for record in records:
            counts[record.outcome] = counts.get(record.outcome, 0) + 1
        successes = counts.get("reached_goal", 0)
        total_collisions = sum(record.collision_count for record in records)
        summaries.append(
            AlgorithmSummary(
                algorithm=algorithm,
                runs=count,
                success_rate=successes / count,
                mean_sim_time=statistics.fmean(record.sim_time for record in records),
                median_sim_time=statistics.median([r.sim_time for r in records]),
                mean_distance=statistics.fmean(
                    record.distance_traveled for record in records
                ),
                total_collisions=total_collisions,
                mean_collisions=total_collisions / count,
                mean_planning_ms=statistics.fmean(
                    record.planning_ms for record in records
                ),
                mean_replans=sum(record.replans for record in records) / count,
                outcome_counts=counts,
            )
        )
    return summaries
