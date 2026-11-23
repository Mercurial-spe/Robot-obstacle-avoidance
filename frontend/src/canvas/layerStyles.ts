import type { LayerId } from "../hooks/useLayerToggles";

/**
 * Single source of truth for layer colors and legend metadata. The canvas
 * layers and the legend both read from here so colors stay consistent.
 * Palette: few high-contrast accents on the dark arena (spec §5) — the
 * trajectory teal and planned-path amber are the P0 reference colors.
 */
export interface LayerStyle {
  label: string;
  /** Hex/rgba color used by the canvas layer AND its legend swatch. */
  color: string;
  kind: "line" | "fill" | "dot" | "arrow";
}

export const LAYER_STYLE: Record<LayerId, LayerStyle> = {
  inflation: {
    label: "膨胀区",
    color: "rgba(125, 211, 252, 0.5)",
    kind: "fill",
  },
  astarGrid: {
    label: "A* 栅格与搜索节点",
    color: "#6366f1",
    kind: "dot",
  },
  plannedPath: { label: "规划路径", color: "#fbbf24", kind: "line" },
  trajectory: { label: "实际轨迹", color: "#39c6b0", kind: "line" },
  robotHeading: { label: "机器人朝向", color: "#f87171", kind: "arrow" },
  obstacleVelocity: { label: "动态障碍物速度", color: "#f472b6", kind: "arrow" },
  apfForce: { label: "APF 力", color: "#c084fc", kind: "arrow" },
};

/**
 * Executed-trajectory progress gradient: stroke color lerps from the teal
 * P0 accent (departure) to sky blue (arrival). Konva cannot stroke a single
 * Line with a gradient, so MapCanvas splits the polyline into short segments
 * and lerps per segment; the legend swatch keeps the departure color.
 */
export const TRAJECTORY_GRADIENT = {
  start: "#39c6b0",
  end: "#38bdf8",
} as const;

/** Arena tint of the inflation silhouette (legend swatch shows the stroke). */
export const INFLATION_FILL = "rgba(125, 211, 252, 0.1)";

export const PX_PER_M = 48;

/**
 * Experiment-chart colors, assigned BY ALGORITHM ID (color follows the entity,
 * never its rank — a different algorithm mix must not repaint survivors).
 * Validated with the dataviz six-checks script against the chart surface
 * #18181b (bg-zinc-900): lightness band, chroma, CVD separation, contrast.
 * Chart series stay darker than the map's line accents on purpose: bars are
 * large fills, lines are thin strokes.
 */
export const ALGO_COLORS: Record<string, string> = {
  astar: "#d97706", // amber-600 — matches the planned-path accent family
  apf: "#0d9488", // teal-600 — matches the trajectory accent family
  hybrid: "#8b5cf6", // violet-500 — matches the APF-force accent family
};

/** Color for an algorithm id missing from ALGO_COLORS (future algorithms). */
export const ALGO_COLOR_FALLBACK = "#71717a";

export function algoColor(algorithm: string): string {
  return ALGO_COLORS[algorithm] ?? ALGO_COLOR_FALLBACK;
}
