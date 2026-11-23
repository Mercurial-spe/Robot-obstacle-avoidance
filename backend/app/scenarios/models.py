"""Scenario data model. Shared by the live API and batch experiment runners."""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.simulation.geometry import Vec2


class CircleObstacleSpec(BaseModel):
    kind: Literal["circle"] = "circle"
    cx: float
    cy: float
    radius: float


class RectObstacleSpec(BaseModel):
    kind: Literal["rect"] = "rect"
    x: float
    y: float
    width: float
    height: float


class PingPongMotionSpec(BaseModel):
    """Horizontal/vertical back-and-forth sweep (see simulation.dynamic)."""

    type: Literal["pingpong"] = "pingpong"
    axis: Literal["x", "y"] = "x"
    amplitude: float = Field(gt=0.0)
    half_period_s: float = Field(gt=0.0)
    phase_s: float = 0.0


class PolylineMotionSpec(BaseModel):
    """Waypoint loop relative to the obstacle's anchor position."""

    type: Literal["polyline"] = "polyline"
    points: list[tuple[float, float]] = Field(min_length=1)
    speed: float = Field(gt=0.0)
    pause_s: float = Field(default=0.0, ge=0.0)


MotionSpec = Annotated[Union[PingPongMotionSpec, PolylineMotionSpec], Field(discriminator="type")]


class DynamicCircleObstacleSpec(BaseModel):
    kind: Literal["dynamic-circle"] = "dynamic-circle"
    cx: float
    cy: float
    radius: float
    motion: MotionSpec


class DynamicRectObstacleSpec(BaseModel):
    kind: Literal["dynamic-rect"] = "dynamic-rect"
    x: float
    y: float
    width: float
    height: float
    motion: MotionSpec


ObstacleSpec = Annotated[
    Union[
        CircleObstacleSpec,
        RectObstacleSpec,
        DynamicCircleObstacleSpec,
        DynamicRectObstacleSpec,
    ],
    Field(discriminator="kind"),
]


class RobotParams(BaseModel):
    radius: float = 0.25
    v_max: float = 1.2
    omega_max: float = 2.5


class Scenario(BaseModel):
    id: str
    name: str
    description: str = ""
    width: float
    height: float
    start: tuple[float, float]
    goal: tuple[float, float]
    obstacles: list[ObstacleSpec] = Field(default_factory=list)
    robot: RobotParams = Field(default_factory=RobotParams)
    goal_radius: float = 0.3
    timeout_s: float = 120.0
    # Dynamic scenes need weaving maneuvers that may temporarily move away from
    # the goal; presets can widen the stuck window without touching P0 defaults.
    stuck_window_s: float = 6.0
    seed: int = 0

    def start_position(self) -> Vec2:
        return Vec2(*self.start)

    def goal_position(self) -> Vec2:
        return Vec2(*self.goal)

    def has_dynamic_obstacles(self) -> bool:
        return any(spec.kind.startswith("dynamic-") for spec in self.obstacles)
