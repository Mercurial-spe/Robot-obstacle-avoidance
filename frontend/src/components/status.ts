import type { SessionStatus } from "../types";

/**
 * Single source of truth for session status chips and run-outcome labels —
 * both the side-by-side metrics footer and the single-view status panel read
 * from here so wording and colors never drift apart.
 *
 * Color carries MEANING: a finished run is colored by HOW it ended
 * (reached_goal green, collided red, timeout amber, stuck orange) — a
 * collided run must never wear the same green as a successful one.
 */

export const RUN_STATUS_LABELS: Record<string, string> = {
  running: "行驶中",
  reached_goal: "到达终点",
  collided: "碰撞",
  timeout: "超时",
  stuck: "被困",
  planning_failed: "规划失败",
};

/** Chip color for a finished run, keyed by run outcome. */
const OUTCOME_CHIPS: Record<string, string> = {
  reached_goal: "bg-emerald-700 text-white",
  collided: "bg-red-700 text-white",
  timeout: "bg-amber-600 text-white",
  stuck: "bg-orange-600 text-white",
  planning_failed: "bg-slate-700 text-slate-200",
};

const SESSION_CHIPS: Record<SessionStatus, { label: string; className: string }> = {
  idle: { label: "待机", className: "bg-slate-700 text-slate-200" },
  running: { label: "运行中", className: "bg-sky-600 text-white" },
  paused: { label: "已暂停", className: "bg-amber-600 text-white" },
  finished: { label: "已结束", className: "bg-emerald-700 text-white" },
  error: { label: "错误", className: "bg-red-700 text-white" },
};

/** Chip label + tailwind classes for a session. While finished, the chip
 * shows the OUTCOME with the outcome's color (never a blanket green). */
export function sessionChip(
  status: SessionStatus,
  runStatus: string,
): { label: string; className: string } {
  const chip = SESSION_CHIPS[status] ?? SESSION_CHIPS.idle;
  if (status === "finished") {
    return {
      label: RUN_STATUS_LABELS[runStatus] ?? chip.label,
      className: OUTCOME_CHIPS[runStatus] ?? chip.className,
    };
  }
  return chip;
}
