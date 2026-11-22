# P0 Implementation Plan

Ordered checklist; each step ends in a verifiable state.

## Backend

- [x] 1. `backend/pyproject.toml` (uv, requires-python >=3.11; deps: fastapi, uvicorn[standard], pydantic, numpy; dev: pytest). `uv sync` green (uv 0.12.4 pulled CPython 3.12; Tsinghua mirror needed on this network).
- [x] 2. `app/simulation/`: `geometry.py`, `robot.py`, `world.py` (RunStatus lives here instead of a separate `state.py`).
- [x] 3. `app/algorithms/`: `base.py`, `astar.py`, `controller.py`.
- [x] 4. `app/scenarios/`: `models.py`, `presets.py`, plus `build.py` (scenario → World factory shared by API/tests).
- [x] 5. `backend/tests/`: `test_arrival_no_obstacles.py`, `test_detour_static_obstacle.py`, `test_engine_behavior.py` (collision terminal + reproducibility), `helpers.py`. `uv run pytest` → 4 passed.
- [x] 6. `app/schemas/models.py` + `app/api/routes.py` + `app/api/sessions.py` + `app/main.py`. Smoke: session create, step, start; WS stream ~15 Hz; full live run `reached_goal` in 14.7 s sim, 0 collisions.

## Frontend

- [x] 7. `frontend/` Vite react-ts (hand-written scaffold), deps: react 19, konva/react-konva, tailwind v4 (`@tailwindcss/vite`), lucide-react; dev proxy `/api` → 127.0.0.1:8000, `VITE_API_BASE_URL` override supported.
- [x] 8. `src/types/index.ts` mirror + `src/api/client.ts`.
- [x] 9. `src/hooks/useSession.ts` (create/commands + WS auto-reconnect).
- [x] 10. `src/canvas/MapCanvas.tsx` + `src/components/ControlBar.tsx`, `StatusPanel.tsx` + `App.tsx` dark layout.
- [x] 11. `npm run build` green (tsc strict + vite). Browser interaction to be eyeballed by the maintainer; REST/WS behavior verified by script.

## Validation

- `uv run pytest` → 4 passed (0.31 s)
- `npm run build` → built in 0.6 s, no type errors
- Live smoke: created session, started, WS received ~15 snapshots/s, run ended `reached_goal` (sim 14.7 s, distance 16.56 m, collisions 0, planning 17.9 ms)

## Rollback points

After step 5 (headless engine proven) and step 11 (UI proven) — revert to the last green state if a step breaks the loop.
