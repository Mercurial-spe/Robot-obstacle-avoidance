"""P0 base test 1: the robot reaches the goal in an empty arena."""

from __future__ import annotations

from app.scenarios.models import Scenario
from app.simulation.world import RunStatus
from tests.helpers import run_headless


def test_robot_reaches_goal_without_obstacles() -> None:
    scenario = Scenario(
        id="test-empty",
        name="empty arena",
        width=10.0,
        height=10.0,
        start=(1.0, 5.0),
        goal=(9.0, 5.0),
        obstacles=[],
    )
    world, _ = run_headless(scenario)
    assert world.status is RunStatus.REACHED_GOAL
    assert world.collision_count == 0
    assert world.sim_time < world.params.timeout_s
