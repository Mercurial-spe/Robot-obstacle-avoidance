import { Group, Circle, Line, Rect, Stage, Text } from "react-konva";
import type { Snapshot } from "../types";

const PX_PER_M = 48;

/** Renders a backend snapshot. All geometry arrives in meters (y-up); we flip
 * y for the canvas and never mutate the state we draw. */
export function MapCanvas({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        创建会话后开始仿真
      </div>
    );
  }
  const width = snapshot.width * PX_PER_M;
  const height = snapshot.height * PX_PER_M;
  const toPx = (x: number, y: number): [number, number] => [
    x * PX_PER_M,
    height - y * PX_PER_M,
  ];

  const robotPos = toPx(snapshot.robot.x, snapshot.robot.y);
  const goalPos = toPx(snapshot.goal[0], snapshot.goal[1]);
  const startPos = toPx(snapshot.start[0], snapshot.start[1]);
  const headingLen = snapshot.robot_radius * PX_PER_M * 1.6;

  return (
    <Stage width={width} height={height}>
      {/* arena */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#101826"
        stroke="#2b3a52"
        strokeWidth={2}
      />
      {/* obstacles */}
      <Group>
        {snapshot.obstacles.map((obstacle, i) =>
          obstacle.kind === "circle" ? (
            <Circle
              key={i}
              {...circleProps(obstacle.cx, obstacle.cy, obstacle.radius, toPx)}
              fill="#3d4a61"
              stroke="#5a6b88"
              strokeWidth={1}
            />
          ) : (
            <Rect
              key={i}
              x={obstacle.x * PX_PER_M}
              y={height - (obstacle.y + obstacle.height) * PX_PER_M}
              width={obstacle.width * PX_PER_M}
              height={obstacle.height * PX_PER_M}
              fill="#3d4a61"
              stroke="#5a6b88"
              strokeWidth={1}
            />
          ),
        )}
      </Group>
      {/* planned path */}
      {snapshot.path.length > 1 && (
        <Line
          points={snapshot.path.flatMap(([x, y]) => toPx(x, y))}
          stroke="#f5b04c"
          strokeWidth={2}
          dash={[8, 6]}
          opacity={0.9}
        />
      )}
      {/* executed trajectory */}
      {snapshot.trajectory.length > 1 && (
        <Line
          points={snapshot.trajectory.flatMap(([x, y]) => toPx(x, y))}
          stroke="#39c6b0"
          strokeWidth={2.5}
          lineCap="round"
          lineJoin="round"
        />
      )}
      {/* start & goal */}
      <Circle x={startPos[0]} y={startPos[1]} radius={6} stroke="#8fa3bf" strokeWidth={2} />
      <Circle x={goalPos[0]} y={goalPos[1]} radius={snapshot.robot_radius * PX_PER_M} stroke="#4ade80" strokeWidth={2} dash={[4, 4]} />
      <Text x={goalPos[0] - 12} y={goalPos[1] + snapshot.robot_radius * PX_PER_M + 6} text="GOAL" fill="#4ade80" fontSize={11} />
      {/* robot */}
      <Circle x={robotPos[0]} y={robotPos[1]} radius={snapshot.robot_radius * PX_PER_M} fill="#e2e8f0" stroke="#f8fafc" strokeWidth={1.5} />
      <Line
        points={[
          robotPos[0],
          robotPos[1],
          robotPos[0] + Math.cos(-snapshot.robot.theta) * headingLen,
          robotPos[1] + Math.sin(-snapshot.robot.theta) * headingLen,
        ]}
        stroke="#f87171"
        strokeWidth={2.5}
        lineCap="round"
      />
    </Stage>
  );
}

type ToPx = (x: number, y: number) => [number, number];

function circleProps(
  cx: number,
  cy: number,
  radius: number,
  toPx: ToPx,
): { x: number; y: number; radius: number } {
  const [x, y] = toPx(cx, cy);
  return { x, y, radius: radius * PX_PER_M };
}
