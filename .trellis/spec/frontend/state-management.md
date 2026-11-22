# State Management

> What state lives where in this project.

---

## Overview

The backend owns the simulation state. The frontend only owns **view state** and a mirror of the latest backend snapshot. No Redux/Zustand for now — React context + hooks are sufficient at this scale.

---

## State Categories

| Category | Where | Examples |
|----------|-------|----------|
| Server state (simulation) | Backend; mirrored via WS into a session hook | robot pose, obstacles, path, trajectory, metrics |
| Session control | Backend + local mirror of `{ status }` | running / paused / finished |
| View state | `useState` in `App.tsx` or a small context | selected scenario, selected algorithm, active layout (single vs side-by-side), visible layers |
| Transient UI state | Local `useState` in the component | hover, open dropdown |

---

## Rules

- Never duplicate simulation state in two hooks; there is exactly one WS subscription per session feeding one state holder.
- Scenario/algorithm selections are sent to the backend on session create; the frontend does not apply them locally to the simulation.
- Trajectory rendering appends increments from the stream; on `reset`, clear the local trajectory buffer together with the backend reset.
- If a state is needed by components more than two levels apart, lift it to a small context provider rather than prop-drilling — but keep the number of contexts small.

---

## Common Mistakes

- Keeping robot pose in component state and animating it independently of snapshots (double source of truth — forbidden by the spec).
- optimistic scene edits that the backend never confirmed; scene updates must round-trip the backend (`PUT /api/sessions/{id}/scene`).
- Storing derived metrics in state instead of computing from the snapshot during render.
