"""Build a runnable World from a Scenario. Shared by live sessions, tests and batch runners."""

from __future__ import annotations

from app.scenarios.models import MotionSpec, Scenario
from app.simulation.dynamic import (
    DynamicCircleObstacle,
    DynamicRectObstacle,
    MotionPattern,
    PingPongMotion,
    PolylineMotion,
)
from app.simulation.robot import RobotLimits, RobotState
from app.simulation.world import CircleObstacle, RectObstacle, World


def build_motion(spec: MotionSpec) -> MotionPattern:
    if spec.type == "pingpong":
        return PingPongMotion(
            axis=spec.axis,
            amplitude=spec.amplitude,
            half_period_s=spec.half_period_s,
            phase_s=spec.phase_s,
        )
    return PolylineMotion(
        points=tuple(spec.points),
        speed=spec.speed,
        pause_s=spec.pause_s,
    )


def build_world(scenario: Scenario) -> World:
    robot = RobotState(x=scenario.start[0], y=scenario.start[1], theta=0.0)
    obstacles = []
    for spec in scenario.obstacles:
        if spec.kind == "circle":
            obstacles.append(CircleObstacle(cx=spec.cx, cy=spec.cy, radius=spec.radius))
        elif spec.kind == "rect":
            obstacles.append(RectObstacle(x=spec.x, y=spec.y, width=spec.width, height=spec.height))
        elif spec.kind == "dynamic-circle":
            obstacles.append(
                DynamicCircleObstacle(
                    base_x=spec.cx,
                    base_y=spec.cy,
                    radius=spec.radius,
                    motion=build_motion(spec.motion),
                )
            )
        else:  # dynamic-rect
            obstacles.append(
                DynamicRectObstacle(
                    base_x=spec.x,
                    base_y=spec.y,
                    width=spec.width,
                    height=spec.height,
                    motion=build_motion(spec.motion),
                )
            )
    world = World(
        width=scenario.width,
        height=scenario.height,
        obstacles=obstacles,
        robot=robot,
        goal=scenario.goal_position(),
        limits=RobotLimits(v_max=scenario.robot.v_max, omega_max=scenario.robot.omega_max),
    )
    world.params.goal_radius = scenario.goal_radius
    world.params.timeout_s = scenario.timeout_s
    world.params.stuck_window_s = scenario.stuck_window_s
    return world
