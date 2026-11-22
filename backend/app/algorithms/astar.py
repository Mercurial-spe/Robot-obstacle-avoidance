"""A* planner over an inflated occupancy grid."""

from __future__ import annotations

import heapq
import math
import time

from app.algorithms.base import PlanResult, WorldView
from app.simulation.geometry import Vec2
from app.simulation.robot import RobotState
from app.simulation.world import CircleObstacle, RectObstacle

GRID_RESOLUTION = 0.1  # meters per cell


class AStarPlanner:
    name = "astar"

    def __init__(self, safety_margin: float = 0.15) -> None:
        self.safety_margin = safety_margin

    # -- grid construction --------------------------------------------------

    def _inflation(self, world_view: WorldView) -> float:
        return world_view.robot_radius + self.safety_margin

    def build_grid(self, world_view: WorldView) -> tuple[list[bool], int, int]:
        """Rasterize the arena into a blocked/free grid, inflating obstacles."""
        inflation = self._inflation(world_view)
        cols = int(round(world_view.width / GRID_RESOLUTION))
        rows = int(round(world_view.height / GRID_RESOLUTION))
        blocked = [False] * (cols * rows)

        def cell_center(col: int, row: int) -> tuple[float, float]:
            return (col + 0.5) * GRID_RESOLUTION, (row + 0.5) * GRID_RESOLUTION

        # Arena boundary counts as an obstacle inflated by the same margin.
        for row in range(rows):
            for col in range(cols):
                cx, cy = cell_center(col, row)
                if (
                    cx < inflation
                    or cy < inflation
                    or cx > world_view.width - inflation
                    or cy > world_view.height - inflation
                ):
                    blocked[row * cols + col] = True

        for obstacle in world_view.obstacles:
            if isinstance(obstacle, CircleObstacle):
                radius = obstacle.radius + inflation
                min_col = max(0, int((obstacle.cx - radius) / GRID_RESOLUTION))
                max_col = min(cols - 1, int((obstacle.cx + radius) / GRID_RESOLUTION))
                min_row = max(0, int((obstacle.cy - radius) / GRID_RESOLUTION))
                max_row = min(rows - 1, int((obstacle.cy + radius) / GRID_RESOLUTION))
                for row in range(min_row, max_row + 1):
                    for col in range(min_col, max_col + 1):
                        cx, cy = cell_center(col, row)
                        if (cx - obstacle.cx) ** 2 + (cy - obstacle.cy) ** 2 < radius**2:
                            blocked[row * cols + col] = True
            else:
                min_x = obstacle.x - inflation
                min_y = obstacle.y - inflation
                max_x = obstacle.max_x + inflation
                max_y = obstacle.max_y + inflation
                min_col = max(0, int(min_x / GRID_RESOLUTION))
                max_col = min(cols - 1, int(max_x / GRID_RESOLUTION))
                min_row = max(0, int(min_y / GRID_RESOLUTION))
                max_row = min(rows - 1, int(max_y / GRID_RESOLUTION))
                for row in range(min_row, max_row + 1):
                    for col in range(min_col, max_col + 1):
                        cx, cy = cell_center(col, row)
                        if min_x <= cx <= max_x and min_y <= cy <= max_y:
                            blocked[row * cols + col] = True
        return blocked, cols, rows

    # -- search -------------------------------------------------------------

    def plan(
        self, robot: RobotState, goal: Vec2, world_view: WorldView
    ) -> PlanResult:
        started = time.perf_counter()
        blocked, cols, rows = self.build_grid(world_view)

        start_cell = self._to_cell(robot.position, cols, rows)
        goal_cell = self._to_cell(goal, cols, rows)
        if blocked[goal_cell[1] * cols + goal_cell[0]]:
            return self._failure(started, "goal lies inside an inflated obstacle")
        if blocked[start_cell[1] * cols + start_cell[0]]:
            return self._failure(started, "start lies inside an inflated obstacle")

        path = self._search(blocked, cols, rows, start_cell, goal_cell)
        if path is None:
            return self._failure(started, "no collision-free path found")

        waypoints = self._simplify(path, blocked, cols, rows)
        # The last grid cell may sit short of the exact goal; always finish at the goal.
        waypoints.append(goal)
        compute_ms = (time.perf_counter() - started) * 1000.0
        return PlanResult(waypoints=waypoints, compute_ms=compute_ms, found=True)

    def _failure(self, started: float, reason: str) -> PlanResult:
        return PlanResult(
            waypoints=[],
            compute_ms=(time.perf_counter() - started) * 1000.0,
            found=False,
            failure_reason=reason,
        )

    @staticmethod
    def _to_cell(point: Vec2, cols: int, rows: int) -> tuple[int, int]:
        col = min(cols - 1, max(0, int(point.x / GRID_RESOLUTION)))
        row = min(rows - 1, max(0, int(point.y / GRID_RESOLUTION)))
        return col, row

    @staticmethod
    def _search(
        blocked: list[bool],
        cols: int,
        rows: int,
        start: tuple[int, int],
        goal: tuple[int, int],
    ) -> list[tuple[int, int]] | None:
        """8-connected A*; diagonal moves require both orthogonal neighbors free."""

        def heuristic(cell: tuple[int, int]) -> float:
            dx = abs(cell[0] - goal[0])
            dy = abs(cell[1] - goal[1])
            return (dx + dy) + (math.sqrt(2) - 2) * min(dx, dy)

        open_heap: list[tuple[float, float, tuple[int, int]]] = []
        heapq.heappush(open_heap, (heuristic(start), 0.0, start))
        g_cost = {start: 0.0}
        came_from: dict[tuple[int, int], tuple[int, int]] = {}
        closed: set[tuple[int, int]] = set()
        neighbors = [
            (1, 0, 1.0),
            (-1, 0, 1.0),
            (0, 1, 1.0),
            (0, -1, 1.0),
            (1, 1, math.sqrt(2)),
            (1, -1, math.sqrt(2)),
            (-1, 1, math.sqrt(2)),
            (-1, -1, math.sqrt(2)),
        ]

        while open_heap:
            _, g, current = heapq.heappop(open_heap)
            if current in closed:
                continue
            closed.add(current)
            if current == goal:
                path = [current]
                while current in came_from:
                    current = came_from[current]
                    path.append(current)
                path.reverse()
                return path
            col, row = current
            for dcol, drow, cost in neighbors:
                ncol, nrow = col + dcol, row + drow
                if not (0 <= ncol < cols and 0 <= nrow < rows):
                    continue
                if blocked[nrow * cols + ncol]:
                    continue
                if dcol != 0 and drow != 0:
                    if blocked[row * cols + ncol] or blocked[nrow * cols + col]:
                        continue  # no corner cutting
                neighbor = (ncol, nrow)
                tentative = g + cost
                if tentative < g_cost.get(neighbor, math.inf):
                    g_cost[neighbor] = tentative
                    came_from[neighbor] = current
                    heapq.heappush(
                        open_heap, (tentative + heuristic(neighbor), tentative, neighbor)
                    )
        return None

    def _simplify(
        self,
        path: list[tuple[int, int]],
        blocked: list[bool],
        cols: int,
        rows: int,
    ) -> list[Vec2]:
        """Keep only waypoints that are required: greedy line-of-sight pruning."""

        def has_line_of_sight(a: tuple[int, int], b: tuple[int, int]) -> bool:
            steps = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
            # Sample at half-cell resolution along the segment.
            for i in range(2 * steps + 1):
                t = i / (2 * steps) if steps > 0 else 0.0
                col = int(round(a[0] + (b[0] - a[0]) * t))
                row = int(round(a[1] + (b[1] - a[1]) * t))
                col = min(cols - 1, max(0, col))
                row = min(rows - 1, max(0, row))
                if blocked[row * cols + col]:
                    return False
            return True

        simplified_indices = [0]
        index = 0
        while index < len(path) - 1:
            furthest = index + 1
            for candidate in range(len(path) - 1, index, -1):
                if has_line_of_sight(path[index], path[candidate]):
                    furthest = candidate
                    break
            simplified_indices.append(furthest)
            index = furthest

        waypoints: list[Vec2] = []
        for cell_index in simplified_indices:
            col, row = path[cell_index]
            waypoints.append(
                Vec2((col + 0.5) * GRID_RESOLUTION, (row + 0.5) * GRID_RESOLUTION)
            )
        return waypoints
