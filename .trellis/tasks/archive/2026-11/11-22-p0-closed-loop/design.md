# P0 Design

## Boundaries

```text
scenarios (presets, seed)
      │ builds
      ▼
simulation (World: robot + obstacles + stepping + collision + end conditions)
      ▲ observes
algorithms (AStarPlanner -> path; WaypointFollower -> (v, omega))
      │
api/schemas (FastAPI routes + Pydantic models, in-memory SessionStore)
      │ REST + WS
frontend (api client, useSession hook, Konva canvas, control components)
```

- `simulation` and `algorithms` have **no FastAPI imports**; the API layer wires a chosen planner into the engine.
- Planner contract: `plan(robot_state, goal, world_view) -> list[Vec2]`. Controller contract: given current pose + waypoints → `(v, omega)` with limits applied. Engine executes and judges.

## Key decisions

1. **Dataclasses + NumPy for internals; Pydantic only at the API edge.** Schemas mirror names into `frontend/src/types/`.
2. **Stepping**: `World.step(dt)` advances robot via unicycle model; collision checks circle-vs-circle / circle-vs-AABB with robot radius, using 4 substeps when speed is high enough to tunnel. Bounds check on the arena rectangle.
3. **A\***: grid resolution 0.1 m over the arena, obstacles inflated by robot radius + margin (default 0.15 m); 8-connected with corner-cutting prevention; path simplified by line-of-sight walking. Replan only on reset/new session in P0 (static obstacles).
4. **Waypoint follower**: aim at the next waypoint, rotate-toward then drive; angular rate limit; slow down within goal radius. Terminal condition: distance to goal < threshold (default 0.3 m).
5. **Session loop**: each session runs a asyncio task at ~15 Hz wall-clock; each tick advances `k` sim steps to match requested speed (default 1×), then broadcasts a snapshot over WS. `step` advances exactly one sim step while paused. Deterministic per seed in headless mode (batch/tests run steps directly, no wall-clock).
6. **In-memory `SessionStore`** (dict[uuid, Session]); sessions are single-consumer (one WS per session id in P0).
7. **Frontend**: Vite `react-ts`; deps: `konva`, `react-konva`, `tailwindcss`, `lucide-react` (shadcn-style components can be added incrementally; P0 keeps a minimal dark UI). `useSession` hook owns REST commands + WS subscription; `MapCanvas` renders meters→pixels with a fixed world size (20×12 m default arena).

## Failure handling

- No path found → session enters `error` status with reason; frontend shows a message.
- Collision/timeout/stuck → terminal `RunStatus` values recorded and streamed; run freezes for inspection until reset.

## Rollback

Single-feature increment; revert the feature commits to return to the docs-only skeleton.
