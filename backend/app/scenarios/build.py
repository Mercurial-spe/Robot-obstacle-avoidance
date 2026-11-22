"""Build a runnable World from a Scenario. Shared by live sessions, tests and batch runners."""

from __future__ import annotations

from app.scenarios.models import Scenario
from app.simulation.robot import RobotLimits, RobotState
from app.simulation.world import CircleObstacle, RectObstacle, World


def build_world(scenario: Scenario) -> World:
    robot = RobotState(x=scenario.start[0], y=scenario.start[1], theta=0.0)
    obstacles = []
    for spec in scenario.obstacles:
        if spec.kind == "circle":
            obstacles.append(CircleObstacle(cx=spec.cx, cy=spec.cy, radius=spec.radius))
        else:
            obstacles.append(RectObstacle(x=spec.x, y=spec.y, width=spec.width, height=spec.height))
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
    return world
