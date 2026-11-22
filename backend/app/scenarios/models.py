"""Scenario data model. Shared by the live API and batch experiment runners."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.simulation.geometry import Vec2


class CircleObstacleSpec(BaseModel):
    kind: str = "circle"
    cx: float
    cy: float
    radius: float


class RectObstacleSpec(BaseModel):
    kind: str = "rect"
    x: float
    y: float
    width: float
    height: float


ObstacleSpec = CircleObstacleSpec | RectObstacleSpec


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
    seed: int = 0

    def start_position(self) -> Vec2:
        return Vec2(*self.start)

    def goal_position(self) -> Vec2:
        return Vec2(*self.goal)
