"""Algorithm contracts.

A planner maps the current observation to a path; the controller turns a path
into motion commands. All algorithms share the same robot model, collision
rules and observation — no planner may read future obstacle positions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.simulation.geometry import Vec2
from app.simulation.robot import Command, RobotState
from app.simulation.world import Obstacle


@dataclass(frozen=True, slots=True)
class WorldView:
    """What an algorithm may observe about the environment (full-state in P0)."""

    width: float
    height: float
    obstacles: tuple[Obstacle, ...]
    robot_radius: float


@dataclass(slots=True)
class PlanResult:
    waypoints: list[Vec2]
    compute_ms: float
    found: bool
    failure_reason: str | None = None


class Planner(Protocol):
    name: str

    def plan(
        self, robot: RobotState, goal: Vec2, world_view: WorldView
    ) -> PlanResult: ...


def execute_command(controller_state: object, command: Command) -> Command:
    """Hook for shared command post-processing (limits are applied in the engine)."""
    return command
