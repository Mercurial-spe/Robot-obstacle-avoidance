# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

The frontend is judged on three things: it renders **real backend state**, the two side-by-side maps stay **comparable**, and it stays readable on a classroom projector. Pure logic (unit conversion, interpolation, trajectory buffer) belongs in `src/api/`, `src/hooks/`, or small utils where Vitest can test it.

---

## Required Patterns

- React function components + hooks only; effect cleanup for every subscription and listener.
- All backend access via `src/api/`; all session state via hooks in `src/hooks/` (see [hook guidelines](./hook-guidelines.md)).
- Tailwind + shadcn/ui tokens for styling; Konva layers for the scene graph.
- Check `npm run build` (tsc + Vite) passes before declaring work done.

---

## Forbidden Patterns

- CSS/canvas keyframe animation that fakes robot motion or avoidance behavior (project spec explicitly forbids this).
- Fetching from components; duplicating backend-derived state in a store.
- `any`, non-strict tsconfig options, unused Vite template boilerplate kept in the repo.
- Layout-only hacks that break the shared viewport/scale between the paired maps.
- **Non-`<Layer>` direct children of a Konva `<Stage>`** — Konva throws "You may only add layers to the stage" at RUNTIME, crashing the whole React tree to a blank page while `tsc` + `vite build` stay green. Always wrap canvas content in `<Layer>`; any change to `src/canvas/` must be eyeballed in the browser, not just built.

---

## Testing Requirements

- Vitest for pure logic (unit conversion, interpolation, trajectory buffer).
- Playwright smoke tests are optional post-MVP; manual check requirement for UI work: verify the actual page (start → running → pause → reset) in the browser, not just the build.
- When touching the canvas, verify both the single view and the side-by-side view still render consistently.

---

## Code Review Checklist

- Does every rendered number/position come from the backend snapshot?
- Are WS/REST errors surfaced in the UI (status chip, toast) rather than swallowed?
- Are legend, colors, and metric placement consistent between paired maps?
- Is the dark-theme contrast sufficient for projection?
