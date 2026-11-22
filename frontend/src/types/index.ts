/**
 * Mirror of the backend Pydantic schemas (backend/app/schemas/models.py).
 * Keep names and shapes 1:1; update in the same commit as schema changes.
 */

export type RunStatus =
  | "running"
  | "reached_goal"
  | "collided"
  | "timeout"
  | "stuck";

export type SessionStatus = "idle" | "running" | "paused" | "finished" | "error";

export type CommandAction = "start" | "pause" | "step" | "reset";

export interface CircleObstacleSpec {
  kind: "circle";
  cx: number;
  cy: number;
  radius: number;
}

export interface RectObstacleSpec {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ObstacleSpec = CircleObstacleSpec | RectObstacleSpec;

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  has_dynamic_obstacles: boolean;
}

export interface RobotPose {
  x: number;
  y: number;
  theta: number;
}

export interface RunMetrics {
  distance_traveled: number;
  sim_time: number;
  planning_ms: number;
  replans: number;
  collision_count: number;
}

export interface Snapshot {
  session_id: string;
  status: SessionStatus;
  run_status: RunStatus;
  sim_time: number;
  width: number;
  height: number;
  robot: RobotPose;
  goal: [number, number];
  start: [number, number];
  robot_radius: number;
  obstacles: ObstacleSpec[];
  path: [number, number][];
  trajectory: [number, number][];
  metrics: RunMetrics;
  message: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
