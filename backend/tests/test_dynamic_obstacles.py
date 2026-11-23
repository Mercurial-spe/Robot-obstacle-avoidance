"""Dynamic obstacles: deterministic motion, terminal collisions, replanning."""

from __future__ import annotations

import pytest

from app.api.sessions import Session
from app.scenarios.build import build_world
from app.scenarios.presets import DYNAMIC_CROSSING
from app.simulation.dynamic import DynamicCircleObstacle, PingPongMotion, is_dynamic
from app.simulation.geometry import Vec2
from app.simulation.robot import Command, RobotLimits, RobotState
from app.simulation.world import RunStatus, World
from tests.helpers import run_headless


def _dynamic_poses(world: World) -> list[tuple[float, float, float, float]]:
    poses = []
    for obstacle in world.obstacles:
        if isinstance(obstacle, DynamicCircleObstacle):
            poses.append((obstacle.cx, obstacle.cy, obstacle.vx, obstacle.vy))
        elif is_dynamic(obstacle):
            poses.append((obstacle.x, obstacle.y, obstacle.vx, obstacle.vy))
    return poses


def test_dynamic_motion_is_deterministic() -> None:
    """Same scenario + seed -> identical obstacle poses (and velocities) at t=5s."""
    world_a = build_world(DYNAMIC_CROSSING)
    world_b = build_world(DYNAMIC_CROSSING)
    zero = Command(v=0.0, omega=0.0)
    for _ in range(100):  # 100 * 0.05s = 5.0s
        world_a.step(zero)
        world_b.step(zero)
    assert world_a.sim_time == pytest.approx(5.0)
    assert world_b.sim_time == pytest.approx(5.0)
    poses_a = _dynamic_poses(world_a)
    poses_b = _dynamic_poses(world_b)
    assert poses_a == poses_b
    assert poses_a, "scenario must contain dynamic obstacles"
    # Pure-function check: querying a past time gives the same pose again.
    obstacle = world_a.obstacles[0]
    assert is_dynamic(obstacle)
    pose_now = obstacle.pose_at(5.0)
    pose_again = obstacle.pose_at(5.0)
    assert pose_now == pose_again


def test_robot_colliding_with_moving_obstacle_is_terminal() -> None:
    """A dynamic obstacle driving into the robot's path ends the run as COLLIDED."""
    world = World(
        width=10.0,
        height=10.0,
        obstacles=[
            DynamicCircleObstacle(
                base_x=5.0,
                base_y=1.0,
                radius=0.8,
                motion=PingPongMotion(axis="y", amplitude=5.0, half_period_s=1.25),
            ),
        ],
        robot=RobotState(1.0, 5.0, 0.0),
        goal=Vec2(9.0, 5.0),
        limits=RobotLimits(v_max=1.2, omega_max=2.5),
    )
    for _ in range(1000):
        status = world.step(Command(v=world.limits.v_max, omega=0.0))
        if status is not RunStatus.RUNNING:
            break
    assert world.status is RunStatus.COLLIDED
    assert world.collision_count == 1


def test_naive_no_replan_run_fails_on_dynamic_crossing() -> None:
    """Without replanning the straight initial path is cut by the crossing bar."""
    world, _ = run_headless(DYNAMIC_CROSSING)
    assert world.status is RunStatus.COLLIDED
    assert world.collision_count == 1


def test_dynamic_crossing_with_replanning_reaches_goal() -> None:
    """Session-level periodic + proximity replanning must beat the crossing bar."""
    session = Session("dynamic-crossing", "astar", seed=None, speed=1.0)
    world = session.world
    assert world is not None
    steps = 0
    while world.status is RunStatus.RUNNING and steps < 6000:
        session.advance_steps(20)
        steps += 20
    assert world.status is RunStatus.REACHED_GOAL, (
        f"run ended as {world.status.value} at t={world.sim_time:.1f}s "
        f"(message={session.message!r})"
    )
    assert world.collision_count == 0
    assert session.replans >= 1, "replanning must actually have happened"


def test_dynamic_crossing_full_run_is_reproducible() -> None:
    session_a = Session("dynamic-crossing", "astar", seed=None, speed=1.0)
    session_b = Session("dynamic-crossing", "astar", seed=None, speed=1.0)
    for session in (session_a, session_b):
        world = session.world
        assert world is not None
        steps = 0
        while world.status is RunStatus.RUNNING and steps < 6000:
            session.advance_steps(20)
            steps += 20
    world_a, world_b = session_a.world, session_b.world
    assert world_a is not None and world_b is not None
    assert world_a.status == world_b.status
    assert world_a.sim_time == world_b.sim_time
    assert world_a.distance_traveled == world_b.distance_traveled
    assert (world_a.robot.x, world_a.robot.y) == (world_b.robot.x, world_b.robot.y)
    assert session_a.replans == session_b.replans
    assert len(session_a.trajectory) == len(session_b.trajectory)
