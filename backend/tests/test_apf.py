"""APF algorithm: goal reaching, honest failure, fairness and determinism."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.algorithms.apf import APFController
from app.algorithms.base import WorldView
from app.api.sessions import Session
from app.main import app
from app.scenarios.build import build_world
from app.scenarios.models import RectObstacleSpec, Scenario
from app.scenarios.presets import STATIC_BASIC
from app.simulation.robot import RobotLimits, RobotState
from app.simulation.geometry import Vec2
from app.simulation.world import RunStatus, World


def run_apf(world: World, max_steps: int = 4000) -> tuple[World, APFController, list[tuple[float, float]]]:
    """Drive a world with a fresh APFController until it terminates."""
    controller = APFController(world.limits)
    world_view = WorldView(
        width=world.width,
        height=world.height,
        obstacles=tuple(world.obstacles),
        robot_radius=0.25,
    )
    trace: list[tuple[float, float]] = [(world.robot.x, world.robot.y)]
    steps = 0
    while world.status is RunStatus.RUNNING and steps < max_steps:
        command = controller.command(world.robot, world.goal, world_view)
        world.step(command)
        trace.append((world.robot.x, world.robot.y))
        steps += 1
    return world, controller, trace


def test_apf_reaches_goal_in_empty_arena() -> None:
    world = World(
        width=20.0,
        height=12.0,
        obstacles=[],
        robot=RobotState(2.0, 6.0, 0.0),
        goal=Vec2(18.0, 6.0),
        limits=RobotLimits(v_max=1.2, omega_max=2.5),
    )
    world, controller, _ = run_apf(world)
    assert world.status is RunStatus.REACHED_GOAL
    assert world.collision_count == 0
    assert world.sim_time < world.params.timeout_s


def test_apf_reaches_goal_in_static_basic() -> None:
    """The broken wall must be rounded via the tangential slide, not brute force."""
    world = build_world(STATIC_BASIC)
    world, controller, trace = run_apf(world)
    assert world.status is RunStatus.REACHED_GOAL, f"ended as {world.status.value}"
    assert world.collision_count == 0
    assert world.sim_time < world.params.timeout_s
    # The detour happened: the trace must leave the straight start-goal line.
    assert any(abs(y - 6.0) > 1.0 for _, y in trace)


def test_apf_fails_honestly_in_concave_trap() -> None:
    """A sealed concave pocket (U walls closed by the arena floor) traps APF.

    The goal lies inside the pocket; attraction pulls the robot against the
    pocket roof, the vortex slide just orbits the walls, and no route exists.
    The run MUST terminate as STUCK (or TIMEOUT) — never faked into success.
    """
    trap = Scenario(
        id="apf-trap",
        name="U形陷阱",
        description="U形墙体与场地边界围成的封闭凹形陷阱，目标位于口袋内部。",
        width=20.0,
        height=12.0,
        start=(2.0, 10.0),
        goal=(10.0, 2.0),
        obstacles=[
            RectObstacleSpec(x=6.0, y=0.0, width=1.0, height=6.0),
            RectObstacleSpec(x=13.0, y=0.0, width=1.0, height=6.0),
            RectObstacleSpec(x=6.0, y=5.0, width=8.0, height=1.0),
        ],
    )
    world = build_world(trap)
    world, controller, _ = run_apf(world)
    assert world.status in (RunStatus.STUCK, RunStatus.TIMEOUT)
    assert world.status is not RunStatus.REACHED_GOAL
    assert world.collision_count == 0, "the field must keep the robot off the walls"
    # The trap is surfaced as a human-readable message before the verdict.
    assert controller.status_message is not None
    assert "trapped" in controller.status_message


def test_apf_snapshot_carries_force_vector() -> None:
    """Session snapshots expose the current APF force for the force-arrow layer."""
    session = Session("static-basic", "apf", seed=None, speed=1.0)
    session.advance_steps(5)
    snapshot = session.snapshot()
    assert snapshot.apf_force is not None
    fx, fy = snapshot.apf_force
    assert (fx, fy) != (0.0, 0.0)
    # A* has no field, so its snapshots must keep apf_force None.
    astar = Session("static-basic", "astar", seed=None, speed=1.0)
    astar.advance_steps(5)
    assert astar.snapshot().apf_force is None


def test_apf_same_seed_is_deterministic() -> None:
    world_a = build_world(STATIC_BASIC)
    world_b = build_world(STATIC_BASIC)
    _, _, trace_a = run_apf(world_a)
    _, _, trace_b = run_apf(world_b)
    assert trace_a == trace_b
    assert world_a.status == world_b.status
    assert world_a.sim_time == world_b.sim_time
    assert world_a.distance_traveled == world_b.distance_traveled


def test_algorithms_share_limits_fairly() -> None:
    """On identical scenario + overrides, all algorithms get identical limits."""
    for algorithm in ("astar", "apf", "hybrid"):
        session = Session("static-basic", algorithm, seed=7, speed=1.0, v_max=0.9)
        world = session.world
        assert world is not None
        assert world.limits == RobotLimits(v_max=0.9, omega_max=2.5)
        follower = session.follower
        assert follower is not None
        # Controllers hold the very same limits object the engine enforces.
        assert getattr(follower, "limits", None) is world.limits


def test_algorithm_registry_is_exposed_via_api() -> None:
    """GET /api/algorithms lists the three algorithms with display names."""
    with TestClient(app) as client:
        response = client.get("/api/algorithms")
        assert response.status_code == 200, response.text
        algorithms = response.json()
        by_id = {entry["id"]: entry["name"] for entry in algorithms}
        assert set(by_id) == {"astar", "apf", "hybrid"}
        assert by_id["astar"] == "A* 全局规划"
        assert "APF" in by_id["apf"]
        assert "混合" in by_id["hybrid"]
        # Wire ids are accepted by session creation.
        for algorithm in by_id:
            payload = {"scenario_id": "static-basic", "algorithm": algorithm}
            assert client.post("/api/sessions", json=payload).status_code == 200
