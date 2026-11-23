"""P1 extended-scenario tests: every preset must be honestly solvable.

Static presets are planned once and executed headless (A*, no replanning —
fine because nothing moves). Dynamic presets are run through the full
Session loop (which replans exactly like the live server) for ALL THREE
algorithms: a preset that an algorithm cannot solve would be a demo trap,
not a scenario.
"""

from __future__ import annotations

import pytest

from app.api.sessions import Session
from app.scenarios.presets import (
    DYNAMIC_DOUBLE_CROSSING,
    DYNAMIC_PATROL_LINE,
    STATIC_SLALOM,
)
from app.simulation.world import RunStatus
from tests.helpers import run_headless

# 2600 steps = 130 s simulated time; the scenario timeout is 120 s, so the
# loop can never cut an honest run short.
STEP_BUDGET = 2600


def test_slalom_route_actually_zigzags() -> None:
    """The staggered gates must push the route through BOTH height bands."""
    world, follower = run_headless(STATIC_SLALOM)
    assert world.status is RunStatus.REACHED_GOAL
    ys = [wp.y for wp in follower.waypoints]
    assert any(y > 6.5 for y in ys), "route never used the bottom-hung gate gap"
    # Gate 2 hangs from y=4.5; with inflation the route can only clear it
    # below y=4.1 — passing there proves it threaded the floor-hung gap.
    assert any(y < 4.1 for y in ys), "route never used the floor-hung gate gap"


@pytest.mark.parametrize("algorithm", ["astar", "apf", "hybrid"])
@pytest.mark.parametrize("scenario_id", ["dynamic-double-crossing", "dynamic-patrol-line"])
def test_dynamic_scenarios_solvable_by_every_algorithm(
    scenario_id: str, algorithm: str,
) -> None:
    session = Session(scenario_id, algorithm, seed=1, speed=1.0)
    session.advance_steps(STEP_BUDGET)
    world = session.world
    assert world is not None
    assert world.status is RunStatus.REACHED_GOAL, (
        f"{algorithm} on {scenario_id} ended as {world.status.value} "
        f"(best goal distance {world._best_goal_distance:.2f} m)"
    )
    assert world.collision_count == 0
    assert world.sim_time < world.params.timeout_s
