# Component Guidelines

> How components are built in this project.

---

## Overview

React + TypeScript function components only. The frontend **renders backend state** — it never computes robot positions, collisions, or metrics. Two render contexts share the same canvas component: the single-robot detail view and the side-by-side comparison view (see [architecture](../../../docs/ARCHITECTURE.md#前端)).

> Note: P0 establishes the reference examples. Until the first components land, these rules come from the [project specification](../../../docs/robot_navigation_workbench_spec.md) §2/§5.

---

## Component Structure

```text
src/components/<feature>/
  ControlPanel.tsx
  MetricCards.tsx
```

- Named function components; props typed via a `Props` interface declared right above the component.
- One component per file, PascalCase filename matching the export.
- Pages/layouts live at `src/App.tsx`; reusable pieces under `src/components/`, Konva scene graph under `src/canvas/`.

---

## Props Conventions

- Props are the **backend state slices** to render plus callbacks to mutate session state (e.g. `session: SessionSnapshot`, `onCommand: (cmd: Command) => void`).
- No component fetches data itself — data arrives via hooks in `src/hooks/` (see [hook guidelines](./hook-guidelines.md)).
- Keep props serializable and few; group related values into one object instead of 8 booleans.

---

## Styling Patterns

- **Tailwind CSS + shadcn/ui** with the design tokens from spec §5: dark, deep-blue/graphite background, few high-contrast accent colors for path/robot/status.
- No inline `style={{}}` except for canvas-derived values (position mapping, line widths).
- Visual style target is "Robotics Research Workbench": clean and professional, restrained animation (`motion/react` only for panel transitions), no gamification.

---

## Accessibility

- Buttons are real `<button>`s (or shadcn components) with labels; run/pause/reset reachable by keyboard.
- Text shown on classroom projection must stay legible: sufficient contrast on the dark background, consistent placement of legend and metrics.

---

## Common Mistakes

- Deriving robot pose with CSS transforms/animations instead of consuming the backend snapshot.
- A "smart" component that holds a copy of simulation state — components are presentational over session hooks.
- Inconsistent scales/colors between the two side-by-side maps; both maps must share viewport and legend (spec §5).
