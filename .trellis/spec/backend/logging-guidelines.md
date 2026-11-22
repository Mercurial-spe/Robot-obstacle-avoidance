# Logging Guidelines

> How logging is done in this project.

---

## Overview

Use the standard library `logging` module, one module-level logger per module:

```python
import logging

logger = logging.getLogger(__name__)
```

Configure logging once in `backend/app/main.py` (basicConfig, level `INFO`); libraries and modules never call `basicConfig` themselves. Uvicorn keeps its own access log.

---

## Log Levels

| Level | When |
|-------|------|
| `DEBUG` | Per-step simulation internals (planner expansions, forces) — off by default, useful for algorithm debugging |
| `INFO` | Session lifecycle (created, started, paused, reset, closed), run completion with outcome and key metrics, batch experiment start/finish |
| `WARNING` | Recoverable oddities: client sent an unknown WS message, a planner fell back to a previous path, an export overwrote an existing file |
| `ERROR` | Unexpected exceptions in request/WS handlers, failure to write an export file |

---

## What to Log

- Session and command events with the session id (short form is enough).
- Every finished run: scenario, algorithm, seed, outcome, elapsed steps, collision count — this mirrors what experiments export, which makes live-session issues comparable with batch data.
- Batch experiment progress every N runs, not per run.

## What NOT to Log

- Full world state or full trajectories per step (too large; use DEBUG only if needed).
- Anything from request bodies verbatim — log a summary (scenario name, algorithm, seed) instead.
- Never log at `INFO` inside the fixed-timestep loop; it distorts batch timing and floods output.
