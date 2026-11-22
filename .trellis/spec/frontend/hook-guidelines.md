# Hook Guidelines

> How hooks are used in this project.

---

## Overview

Custom hooks own all stateful logic: session lifecycle, WebSocket subscription, and view state. Components and canvas layers stay presentational.

---

## Custom Hook Patterns

- Hooks live in `src/hooks/`, named `use<Thing>.ts`, one concern per hook.
- Session control is a single hook (e.g. `useSession`) that wraps the API client in `src/api/` and exposes `{ snapshot, status, start, pause, step, reset }`.
- The WebSocket stream is consumed through a subscription hook that pushes each backend snapshot into React state at the backend's 10–20 Hz rate; components read the latest snapshot, they do not manage the socket.

```tsx
// Reference shape (P0)
export function useSession(sessionId: string | null) {
  // REST commands + WS subscription, returns latest snapshot + senders
}
```

---

## Data Fetching

- REST calls go through the typed client in `src/api/` — never `fetch` inline in a component.
- WebSocket reconnection is handled inside the hook (retry with backoff, expose `connected`).
- No React Query/SWR for now; the backend pushes live state over WS. Revisit only if REST-side caching pain appears.

---

## Naming Conventions

- `use` prefix, camelCase, filename matches hook name.
- Returned object keys are nouns (`snapshot`, `error`); action callbacks are verbs (`start`, `reset`, `setScenario`).

---

## Common Mistakes

- Subscribing to the WebSocket in `useEffect` without cleanup → duplicate streams on remount.
- Storing the whole snapshot history in state; keep the latest snapshot (plus trajectory increments appended explicitly, since the trajectory *is* the data we display).
- Calling REST commands from multiple components directly instead of through the session hook.
