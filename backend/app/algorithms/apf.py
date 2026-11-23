"""Artificial Potential Field (APF) local steering controller.

Design (all parameters documented here, tuned for the shared ``dt = 0.05 s``
engine and the preset arenas of 10-24 m):

- **Attraction** ``F_att = k_att * (target - p)`` — a conic (linear) well: the
  magnitude grows with distance to the goal (or to the next waypoint, for the
  Hybrid) and tapers to zero at the target itself, so the robot decelerates and
  settles instead of orbiting the goal point.
- **Repulsion** from every obstacle's CURRENT pose (static and dynamic alike;
  full-state observation — no future positions are ever used). For each
  obstacle the distance ``d`` from the robot center to the obstacle SURFACE is
  computed with the same closest-point convention as the engine's collision
  test, and while ``d < influence_radius`` the kernel
  ``k_rep * (1/d - 1/eta)`` pushes the robot away along the surface normal.
  The inverse (not inverse-square) kernel is deliberate: in the preset narrow
  gaps (~1.5 m) an inverse-square term explodes and makes the heading oscillate
  violently; the gentler kernel keeps the passage steerable while still
  dominating attraction at contact range. ``d`` is floored at ``d_floor`` and
  each per-obstacle magnitude is capped at ``repulse_cap`` (no unbounded
  forces). The four arena boundary walls join the field as pseudo-obstacles.
- **Tangential (vortex) component, per obstacle**: attraction + repulsion alone
  deadlock on any wall face (antiparallel forces). Each repulsing source
  additionally contributes ``k_tan * magnitude * rotate(normal, +-90deg)`` — a
  swirl parallel to ITS OWN surface, so it can never press the robot into that
  obstacle. The rotation sign is decided once per contact episode and latched:
  ``sign(cross(normal, dir_to_target))`` (slide around the obstacle on the goal
  side); when the two are (near) antiparallel the cross degenerates, and the
  fallback slides toward the NEAREST boundary END of a rectangular obstacle
  (for a wall face that is where the passage is) or, for end-less obstacles,
  keeps the previous latch / defaults to the deterministic left side. Latches
  clear after ``free_steps_reset`` steps out of range so every encounter is
  decided fresh. Latching is what prevents sign chatter at corners.
- **Force -> command** (unicycle): desired heading = total force direction;
  ``omega = k_omega * heading_error`` capped by ``omega_max``; ``v`` is scaled
  by ``cos(heading_error)`` (never negative — the robot stops rather than
  backing into whatever it avoids), by the goal-proximity blend and by a
  proximity governor (``governor_radius``: linear slowdown to 35% when the
  closest obstacle surface is near, so the 0.05 s discretization cannot
  overshoot into an obstacle), then capped by ``v_max``. Above ``align_stop``
  radians of heading error the robot rotates in place (WaypointFollower
  convention).
- **Local-minimum handling**: NOT rescued here. A true trap (e.g. a sealed
  concave pocket) still makes no goal progress, so the engine's stuck detector
  fires STUCK honestly. What this module adds is a human-readable trap report:
  ``status_message`` is set once the goal-directed component of the total force
  has been non-positive for ``trap_steps`` consecutive steps. The message is
  informational; it never converts a failure into success and never masks the
  engine's STUCK/TIMEOUT terminal statuses.

Force units: the field is a scaled-Newton artifact — only its DIRECTION and
relative magnitude matter, since the command stage normalizes it. The snapshot
field ``apf_force`` carries this total force vector in the world frame
(x right, y up, meters), so the frontend can draw an APF force arrow.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

from app.algorithms.base import WorldView
from app.simulation.dynamic import DynamicCircleObstacle, DynamicRectObstacle
from app.simulation.geometry import Vec2, clamp, wrap_angle
from app.simulation.robot import Command, RobotLimits, RobotState
from app.simulation.world import CircleObstacle, RectObstacle


@dataclass(frozen=True, slots=True)
class APFParams:
    """Tunable APF gains with the rationale for each default."""

    k_att: float = 1.0
    # Conic attraction well: F = k_att * (target - p), i.e. magnitude
    # k_att * distance (10-22 over the preset arenas). Contact-range repulsion
    # (>= 50) still dominates it, so approach is stopped well before touching.
    k_rep: float = 3.0
    # Inverse-kernel gain: at d = 0.5 m the repulsion is ~4.5 (comparable to
    # local attraction, gentle steering in narrow gaps); at d = 0.1 m it is
    # ~28 (hard stop). Balanced for the 1.5 m preset gaps.
    influence_radius: float = 2.0
    # Range of the repulsive field (m): matches the A* safety_margin inflation
    # scale so all algorithms react to obstructions at a comparable distance.
    k_tan: float = 0.8
    # Tangential gain relative to each source's repulsion magnitude: strong
    # enough to slide along a face, weaker than the normal term so the robot
    # keeps off the surface while sliding.
    repulse_cap: float = 200.0
    # Per-source cap on the kernel output (finite forces, stable mapping).
    d_floor: float = 0.05
    slow_radius: float = 1.2
    # Distance from the GOAL inside which speed tapers linearly to ~25%
    # v_max (matching WaypointFollower's slow_scale floor); the attraction
    # magnitude tapers with it because the well is conic.
    governor_radius: float = 0.8
    governor_min: float = 0.35
    # Speed governor: inside governor_radius of the closest obstacle surface,
    # v scales down linearly to governor_min — bounds the per-step position
    # change so no obstacle is overshot at dt = 0.05 s.
    k_omega: float = 2.5
    # Same heading-proportional gain as WaypointFollower, so heading dynamics
    # are identical across algorithms.
    align_stop: float = 0.6
    # Heading error beyond which the robot rotates in place (WaypointFollower
    # convention), keeping turn-in-place behavior uniform across algorithms.
    trap_steps: int = 60
    # 3 s without meaningful goal progress = "trapped" report (informational
    # only; the engine's stuck detector stays the authority). Shorter than the
    # engine's default 6 s stuck window so the message leads the verdict.
    trap_progress_m: float = 0.2
    # Goal-approach increment that counts as "still making progress".
    free_steps_reset: int = 10
    # 0.5 s out of a source's influence clears its tangential-sign latch.
    vortex_eps: float = 0.15
    # |cross(normal, dir_to_target)| below this is treated as head-on
    # (degenerate) when choosing a fresh tangential sign.


def surface_distance(position: Vec2, obstacle: object) -> tuple[float, Vec2]:
    """Distance from ``position`` to an obstacle's surface and the away normal.

    Returns ``(distance, unit_vector_pointing_away_from_the_obstacle)``. The
    closest-point convention matches the engine's collision test
    (``geometry.circle_overlaps_rect`` / circle-circle), so the field reacts at
    the same surfaces the collision checker enforces.
    """
    if isinstance(obstacle, (CircleObstacle, DynamicCircleObstacle)):
        center = Vec2(obstacle.cx, obstacle.cy)
        dx = position.x - center.x
        dy = position.y - center.y
        dist = math.hypot(dx, dy)
        if dist <= 1e-9:
            return obstacle.radius, Vec2(1.0, 0.0)
        return dist - obstacle.radius, Vec2(dx / dist, dy / dist)
    if isinstance(obstacle, (RectObstacle, DynamicRectObstacle)):
        closest_x = clamp(position.x, obstacle.x, obstacle.max_x)
        closest_y = clamp(position.y, obstacle.y, obstacle.max_y)
        dx = position.x - closest_x
        dy = position.y - closest_y
        dist = math.hypot(dx, dy)
        if dist <= 1e-9:
            # Center inside the rect: push out through the nearest face.
            left = position.x - obstacle.x
            right = obstacle.max_x - position.x
            bottom = position.y - obstacle.y
            top = obstacle.max_y - position.y
            minimum = min(left, right, bottom, top)
            if minimum == left:
                return 0.0, Vec2(-1.0, 0.0)
            if minimum == right:
                return 0.0, Vec2(1.0, 0.0)
            if minimum == bottom:
                return 0.0, Vec2(0.0, -1.0)
            return 0.0, Vec2(0.0, 1.0)
        return dist, Vec2(dx / dist, dy / dist)
    return math.inf, Vec2(0.0, 0.0)


def nearest_end_direction(position: Vec2, obstacle: object) -> Vec2 | None:
    """Unit vector from ``position`` to the closest boundary END of an obstacle.

    Used only to break head-on ties for the tangential slide: for a rectangular
    face the "ends" are its corners, so sliding toward the nearest end walks
    the robot off the face where the passage is. Circles have no ends and
    return ``None`` (the caller keeps its latch / defaults to the left side).
    """
    if isinstance(obstacle, (RectObstacle, DynamicRectObstacle)):
        corners = [
            Vec2(obstacle.x, obstacle.y),
            Vec2(obstacle.max_x, obstacle.y),
            Vec2(obstacle.x, obstacle.max_y),
            Vec2(obstacle.max_x, obstacle.max_y),
        ]
        best: tuple[float, Vec2] | None = None
        for corner in corners:
            dx = corner.x - position.x
            dy = corner.y - position.y
            dist = math.hypot(dx, dy)
            if best is None or dist < best[0]:
                best = (dist, Vec2(dx / dist, dy / dist) if dist > 1e-9 else Vec2(0.0, 0.0))
        return best[1] if best else None
    return None


def _boundary_sources(position: Vec2, width: float, height: float) -> list[tuple[str, float, Vec2]]:
    """Arena boundary walls as (key, surface_distance, away_normal) sources."""
    return [
        ("wall-left", position.x, Vec2(1.0, 0.0)),
        ("wall-right", width - position.x, Vec2(-1.0, 0.0)),
        ("wall-bottom", position.y, Vec2(0.0, 1.0)),
        ("wall-top", height - position.y, Vec2(0.0, -1.0)),
    ]


class APFController:
    """Steers DIRECTLY on the potential field: no path, force -> (v, omega)."""

    name = "apf"

    def __init__(
        self,
        limits: RobotLimits,
        params: APFParams | None = None,
        slow_radius: float | None = None,
    ) -> None:
        self.limits = limits
        self.params = params if params is not None else APFParams()
        if slow_radius is not None:
            self.params = replace(self.params, slow_radius=slow_radius)
        self.last_force: Vec2 | None = None
        self.status_message: str | None = None
        self._trap_counter = 0
        self._trap_best_distance = math.inf
        self._min_surface_distance = math.inf
        # Per-source tangential-sign latches: key -> [sign, steps_out_of_range].
        self._vortex_signs: dict[str, list[float]] = {}

    # -- forces -------------------------------------------------------------

    def compute_force(
        self, state: RobotState, target: Vec2, world_view: WorldView
    ) -> tuple[Vec2, float]:
        """Total potential force toward ``target`` and its repulsion magnitude.

        The repulsion magnitude (root sum of squares of the per-source
        magnitudes) is returned so the Hybrid can detect a blocked path ahead
        and APF can report being trapped.
        """
        params = self.params
        dx = target.x - state.x
        dy = target.y - state.y
        goal_distance = math.hypot(dx, dy)
        if goal_distance <= 1e-9:
            return Vec2(0.0, 0.0), 0.0
        # Conic attraction well: linear growth with distance, zero at target.
        force = Vec2(params.k_att * dx, params.k_att * dy)
        attraction_dir = Vec2(dx / goal_distance, dy / goal_distance)

        # Gather sources: real obstacles (current poses only) + boundary walls.
        sources: list[tuple[str, float, Vec2, object]] = []
        for index, obstacle in enumerate(world_view.obstacles):
            distance, normal = surface_distance(state.position, obstacle)
            sources.append((f"obs{index}", distance, normal, obstacle))
        for key, distance, normal in _boundary_sources(
            state.position, world_view.width, world_view.height
        ):
            sources.append((key, distance, normal, None))

        repulse_sq_sum = 0.0
        min_surface_distance = math.inf
        seen_keys: set[str] = set()
        for key, distance, normal, obstacle in sources:
            if distance >= params.influence_radius:
                continue
            seen_keys.add(key)
            min_surface_distance = min(min_surface_distance, distance)
            d = max(distance, params.d_floor)
            magnitude = min(
                params.k_rep * (1.0 / d - 1.0 / params.influence_radius),
                params.repulse_cap,
            )
            repulse_sq_sum += magnitude * magnitude
            force = Vec2(
                force.x + magnitude * normal.x,
                force.y + magnitude * normal.y,
            )
            # Per-source tangential (vortex) slide, sign latched per episode.
            latch = self._vortex_signs.get(key)
            if latch is None or latch[0] == 0.0:
                self._vortex_signs[key] = [
                    self._choose_vortex_sign(state, obstacle, normal, attraction_dir, params),
                    0,
                ]
                latch = self._vortex_signs[key]
            tangential = Vec2(-latch[0] * normal.y, latch[0] * normal.x)
            force = Vec2(
                force.x + params.k_tan * magnitude * tangential.x,
                force.y + params.k_tan * magnitude * tangential.y,
            )
        # Age and clear latches of sources no longer in range.
        for key in list(self._vortex_signs):
            if key not in seen_keys:
                latch = self._vortex_signs[key]
                latch[1] += 1
                if latch[1] >= params.free_steps_reset:
                    del self._vortex_signs[key]

        repulse_mag = math.sqrt(repulse_sq_sum)
        self._min_surface_distance = min_surface_distance
        return force, repulse_mag

    def _choose_vortex_sign(
        self,
        state: RobotState,
        obstacle: object,
        normal: Vec2,
        attraction_dir: Vec2,
        params: APFParams,
    ) -> float:
        """Pick the slide sense for one source at the moment of first contact.

        Prefer the goal side: sign(cross(normal, dir_to_target)). Head-on
        (degenerate cross) slides toward the nearest boundary end of a
        rectangular obstacle — that is where the passage is; circles and
        boundary walls have no ends and default to the deterministic left of
        the goal direction.
        """
        cross = normal.x * attraction_dir.y - normal.y * attraction_dir.x
        if abs(cross) > params.vortex_eps:
            return 1.0 if cross > 0.0 else -1.0
        if obstacle is not None:
            end_dir = nearest_end_direction(state.position, obstacle)
            if end_dir is not None:
                cross_end = normal.x * end_dir.y - normal.y * end_dir.x
                if abs(cross_end) > 1e-9:
                    return 1.0 if cross_end > 0.0 else -1.0
        return 1.0  # deterministic default: slide to the left of the target

    # -- commands -----------------------------------------------------------

    def force_to_command(self, force: Vec2, state: RobotState, goal: Vec2) -> Command:
        """Map a force vector to (v, omega) with all limits respected."""
        magnitude = math.hypot(force.x, force.y)
        if magnitude <= 1e-9:
            return Command(v=0.0, omega=0.0)
        desired = math.atan2(force.y, force.x)
        heading_error = wrap_angle(desired - state.theta)
        omega = clamp(
            self.params.k_omega * heading_error,
            -self.limits.omega_max,
            self.limits.omega_max,
        )
        if abs(heading_error) > self.params.align_stop:
            return Command(v=0.0, omega=omega)  # rotate before committing speed
        alignment = math.cos(heading_error)
        goal_distance = state.position.distance_to(goal)
        slow = clamp(goal_distance / self.params.slow_radius, 0.25, 1.0)
        # Proximity governor: slow down near the closest obstacle surface so
        # the fixed 0.05 s step cannot overshoot into it.
        governor = 1.0
        closest = getattr(self, "_min_surface_distance", math.inf)
        if closest < self.params.governor_radius:
            governor = clamp(
                closest / self.params.governor_radius,
                self.params.governor_min,
                1.0,
            )
        v = self.limits.v_max * alignment * slow * governor
        return Command(v=max(0.0, v), omega=omega)

    def command(self, state: RobotState, goal: Vec2, world_view: WorldView) -> Command:
        force, repulse_mag = self.compute_force(state, goal, world_view)
        self.last_force = force
        self._update_trap_report(state, goal)
        return self.force_to_command(force, state, goal)

    def _update_trap_report(self, state: RobotState, goal: Vec2) -> None:
        """Surface (never mask) a local-minimum situation as a status message.

        "Trapped" = no meaningful approach toward the goal (improvement of at
        least ``trap_progress_m``) for ``trap_steps`` consecutive steps while
        the total force is still nonzero. This mirrors the engine's stuck
        detector with shorter, message-only thresholds: it fires earlier and
        explains WHY, but it never changes the run's outcome — the engine's
        STUCK/TIMEOUT remain the only terminal verdicts. The message clears
        itself if the field opens up and progress resumes.
        """
        goal_distance = state.position.distance_to(goal)
        if goal_distance < self._trap_best_distance - self.params.trap_progress_m:
            self._trap_best_distance = goal_distance
            self._trap_counter = 0
            self.status_message = None
            return
        self._trap_counter += 1
        if self._trap_counter >= self.params.trap_steps and self.status_message is None:
            self.status_message = (
                f"APF trapped in a local minimum near ({state.x:.1f}, {state.y:.1f}): "
                f"no goal progress for {self.params.trap_steps * 0.05:.0f}s; "
                "expect STUCK unless the field changes"
            )
