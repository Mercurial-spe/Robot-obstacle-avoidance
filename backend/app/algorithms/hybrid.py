"""A* + APF Hybrid: a global path steered by local potential forces.

The A* planner supplies intermediate waypoints (the GLOBAL layer); between
waypoints the robot is NOT driven by the blind WaypointFollower but by APF-style
forces (the LOCAL layer): attraction toward the NEXT WAYPOINT plus repulsion
from every obstacle's CURRENT pose (same field machinery as the pure APF).

Replan triggers (each one alone requests a replan; the session throttles them):

1. **Local blockage** — the local field chokes the drive toward the next
   waypoint: while a repulsive field is active, the total force's projection on
   the waypoint direction stays below ``BLOCKED_FRACTION`` (0.25) of the
   free-space attraction for ``block_steps`` consecutive steps (default 20 =
   1 s of sim time). One second is long enough to ride out a passing dynamic
   obstacle's wake but short compared with the engine's stuck window, so the
   global layer reacts before the run degrades into STUCK. The trigger only
   FIRES for INTERMEDIATE waypoints; when steering at the final goal,
   blockage is honest APF behavior and replanning cannot help a trapped field
   near the goal.
2. **Proximity** — the next path segment encroaches on any obstacle's current
   pose (session-side ``_path_threatened``, shared with the A* baseline).
3. **Periodic** — the session's 1.0 s scheduled replan check (shared plumbing).

The controller never replans by itself: it raises ``replan_requested`` and the
session (single source of truth) runs the planner and swaps in a fresh
controller with the new waypoints.
"""

from __future__ import annotations

import math

from app.algorithms.apf import APFController, APFParams
from app.algorithms.base import WorldView
from app.algorithms.controller import WaypointFollower
from app.simulation.geometry import Vec2
from app.simulation.robot import Command, RobotLimits, RobotState

DEFAULT_BLOCK_STEPS = 20  # 20 * dt(0.05s) = 1.0s of local blockage
BLOCKED_FRACTION = 0.25  # projection below this share of attraction = choked


class HybridController(WaypointFollower):
    """WaypointFollower bookkeeping (advance/switch) with APF local steering."""

    name = "hybrid"

    def __init__(
        self,
        waypoints: list[Vec2],
        limits: RobotLimits,
        params: APFParams | None = None,
        block_steps: int = DEFAULT_BLOCK_STEPS,
    ) -> None:
        super().__init__(waypoints, limits)
        self.apf = APFController(limits, params)
        self.block_steps = block_steps
        self.replan_requested = False
        self._block_counter = 0
        # Force the LOCAL layer produced last step (exposed for snapshots).
        self.last_force: Vec2 | None = None

    def command(self, state: RobotState, goal: Vec2, world_view: WorldView) -> Command:
        self.advance(state.position)
        if self.finished:
            return Command(v=0.0, omega=0.0)
        target = self.waypoints[self._index]
        force, repulse_mag = self.apf.compute_force(state, target, world_view)
        self.apf.last_force = force
        self.last_force = force
        self._update_block_trigger(state, target, force, repulse_mag)
        # force_to_command decelerates near the FINAL goal; intermediate
        # waypoints are handed over at the switch radius. Speed stays capped
        # by v_max and the heading-alignment factor in every case.
        return self.apf.force_to_command(force, state, goal)

    def _update_block_trigger(
        self, state: RobotState, target: Vec2, force: Vec2, repulse_mag: float
    ) -> None:
        """Count consecutive steps where the field chokes the drive to the waypoint.

        Blocked step = an active repulsive field (``repulse_mag > 0``) AND the
        total force's projection on the waypoint direction below
        ``BLOCKED_FRACTION`` of the free-space attraction ``k_att * distance``
        (which is exactly the projection attraction alone would give, since it
        points straight at the target). At the attraction/repulsion equilibrium
        the projection hovers around zero, so this fires reliably while a wall
        sits on the path, and never in free space (projection = attraction).
        """
        if repulse_mag <= 1e-9:
            self._block_counter = 0
            return
        dx = target.x - state.x
        dy = target.y - state.y
        distance = math.hypot(dx, dy)
        if distance <= 1e-9:
            self._block_counter = 0
            return
        dir_x, dir_y = dx / distance, dy / distance
        attraction = self.apf.params.k_att * distance
        projection = force.x * dir_x + force.y * dir_y
        if projection < BLOCKED_FRACTION * attraction:
            self._block_counter += 1
        else:
            self._block_counter = 0
        if self._block_counter >= self.block_steps and self._index < len(self.waypoints) - 1:
            self.replan_requested = True
            self._block_counter = 0

    def consume_replan_request(self) -> bool:
        """Read-and-clear the blockage flag (the session polls this each step)."""
        if self.replan_requested:
            self.replan_requested = False
            return True
        return False
