"""Headless batch experiment runner.

Batch runs reuse the EXACT session machinery that live sessions use
(``app.api.sessions.Session``): the same world construction, the same
planner, the same replanning policy, the same controller interface and the
same ``World.step`` engine — so a batch run and a live session of the same
``(scenario, algorithm, seed)`` cannot diverge. (``app.api.sessions`` imports
no FastAPI; this module must not either.)

Outcomes are DATA, never exceptions: ``reached_goal`` / ``collided`` /
``timeout`` / ``stuck`` come straight from the engine's ``RunStatus``. One
extra honest outcome exists, ``planning_failed``, for runs whose very first
plan found no path (no motion happened; recording it as ``timeout`` would
launder the failure). Failures are never dropped from aggregates.

Determinism: same inputs -> identical ``outcome`` / ``sim_time`` /
``distance_traveled`` / ``collision_count`` / ``replans``. ``planning_ms`` is
a wall-clock measurement (``time.perf_counter`` inside the planner) and is
therefore the ONE field excluded from reproducibility comparisons.
"""

from __future__ import annotations

import dataclasses
import math

from app.api.sessions import ALGORITHMS, Session, SessionError
from app.scenarios.presets import PRESETS
from app.simulation.world import RunStatus

# Additional outcome beyond RunStatus: the very first plan found no path.
OUTCOME_PLANNING_FAILED = "planning_failed"

# Request caps enforced both here (headless, 400 via SessionError) and in the
# Pydantic request model (API, 422 via validation).
MAX_ALGORITHMS = 4
MAX_SEEDS = 20


@dataclasses.dataclass(frozen=True, slots=True)
class RunRecord:
    """Metrics of ONE complete headless run."""

    algorithm: str
    seed: int
    outcome: str
    sim_time: float
    distance_traveled: float
    collision_count: int
    planning_ms: float  # total across the initial plan and all replans
    replans: int


def validate_batch_request(
    scenario_id: str, algorithms: list[str], seeds: list[int]
) -> None:
    """Validate a batch request; raises ``SessionError`` (API maps to 400)."""
    if scenario_id not in PRESETS:
        raise SessionError(
            "unknown_scenario", f"scenario {scenario_id!r} does not exist"
        )
    if not algorithms:
        raise SessionError("invalid_request", "algorithms must not be empty")
    if not seeds:
        raise SessionError("invalid_request", "seeds must not be empty")
    if len(algorithms) > MAX_ALGORITHMS:
        raise SessionError(
            "invalid_request",
            f"at most {MAX_ALGORITHMS} algorithms per batch (got {len(algorithms)})",
        )
    if len(seeds) > MAX_SEEDS:
        raise SessionError(
            "invalid_request",
            f"at most {MAX_SEEDS} seeds per batch (got {len(seeds)})",
        )
    unknown = [algorithm for algorithm in algorithms if algorithm not in ALGORITHMS]
    if unknown:
        raise SessionError(
            "unknown_algorithm",
            f"algorithm {unknown[0]!r} is not available",
        )


def run_single(
    scenario_id: str,
    algorithm: str,
    seed: int,
    *,
    safety_margin: float = 0.15,
    v_max: float | None = None,
) -> RunRecord:
    """Run ONE complete (scenario, algorithm, seed) episode headlessly.

    Uses the live ``Session`` machinery with default fairness parameters
    (safety_margin 0.15, no v_max override — the same defaults a live session
    gets), advances it in one headless burst until the engine reports a
    terminal status, then reads the run's metrics off the session/world.
    """
    session = Session(
        scenario_id,
        algorithm,
        seed,
        speed=1.0,
        safety_margin=safety_margin,
        v_max=v_max,
    )
    world = session.world
    assert world is not None
    if session.follower is None:
        # The very first plan failed: no motion happened. Record it honestly.
        return RunRecord(
            algorithm=algorithm,
            seed=seed,
            outcome=OUTCOME_PLANNING_FAILED,
            sim_time=world.sim_time,
            distance_traveled=world.distance_traveled,
            collision_count=world.collision_count,
            planning_ms=session.planning_ms,
            replans=session.replans,
        )
    max_steps = int(math.ceil(world.params.timeout_s / world.params.dt)) + 1
    session.advance_steps(max_steps)
    if world.status is RunStatus.RUNNING:
        raise RuntimeError(
            f"run (scenario={scenario_id} algorithm={algorithm} seed={seed}) "
            f"did not terminate within {max_steps} steps"
        )
    return RunRecord(
        algorithm=algorithm,
        seed=seed,
        outcome=world.status.value,
        sim_time=world.sim_time,
        distance_traveled=world.distance_traveled,
        collision_count=world.collision_count,
        planning_ms=session.planning_ms,
        replans=session.replans,
    )


def run_batch(
    scenario_id: str,
    algorithms: list[str],
    seeds: list[int],
    *,
    safety_margin: float = 0.15,
    v_max: float | None = None,
) -> list[RunRecord]:
    """Run every (algorithm, seed) pair in order; deterministic record order."""
    validate_batch_request(scenario_id, algorithms, seeds)
    records: list[RunRecord] = []
    for algorithm in algorithms:
        for seed in seeds:
            records.append(
                run_single(
                    scenario_id,
                    algorithm,
                    seed,
                    safety_margin=safety_margin,
                    v_max=v_max,
                )
            )
    return records
