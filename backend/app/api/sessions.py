"""In-memory session store and the per-session live loop.

The loop advances the world in real time and broadcasts snapshots. Headless
users (tests, batch experiments) drive ``World.step`` directly instead.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid

from app.algorithms.astar import AStarPlanner
from app.algorithms.base import WorldView
from app.algorithms.controller import WaypointFollower
from app.scenarios.build import build_world
from app.scenarios.models import Scenario
from app.scenarios.presets import get_preset
from app.simulation.world import RunStatus

logger = logging.getLogger(__name__)

BROADCAST_HZ = 15

ALGORITHMS: dict[str, str] = {"astar": "astar"}  # P1 adds apf / hybrid


class SessionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class Session:
    def __init__(
        self, scenario_id: str, algorithm: str, seed: int | None, speed: float
    ) -> None:
        if algorithm not in ALGORITHMS:
            raise SessionError("unknown_algorithm", f"algorithm {algorithm!r} is not available")
        self.id = uuid.uuid4().hex[:12]
        self.scenario: Scenario = get_preset(scenario_id)
        self.algorithm = algorithm
        self.seed = seed if seed is not None else self.scenario.seed
        self.speed = speed
        self.running = False
        self.message: str | None = None
        self.world: World | None = None
        self.planner = AStarPlanner()
        self.follower: WaypointFollower | None = None
        self.planning_ms = 0.0
        self.replans = 0
        self.trajectory: list[tuple[float, float]] = []
        self._last_step_monotonic = time.monotonic()
        self.websockets: set[asyncio.Queue[str]] = set()  # subscriber queues of JSON payloads
        self.reset()

    # -- lifecycle ----------------------------------------------------------

    def reset(self) -> None:
        self.world = build_world(self.scenario)
        self.trajectory = [
            (self.world.robot.x, self.world.robot.y)
        ]
        self.plan()

    def plan(self) -> None:
        assert self.world is not None
        world_view = WorldView(
            width=self.world.width,
            height=self.world.height,
            obstacles=tuple(self.world.obstacles),
            robot_radius=self.scenario.robot.radius,
        )
        result = self.planner.plan(self.world.robot, self.world.goal, world_view)
        self.planning_ms = result.compute_ms
        if not result.found:
            self.follower = None
            self.message = f"planning failed: {result.failure_reason}"
            logger.warning("session %s planning failed: %s", self.id, result.failure_reason)
            return
        self.message = None
        self.follower = WaypointFollower(result.waypoints, self.world.limits)
        self._path = list(result.waypoints)

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
            self.reset()
        else:
            raise SessionError("invalid_command", f"unknown action {action!r}")

    # -- stepping -----------------------------------------------------------

    def advance_steps(self, n: int) -> None:
        world = self.world
        follower = self.follower
        if world is None or follower is None:
            return
        world_view = WorldView(
            width=world.width,
            height=world.height,
            obstacles=tuple(world.obstacles),
            robot_radius=self.scenario.robot.radius,
        )
        for _ in range(n):
            if world.status is not RunStatus.RUNNING:
                self.running = False
                break
            cmd = follower.command(world.robot, world.goal, world_view)
            world.step(cmd)
            self.trajectory.append((world.robot.x, world.robot.y))
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
            obstacles=list(self.scenario.obstacles),
            path=[(wp.x, wp.y) for wp in getattr(self, "_path", [])],
            trajectory=self.trajectory,
            metrics=RunMetrics(
                distance_traveled=world.distance_traveled,
                sim_time=world.sim_time,
                planning_ms=self.planning_ms,
                replans=self.replans,
                collision_count=world.collision_count,
            ),
            message=self.message,
        )


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def create(
        self, scenario_id: str, algorithm: str, seed: int | None, speed: float
    ) -> Session:
        session = Session(scenario_id, algorithm, seed, speed)
        self._sessions[session.id] = session
        self._tasks[session.id] = asyncio.create_task(session.run_loop())
        logger.info("session %s created (scenario=%s algorithm=%s seed=%s)", session.id, scenario_id, algorithm, session.seed)
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
