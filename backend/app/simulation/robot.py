"""Robot model: circular differential-drive robot with unicycle kinematics."""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.simulation.geometry import Vec2, clamp, wrap_angle


@dataclass(slots=True)
class RobotState:
    x: float
    y: float
    theta: float

    @property
    def position(self) -> Vec2:
        return Vec2(self.x, self.y)

    def copy(self) -> "RobotState":
        return RobotState(self.x, self.y, self.theta)


@dataclass(frozen=True, slots=True)
class Command:
    """A control command produced by an algorithm: linear and angular velocity."""

    v: float
    omega: float


@dataclass(frozen=True, slots=True)
class RobotLimits:
    v_max: float
    omega_max: float


def apply_command(
    state: RobotState, command: Command, limits: RobotLimits, dt: float
) -> RobotState:
    """Advance the unicycle model one step with velocity limits applied."""
    v = clamp(command.v, 0.0, limits.v_max)
    omega = clamp(command.omega, -limits.omega_max, limits.omega_max)
    return RobotState(
        x=state.x + v * math.cos(state.theta) * dt,
        y=state.y + v * math.sin(state.theta) * dt,
        theta=wrap_angle(state.theta + omega * dt),
    )
