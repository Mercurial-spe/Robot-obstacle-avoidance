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
    """What an algorithm may observe about the environment (full-state observation).

    ``obstacles`` contains static obstacles and dynamic obstacles at their
    CURRENT position and velocity (``vx``/``vy`` on dynamic instances) — never
    future poses. Algorithms that need to track motion must re-observe each
    step; nothing here may be extrapolated from inside the planner.
    """

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


class SteeringController(Protocol):
    """A controller that turns the CURRENT observation into a motion command.

    Two families satisfy this protocol:

    - Path followers (``WaypointFollower``): consume a planner's waypoints.
    - Direct steering (``APFController``, ``HybridController``): compute
      commands straight from the field / global path each step.

    Both produce the same ``Command`` type and run through the SAME engine step
    (limits, substepped collision, end conditions) — the engine never knows
    which family is driving. Optional extras the session may probe with
    ``getattr``: ``limits`` (fairness check), ``last_force`` (APF force arrow
    for the snapshot), ``status_message`` (human-readable trap report),
    ``replan_requested`` / ``consume_replan_request()`` (Hybrid replan trigger),
    ``waypoints`` / ``_index`` / ``finished`` (path proximity checks).
    """

    name: str

    def command(
        self, state: RobotState, goal: Vec2, world_view: WorldView
    ) -> Command: ...


def execute_command(controller_state: object, command: Command) -> Command:
    """Hook for shared command post-processing (limits are applied in the engine)."""
    return command
