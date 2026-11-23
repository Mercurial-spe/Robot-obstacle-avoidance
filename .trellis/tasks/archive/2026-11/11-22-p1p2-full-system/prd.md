# P1+P2 — Full System

Implement everything in [project spec](../../../docs/robot_navigation_workbench_spec.md) §9 P1 + P2 and the §10 Definition of Done, on top of the completed P0 (commit `3ebef79`).

## Scope

**P1 — course requirements**
1. Dynamic obstacles: repeatable motion patterns (horizontal/vertical ping-pong, polyline), fixed-timestep updates, honest collision semantics.
2. APF algorithm: attractive + repulsive forces → `(v, ω)`; local-minimum/oscillation recorded as failure, never laundered.
3. A* replanning in dynamic scenes, with replan count + planning time metrics.
4. Scenario presets: `static-basic`, `dynamic-crossing`, `mixed-corridor`.
5. Batch experiments over seed lists, metric aggregation, CSV/JSON export.
6. Fair comparison: all algorithms share robot limits, collision rules, observation.

**P2 — presentation & improvement**
7. Hybrid A*+APF with documented trigger conditions.
8. Side-by-side comparison view (two algorithms, same scenario/seed, shared timeline) + single-robot detail view.
9. Toggleable visualization layers: inflated zones, A* grid/expanded nodes, planned path, trajectory, heading, dynamic-obstacle velocity arrows, APF force; legend.
10. Scene editing while paused (drag/add/remove obstacles, move start/goal), reset restores initial conditions; 409 when running.
11. Recharts experiment dashboard; parameter panel; restrained motion/react transitions.

## Acceptance

- `uv run pytest` and `npm run build` pass.
- At least two algorithms really run and compare fairly on the same scenario; batch runs are reproducible per seed; failures recorded.
- README documents architecture, run steps, algorithms, and experiment reproduction.

Execution: multi-agent workflow (backend core → algorithms → experiments ∥ frontend core → frontend advanced → verify+docs). Bookkeeping only in this task dir; agents must not touch `.trellis/`.
