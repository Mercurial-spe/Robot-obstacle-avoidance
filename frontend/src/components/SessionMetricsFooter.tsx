import type { Snapshot } from "../types";
import { RUN_STATUS_LABELS, sessionChip } from "./status";

/**
 * Value text color for a run outcome — mirrors the chip semantics in status.ts
 * (reached_goal green / collided red / timeout amber / stuck orange): a failed
 * run must never wear the neutral zinc of an in-progress one.
 */
const OUTCOME_VALUE_COLOR: Record<string, string> = {
  reached_goal: "text-emerald-400",
  collided: "text-red-400",
  timeout: "text-amber-400",
  stuck: "text-orange-400",
  planning_failed: "text-zinc-400",
};

/** 重规划次数达到该值视为偏高，用琥珀色提醒（而非报错红）。 */
const HIGH_REPLANS = 5;

/** Status chip + key metrics rendered DIRECTLY under one map. Used for both
 * sides of the side-by-side view so the layout stays comparable (spec §5).
 * Metrics render as small zinc-950/60 tiles: tiny label on top, mono value
 * below, colored by outcome semantics where it carries meaning. */
export function SessionMetricsFooter({
  snapshot,
  connected,
}: {
  snapshot: Snapshot | null;
  connected: boolean;
}) {
  if (!snapshot) {
    return (
      <div className="mt-2 flex h-16 items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-900/40 text-xs text-zinc-500">
        尚未创建会话
      </div>
    );
  }
  const chip = sessionChip(snapshot.status, snapshot.run_status);
  const metrics = snapshot.metrics;
  return (
    <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.className}`}
        >
          {chip.label}
        </span>
        {!connected && (
          <span className="text-[10px] text-zinc-500">WS 未连接</span>
        )}
      </div>
      <dl className="grid grid-cols-5 gap-2">
        <Metric
          label="结果"
          value={RUN_STATUS_LABELS[snapshot.run_status] ?? snapshot.run_status}
          valueClassName={OUTCOME_VALUE_COLOR[snapshot.run_status] ?? "text-zinc-100"}
        />
        <Metric label="用时" value={`${metrics.sim_time.toFixed(1)}s`} />
        <Metric label="距离" value={`${metrics.distance_traveled.toFixed(1)}m`} />
        <Metric
          label="碰撞"
          value={String(metrics.collision_count)}
          valueClassName={metrics.collision_count > 0 ? "text-red-400" : "text-zinc-100"}
        />
        <Metric
          label="重规划"
          value={String(metrics.replans)}
          valueClassName={
            metrics.replans >= HIGH_REPLANS ? "text-amber-300" : "text-zinc-100"
          }
        />
      </dl>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClassName = "text-zinc-100",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-zinc-950/60 px-2 py-1.5">
      <dt className="truncate text-[10px] text-zinc-400">{label}</dt>
      <dd className={`truncate font-mono text-xs tabular-nums ${valueClassName}`}>
        {value}
      </dd>
    </div>
  );
}
