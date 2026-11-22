# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

The backend is the **single source of truth** for simulation state. Quality standards protect two things above all: **physical correctness** (real kinematics and collision detection) and **reproducibility** (same seed → same result).

---

## Required Patterns

- Units: meters, seconds, radians everywhere internally; only the frontend converts to pixels.
- Fixed timestep `dt = 0.05 s`; all stepping goes through the same engine loop used by both live sessions and batch experiments.
- Every function that consumes randomness gets its generator passed in (seeded from the session seed) — no bare `random.*` or `np.random.*` calls.
- Pure geometry/algorithms as plain functions or small classes, runnable from a Python script without FastAPI (see [directory structure](./directory-structure.md)).
- Pydantic models for anything crossing the API boundary; simulation internals use dataclasses/NumPy.
- Tests in `backend/tests/` run with `uv run pytest`.

---

## Forbidden Patterns

- **No duplicated physics state.** The frontend renders backend state; never keep a second authoritative copy of positions in TS.
- **No faked motion.** Pre-baked trajectories or CSS/canvas keyframe animation standing in for simulation is forbidden by the project spec.
- **No success laundering.** Collision/timeout/stuck must be recorded as such; never downgrade a failure to make an algorithm look better.
- **No unfair algorithm advantages.** All planners share the same robot model, collision rules, and observation; none may read future obstacle positions.
- No platform-specific shell syntax in scripts (must run on Windows and macOS).
- Live sessions advance the simulation whether or not a WebSocket client is watching — never gate stepping on the presence of subscribers (the backend is the source of truth).

---

## Testing Requirements

- P0 minimum: robot reaches the goal with no obstacles; robot detours around a static obstacle and does not collide.
- Algorithm tests assert reproducibility: same seed, same result (compare trajectories or final metrics exactly).
- Batch experiment runner is tested headless (no FastAPI import needed).
- New algorithm ⇒ new test file with a scenario that shows its characteristic behavior.

---

## Code Review Checklist

- Does the change keep simulation runnable without the server?
- Is every new piece of state derivable from the seed (reproducible)?
- Are collision checks radius-aware and sub-step safe for fast motion?
- Do metrics distinguish "did not reach" from "collided" from "timed out"?
- Are new API fields added to Pydantic schemas (and mirrored in frontend types)?
