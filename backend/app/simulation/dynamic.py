"""Dynamic obstacle motion patterns and engine-side dynamic obstacles.

Motion is a pure function of simulation time: given the same parameters and
``t``, every call returns the same pose. There is no RNG and no wall-clock
read anywhere in this module, which is what makes runs reproducible per seed.

Positions are meters, velocities m/s, times seconds, angles radians.
No FastAPI imports here — this module must stay runnable from plain Python.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Union

from app.simulation.geometry import Vec2


# -- motion patterns ---------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PingPongMotion:
    """Back-and-forth sweep along one axis (horizontal or vertical ping-pong).

    The obstacle starts at its base position, moves out ``amplitude`` meters
    along ``axis`` in ``half_period_s`` seconds, then moves back, forever.
    ``phase_s`` shifts the start along the cycle so several obstacles can be
    desynchronized deterministically.
    """

    axis: Literal["x", "y"] = "x"
    amplitude: float = 1.0
    half_period_s: float = 2.0
    phase_s: float = 0.0

    def pose_at(self, base: Vec2, t: float) -> tuple[Vec2, Vec2]:
        cycle = 2.0 * self.half_period_s
        u = math.fmod(t + self.phase_s, cycle)
        if u < 0.0:
            u += cycle
        if u <= self.half_period_s:
            frac = u / self.half_period_s
            sign = 1.0
        else:
            frac = (cycle - u) / self.half_period_s
            sign = -1.0
        speed = self.amplitude / self.half_period_s * sign
        offset = self.amplitude * frac
        if self.axis == "x":
            return Vec2(base.x + offset, base.y), Vec2(speed, 0.0)
        return Vec2(base.x, base.y + offset), Vec2(0.0, speed)


@dataclass(frozen=True, slots=True)
class PolylineMotion:
    """Waypoint loop: constant speed per segment, optional pause at vertices.

    ``points`` are OFFSETS relative to the obstacle's base position; the loop
    goes base -> p1 -> ... -> pn -> base, repeating forever. Velocity is the
    segment direction times ``speed`` while moving and zero while pausing.
    """

    points: tuple[tuple[float, float], ...]
    speed: float = 1.0
    pause_s: float = 0.0

    def pose_at(self, base: Vec2, t: float) -> tuple[Vec2, Vec2]:
        # Offsets: the base itself plus the authored points; the loop closes
        # back onto the base.
        offsets = [(0.0, 0.0), *self.points]
        count = len(offsets)
        segments: list[tuple[tuple[float, float], tuple[float, float], float, float]] = []
        cycle = 0.0
        for index in range(count):
            ax, ay = offsets[index]
            bx, by = offsets[(index + 1) % count]
            length = math.hypot(bx - ax, by - ay)
            move_s = length / self.speed
            segments.append(((ax, ay), (bx, by), length, move_s))
            cycle += move_s + self.pause_s
        if cycle <= 0.0:
            return base, Vec2(0.0, 0.0)
        u = math.fmod(t, cycle)
        if u < 0.0:
            u += cycle
        for (ax, ay), (bx, by), length, move_s in segments:
            if move_s > 0.0 and u < move_s:
                frac = u / move_s
                return (
                    Vec2(
                        base.x + ax + (bx - ax) * frac,
                        base.y + ay + (by - ay) * frac,
                    ),
                    Vec2((bx - ax) / length * self.speed, (by - ay) / length * self.speed),
                )
            u -= move_s
            if self.pause_s > 0.0 and u < self.pause_s:
                return Vec2(base.x + bx, base.y + by), Vec2(0.0, 0.0)
            u -= self.pause_s
        # Float-rounding safety net: park at the base.
        return base, Vec2(0.0, 0.0)


MotionPattern = Union[PingPongMotion, PolylineMotion]


# -- engine obstacles --------------------------------------------------------


@dataclass(slots=True)
class DynamicCircleObstacle:
    """Circular obstacle whose center follows a motion pattern.

    ``base_x``/``base_y`` is the home (anchor) position; ``cx``/``cy`` hold the
    CURRENT center and ``vx``/``vy`` the current velocity, refreshed by
    :meth:`update` from simulation time only.
    """

    base_x: float
    base_y: float
    radius: float
    motion: MotionPattern
    cx: float = 0.0
    cy: float = 0.0
    vx: float = 0.0
    vy: float = 0.0

    def __post_init__(self) -> None:
        self.update(0.0)

    def update(self, t: float) -> None:
        position, velocity = self.motion.pose_at(Vec2(self.base_x, self.base_y), t)
        self.cx, self.cy = position.x, position.y
        self.vx, self.vy = velocity.x, velocity.y

    def pose_at(self, t: float) -> tuple[Vec2, Vec2]:
        """Query without mutating: pose (position, velocity) at time ``t``."""
        return self.motion.pose_at(Vec2(self.base_x, self.base_y), t)


@dataclass(slots=True)
class DynamicRectObstacle:
    """Axis-aligned rectangular obstacle whose min corner follows a pattern.

    ``base_x``/``base_y`` is the home min corner; ``x``/``y`` hold the CURRENT
    min corner and ``vx``/``vy`` the current velocity of the whole body.
    """

    base_x: float
    base_y: float
    width: float
    height: float
    motion: MotionPattern
    x: float = 0.0
    y: float = 0.0
    vx: float = 0.0
    vy: float = 0.0

    def __post_init__(self) -> None:
        self.update(0.0)

    def update(self, t: float) -> None:
        position, velocity = self.motion.pose_at(Vec2(self.base_x, self.base_y), t)
        self.x, self.y = position.x, position.y
        self.vx, self.vy = velocity.x, velocity.y

    def pose_at(self, t: float) -> tuple[Vec2, Vec2]:
        return self.motion.pose_at(Vec2(self.base_x, self.base_y), t)

    @property
    def cx(self) -> float:
        return self.x + self.width / 2.0

    @property
    def cy(self) -> float:
        return self.y + self.height / 2.0

    @property
    def max_x(self) -> float:
        return self.x + self.width

    @property
    def max_y(self) -> float:
        return self.y + self.height


DynamicObstacle = DynamicCircleObstacle | DynamicRectObstacle


def effective_radius(obstacle: object) -> float:
    """Conservative radius used by clearance checks (rect: half diagonal)."""
    if isinstance(obstacle, (DynamicCircleObstacle,)):
        return obstacle.radius
    if hasattr(obstacle, "radius"):
        return float(obstacle.radius)  # type: ignore[attr-defined]
    if hasattr(obstacle, "width") and hasattr(obstacle, "height"):
        return 0.5 * math.hypot(obstacle.width, obstacle.height)  # type: ignore[attr-defined]
    return 0.0


def anchor_position(obstacle: object) -> Vec2:
    """Current reference point of an obstacle (circle center / rect center)."""
    if isinstance(obstacle, DynamicRectObstacle):
        return Vec2(obstacle.cx, obstacle.cy)
    if hasattr(obstacle, "cx") and hasattr(obstacle, "cy"):
        return Vec2(obstacle.cx, obstacle.cy)  # type: ignore[attr-defined]
    if hasattr(obstacle, "x") and hasattr(obstacle, "y"):
        return Vec2(obstacle.x, obstacle.y)  # type: ignore[attr-defined]
    return Vec2(0.0, 0.0)


def is_dynamic(obstacle: object) -> bool:
    return isinstance(obstacle, (DynamicCircleObstacle, DynamicRectObstacle))
