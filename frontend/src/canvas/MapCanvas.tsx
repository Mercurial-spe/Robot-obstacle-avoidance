import type { KonvaEventObject } from "konva/lib/Node";
import { Map as MapIcon } from "lucide-react";
import {
  Arrow,
  Circle,
  Group,
  Layer,
  Line,
  Rect,
  RegularPolygon,
  Shape,
  Stage,
  Text,
} from "react-konva";
import type { GridInfo, ObstacleState, PlanInfoOut, Snapshot } from "../types";
import type { LayerToggles } from "../hooks/useLayerToggles";
import {
  INFLATION_FILL,
  LAYER_STYLE,
  PX_PER_M,
  TRAJECTORY_GRADIENT,
} from "./layerStyles";

/** Geometry of one obstacle body in world meters, from a snapshot state. */
type ObstacleGeom =
  | { shape: "circle"; cx: number; cy: number; radius: number; dynamic: boolean }
  | {
      shape: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      dynamic: boolean;
    };

function obstacleGeom(obstacle: ObstacleState): ObstacleGeom | null {
  const dynamic = obstacle.kind.startsWith("dynamic-");
  if (obstacle.radius !== null && obstacle.cx !== null && obstacle.cy !== null) {
    return {
      shape: "circle",
      cx: obstacle.cx,
      cy: obstacle.cy,
      radius: obstacle.radius,
      dynamic,
    };
  }
  if (
    obstacle.x !== null &&
    obstacle.y !== null &&
    obstacle.width !== null &&
    obstacle.height !== null
  ) {
    return {
      shape: "rect",
      x: obstacle.x,
      y: obstacle.y,
      width: obstacle.width,
      height: obstacle.height,
      dynamic,
    };
  }
  return null;
}

/** World-space anchor of a dragged obstacle node (circle center / rect min
 * corner), converted back from canvas px. Y-up flip applied. */
function nodeToWorldAnchor(
  geom: ObstacleGeom,
  node: { x(): number; y(): number },
  S: number,
  height: number,
): [number, number] {
  if (geom.shape === "circle") {
    return [node.x() / S, (height - node.y()) / S];
  }
  return [node.x() / S, (height - node.y()) / S - geom.height];
}

export interface MapCanvasInteraction {
  /** Render these obstacle states instead of `snapshot.obstacles` (scene-edit
   * draft). Draft obstacles keep the ObstacleState shape. */
  obstacles?: ObstacleState[];
  /** Enable dragging obstacles/start/goal and arena clicks (idle/paused only). */
  editable?: boolean;
  /** Index of the selected obstacle in the rendered list; highlighted. */
  selectedObstacle?: number | null;
  onSelectObstacle?: (index: number) => void;
  /** Dragged obstacle reports its NEW world anchor (circle center / rect corner). */
  onObstacleDragEnd?: (index: number, newAnchor: [number, number]) => void;
  onStartDragEnd?: (pos: [number, number]) => void;
  onGoalDragEnd?: (pos: [number, number]) => void;
  /** Click on empty arena (world meters, y-up) — used for add-mode placement
   * and click-empty-to-deselect. */
  onArenaClick?: (pos: [number, number]) => void;
}

/** Renders a backend snapshot (plus one-shot plan metadata). All geometry
 * arrives in meters (y-up); we flip y for the canvas and never mutate the
 * state we draw. Toggleable layers are keyed by `LayerToggles`. When an
 * interaction object is passed, obstacles/start/goal become draggable and the
 * arena reports clicks — used by the scene editor in the single-session view. */
export function MapCanvas({
  snapshot,
  planInfo,
  layers,
  interaction,
}: {
  snapshot: Snapshot | null;
  planInfo: PlanInfoOut | null;
  layers: LayerToggles;
  interaction?: MapCanvasInteraction;
}) {
  if (!snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
        <MapIcon size={28} strokeWidth={1.5} aria-hidden />
        <p className="text-sm font-medium text-zinc-400">尚未创建会话</p>
        <p className="max-w-56 text-center text-xs leading-relaxed">
          在顶部选择场景与算法后点击「新建会话」开始仿真
        </p>
      </div>
    );
  }
  const editable = interaction?.editable ?? false;
  const obstacles = interaction?.obstacles ?? snapshot.obstacles;
  const selected = interaction?.selectedObstacle ?? null;

  const S = PX_PER_M;
  const width = snapshot.width * S;
  const height = snapshot.height * S;
  const toPx = (x: number, y: number): [number, number] => [
    x * S,
    height - y * S,
  ];

  const robotPos = toPx(snapshot.robot.x, snapshot.robot.y);
  const goalPos = toPx(snapshot.goal[0], snapshot.goal[1]);
  const startPos = toPx(snapshot.start[0], snapshot.start[1]);
  const headingLen = snapshot.robot_radius * S * 1.6;

  const geoms = obstacles
    .map(obstacleGeom)
    .filter((g): g is ObstacleGeom => g !== null);
  // NOTE: obstacleGeom can drop malformed entries; interaction indices must
  // match the RAW list, so editors rely on obstacles being well-formed.
  const inflationM = Math.max(0, planInfo?.inflation_m ?? 0);

  const handleArenaClick = (event: KonvaEventObject<MouseEvent>) => {
    if (!interaction?.onArenaClick) return;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    interaction.onArenaClick([pointer.x / S, (height - pointer.y) / S]);
  };

  return (
    <Stage width={width} height={height}>
      {/* Konva requires Layer as the direct child of a Stage */}
      <Layer>
      {/* arena: PathPlanner-style mid-gray field with a crisp white border,
          clickable when editing (add obstacle / deselect) */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#32353c"
        stroke="#e4e4e7"
        strokeWidth={2}
        onClick={editable ? handleArenaClick : undefined}
      />
      {/* blueprint grid: 1 m minor / 5 m major lines — scale perception with
          zero motion; two Shapes so major lines read darker */}
      <GridLayerBackdrop width={width} height={height} S={S} />
      {/* engineering-drawing annotations: 2 m coordinate ticks on all four
          edges (INSIDE the border) + L-shaped drafting corner marks */}
      <FieldAnnotations width={width} height={height} S={S} />
      {/* A* occupancy grid + expanded search cells (single Shape each) */}
      {layers.astarGrid && planInfo?.grid && (
        <GridLayer grid={planInfo.grid} height={height} />
      )}
      {layers.astarGrid && planInfo?.grid && planInfo.expanded_nodes.length > 0 && (
        <ExpandedNodesLayer
          grid={planInfo.grid}
          nodes={planInfo.expanded_nodes}
          height={height}
        />
      )}
      {/* inflation zone: obstacle silhouettes grown by the planner's inflation */}
      {layers.inflation && inflationM > 0 && (
        <Group listening={false}>
          {geoms.map((geom, i) => (
            <InflatedShape key={i} geom={geom} inflationM={inflationM} S={S} height={height} />
          ))}
        </Group>
      )}
      {/* dynamic-obstacle "energy" rings: two static concentric dashed rings
          with rising radius / falling opacity — multi-layer styling suggests
          motion without any animation (spec forbids faked movement) */}
      {layers.obstacleVelocity && geoms.some((geom) => geom.dynamic) && (
        <DynamicEnergyRings geoms={geoms} S={S} height={height} />
      )}
      {/* obstacle bodies at their CURRENT snapshot positions (draggable while
          editing); listening is only enabled when editable so the idle maps
          never swallow clicks */}
      <Group listening={editable}>
        {geoms.map((geom, i) => (
          <ObstacleBody
            key={i}
            geom={geom}
            S={S}
            height={height}
            editable={editable}
            selected={selected === i}
            onSelect={
              interaction?.onSelectObstacle
                ? () => interaction.onSelectObstacle?.(i)
                : undefined
            }
            onDragEnd={
              interaction?.onObstacleDragEnd
                ? (event) => {
                    const anchor = nodeToWorldAnchor(geom, event.target, S, height);
                    // Snap the node back to its rendered position; the draft
                    // state (if the edit is accepted) moves it via props.
                    const rendered =
                      geom.shape === "circle"
                        ? { x: geom.cx * S, y: height - geom.cy * S }
                        : {
                            x: geom.x * S,
                            y: height - (geom.y + geom.height) * S,
                          };
                    event.target.position(rendered);
                    interaction.onObstacleDragEnd?.(i, anchor);
                  }
                : undefined
            }
          />
        ))}
      </Group>
      {/* planned path */}
      {layers.plannedPath && snapshot.path.length > 1 && (
        <Line
          points={snapshot.path.flatMap(([x, y]) => toPx(x, y))}
          stroke={LAYER_STYLE.plannedPath.color}
          strokeWidth={2}
          dash={[8, 6]}
          opacity={0.9}
          listening={false}
          shadowColor={LAYER_STYLE.plannedPath.color}
          shadowBlur={4}
          shadowOpacity={0.35}
        />
      )}
      {/* planned-path waypoint dots (PathPlanner-style vertex markers) */}
      {layers.plannedPath && snapshot.path.length > 2 && (
        <WaypointDots path={snapshot.path} toPx={toPx} />
      )}
      {/* executed trajectory: one short Line per ~equal-length slice, stroke
          color lerped teal → sky blue by travel progress (Konva cannot stroke
          a gradient, so progress is drawn as per-segment solid colors) */}
      {layers.trajectory && snapshot.trajectory.length > 1 && (
        <TrajectoryGradient trajectory={snapshot.trajectory} toPx={toPx} />
      )}
      {/* start & goal (draggable while editing) */}
      {/* start = crosshair reticle: two short lines + hollow circle */}
      <Group listening={false}>
        <Line
          points={[
            startPos[0] - 12,
            startPos[1],
            startPos[0] + 12,
            startPos[1],
          ]}
          stroke="#8fa3bf"
          strokeWidth={1.5}
          lineCap="round"
        />
        <Line
          points={[
            startPos[0],
            startPos[1] - 12,
            startPos[0],
            startPos[1] + 12,
          ]}
          stroke="#8fa3bf"
          strokeWidth={1.5}
          lineCap="round"
        />
      </Group>
      <Circle
        x={startPos[0]}
        y={startPos[1]}
        radius={6}
        stroke="#a5c0e0"
        strokeWidth={2}
        listening={editable}
        draggable={editable}
        onDragEnd={(event) => {
          const pos: [number, number] = [
            event.target.x() / S,
            (height - event.target.y()) / S,
          ];
          event.target.position({ x: startPos[0], y: startPos[1] });
          interaction?.onStartDragEnd?.(pos);
        }}
      />
      <Text
        x={startPos[0] - 16}
        y={startPos[1] + 14}
        text="START"
        fill="#d4d4d8"
        fontSize={10}
        listening={false}
      />
      {/* goal = flagpole + double ring (inner solid, outer dashed) */}
      <Group listening={false}>
        <Line
          points={[goalPos[0], goalPos[1], goalPos[0], goalPos[1] - 28]}
          stroke="#4ade80"
          strokeWidth={1.5}
          lineCap="round"
        />
        <Line
          points={[
            goalPos[0],
            goalPos[1] - 28,
            goalPos[0] + 12,
            goalPos[1] - 23,
            goalPos[0],
            goalPos[1] - 18,
          ]}
          closed
          fill="#4ade80"
          opacity={0.9}
        />
      </Group>
      {/* outer dashed ring (decorative) */}
      <Circle
        x={goalPos[0]}
        y={goalPos[1]}
        radius={snapshot.robot_radius * S + 5}
        stroke="rgba(74, 222, 128, 0.55)"
        strokeWidth={1.5}
        dash={[5, 5]}
        listening={false}
      />
      {/* inner ring — the drag anchor keeps the original handlers */}
      <Circle
        x={goalPos[0]}
        y={goalPos[1]}
        radius={snapshot.robot_radius * S}
        fill="rgba(74, 222, 128, 0.14)"
        stroke="#4ade80"
        strokeWidth={2}
        listening={editable}
        draggable={editable}
        onDragEnd={(event) => {
          const pos: [number, number] = [
            event.target.x() / S,
            (height - event.target.y()) / S,
          ];
          event.target.position({ x: goalPos[0], y: goalPos[1] });
          interaction?.onGoalDragEnd?.(pos);
        }}
      />
      {/* static halo when the run actually ended at the goal — state, not
          decoration; no animation faking robot motion (spec forbids) */}
      {snapshot.run_status === "reached_goal" && (
        <Circle
          x={goalPos[0]}
          y={goalPos[1]}
          radius={snapshot.robot_radius * S + 11}
          stroke="rgba(74, 222, 128, 0.55)"
          strokeWidth={2.5}
          listening={false}
        />
      )}
      <Text
        x={goalPos[0] - 12}
        y={goalPos[1] + snapshot.robot_radius * S + 6}
        text="GOAL"
        fill="#4ade80"
        fontSize={11}
        listening={false}
      />
      {/* dynamic obstacle velocity arrows (from snapshot velocities) */}
      {layers.obstacleVelocity && (
        <Group listening={false}>
          {obstacles.map((obstacle, i) => {
            if (obstacle.vx === null || obstacle.vy === null) return null;
            if (Math.hypot(obstacle.vx, obstacle.vy) < 0.05) return null;
            const geom = obstacleGeom(obstacle);
            if (!geom) return null;
            return (
              <VectorArrow
                key={i}
                origin={geom}
                vx={obstacle.vx}
                vy={obstacle.vy}
                S={S}
                height={height}
                color={LAYER_STYLE.obstacleVelocity.color}
                horizonS={0.8}
              />
            );
          })}
        </Group>
      )}
      {/* robot body: white disc + hexagonal chassis ring rotated by the REAL
          heading (theta from the snapshot — real state, not decoration) */}
      <Group listening={false}>
        <Circle
          x={robotPos[0]}
          y={robotPos[1]}
          radius={snapshot.robot_radius * S}
          fill="#fafafa"
          stroke="#18181b"
          strokeWidth={1.5}
          shadowColor="#000000"
          shadowBlur={8}
          shadowOpacity={0.45}
          shadowOffsetY={2}
        />
        <RegularPolygon
          x={robotPos[0]}
          y={robotPos[1]}
          sides={6}
          radius={snapshot.robot_radius * S * 1.5}
          rotation={(-snapshot.robot.theta * 180) / Math.PI}
          stroke="#38bdf8"
          strokeWidth={1.5}
          cornerRadius={2}
        />
        {/* 6 vertex studs on the hexagon — PathPlanner-style modular chassis;
            they rotate with the same real theta as the ring */}
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const vertexAngle =
            ((k * 60 - 90 + (-snapshot.robot.theta * 180) / Math.PI) *
              Math.PI) /
            180;
          const ringR = snapshot.robot_radius * S * 1.5;
          return (
            <Circle
              key={k}
              x={robotPos[0] + Math.cos(vertexAngle) * ringR}
              y={robotPos[1] + Math.sin(vertexAngle) * ringR}
              radius={2.2}
              fill="#38bdf8"
              listening={false}
            />
          );
        })}
        {/* heading tick on the hexagon so rotation is readable at a glance */}
        <Line
          points={[
            robotPos[0],
            robotPos[1],
            robotPos[0] + Math.cos(snapshot.robot.theta) * snapshot.robot_radius * S * 1.5,
            robotPos[1] - Math.sin(snapshot.robot.theta) * snapshot.robot_radius * S * 1.5,
          ]}
          stroke="#38bdf8"
          strokeWidth={2}
          lineCap="round"
        />
      </Group>
      {/* robot heading */}
      {layers.robotHeading && (
        <Line
          points={[
            robotPos[0],
            robotPos[1],
            robotPos[0] + Math.cos(snapshot.robot.theta) * headingLen,
            robotPos[1] - Math.sin(snapshot.robot.theta) * headingLen,
          ]}
          stroke={LAYER_STYLE.robotHeading.color}
          strokeWidth={2.5}
          lineCap="round"
          listening={false}
        />
      )}
      {/* APF force arrow at the robot position */}
      {layers.apfForce && snapshot.apf_force && (
        <ApfArrow
          force={snapshot.apf_force}
          robotPos={robotPos}
          S={S}
          color={LAYER_STYLE.apfForce.color}
        />
      )}
      </Layer>
    </Stage>
  );
}

// ---------------------------------------------------------------------------
// Layer pieces
// ---------------------------------------------------------------------------

/** Static blueprint grid under everything: 1 m lines, every 5th one darker.
 * Pure presentation from snapshot dimensions — no state, no animation. */
function GridLayerBackdrop({
  width,
  height,
  S,
}: {
  width: number;
  height: number;
  S: number;
}) {
  return (
    <Group listening={false}>
      {[0.08, 0.16].map((alpha, pass) => (
        <Shape
          key={pass}
          listening={false}
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            const step = pass === 0 ? 1 : 5;
            for (let m = step; m * S < width; m += step) {
              ctx.moveTo(m * S, 0);
              ctx.lineTo(m * S, height);
            }
            for (let m = step; m * S < height; m += step) {
              ctx.moveTo(0, height - m * S);
              ctx.lineTo(width, height - m * S);
            }
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
          stroke={`rgba(0, 0, 0, ${alpha})`}
          strokeWidth={1}
        />
      ))}
    </Group>
  );
}

/** Engineering-drawing field annotations: a coordinate tick label every 2 m on
 * all four edges (placed just INSIDE the border — outside would overflow the
 * Stage) plus L-shaped drafting corner marks. Pure presentation from the
 * snapshot dimensions. */
function FieldAnnotations({
  width,
  height,
  S,
}: {
  width: number;
  height: number;
  S: number;
}) {
  const metersW = width / S;
  const metersH = height / S;
  const ticks: React.ReactNode[] = [];
  for (let m = 2; m < metersW - 0.25; m += 2) {
    ticks.push(
      <Text
        key={`b${m}`}
        x={m * S - 10}
        y={height - 12}
        width={20}
        align="center"
        text={String(m)}
        fill="#71717a"
        fontSize={8}
        listening={false}
      />,
      <Text
        key={`t${m}`}
        x={m * S - 10}
        y={2}
        width={20}
        align="center"
        text={String(m)}
        fill="#71717a"
        fontSize={8}
        listening={false}
      />,
    );
  }
  for (let m = 2; m < metersH - 0.25; m += 2) {
    ticks.push(
      <Text
        key={`l${m}`}
        x={3}
        y={height - m * S - 4}
        text={String(m)}
        fill="#71717a"
        fontSize={8}
        listening={false}
      />,
      <Text
        key={`r${m}`}
        x={width - 15}
        y={height - m * S - 4}
        width={12}
        align="right"
        text={String(m)}
        fill="#71717a"
        fontSize={8}
        listening={false}
      />,
    );
  }
  return (
    <Group listening={false}>
      {ticks}
      {/* four L corner marks in one Shape path */}
      <Shape
        listening={false}
        sceneFunc={(ctx, shape) => {
          const a = 4;
          const arm = 14;
          ctx.beginPath();
          ctx.moveTo(a, a + arm);
          ctx.lineTo(a, a);
          ctx.lineTo(a + arm, a);
          ctx.moveTo(width - a - arm, a);
          ctx.lineTo(width - a, a);
          ctx.lineTo(width - a, a + arm);
          ctx.moveTo(width - a, height - a - arm);
          ctx.lineTo(width - a, height - a);
          ctx.lineTo(width - a - arm, height - a);
          ctx.moveTo(a + arm, height - a);
          ctx.lineTo(a, height - a);
          ctx.lineTo(a, height - a - arm);
          // no closePath: each corner subpath must stay an open L, closing
          // would draw a diagonal across the corner
          ctx.fillStrokeShape(shape);
        }}
        stroke="#e4e4e7"
        strokeWidth={2}
        lineJoin="miter"
      />
    </Group>
  );
}

/** Hex → 0-255 triplet for the trajectory gradient lerp. */
function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Linear interpolation between two #rrggbb colors, returned as rgb(). */
function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Segment budget for the trajectory gradient — a hard cap keeps the node
 * count (and redraw cost) bounded no matter how long the run gets. */
const TRAJECTORY_MAX_SEGMENTS = 40;

/** Executed trajectory as ≤40 equal-arc-length Line slices, each stroked with
 * a solid color lerped from the departure teal to the arrival sky blue.
 * Konva cannot stroke a gradient along a path, so progress is expressed by
 * per-segment solid colors; slices share endpoints so the line reads as one. */
function TrajectoryGradient({
  trajectory,
  toPx,
}: {
  trajectory: [number, number][];
  toPx: (x: number, y: number) => [number, number];
}) {
  const pts = trajectory.map(([x, y]) => toPx(x, y));
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const total = cum[pts.length - 1];
  if (total <= 0) return null;
  const segments = Math.max(
    2,
    Math.min(TRAJECTORY_MAX_SEGMENTS, Math.ceil(total / 10)),
  );
  let span = 0; // polyline span holding the current sample length
  const pointAt = (len: number): [number, number] => {
    while (span < pts.length - 2 && cum[span + 1] < len) span += 1;
    const segLen = cum[span + 1] - cum[span] || 1;
    const t = (len - cum[span]) / segLen;
    return [
      pts[span][0] + (pts[span + 1][0] - pts[span][0]) * t,
      pts[span][1] + (pts[span + 1][1] - pts[span][1]) * t,
    ];
  };
  const slices: React.ReactNode[] = [];
  for (let j = 0; j < segments; j += 1) {
    const l0 = (total * j) / segments;
    const l1 = (total * (j + 1)) / segments;
    const head = pointAt(l0);
    const points: number[] = [head[0], head[1]];
    // keep the real waypoints that fall inside this slice so corners stay sharp
    for (let i = span + 1; i < pts.length && cum[i] < l1; i += 1) {
      points.push(pts[i][0], pts[i][1]);
    }
    const tail = pointAt(l1);
    points.push(tail[0], tail[1]);
    const color = lerpColor(
      TRAJECTORY_GRADIENT.start,
      TRAJECTORY_GRADIENT.end,
      segments === 1 ? 0 : j / (segments - 1),
    );
    slices.push(
      <Line
        key={j}
        points={points}
        stroke={color}
        strokeWidth={2.5}
        lineCap="round"
        lineJoin="round"
        listening={false}
        shadowColor={color}
        shadowBlur={6}
        shadowOpacity={0.45}
      />,
    );
  }
  return <Group listening={false}>{slices}</Group>;
}

/** Two concentric dashed rings around each DYNAMIC obstacle: radius grows and
 * opacity falls outward, a static multi-layer styling that reads as "this body
 * is energized / moving" without any animation (spec forbids faked motion). */
function DynamicEnergyRings({
  geoms,
  S,
  height,
}: {
  geoms: ObstacleGeom[];
  S: number;
  height: number;
}) {
  const rings: React.ReactNode[] = [];
  geoms.forEach((geom, i) => {
    if (!geom.dynamic) return;
    const center = geomCenterPx(geom, S, height);
    if (!center) return;
    const base =
      geom.shape === "circle"
        ? geom.radius * S
        : (Math.hypot(geom.width, geom.height) / 2) * S;
    const offsets: [number, number][] = [
      [8, 0.4],
      [16, 0.18],
    ];
    for (const [offset, opacity] of offsets) {
      rings.push(
        <Circle
          key={`${i}-${offset}`}
          x={center[0]}
          y={center[1]}
          radius={base + offset}
          stroke="#f472b6"
          strokeWidth={1}
          dash={[3, 6]}
          opacity={opacity}
          listening={false}
        />,
      );
    }
  });
  if (rings.length === 0) return null;
  return <Group listening={false}>{rings}</Group>;
}

/** PathPlanner-style vertex markers on the planned path, thinned to ≤40 dots. */
function WaypointDots({
  path,
  toPx,
}: {
  path: [number, number][];
  toPx: (x: number, y: number) => [number, number];
}) {
  const k = Math.max(1, Math.ceil(path.length / 40));
  const dots: React.ReactNode[] = [];
  for (let i = 1; i < path.length - 1; i += k) {
    const [px, py] = toPx(path[i][0], path[i][1]);
    dots.push(
      <Circle
        key={i}
        x={px}
        y={py}
        radius={2.5}
        stroke={LAYER_STYLE.plannedPath.color}
        strokeWidth={1}
        opacity={0.7}
      />,
    );
  }
  return <Group listening={false}>{dots}</Group>;
}

function ObstacleBody({
  geom,
  S,
  height,
  editable,
  selected,
  onSelect,
  onDragEnd,
}: {
  geom: ObstacleGeom;
  S: number;
  height: number;
  editable: boolean;
  selected: boolean;
  onSelect?: () => void;
  onDragEnd?: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const stroke = selected
    ? "#38bdf8"
    : geom.dynamic
      ? "#f472b6" // dynamic family — matches the velocity-arrow accent
      : "#a1a1aa";
  const common = {
    fill: "#15161a",
    stroke,
    strokeWidth: selected ? 2.5 : 1.5,
    dash: geom.dynamic ? [4, 3] : undefined,
    shadowColor: "#000000",
    shadowBlur: 6,
    shadowOpacity: 0.4,
    shadowOffsetY: 2,
    draggable: editable,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd,
  };
  if (geom.shape === "circle") {
    return (
      <Circle
        x={geom.cx * S}
        y={height - geom.cy * S}
        radius={geom.radius * S}
        {...common}
      />
    );
  }
  return (
    <Rect
      x={geom.x * S}
      y={height - (geom.y + geom.height) * S}
      width={geom.width * S}
      height={geom.height * S}
      {...common}
    />
  );
}

function InflatedShape({
  geom,
  inflationM,
  S,
  height,
}: {
  geom: ObstacleGeom;
  inflationM: number;
  S: number;
  height: number;
}) {
  const fill = INFLATION_FILL;
  const stroke = LAYER_STYLE.inflation.color;
  if (geom.shape === "circle") {
    return (
      <Circle
        x={geom.cx * S}
        y={height - geom.cy * S}
        radius={(geom.radius + inflationM) * S}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        dash={[3, 4]}
      />
    );
  }
  return (
    <Rect
      x={(geom.x - inflationM) * S}
      y={height - (geom.y + geom.height + inflationM) * S}
      width={(geom.width + 2 * inflationM) * S}
      height={(geom.height + 2 * inflationM) * S}
      fill={fill}
      stroke={stroke}
      strokeWidth={1}
      dash={[3, 4]}
    />
  );
}

/** All blocked cells in ONE Konva Shape: a single sceneFunc rect path. */
function GridLayer({ grid, height }: { grid: GridInfo; height: number }) {
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        const cellW = grid.resolution * PX_PER_M;
        for (let row = 0; row < grid.rows; row += 1) {
          const rowBase = row * grid.cols;
          for (let col = 0; col < grid.cols; col += 1) {
            if (!grid.blocked[rowBase + col]) continue;
            const x = (grid.origin_x + col * grid.resolution) * PX_PER_M;
            const yTop =
              height - (grid.origin_y + (row + 1) * grid.resolution) * PX_PER_M;
            ctx.rect(x, yTop, cellW, cellW);
          }
        }
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
      fill="rgba(0, 0, 0, 0.28)"
    />
  );
}

/** All expanded search nodes in ONE Konva Shape: a single arc path. */
function ExpandedNodesLayer({
  grid,
  nodes,
  height,
}: {
  grid: GridInfo;
  nodes: [number, number][];
  height: number;
}) {
  const r = Math.max(1.5, grid.resolution * PX_PER_M * 0.18);
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        for (const [col, row] of nodes) {
          const cx = (grid.origin_x + (col + 0.5) * grid.resolution) * PX_PER_M;
          const cy =
            height - (grid.origin_y + (row + 0.5) * grid.resolution) * PX_PER_M;
          ctx.moveTo(cx + r, cy);
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }
        ctx.fillStrokeShape(shape);
      }}
      fill={LAYER_STYLE.astarGrid.color}
      opacity={0.7}
    />
  );
}

/** Velocity arrow for one dynamic obstacle: tip = current pos + v * horizonS. */
function VectorArrow({
  origin,
  vx,
  vy,
  S,
  height,
  color,
  horizonS,
}: {
  origin: ObstacleGeom;
  vx: number;
  vy: number;
  S: number;
  height: number;
  color: string;
  horizonS: number;
}) {
  const center = geomCenterPx(origin, S, height);
  if (!center) return null;
  const speed = Math.hypot(vx, vy);
  const lenM = Math.min(1.5, Math.max(0.35, speed * horizonS));
  const dx = (vx / speed) * lenM * S;
  const dy = (-vy / speed) * lenM * S;
  return (
    <Arrow
      x={center[0]}
      y={center[1]}
      points={[0, 0, dx, dy]}
      pointerLength={7}
      pointerWidth={6}
      fill={color}
      stroke={color}
      strokeWidth={2}
    />
  );
}

/** APF force arrow at the robot position; length encodes magnitude (clamped). */
function ApfArrow({
  force,
  robotPos,
  S,
  color,
}: {
  force: [number, number];
  robotPos: [number, number];
  S: number;
  color: string;
}) {
  const magnitude = Math.hypot(force[0], force[1]);
  if (magnitude < 1e-3) return null;
  const lenM = Math.min(1.6, Math.max(0.4, 0.25 + 0.25 * magnitude));
  const dx = (force[0] / magnitude) * lenM * S;
  const dy = (-force[1] / magnitude) * lenM * S;
  return (
    <Arrow
      x={robotPos[0]}
      y={robotPos[1]}
      points={[0, 0, dx, dy]}
      pointerLength={9}
      pointerWidth={8}
      fill={color}
      stroke={color}
      strokeWidth={2.5}
    />
  );
}

function geomCenterPx(
  geom: ObstacleGeom,
  S: number,
  height: number,
): [number, number] | null {
  if (geom.shape === "circle") {
    return [geom.cx * S, height - geom.cy * S];
  }
  return [
    (geom.x + geom.width / 2) * S,
    height - (geom.y + geom.height / 2) * S,
  ];
}
