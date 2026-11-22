"""P0 base test 2: the robot detours around static obstacles without colliding."""

from __future__ import annotations

from app.scenarios.presets import STATIC_BASIC
from app.simulation.world import RunStatus
from tests.helpers import run_headless


def test_robot_detours_around_static_obstacles() -> None:
    world, follower = run_headless(STATIC_BASIC)
    assert world.status is RunStatus.REACHED_GOAL
    assert world.collision_count == 0
    # The broken wall forces a detour: the path must leave the straight line.
    waypoints = [wp for wp in follower.waypoints]
    assert any(abs(wp.y - 6.0) > 1.0 for wp in waypoints)
    assert world.sim_time < world.params.timeout_s
