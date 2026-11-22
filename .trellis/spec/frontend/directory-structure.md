# Frontend Directory Structure

See the [frontend directory map](../../../docs/ARCHITECTURE.md#前端) for the paths and responsibilities created in the initial repository structure.

Keep REST and WebSocket access in `src/api/`. Let session hooks manage subscriptions. Canvas and components render backend state and forward user actions.

Follow the [project specification](../../../docs/robot_navigation_workbench_spec.md) for stage order and acceptance criteria.
