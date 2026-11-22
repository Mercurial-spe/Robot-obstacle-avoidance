# Type Safety

> TypeScript conventions for this project.

---

## Overview

Strict TypeScript from the Vite `react-ts` template (`strict: true` stays on). Types for backend payloads live in `src/types/` and are the single mirror of the Pydantic schemas in `backend/app/schemas/`.

---

## Type Organization

- `src/types/` holds API payload types: `SessionSnapshot`, `ScenarioSummary`, `Command`, `RunStatus`, `Vec2`, etc.
- Names mirror the backend schema names 1:1 so an OpenAPI-generated or hand-updated type set stays diffable.
- Units belong in names, since values arrive in SI units: `positionMeters`, `vMaxMs`, `timeoutS`.

---

## Conventions

- Prefer discriminated unions for backend enums/status: `type RunStatus = "running" | "reached_goal" | "collided" | "timeout" | "stuck"`.
- `interface` for object shapes, `type` for unions; export everything a component or hook needs from the type module — no local re-definitions of payload types.
- No `any`. Use `unknown` + narrowing for anything untyped at the boundary; WS messages are parsed once in `src/api/` before entering app state.
- Canvas coordinate conversion functions have explicit in/out unit names in their signatures (`metersToPx`).

---

## Common Mistakes

- Hand-copying a payload type with slightly different field names than the Pydantic schema; when schemas change, update `src/types/` in the same commit.
- Trusting WS JSON blindly at the component level — validate/parse in the API layer.
- Using pixel coordinates inside state that should hold meters; keep meters in state, convert only at the canvas layer.
