# Error Handling

> How errors are handled in this project.

---

## Overview

Errors are separated into three layers with different strategies:

1. **Simulation domain** — expected outcomes, not exceptions. A run that collides, times out, or gets stuck is a *recorded result*, never a raised error.
2. **API layer** — validation via Pydantic schemas; unknown sessions and invalid commands return structured HTTP errors.
3. **Programming errors** — unexpected exceptions are logged and surfaced as HTTP 500 without leaking internals.

The spec requirement is explicit: failures (collision, timeout, local minimum trap) must be **kept visible**, never silently converted into success.

---

## Error Types

Domain module (`backend/app/simulation/`) defines the run outcome as data, e.g.:

```python
class RunStatus(str, Enum):
    RUNNING = "running"
    REACHED_GOAL = "reached_goal"
    COLLIDED = "collided"
    TIMEOUT = "timeout"
    STUCK = "stuck"
```

API layer defines one error body shape, returned for all non-2xx responses:

```json
{ "error": { "code": "session_not_found", "message": "..." } }
```

---

## Error Handling Patterns

- **Never raise for expected simulation outcomes.** `collided` / `timeout` / `stuck` are terminal statuses recorded on the session and reported to the frontend.
- FastAPI exception handlers translate domain lookup failures (`KeyError` on the session store) into `404`, and `ValueError` from invalid scene edits into `400` with a human-readable reason (e.g. why a map is unreachable). The UI must show the reason, not freeze.
- Scene updates are only valid while the session is paused/reset; violating that is a `409`, not a silent accept.

---

## API Error Responses

All errors use the single `{ "error": { "code", "message" } }` body above. Typical codes: `session_not_found`, `invalid_command`, `scene_locked`, `invalid_scene`, `validation_error`. Pydantic `ValidationError` from request bodies is kept in FastAPI's default 422 shape — the frontend treats any non-2xx as an error and displays `message`.

---

## Common Mistakes

- Catching an exception and marking a run `reached_goal` — success must only be set by the goal check in the simulation engine.
- Returning `200` with an error encoded in the payload; use the proper status code.
- Letting a WebSocket handler die on one bad client message — validate, ignore, and keep the stream alive.
- **Do not use `from __future__ import annotations` in FastAPI route modules** (`app/api/routes.py`). It turns response-model annotations into unresolved `ForwardRef`s and every request fails with `PydanticUserError: TypeAdapter ... not fully defined`. Route modules must import the real model classes.
