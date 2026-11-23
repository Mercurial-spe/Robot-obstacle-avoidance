"""Pydantic transport models. Names mirror the frontend types in frontend/src/types/."""

from __future__ import annotations

from typing import Annotated, Literal, Union

from app.scenarios.models import (
    CircleObstacleSpec,
    ObstacleSpec,
    RectObstacleSpec,
    RobotParams,
    Scenario,
)
from pydantic import BaseModel, Field

__all__ = [
    "CircleObstacleSpec",
    "ObstacleSpec",
    "RectObstacleSpec",
    "RobotParams",
    "Scenario",
    "ScenarioSummary",
    "AlgorithmInfo",
    "SessionCreate",
    "SessionOut",
    "CommandRequest",
    "RobotPose",
    "RunMetrics",
    "ObstacleState",
    "Snapshot",
    "SceneUpdate",
    "GridInfo",
    "PlanInfoOut",
    "ErrorResponse",
]


class ScenarioSummary(BaseModel):
    id: str
    name: str
    description: str
    width: float
    height: float
    has_dynamic_obstacles: bool = False


class AlgorithmInfo(BaseModel):
    """One entry of GET /api/algorithms: wire id + Chinese display name."""

    id: str
    name: str


class SessionCreate(BaseModel):
    scenario_id: str
    algorithm: str = "astar"
    seed: int | None = None
    speed: float = Field(default=1.0, gt=0.0, description="Real-time multiplier")
    # Fairness overrides: applied to the planners AND the robot limits alike.
    safety_margin: float = Field(
        default=0.15, ge=0.0, le=2.0, description="Planner inflation margin on top of the robot radius"
    )
    v_max: float | None = Field(
        default=None, gt=0.0, le=5.0, description="Override for the robot's max linear speed (m/s)"
    )


class SessionOut(BaseModel):
    session_id: str
    scenario_id: str
    algorithm: str
    seed: int


class CommandRequest(BaseModel):
    action: str = Field(description="start | pause | step | reset")


class RobotPose(BaseModel):
    x: float
    y: float
    theta: float


class RunMetrics(BaseModel):
    distance_traveled: float
    sim_time: float
    planning_ms: float
    replans: int
    collision_count: int


class PingPongMotionState(BaseModel):
    """Snapshot of a linear ping-pong motion (horizontal or vertical sweep)."""

    type: Literal["pingpong"] = "pingpong"
    axis: str  # "x" | "y"
    amplitude: float
    half_period_s: float
    phase_s: float


class PolylineMotionState(BaseModel):
    """Snapshot of a waypoint-loop motion; points are ABSOLUTE arena positions."""

    type: Literal["polyline"] = "polyline"
    points: list[tuple[float, float]]
    speed: float
    pause_s: float


MotionState = Annotated[
    Union[PingPongMotionState, PolylineMotionState],
    Field(discriminator="type"),
]


class ObstacleState(BaseModel):
    """One obstacle as seen in a snapshot, static or dynamic.

    Static obstacles carry ``motion=None`` and zero velocity. Dynamic obstacles
    carry the CURRENT position (same anchor convention as the specs: circle
    center ``cx``/``cy``, rect min corner ``x``/``y``), the CURRENT velocity
    ``vx``/``vy``, the home anchor ``base`` and the motion parameters so the
    frontend can render the body, draw a velocity arrow and preview the track.
    """

    kind: str  # circle | rect | dynamic-circle | dynamic-rect
    cx: float | None = None
    cy: float | None = None
    radius: float | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    vx: float | None = None
    vy: float | None = None
    base: tuple[float, float] | None = None
    motion: MotionState | None = None


class Snapshot(BaseModel):
    session_id: str
    status: str  # idle | running | paused | finished | error
    run_status: str  # running | reached_goal | collided | timeout | stuck
    sim_time: float
    width: float
    height: float
    robot: RobotPose
    goal: tuple[float, float]
    start: tuple[float, float]
    robot_radius: float
    obstacles: list[ObstacleState]
    path: list[tuple[float, float]]
    trajectory: list[tuple[float, float]]
    metrics: RunMetrics
    message: str | None = None
    apf_force: tuple[float, float] | None = None


class SceneUpdate(BaseModel):
    """Full scene replacement: obstacle list (static + dynamic specs), start, goal."""

    obstacles: list[ObstacleSpec]
    start: tuple[float, float]
    goal: tuple[float, float]


class GridInfo(BaseModel):
    origin_x: float
    origin_y: float
    resolution: float
    cols: int
    rows: int
    blocked: list[int]  # row-major 0/1


class PlanInfoOut(BaseModel):
    session_id: str
    algorithm: str
    planning_ms: float
    replans: int
    grid: GridInfo | None
    expanded_nodes: list[tuple[int, int]]
    path: list[tuple[float, float]]
    inflation_m: float


class ErrorResponse(BaseModel):
    error: "ErrorBody"


class ErrorBody(BaseModel):
    code: str
    message: str
