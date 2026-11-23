import type { KonvaEventObject } from "konva/lib/Node";
import { Arrow, Circle, Group, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import type { GridInfo, ObstacleState, PlanInfoOut, Snapshot } from "../types";
import type { LayerToggles } from "../hooks/useLayerToggles";
import { LAYER_STYLE, PX_PER_M } from "./layerStyles";

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
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        创建会话后开始仿真
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
      {/* arena; clickable when editing (add obstacle / deselect) */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#101826"
        stroke="#2b3a52"
        strokeWidth={2}
        onClick={editable ? handleArenaClick : undefined}
      />
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
        />
      )}
      {/* executed trajectory */}
      {layers.trajectory && snapshot.trajectory.length > 1 && (
        <Line
          points={snapshot.trajectory.flatMap(([x, y]) => toPx(x, y))}
          stroke={LAYER_STYLE.trajectory.color}
          strokeWidth={2.5}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}
      {/* start & goal (draggable while editing) */}
      <Circle
        x={startPos[0]}
        y={startPos[1]}
        radius={6}
        stroke="#8fa3bf"
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
      <Circle
        x={goalPos[0]}
        y={goalPos[1]}
        radius={snapshot.robot_radius * S}
        stroke="#4ade80"
        strokeWidth={2}
        dash={[4, 4]}
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
      {/* robot body */}
      <Circle
        x={robotPos[0]}
        y={robotPos[1]}
        radius={snapshot.robot_radius * S}
        fill="#e2e8f0"
        stroke="#f8fafc"
        strokeWidth={1.5}
        listening={false}
      />
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
      ? "#8fa3bf"
      : "#5a6b88";
  const common = {
    fill: "#3d4a61",
    stroke,
    strokeWidth: selected ? 2.5 : 1,
    dash: geom.dynamic ? [4, 3] : undefined,
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
  const fill = "rgba(148, 163, 184, 0.14)";
  const stroke = "rgba(148, 163, 184, 0.45)";
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
      fill="rgba(148, 163, 184, 0.16)"
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
