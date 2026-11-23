"""Pure geometry helpers for the simulation.

All coordinates are meters; angles are radians. No FastAPI imports here —
this module must stay runnable from plain Python / pytest.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Vec2:
    x: float
    y: float

    def distance_to(self, other: "Vec2") -> float:
        return math.hypot(self.x - other.x, self.y - other.y)


def wrap_angle(angle: float) -> float:
    """Wrap an angle to (-pi, pi]."""
    wrapped = math.fmod(angle + math.pi, 2.0 * math.pi)
    if wrapped <= 0.0:
        wrapped += 2.0 * math.pi
    return wrapped - math.pi


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def circle_overlaps_circle(
    center_a: Vec2, radius_a: float, center_b: Vec2, radius_b: float
) -> bool:
    return center_a.distance_to(center_b) < radius_a + radius_b


def circle_overlaps_rect(
    center: Vec2, radius: float, min_x: float, min_y: float, max_x: float, max_y: float
) -> bool:
    """Circle vs axis-aligned rectangle, using the closest-point distance.

    Uses ``<=`` so a zero-radius point check (the engine's center-based
    collision, with the robot radius handled by planner-side inflation) still
    reports a hit when the center lies inside the rectangle: distance 0 must
    count as overlapping.
    """
    closest_x = clamp(center.x, min_x, max_x)
    closest_y = clamp(center.y, min_y, max_y)
    dx = center.x - closest_x
    dy = center.y - closest_y
    return dx * dx + dy * dy <= radius * radius


def point_in_arena(point: Vec2, radius: float, width: float, height: float) -> bool:
    """The whole robot disc must stay inside the arena."""
    return (
        radius <= point.x <= width - radius
        and radius <= point.y <= height - radius
    )
