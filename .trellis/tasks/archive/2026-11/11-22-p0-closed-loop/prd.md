# P0 — Runnable Closed Loop

## Source of requirements

[Project specification](../../../docs/robot_navigation_workbench_spec.md) §9 「P0 — 可运行闭环」 and §3–§8. This PRD only restates the P0 slice; conflicts resolve in favor of the spec.

## Goal

Deliver the smallest end-to-end increment in which a robot reaches the goal under real simulation: Python engine + A* + FastAPI + React/Konva page with start/pause/reset.

## Deliverables

1. **Backend simulation engine** (`backend/app/simulation/`): fixed timestep `dt = 0.05 s`, unicycle kinematics with `v`/`omega` limits, radius-aware collision against static circle/rect obstacles and world bounds, goal/timeout/stuck end conditions. Runnable from plain Python/pytest without FastAPI.
2. **A\* planner** (`backend/app/algorithms/`): occupancy grid with inflation (robot radius + safety margin), path simplification, waypoint-following controller executing the path. Uses full-state observation only.
3. **Scenario presets** (`backend/app/scenarios/`): at least `static-basic` (a few obstacles between start and goal). Seeded; same definition shared by live and batch use.
4. **FastAPI app** (`backend/app/`): `GET /api/health`, `GET /api/scenarios`, `POST /api/sessions`, `POST /api/sessions/{id}/commands` (`start`/`pause`/`step`/`reset`), `WS /api/sessions/{id}/stream` pushing snapshots at ~15 Hz. Pydantic schemas; CORS for the Vite dev server.
5. **Frontend** (`frontend/`): Vite `react-ts` + Konva map showing obstacles, robot (with heading), planned path, executed trajectory; control bar (run/pause/reset, scenario + algorithm selection); status/metric readouts. Tailwind + shadcn/ui scaffolded but P0 styling stays functional.
6. **Tests** (`backend/tests/`): (a) robot reaches goal in an empty map; (b) robot detours around a static obstacle without collision. Plus reproducibility smoke (same seed → same trajectory).

## Acceptance criteria

- `cd backend && uv sync && uv run pytest` passes.
- `cd backend && uv run uvicorn app.main:app --port 8000` starts; `cd frontend && npm ci && npm run dev` starts; browser shows the map, start drives the robot to the goal, pause/reset work.
- Robot motion comes only from the simulation loop (no animation shortcuts).
- Out-of-scope (explicitly): dynamic obstacles, APF, hybrid, batch experiments, charts, scene editing UI — they belong to P1/P2.

## Constraints

- Backend is the single source of truth; frontend renders snapshots.
- Internal units: meters, seconds, radians.
- Windows and macOS compatible; no platform-specific shell syntax.
