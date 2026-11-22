# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

**This project has no database.** The robot navigation workbench is a stateless-per-session simulation service:

- Live session state (world, robot, obstacles, metrics) lives in an **in-memory session store** inside the FastAPI process (`backend/app/api/`).
- Batch experiment results are plain **CSV / JSON files** produced by `backend/app/experiments/` — the standard library `csv` / `json` modules, no ORM.
- Scenario definitions (maps, obstacles, seeds) are **Pydantic models** serialized to JSON, not DB rows.

Do not introduce SQLite, SQLAlchemy, or any ORM without first updating this file and the [project specification](../../../docs/robot_navigation_workbench_spec.md).

---

## Query Patterns

N/A. The closest analogue is the in-memory session registry:

- Sessions are keyed by a UUID string and looked up by path parameter.
- A missing session id must return `404` with the standard error body (see [error-handling](./error-handling.md)).

---

## Persistence

- Experiment exports go to a local `exports/` directory (gitignored) or are returned inline in the response.
- File names must include scenario, algorithm, and seed so runs are identifiable without opening them, e.g. `dynamic-crossing_hybrid_seed42.csv`.

---

## Common Mistakes

- Reaching for a database "because it's a backend" — reproducibility here comes from **seeds recorded in the experiment metadata**, not from stored rows.
- Keeping simulation state inside FastAPI request objects. Session state belongs to the simulation engine; FastAPI only maps it into schemas (see [directory structure](./directory-structure.md)).
