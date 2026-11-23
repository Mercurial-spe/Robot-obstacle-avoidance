"""In-memory session store and the per-session live loop.

The loop advances the world in real time and broadcasts snapshots. Headless
users (tests, batch experiments) drive ``World.step`` directly instead.

Algorithms share ONE session machinery: every algorithm drives the world through
a ``SteeringController`` (base.py) whose ``command()`` feeds the same
``World.step`` — identical limits, collision rules and end conditions.

- ``astar``: A* over the inflated grid + WaypointFollower.
- ``apf``: direct potential-field steering, no global path.
- ``hybrid``: A* waypoints steered by local APF forces (HybridController).

Replanning policy (A* and Hybrid): while running, re-plan every
``REPLAN_PERIOD_S`` of sim time AND immediately whenever the next path segment
comes within ``robot_radius + safety_margin`` of any obstacle's current
position; the Hybrid additionally requests a replan when its local force field
reports the path ahead blocked (see algorithms/hybrid.py). Planners only ever
see the current obstacle poses — never future ones (fairness rule).
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
import uuid

from app.algorithms.apf import APFController
from app.algorithms.astar import GRID_RESOLUTION, AStarPlanner
from app.algorithms.base import SteeringController, WorldView
from app.algorithms.controller import WaypointFollower
from app.algorithms.hybrid import HybridController
from app.scenarios.build import build_world
from app.scenarios.models import ObstacleSpec, Scenario
from app.scenarios.presets import get_preset
from app.simulation.dynamic import (
    DynamicCircleObstacle,
    DynamicRectObstacle,
    PingPongMotion,
    PolylineMotion,
    anchor_position,
    effective_radius,
)
from app.simulation.geometry import Vec2
from app.simulation.world import RunStatus

logger = logging.getLogger(__name__)

BROADCAST_HZ = 15

# Algorithm registry: id -> Chinese display name. Exposed to the frontend via
# GET /api/algorithms (routes.py); ids are the wire values for SessionCreate.
ALGORITHMS: dict[str, str] = {
    "astar": "A* 全局规划",
    "apf": "人工势场法 (APF)",
    "hybrid": "A*+APF 混合",
}

REPLAN_PERIOD_S = 1.0  # scheduled replanning interval in sim time
MIN_REPLAN_INTERVAL_S = 0.25  # throttle so proximity triggers cannot flail
PROXIMITY_BUFFER_M = 0.05  # small buffer so a path hugging the inflation boundary does not retrigger
SWITCH_RADIUS = 0.3  # must match the WaypointFollower default


class SessionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def segment_point_distance(a: Vec2, b: Vec2, p: Vec2) -> float:
    """Distance from point ``p`` to segment ``a``-``b``."""
    ab_x, ab_y = b.x - a.x, b.y - a.y
    length_sq = ab_x * ab_x + ab_y * ab_y
    if length_sq <= 0.0:
        return a.distance_to(p)
    t = max(0.0, min(1.0, ((p.x - a.x) * ab_x + (p.y - a.y) * ab_y) / length_sq))
    closest = Vec2(a.x + ab_x * t, a.y + ab_y * t)
    return closest.distance_to(p)


class Session:
    def __init__(
        self,
        scenario_id: str,
        algorithm: str,
        seed: int | None,
        speed: float,
        safety_margin: float = 0.15,
        v_max: float | None = None,
    ) -> None:
        if algorithm not in ALGORITHMS:
            raise SessionError("unknown_algorithm", f"algorithm {algorithm!r} is not available")
        self.id = uuid.uuid4().hex[:12]
        try:
            self.base_scenario: Scenario = get_preset(scenario_id)
        except KeyError:
            raise SessionError(
                "unknown_scenario", f"scenario {scenario_id!r} does not exist"
            ) from None
        self.algorithm = algorithm
        self.seed = seed if seed is not None else self.base_scenario.seed
        self.speed = speed
        self.safety_margin = safety_margin
        self.v_max = v_max
        self.scenario: Scenario = self._apply_overrides(self.base_scenario)
        self.running = False
        self.message: str | None = None
        # Mirror of the controller's own status report (APF trap message);
        # kept separate so planner messages keep precedence in the snapshot.
        self._controller_message: str | None = None
        self.world = None
        # Only path-producing algorithms run the A* planner; APF steers
        # directly off the field and has no planning phase (planning_ms stays 0).
        self.plans_paths = algorithm in ("astar", "hybrid")
        self.planner: AStarPlanner | None = (
            AStarPlanner(safety_margin=safety_margin) if self.plans_paths else None
        )
        self.follower: SteeringController | None = None
        self.planning_ms = 0.0
        self.replans = 0
        self.trajectory: list[tuple[float, float]] = []
        self._path: list[Vec2] = []
        self._next_replan_time = REPLAN_PERIOD_S
        self._last_replan_time = -math.inf
        self._last_step_monotonic = time.monotonic()
        self.websockets: set[asyncio.Queue[str]] = set()  # subscriber queues of JSON payloads
        self.reset()

    # -- scenario handling ---------------------------------------------------

    def _apply_overrides(self, base: Scenario) -> Scenario:
        """Copy a preset and apply the session-level fairness overrides."""
        scenario = base.model_copy(deep=True)
        scenario.seed = self.seed
        if self.v_max is not None:
            # Applies to the robot limits AND any planner use of speed: the
            # same value everywhere, so comparisons stay fair.
            scenario.robot.v_max = self.v_max
        return scenario

    # -- lifecycle ----------------------------------------------------------

    def reset(self) -> None:
        self.world = build_world(self.scenario)
        self.trajectory = [
            (self.world.robot.x, self.world.robot.y)
        ]
        self.planning_ms = 0.0
        self.replans = 0
        self._controller_message = None
        self._next_replan_time = REPLAN_PERIOD_S
        self._last_replan_time = -math.inf
        self.plan()

    def _world_view(self) -> WorldView:
        world = self.world
        assert world is not None
        return WorldView(
            width=world.width,
            height=world.height,
            obstacles=tuple(world.obstacles),
            robot_radius=self.scenario.robot.radius,
        )

    def _make_controller(self, waypoints: list[Vec2], limits) -> SteeringController:
        """Choose the controller family for the configured algorithm.

        ``astar`` keeps the plain waypoint follower; ``hybrid`` swaps in the
        APF-steered hybrid (same waypoint bookkeeping, force-based commands).
        """
        if self.algorithm == "hybrid":
            return HybridController(waypoints, limits)
        return WaypointFollower(waypoints, limits, switch_radius=SWITCH_RADIUS)

    def plan(self) -> None:
        assert self.world is not None
        if not self.plans_paths:
            # APF: no global plan exists — steer directly from the field.
            self.follower = APFController(self.world.limits)
            self._path = []
            self.message = None
            return
        planner = self.planner
        assert planner is not None
        result = planner.plan(self.world.robot, self.world.goal, self._world_view())
        self.planning_ms += result.compute_ms
        if not result.found:
            self.follower = None
            self.message = f"planning failed: {result.failure_reason}"
            logger.warning("session %s planning failed: %s", self.id, result.failure_reason)
            return
        self.message = None
        self.follower = self._make_controller(result.waypoints, self.world.limits)
        self._path = list(result.waypoints)

    # -- replanning ---------------------------------------------------------

    def replan(self) -> None:
        """Re-run the planner against the CURRENT obstacle poses.

        On success the follower is re-targeted from the robot's current
        position (waypoints the robot has already passed are dropped). On
        failure the previous path is kept and the reason recorded — a failed
        replan never crashes the run and never fakes success.
        """
        world = self.world
        if world is None:
            return
        planner = self.planner
        assert planner is not None  # replanning only runs for path algorithms
        self.replans += 1
        self._last_replan_time = world.sim_time
        self._next_replan_time = world.sim_time + REPLAN_PERIOD_S
        result = planner.plan(world.robot, world.goal, self._world_view())
        self.planning_ms += result.compute_ms
        if not result.found:
            self.message = (
                f"replan failed at t={world.sim_time:.1f}s: {result.failure_reason}; keeping previous path"
            )
            logger.info("session %s replan failed: %s", self.id, result.failure_reason)
            return
        self.message = None
        waypoints = self._retarget(result.waypoints, world.robot.position)
        self.follower = self._make_controller(waypoints, world.limits)
        self._path = list(waypoints)

    @staticmethod
    def _retarget(waypoints: list[Vec2], position: Vec2) -> list[Vec2]:
        """Drop leading waypoints the robot has effectively driven past.

        A waypoint is skipped while the NEXT one is closer to the robot, so
        the follower re-targets forward from the robot's current position and
        never doubles back to the start of the old path.
        """
        kept = list(waypoints)
        index = 0
        while index < len(kept) - 1 and position.distance_to(kept[index + 1]) <= position.distance_to(kept[index]):
            index += 1
        return kept[index:]

    def _maybe_replan(self) -> None:
        world = self.world
        if world is None or self.follower is None or world.status is not RunStatus.RUNNING:
            return
        if not self.plans_paths:
            return  # APF has no path to refresh; it rides the field directly
        follower = self.follower
        requested = isinstance(follower, HybridController) and follower.consume_replan_request()
        scheduled = world.sim_time >= self._next_replan_time
        threatened = self._path_threatened()
        if not scheduled and not threatened and not requested:
            return
        if world.sim_time - self._last_replan_time < MIN_REPLAN_INTERVAL_S:
            return
        self.replan()

    def _path_threatened(self) -> bool:
        """True if the next path segment encroaches on any obstacle's current pose."""
        world = self.world
        follower = self.follower
        if world is None or follower is None or follower.finished:
            return False
        waypoints = follower.waypoints
        index = min(follower._index, len(waypoints) - 1)  # next segment target
        start = world.robot.position
        target = waypoints[index]
        planner = self.planner
        assert planner is not None  # only called for path-producing algorithms
        threshold = self.scenario.robot.radius + planner.safety_margin + PROXIMITY_BUFFER_M
        for obstacle in world.obstacles:
            clearance = (
                segment_point_distance(start, target, anchor_position(obstacle))
                - effective_radius(obstacle)
            )
            if clearance < threshold:
                return True
        return False

    # -- scene editing ------------------------------------------------------

    def update_scene(self, obstacles: list[ObstacleSpec], start: tuple[float, float], goal: tuple[float, float]) -> None:
        """Replace the scene while idle/paused, then rebuild and replan.

        Reset (the command) restores the ORIGINAL preset scene; edits only
        live in ``self.scenario`` until then.
        """
        if self.status() not in ("idle", "paused"):
            raise SessionError(
                "scene_locked",
                f"scene can only be edited while idle or paused (session is {self.status()!r})",
            )
        world = self.world
        assert world is not None
        robot_radius = self.scenario.robot.radius
        for name, point in (("start", start), ("goal", goal)):
            # The whole robot disc must fit inside the arena (same rule the
            # engine enforces on every step).
            if not (
                robot_radius <= point[0] <= world.width - robot_radius
                and robot_radius <= point[1] <= world.height - robot_radius
            ):
                raise SessionError(
                    "invalid_scene",
                    f"{name} point {point} does not leave room for the robot disc inside the arena",
                )
        previous = self.scenario
        scenario = previous.model_copy(deep=True)
        scenario.obstacles = list(obstacles)
        scenario.start = start
        scenario.goal = goal
        self.scenario = scenario
        self.running = False
        self.reset()
        if self.follower is None:
            reason = self.message or "no collision-free path exists for the new scene"
            self.scenario = previous
            self.reset()  # restore the previous, valid world state
            raise SessionError("invalid_scene", reason)
        logger.info(
            "session %s scene updated (%d obstacles, start=%s goal=%s)",
            self.id, len(obstacles), start, goal,
        )

    # -- commands -----------------------------------------------------------

    def command(self, action: str) -> None:
        if action == "start":
            if self.follower is None:
                raise SessionError("invalid_command", "cannot start: no valid plan")
            if self.world is not None and self.world.status is not RunStatus.RUNNING:
                raise SessionError("invalid_command", "run finished; reset before starting again")
            self.running = True
            self._last_step_monotonic = time.monotonic()
        elif action == "pause":
            self.running = False
        elif action == "step":
            self.running = False
            self.advance_steps(1)
        elif action == "reset":
            self.running = False
            # Reset restores the ORIGINAL preset scene, discarding scene edits.
            self.scenario = self._apply_overrides(self.base_scenario)
            self.reset()
        else:
            raise SessionError("invalid_command", f"unknown action {action!r}")

    # -- stepping -----------------------------------------------------------

    def advance_steps(self, n: int) -> None:
        world = self.world
        follower = self.follower
        if world is None or follower is None:
            return
        for _ in range(n):
            if world.status is not RunStatus.RUNNING:
                self.running = False
                break
            self._maybe_replan()
            follower = self.follower
            if follower is None:
                break
            cmd = follower.command(world.robot, world.goal, self._world_view())
            world.step(cmd)
            self.trajectory.append((world.robot.x, world.robot.y))
            # Mirror the controller's own status report (APF trap message)
            # without ever masking the engine's honest STUCK/TIMEOUT verdicts.
            self._controller_message = getattr(follower, "status_message", None)
            if world.status is not RunStatus.RUNNING:
                self.running = False
                logger.info(
                    "session %s finished: %s at t=%.2fs distance=%.2fm",
                    self.id, world.status.value, world.sim_time, world.distance_traveled,
                )
                break

    async def run_loop(self) -> None:
        """Advance in real time at the requested speed and broadcast snapshots.

        The simulation advances whether or not anyone is watching: the backend
        is the single source of truth. Pause/reset semantics stay exact because
        wall-clock debt is only accumulated while running.
        """
        interval = 1.0 / BROADCAST_HZ
        try:
            while True:
                await asyncio.sleep(interval)
                now = time.monotonic()
                if self.running and self.world is not None:
                    due_steps = int(
                        (now - self._last_step_monotonic) * self.speed / self.world.params.dt
                    )
                    if due_steps > 0:
                        self._last_step_monotonic += (
                            due_steps * self.world.params.dt / self.speed
                        )
                        self.advance_steps(min(due_steps, 100))
                else:
                    self._last_step_monotonic = now
                await self.broadcast()
        except asyncio.CancelledError:
            raise

    async def broadcast(self) -> None:
        if not self.websockets:
            return
        payload = self.snapshot().model_dump_json()
        for queue in list(self.websockets):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass  # slow client: drop this tick, the next one catches up

    # -- snapshot -----------------------------------------------------------

    def status(self) -> str:
        if self.follower is None and self.message is not None:
            return "error"
        if self.running:
            return "running"
        world = self.world
        assert world is not None
        if world.status is not RunStatus.RUNNING:
            return "finished"
        if world.sim_time == 0.0 and len(self.trajectory) <= 1 and not self._has_moved():
            return "idle"
        return "paused"

    def _has_moved(self) -> bool:
        return len(self.trajectory) > 1

    def _obstacle_states(self) -> list:
        from app.schemas.models import (
            ObstacleState,
            PingPongMotionState,
            PolylineMotionState,
        )

        world = self.world
        assert world is not None
        states = []
        for obstacle in world.obstacles:
            if isinstance(obstacle, (DynamicCircleObstacle, DynamicRectObstacle)):
                motion = obstacle.motion
                motion_state = (
                    PolylineMotionState(
                        points=self._polyline_points(obstacle),
                        speed=motion.speed,
                        pause_s=motion.pause_s,
                    )
                    if isinstance(motion, PolylineMotion)
                    else PingPongMotionState(
                        axis=motion.axis,
                        amplitude=motion.amplitude,
                        half_period_s=motion.half_period_s,
                        phase_s=motion.phase_s,
                    )
                )
                if isinstance(obstacle, DynamicCircleObstacle):
                    states.append(
                        ObstacleState(
                            kind="dynamic-circle",
                            cx=obstacle.cx,
                            cy=obstacle.cy,
                            radius=obstacle.radius,
                            vx=obstacle.vx,
                            vy=obstacle.vy,
                            base=(obstacle.base_x, obstacle.base_y),
                            motion=motion_state,
                        )
                    )
                else:
                    states.append(
                        ObstacleState(
                            kind="dynamic-rect",
                            x=obstacle.x,
                            y=obstacle.y,
                            width=obstacle.width,
                            height=obstacle.height,
                            vx=obstacle.vx,
                            vy=obstacle.vy,
                            base=(obstacle.base_x, obstacle.base_y),
                            motion=motion_state,
                        )
                    )
            elif hasattr(obstacle, "radius"):  # static circle
                states.append(
                    ObstacleState(
                        kind="circle",
                        cx=obstacle.cx,
                        cy=obstacle.cy,
                        radius=obstacle.radius,
                        vx=0.0,
                        vy=0.0,
                    )
                )
            else:  # static rect
                states.append(
                    ObstacleState(
                        kind="rect",
                        x=obstacle.x,
                        y=obstacle.y,
                        width=obstacle.width,
                        height=obstacle.height,
                        vx=0.0,
                        vy=0.0,
                    )
                )
        return states

    @staticmethod
    def _polyline_points(obstacle) -> list[tuple[float, float]]:
        """Absolute waypoint positions of a polyline motion (anchor + offsets)."""
        base_x = obstacle.base_x
        base_y = obstacle.base_y
        return [(base_x + px, base_y + py) for px, py in obstacle.motion.points]

    def snapshot(self):
        from app.schemas.models import (
            RobotPose,
            RunMetrics,
            Snapshot,
        )

        world = self.world
        assert world is not None
        return Snapshot(
            session_id=self.id,
            status=self.status(),
            run_status=world.status.value,
            sim_time=world.sim_time,
            width=world.width,
            height=world.height,
            robot=RobotPose(x=world.robot.x, y=world.robot.y, theta=world.robot.theta),
            goal=(world.goal.x, world.goal.y),
            start=self.scenario.start,
            robot_radius=self.scenario.robot.radius,
            obstacles=self._obstacle_states(),
            path=[(wp.x, wp.y) for wp in self._path],
            trajectory=self.trajectory,
            metrics=RunMetrics(
                distance_traveled=world.distance_traveled,
                sim_time=world.sim_time,
                planning_ms=self.planning_ms,
                replans=self.replans,
                collision_count=world.collision_count,
            ),
            message=self.message or self._controller_message,
            # Total APF force of the last steering step (world frame, field
            # units); None for path-only algorithms like A* + WaypointFollower.
            apf_force=self._apf_force(),
        )

    def _apf_force(self) -> tuple[float, float] | None:
        force = getattr(self.follower, "last_force", None)
        if force is None:
            return None
        return (force.x, force.y)

    # -- one-shot plan info -------------------------------------------------

    def plan_info(self):
        from app.schemas.models import GridInfo, PlanInfoOut

        world = self.world
        assert world is not None
        grid: GridInfo | None = None
        last_grid = getattr(self.planner, "last_grid", None)
        if last_grid is not None:
            blocked, cols, rows = last_grid
            grid = GridInfo(
                origin_x=0.0,
                origin_y=0.0,
                resolution=GRID_RESOLUTION,
                cols=cols,
                rows=rows,
                blocked=[1 if cell else 0 for cell in blocked],
            )
        expanded = [tuple(node) for node in getattr(self.planner, "last_expanded", [])]
        return PlanInfoOut(
            session_id=self.id,
            algorithm=self.algorithm,
            planning_ms=self.planning_ms,
            replans=self.replans,
            grid=grid,
            expanded_nodes=expanded,
            path=[(wp.x, wp.y) for wp in self._path],
            inflation_m=self.scenario.robot.radius + getattr(self.planner, "safety_margin", 0.0),
        )


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def create(
        self,
        scenario_id: str,
        algorithm: str,
        seed: int | None,
        speed: float,
        safety_margin: float = 0.15,
        v_max: float | None = None,
    ) -> Session:
        session = Session(scenario_id, algorithm, seed, speed, safety_margin=safety_margin, v_max=v_max)
        self._sessions[session.id] = session
        self._tasks[session.id] = asyncio.create_task(session.run_loop())
        logger.info(
            "session %s created (scenario=%s algorithm=%s seed=%s safety_margin=%s v_max=%s)",
            session.id, scenario_id, algorithm, session.seed, safety_margin, v_max,
        )
        return session

    def get(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionError("session_not_found", f"session {session_id!r} does not exist")
        return session

    async def close_all(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        self._sessions.clear()
        self._tasks.clear()
