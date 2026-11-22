"""Engine behavior: collision detection terminates the run and is reproducible."""

from __future__ import annotations

from app.scenarios.models import CircleObstacleSpec, Scenario
from app.scenarios.presets import STATIC_BASIC
from app.simulation.robot import Command, RobotLimits, RobotState
from app.simulation.world import CircleObstacle, RunStatus, World
from tests.helpers import run_headless


def test_collision_is_terminal() -> None:
    scenario = Scenario(
        id="test-crash",
        name="head-on wall",
        width=10.0,
        height=10.0,
        start=(1.0, 5.0),
        goal=(9.0, 5.0),
        obstacles=[CircleObstacleSpec(cx=4.0, cy=5.0, radius=1.0)],
    )
    world = World(
        width=scenario.width,
        height=scenario.height,
        obstacles=[CircleObstacle(4.0, 5.0, 1.0)],
        goal=scenario.goal_position(),
        robot=RobotState(1.0, 5.0, 0.0),
        limits=RobotLimits(v_max=1.2, omega_max=2.5),
    )
    # Drive straight at the circle; no planner intervenes.
    for _ in range(1000):
        status = world.step(Command(v=world.limits.v_max, omega=0.0))
        if status is not RunStatus.RUNNING:
            break
    assert world.status is RunStatus.COLLIDED
    assert world.collision_count == 1


def test_same_seed_produces_same_run() -> None:
    world_a, _ = run_headless(STATIC_BASIC)
    world_b, _ = run_headless(STATIC_BASIC)
    assert world_a.status == world_b.status
    assert world_a.distance_traveled == world_b.distance_traveled
    assert world_a.sim_time == world_b.sim_time
    assert (world_a.robot.x, world_a.robot.y) == (world_b.robot.x, world_b.robot.y)
