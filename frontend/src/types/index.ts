/**
 * Mirror of the backend Pydantic schemas (backend/app/schemas/models.py and
 * backend/app/scenarios/models.py). Keep names and shapes 1:1; update in the
 * same commit as schema changes.
 */

export type RunStatus =
  | "running"
  | "reached_goal"
  | "collided"
  | "timeout"
  | "stuck";

export type SessionStatus = "idle" | "running" | "paused" | "finished" | "error";

export type CommandAction = "start" | "pause" | "step" | "reset";

// ---------------------------------------------------------------------------
// Scenario-side obstacle specs (backend/app/scenarios/models.py)
// ---------------------------------------------------------------------------

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

export interface PingPongMotionSpec {
  type: "pingpong";
  axis: "x" | "y";
  amplitude: number;
  half_period_s: number;
  phase_s: number;
}

export interface PolylineMotionSpec {
  type: "polyline";
  /** Waypoint loop relative to the obstacle's anchor position (meters). */
  points: [number, number][];
  speed: number;
  pause_s: number;
}

export type MotionSpec = PingPongMotionSpec | PolylineMotionSpec;

export interface DynamicCircleObstacleSpec {
  kind: "dynamic-circle";
  cx: number;
  cy: number;
  radius: number;
  motion: MotionSpec;
}

export interface DynamicRectObstacleSpec {
  kind: "dynamic-rect";
  x: number;
  y: number;
  width: number;
  height: number;
  motion: MotionSpec;
}

export type ObstacleSpec =
  | CircleObstacleSpec
  | RectObstacleSpec
  | DynamicCircleObstacleSpec
  | DynamicRectObstacleSpec;

// ---------------------------------------------------------------------------
// Registry payloads
// ---------------------------------------------------------------------------

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  has_dynamic_obstacles: boolean;
}

/** One entry of GET /api/algorithms: wire id + Chinese display name. */
export interface AlgorithmInfo {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Session create (backend SessionCreate)
// ---------------------------------------------------------------------------

export interface SessionCreate {
  scenario_id: string;
  algorithm: string;
  seed: number | null;
  speed: number;
  /** Planner inflation margin on top of the robot radius (meters). */
  safety_margin: number;
  /** Override for the robot's max linear speed (m/s); null = scenario default. */
  v_max: number | null;
}

/** Optional overrides accepted by `apiCreateSession`. */
export type SessionCreateParams = Partial<
  Omit<SessionCreate, "scenario_id" | "algorithm">
>;

// ---------------------------------------------------------------------------
// Snapshot (backend Snapshot)
// ---------------------------------------------------------------------------

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

export interface PingPongMotionState {
  type: "pingpong";
  axis: "x" | "y";
  amplitude: number;
  half_period_s: number;
  phase_s: number;
}

export interface PolylineMotionState {
  type: "polyline";
  /** ABSOLUTE arena positions (meters), unlike the spec's anchor-relative points. */
  points: [number, number][];
  speed: number;
  pause_s: number;
}

export type MotionState = PingPongMotionState | PolylineMotionState;

/**
 * One obstacle as seen in a snapshot, static or dynamic. Flat shape mirroring
 * the backend model: static obstacles carry `motion = null` and zero velocity;
 * dynamic ones carry the CURRENT position (same anchor convention as the
 * specs: circle center `cx`/`cy`, rect min corner `x`/`y`), the CURRENT
 * velocity `vx`/`vy`, the home anchor `base` and the motion parameters.
 */
export interface ObstacleState {
  kind: string; // circle | rect | dynamic-circle | dynamic-rect
  cx: number | null;
  cy: number | null;
  radius: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  vx: number | null;
  vy: number | null;
  base: [number, number] | null;
  motion: MotionState | null;
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
  obstacles: ObstacleState[];
  path: [number, number][];
  trajectory: [number, number][];
  metrics: RunMetrics;
  message: string | null;
  /** APF repulsion+attraction force at the robot position [fx, fy] (N), if any. */
  apf_force: [number, number] | null;
}

// ---------------------------------------------------------------------------
// Plan info (GET /api/sessions/{id}/plan-info, backend PlanInfoOut)
// ---------------------------------------------------------------------------

export interface GridInfo {
  origin_x: number;
  origin_y: number;
  resolution: number;
  cols: number;
  rows: number;
  /** Row-major 0/1 occupancy; index = row * cols + col. */
  blocked: number[];
}

export interface PlanInfoOut {
  session_id: string;
  algorithm: string;
  planning_ms: number;
  replans: number;
  grid: GridInfo | null;
  /** Expanded search cells as [col, row] grid indices. */
  expanded_nodes: [number, number][];
  path: [number, number][];
  /** Total inflation used by the planner: robot radius + safety margin (m). */
  inflation_m: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Scene update (PUT /api/sessions/{id}/scene, backend SceneUpdate)
// ---------------------------------------------------------------------------

/** Full scene replacement body. Obstacles use the scenario-side SPEC shape
 * (anchor + motion), not the snapshot state shape. */
export interface SceneUpdate {
  obstacles: ObstacleSpec[];
  start: [number, number];
  goal: [number, number];
}

// ---------------------------------------------------------------------------
// Batch experiments (POST /api/experiments/batch, backend experiments/schemas)
// ---------------------------------------------------------------------------

export type RunOutcome =
  | "reached_goal"
  | "collided"
  | "timeout"
  | "stuck"
  | "planning_failed";

/** One completed headless run (mirrors ExperimentRunOut). */
export interface ExperimentRunOut {
  algorithm: string;
  seed: number;
  outcome: RunOutcome;
  sim_time: number;
  distance_traveled: number;
  collision_count: number;
  planning_ms: number;
  replans: number;
}

/** One algorithm aggregated across all requested seeds (ExperimentSummaryOut). */
export interface ExperimentSummaryOut {
  algorithm: string;
  runs: number;
  success_rate: number;
  mean_sim_time: number;
  median_sim_time: number;
  mean_distance: number;
  total_collisions: number;
  mean_collisions: number;
  mean_planning_ms: number;
  mean_replans: number;
  outcome_counts: Record<string, number>;
}

/** BatchExperimentOut: per-run rows + per-algorithm aggregates + export info. */
export interface BatchExperimentOut {
  scenario_id: string;
  algorithms: string[];
  seeds: number[];
  runs: ExperimentRunOut[];
  summary: ExperimentSummaryOut[];
  output_dir: string;
  /** runs_csv | summary_csv | results_json -> file name. */
  files: Record<string, string>;
}
