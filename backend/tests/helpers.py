"""Headless runner shared by engine tests: scenario -> planned path -> executed run."""

from __future__ import annotations

from app.algorithms.astar import AStarPlanner
from app.algorithms.base import WorldView
from app.algorithms.controller import WaypointFollower
from app.scenarios.build import build_world
from app.scenarios.models import Scenario
from app.simulation.world import RunStatus, World


def run_headless(scenario: Scenario, safety_margin: float = 0.15) -> tuple[World, WaypointFollower]:
    world = build_world(scenario)
    world_view = WorldView(
        width=world.width,
        height=world.height,
        obstacles=tuple(world.obstacles),
        robot_radius=scenario.robot.radius,
    )
    result = AStarPlanner(safety_margin=safety_margin).plan(world.robot, world.goal, world_view)
    assert result.found, f"planning failed: {result.failure_reason}"
    follower = WaypointFollower(result.waypoints, world.limits)
    while world.status is RunStatus.RUNNING:
        command = follower.command(world.robot, world.goal, world_view)
        world.step(command)
    return world, follower
