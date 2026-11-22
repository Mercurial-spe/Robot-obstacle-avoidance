"""World: arena, obstacles, fixed-timestep stepping, collision and end conditions."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum

from app.simulation.geometry import (
    Vec2,
    circle_overlaps_circle,
    circle_overlaps_rect,
    point_in_arena,
)
from app.simulation.robot import Command, RobotLimits, RobotState, apply_command


class RunStatus(str, Enum):
    RUNNING = "running"
    REACHED_GOAL = "reached_goal"
    COLLIDED = "collided"
    TIMEOUT = "timeout"
    STUCK = "stuck"


@dataclass(frozen=True, slots=True)
class CircleObstacle:
    cx: float
    cy: float
    radius: float


@dataclass(frozen=True, slots=True)
class RectObstacle:
    x: float  # min corner
    y: float  # min corner
    width: float
    height: float

    @property
    def max_x(self) -> float:
        return self.x + self.width

    @property
    def max_y(self) -> float:
        return self.y + self.height


Obstacle = CircleObstacle | RectObstacle


@dataclass(slots=True)
class WorldParams:
    dt: float = 0.05
    goal_radius: float = 0.3
    timeout_s: float = 120.0
    # Stuck detection: no meaningful progress toward the goal over this window.
    stuck_window_s: float = 6.0
    stuck_progress_eps: float = 0.05
    # Collision substepping: cap per-check displacement to avoid tunneling.
    max_collision_step: float = 0.05


@dataclass(slots=True)
class World:
    """Owns all simulation state. It is the single source of truth."""

    width: float
    height: float
    obstacles: list[Obstacle]
    robot: RobotState
    goal: Vec2
    limits: RobotLimits
    params: WorldParams = field(default_factory=WorldParams)
    status: RunStatus = RunStatus.RUNNING
    sim_time: float = 0.0
    distance_traveled: float = 0.0
    collision_count: int = 0
    _best_goal_distance: float = field(default=float("inf"), init=False)
    _last_progress_time: float = field(default=0.0, init=False)

    def __post_init__(self) -> None:
        self._best_goal_distance = self.robot.position.distance_to(self.goal)

    # -- queries ------------------------------------------------------------

    def goal_distance(self) -> float:
        return self.robot.position.distance_to(self.goal)

    def is_position_free(self, position: Vec2, margin: float = 0.0) -> bool:
        """True if a robot disc of radius+margin centered at ``position`` is collision-free."""
        effective = margin
        if not point_in_arena(position, effective, self.width, self.height):
            return False
        for obstacle in self.obstacles:
            if isinstance(obstacle, CircleObstacle):
                if circle_overlaps_circle(position, effective, Vec2(obstacle.cx, obstacle.cy), obstacle.radius):
                    return False
            else:
                if circle_overlaps_rect(position, effective, obstacle.x, obstacle.y, obstacle.max_x, obstacle.max_y):
                    return False
        return True

    # -- stepping -----------------------------------------------------------

    def step(self, command: Command) -> RunStatus:
        """Advance one fixed timestep. Terminal states freeze the world."""
        if self.status is not RunStatus.RUNNING:
            return self.status
        dt = self.params.dt
        v = max(0.0, min(command.v, self.limits.v_max))
        # Substep the motion so fast movement cannot tunnel through thin obstacles.
        speed = v
        n_sub = 1
        if speed > 0.0:
            n_sub = max(1, math.ceil(speed * dt / self.params.max_collision_step))
        sub_dt = dt / n_sub
        state = self.robot
        for _ in range(n_sub):
            state = apply_command(state, command, self.limits, sub_dt)
            if not self._check_collision(state.position):
                self.robot = state
                self.collision_count += 1
                self.status = RunStatus.COLLIDED
                return self.status
            self.robot = state
        self.distance_traveled += speed * dt
        self.sim_time += dt
        self._update_end_conditions()
        return self.status

    def _check_collision(self, position: Vec2) -> bool:
        return self.is_position_free(position, margin=0.0)

    def _update_end_conditions(self) -> None:
        goal_distance = self.goal_distance()
        if goal_distance < self.params.goal_radius:
            self.status = RunStatus.REACHED_GOAL
            return
        if goal_distance < self._best_goal_distance - self.params.stuck_progress_eps:
            self._best_goal_distance = goal_distance
            self._last_progress_time = self.sim_time
        if self.sim_time - self._last_progress_time > self.params.stuck_window_s:
            self.status = RunStatus.STUCK
            return
        if self.sim_time >= self.params.timeout_s:
            self.status = RunStatus.TIMEOUT
