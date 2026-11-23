"""A*+APF Hybrid: local steering, replan triggering, and dynamic-scenario runs."""

from __future__ import annotations

from app.algorithms.base import WorldView
from app.algorithms.hybrid import BLOCKED_FRACTION, DEFAULT_BLOCK_STEPS, HybridController
from app.api.sessions import Session
from app.scenarios.build import build_world
from app.scenarios.models import RectObstacleSpec, Scenario
from app.simulation.geometry import Vec2
from app.simulation.robot import RobotLimits, RobotState
from app.simulation.world import RectObstacle, RunStatus, World


def test_hybrid_reaches_goal_on_dynamic_crossing() -> None:
    """The hybrid must beat the crossing bar like the A* baseline does."""
    session = Session("dynamic-crossing", "hybrid", seed=None, speed=1.0)
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


def test_hybrid_local_steering_reaches_goal_static() -> None:
    """On a static scenario the hybrid drives APF-steered between waypoints."""
    session = Session("static-basic", "hybrid", seed=None, speed=1.0)
    world = session.world
    assert world is not None
    steps = 0
    while world.status is RunStatus.RUNNING and steps < 6000:
        session.advance_steps(20)
        steps += 20
    assert world.status is RunStatus.REACHED_GOAL
    assert world.collision_count == 0
    # Hybrid snapshots expose the local force like pure APF does.
    assert session.snapshot().apf_force is not None


def test_hybrid_requests_replan_when_path_is_choked() -> None:
    """A wall sitting on the path chokes the local field until a replan fires."""
    world = World(
        width=10.0,
        height=10.0,
        obstacles=[RectObstacle(x=5.0, y=0.0, width=1.0, height=10.0)],
        robot=RobotState(2.0, 5.0, 0.0),
        goal=Vec2(8.0, 5.0),
        limits=RobotLimits(v_max=1.2, omega_max=2.5),
    )
    world_view = WorldView(
        width=world.width,
        height=world.height,
        obstacles=tuple(world.obstacles),
        robot_radius=0.25,
    )
    # Waypoint past the wall (the final goal is further, so this waypoint is
    # INTERMEDIATE and the trigger is allowed to fire).
    controller = HybridController([Vec2(6.5, 5.0), Vec2(8.0, 5.0)], world.limits)
    fired = False
    for _ in range(DEFAULT_BLOCK_STEPS * 4):
        command = controller.command(world.robot, world.goal, world_view)
        world.step(command)  # the field only chokes once the robot nears the wall
        if controller.replan_requested:
            fired = True
            break
    assert fired, "blockage on an intermediate waypoint must request a replan"
    # consume_replan_request clears the flag exactly once.
    assert controller.consume_replan_request() is True
    assert controller.replan_requested is False


def test_hybrid_does_not_request_replan_in_free_space() -> None:
    world = World(
        width=10.0,
        height=10.0,
        obstacles=[],
        robot=RobotState(2.0, 5.0, 0.0),
        goal=Vec2(8.0, 5.0),
        limits=RobotLimits(v_max=1.2, omega_max=2.5),
    )
    world_view = WorldView(width=world.width, height=world.height, obstacles=(), robot_radius=0.25)
    controller = HybridController([Vec2(8.0, 5.0)], world.limits)
    for _ in range(DEFAULT_BLOCK_STEPS * 3):
        controller.command(world.robot, world.goal, world_view)
    assert controller.replan_requested is False


def test_hybrid_final_goal_blockage_never_requests_replan() -> None:
    """Blocked at the FINAL goal, replanning cannot help: no request is made."""
    world = World(
        width=10.0,
        height=10.0,
        obstacles=[RectObstacle(x=7.0, y=0.0, width=1.0, height=10.0)],
        robot=RobotState(5.0, 5.0, 0.0),
        goal=Vec2(9.0, 5.0),
        limits=RobotLimits(v_max=1.2, omega_max=2.5),
    )
    world_view = WorldView(
        width=world.width,
        height=world.height,
        obstacles=tuple(world.obstacles),
        robot_radius=0.25,
    )
    # Single waypoint == the goal: there is no intermediate leg to replan.
    controller = HybridController([Vec2(9.0, 5.0)], world.limits)
    for _ in range(DEFAULT_BLOCK_STEPS * 4):
        controller.command(world.robot, world.goal, world_view)
    assert controller.replan_requested is False


def test_hybrid_blocked_fraction_is_strict() -> None:
    """Documented trigger constant: only a badly choked field counts."""
    assert 0.0 < BLOCKED_FRACTION < 1.0


def test_hybrid_same_seed_is_deterministic() -> None:
    session_a = Session("dynamic-crossing", "hybrid", seed=None, speed=1.0)
    session_b = Session("dynamic-crossing", "hybrid", seed=None, speed=1.0)
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
    assert session_a.trajectory == session_b.trajectory


def test_hybrid_scenario_with_pocket_still_reaches() -> None:
    """Regression: a scenario whose pocket defeats pure APF is solved by replanning."""
    pocket = Scenario(
        id="hybrid-pocket",
        name="带凹形口袋的场景",
        width=20.0,
        height=12.0,
        start=(2.0, 10.0),
        goal=(18.0, 10.0),
        obstacles=[
            # A U-shaped pocket the straight line passes through.
            RectObstacleSpec(x=6.0, y=0.0, width=1.0, height=6.0),
            RectObstacleSpec(x=13.0, y=0.0, width=1.0, height=6.0),
            RectObstacleSpec(x=6.0, y=5.0, width=8.0, height=1.0),
        ],
    )
    # Headless drive (the scenario is not a registered preset id).
    world = build_world(pocket)
    world_view = WorldView(
        width=world.width,
        height=world.height,
        obstacles=tuple(world.obstacles),
        robot_radius=pocket.robot.radius,
    )
    from app.algorithms.astar import AStarPlanner

    result = AStarPlanner().plan(world.robot, world.goal, world_view)
    assert result.found, "A* must route around the pocket"
    controller = HybridController(result.waypoints, world.limits)
    steps = 0
    while world.status is RunStatus.RUNNING and steps < 4000:
        command = controller.command(world.robot, world.goal, world_view)
        world.step(command)
        steps += 1
    assert world.status is RunStatus.REACHED_GOAL
    assert world.collision_count == 0
