"""Pydantic transport models. Names mirror the frontend types in frontend/src/types/."""

from __future__ import annotations

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
    "SessionCreate",
    "SessionOut",
    "CommandRequest",
    "RobotPose",
    "RunMetrics",
    "Snapshot",
    "ErrorResponse",
]


class ScenarioSummary(BaseModel):
    id: str
    name: str
    description: str
    width: float
    height: float
    has_dynamic_obstacles: bool = False


class SessionCreate(BaseModel):
    scenario_id: str
    algorithm: str = "astar"
    seed: int | None = None
    speed: float = Field(default=1.0, gt=0.0, description="Real-time multiplier")


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
    obstacles: list[ObstacleSpec]
    path: list[tuple[float, float]]
    trajectory: list[tuple[float, float]]
    metrics: RunMetrics
    message: str | None = None


class ErrorResponse(BaseModel):
    error: "ErrorBody"


class ErrorBody(BaseModel):
    code: str
    message: str
