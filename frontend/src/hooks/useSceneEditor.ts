import { useCallback, useEffect, useRef, useState } from "react";
import type { MotionState, ObstacleSpec, ObstacleState, SceneUpdate, Snapshot } from "../types";

/** Local editable mirror of the scene: obstacle draft states + start + goal.
 * The backend stays the source of truth — edits only leave the frontend via
 * `buildSceneUpdate()` → PUT /api/sessions/{id}/scene, and the draft is
 * re-synced from the snapshot whenever the session is (re)created, reset or
 * the scene update round-trips. */
export interface SceneDraft {
  obstacles: ObstacleState[];
  start: [number, number];
  goal: [number, number];
}

/** Add-obstacle popover configuration (static obstacles only; dynamic ones
 * come from the presets and can be dragged like any other obstacle). */
export interface AddObstacleConfig {
  shape: "circle" | "rect";
  /** Circle radius (m). */
  radius: number;
  /** Rect full width/height (m). */
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function draftFromSnapshot(snapshot: Snapshot): SceneDraft {
  return {
    obstacles: snapshot.obstacles.map((o) => ({
      ...o,
      base: o.base ? [o.base[0], o.base[1]] : null,
      motion: o.motion ? ({ ...o.motion } as MotionState) : null,
    })),
    start: [snapshot.start[0], snapshot.start[1]],
    goal: [snapshot.goal[0], snapshot.goal[1]],
  };
}

/** Convert one draft obstacle state back into the scenario-side SPEC shape the
 * PUT /scene endpoint expects. Polyline motion points are ANCHOR-RELATIVE in
 * specs but ABSOLUTE in snapshots, so they are shifted back by the anchor. */
function specFromDraft(obstacle: ObstacleState): ObstacleSpec | null {
  const motion = obstacle.motion;
  if (obstacle.radius !== null && obstacle.cx !== null && obstacle.cy !== null) {
    if (obstacle.kind === "dynamic-circle" && motion) {
      return {
        kind: "dynamic-circle",
        cx: obstacle.cx,
        cy: obstacle.cy,
        radius: obstacle.radius,
        motion: motionSpecFor(motion, obstacle.cx, obstacle.cy),
      };
    }
    return { kind: "circle", cx: obstacle.cx, cy: obstacle.cy, radius: obstacle.radius };
  }
  if (
    obstacle.x !== null &&
    obstacle.y !== null &&
    obstacle.width !== null &&
    obstacle.height !== null
  ) {
    if (obstacle.kind === "dynamic-rect" && motion) {
      return {
        kind: "dynamic-rect",
        x: obstacle.x,
        y: obstacle.y,
        width: obstacle.width,
        height: obstacle.height,
        motion: motionSpecFor(motion, obstacle.x, obstacle.y),
      };
    }
    return { kind: "rect", x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height };
  }
  return null;
}

function motionSpecFor(
  motion: MotionState,
  anchorX: number,
  anchorY: number,
): MotionState {
  if (motion.type === "pingpong") {
    // Ping-pong sweeps are defined by axis/amplitude/timing relative to the
    // anchor — dragging the obstacle just moves the anchor (offsets the path).
    return { ...motion };
  }
  return {
    ...motion,
    points: motion.points.map(([px, py]) => [
      Number((px - anchorX).toFixed(4)),
      Number((py - anchorY).toFixed(4)),
    ]),
  };
}

export function useSceneEditor(snapshot: Snapshot | null, syncTick: number) {
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addConfig, setAddConfig] = useState<AddObstacleConfig>({
    shape: "circle",
    radius: 0.5,
    width: 1.2,
    height: 0.8,
  });
  // Serialized last-synced draft; `dirty` = current draft differs from it.
  const savedRef = useRef<string>("");

  // Re-sync the draft whenever the session is created/reset or a scene update
  // round-tripped (both bump `syncTick`).
  useEffect(() => {
    if (!snapshot) {
      setDraft(null);
      savedRef.current = "";
      setSelected(null);
      setAddMode(false);
      return;
    }
    const fresh = draftFromSnapshot(snapshot);
    setDraft(fresh);
    savedRef.current = JSON.stringify(fresh);
    setSelected(null);
    setAddMode(false);
  }, [snapshot?.session_id, syncTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    draft !== null && JSON.stringify(draft) !== savedRef.current;

  const canEdit =
    snapshot !== null &&
    (snapshot.status === "idle" || snapshot.status === "paused");

  const moveObstacle = useCallback(
    (index: number, newAnchor: [number, number]) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const obstacle = prev.obstacles[index];
        if (!obstacle) return prev;
        const W = snapshot?.width ?? 50;
        const H = snapshot?.height ?? 50;
        const obstacles = prev.obstacles.slice();
        const moved = { ...obstacle } as ObstacleState;
        let dx = 0;
        let dy = 0;
        if (moved.radius !== null && moved.cx !== null && moved.cy !== null) {
          const cx = clamp(newAnchor[0], moved.radius, W - moved.radius);
          const cy = clamp(newAnchor[1], moved.radius, H - moved.radius);
          dx = cx - moved.cx;
          dy = cy - moved.cy;
          moved.cx = cx;
          moved.cy = cy;
        } else if (
          moved.x !== null &&
          moved.y !== null &&
          moved.width !== null &&
          moved.height !== null
        ) {
          const x = clamp(newAnchor[0], 0, W - moved.width);
          const y = clamp(newAnchor[1], 0, H - moved.height);
          dx = x - moved.x;
          dy = y - moved.y;
          moved.x = x;
          moved.y = y;
        }
        if (dx === 0 && dy === 0) return prev;
        // Dragging a dynamic obstacle offsets its whole path: shift the home
        // anchor and (for polyline loops) every absolute waypoint.
        if (moved.base) moved.base = [moved.base[0] + dx, moved.base[1] + dy];
        if (moved.motion && moved.motion.type === "polyline") {
          moved.motion = {
            ...moved.motion,
            points: moved.motion.points.map(([px, py]) => [px + dx, py + dy]),
          };
        }
        obstacles[index] = moved;
        return { ...prev, obstacles };
      });
    },
    [snapshot?.width, snapshot?.height],
  );

  const moveStart = useCallback(
    (pos: [number, number]) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const W = snapshot?.width ?? 50;
        const H = snapshot?.height ?? 50;
        return {
          ...prev,
          start: [clamp(pos[0], 0.2, W - 0.2), clamp(pos[1], 0.2, H - 0.2)],
        };
      });
    },
    [snapshot?.width, snapshot?.height],
  );

  const moveGoal = useCallback(
    (pos: [number, number]) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const W = snapshot?.width ?? 50;
        const H = snapshot?.height ?? 50;
        return {
          ...prev,
          goal: [clamp(pos[0], 0.2, W - 0.2), clamp(pos[1], 0.2, H - 0.2)],
        };
      });
    },
    [snapshot?.width, snapshot?.height],
  );

  /** Place the configured add-obstacle at the clicked arena position (center
   * for circles, centered min-corner for rects); leaves add mode. */
  const addObstacle = useCallback(
    (pos: [number, number]) => {
      if (!draft) return;
      const W = snapshot?.width ?? 50;
      const H = snapshot?.height ?? 50;
      let obstacle: ObstacleState;
      if (addConfig.shape === "circle") {
        const r = addConfig.radius;
        obstacle = {
          kind: "circle",
          cx: clamp(pos[0], r, W - r),
          cy: clamp(pos[1], r, H - r),
          radius: r,
          x: null,
          y: null,
          width: null,
          height: null,
          vx: null,
          vy: null,
          base: null,
          motion: null,
        };
      } else {
        const w = addConfig.width;
        const h = addConfig.height;
        obstacle = {
          kind: "rect",
          cx: null,
          cy: null,
          radius: null,
          x: clamp(pos[0] - w / 2, 0, W - w),
          y: clamp(pos[1] - h / 2, 0, H - h),
          width: w,
          height: h,
          vx: null,
          vy: null,
          base: null,
          motion: null,
        };
      }
      const obstacles = [...draft.obstacles, obstacle];
      setDraft({ ...draft, obstacles });
      setSelected(obstacles.length - 1);
      setAddMode(false);
    },
    [draft, addConfig, snapshot?.width, snapshot?.height],
  );

  const deleteSelected = useCallback(() => {
    setDraft((prev) => {
      if (!prev || selected === null) return prev;
      const obstacles = prev.obstacles.filter((_, i) => i !== selected);
      return { ...prev, obstacles };
    });
    setSelected(null);
  }, [selected]);

  /** Build the PUT /scene body, or null when there is nothing to send. */
  const buildSceneUpdate = useCallback((): SceneUpdate | null => {
    if (!draft) return null;
    const obstacles: ObstacleSpec[] = [];
    for (const o of draft.obstacles) {
      const spec = specFromDraft(o);
      if (spec) obstacles.push(spec);
    }
    return { obstacles, start: draft.start, goal: draft.goal };
  }, [draft]);

  /** Arena click: place an obstacle in add mode, otherwise deselect. */
  const onArenaClick = useCallback(
    (pos: [number, number]) => {
      if (addMode) {
        addObstacle(pos);
      } else {
        setSelected(null);
      }
    },
    [addMode, addObstacle],
  );

  return {
    draft,
    dirty,
    canEdit,
    selected,
    setSelected,
    addMode,
    setAddMode,
    addConfig,
    setAddConfig,
    moveObstacle,
    moveStart,
    moveGoal,
    deleteSelected,
    buildSceneUpdate,
    onArenaClick,
  };
}
