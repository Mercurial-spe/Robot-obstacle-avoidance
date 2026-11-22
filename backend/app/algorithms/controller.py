"""Waypoint-following controller shared by all path-producing planners."""

from __future__ import annotations

import math

from app.algorithms.base import WorldView
from app.simulation.geometry import Vec2, clamp, wrap_angle
from app.simulation.robot import Command, RobotLimits, RobotState


class WaypointFollower:
    """Drives the robot through a waypoint list, then onto the final goal point."""

    def __init__(
        self,
        waypoints: list[Vec2],
        limits: RobotLimits,
        switch_radius: float = 0.3,
    ) -> None:
        self.waypoints = list(waypoints)
        self.limits = limits
        self.switch_radius = switch_radius
        self._index = 0

    @property
    def finished(self) -> bool:
        return self._index >= len(self.waypoints)

    def advance(self, position: Vec2) -> None:
        while (
            self._index < len(self.waypoints)
            and position.distance_to(self.waypoints[self._index]) < self.switch_radius
        ):
            self._index += 1

    def command(self, state: RobotState, goal: Vec2, world_view: WorldView) -> Command:
        if self.finished:
            return Command(v=0.0, omega=0.0)
        self.advance(state.position)
        if self.finished:
            return Command(v=0.0, omega=0.0)
        target = self.waypoints[self._index]
        heading = math.atan2(target.y - state.y, target.x - state.x)
        heading_error = wrap_angle(heading - state.theta)

        # Rotate toward the target before committing to full speed.
        if abs(heading_error) > 0.6:
            return Command(v=0.0, omega=clamp(2.5 * heading_error, -self.limits.omega_max, self.limits.omega_max))

        goal_distance = state.position.distance_to(goal)
        slow_scale = clamp(goal_distance / 1.5, 0.35, 1.0)
        v = self.limits.v_max * slow_scale
        omega = clamp(2.5 * heading_error, -self.limits.omega_max, self.limits.omega_max)
        return Command(v=v, omega=omega)
