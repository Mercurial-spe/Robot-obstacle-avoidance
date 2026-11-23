import { Crosshair } from "lucide-react";
import type { PlanInfoOut, Snapshot } from "../types";
import { RUN_STATUS_LABELS, sessionChip } from "./status";

/**
 * Value text color for a run outcome — mirrors the chip semantics in status.ts
 * (reached_goal green / collided red / timeout amber / stuck orange).
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

export function StatusPanel({
  snapshot,
  connected,
  planInfo,
}: {
  snapshot: Snapshot | null;
  connected: boolean;
  planInfo: PlanInfoOut | null;
}) {
  if (!snapshot) {
    return <p className="text-sm text-zinc-500">尚无会话。</p>;
  }
  const statusInfo = sessionChip(snapshot.status, snapshot.run_status);
  const apfForce = snapshot.apf_force;
  const metrics = snapshot.metrics;
  return (
    <div className="space-y-4 text-sm text-zinc-300">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
        <span className="text-xs text-zinc-500">
          {connected ? "WS 已连接" : "WS 未连接"}
        </span>
      </div>
      {snapshot.message && (
        <p className="rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-xs text-red-300">
          {snapshot.message}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-2">
        <Metric label="仿真时间" value={`${metrics.sim_time.toFixed(2)} s`} />
        <Metric label="行驶距离" value={`${metrics.distance_traveled.toFixed(2)} m`} />
        <Metric label="规划耗时" value={`${metrics.planning_ms.toFixed(1)} ms`} />
        <Metric
          label="重规划次数"
          value={String(metrics.replans)}
          valueClassName={
            metrics.replans >= HIGH_REPLANS ? "text-amber-300" : "text-zinc-100"
          }
        />
        <Metric
          label="碰撞次数"
          value={String(metrics.collision_count)}
          valueClassName={metrics.collision_count > 0 ? "text-red-400" : "text-zinc-100"}
        />
        <Metric
          label="运行结果"
          value={RUN_STATUS_LABELS[snapshot.run_status] ?? snapshot.run_status}
          valueClassName={OUTCOME_VALUE_COLOR[snapshot.run_status] ?? "text-zinc-100"}
        />
      </dl>
      {apfForce && (
        <p className="text-xs text-zinc-500">
          APF 力：<span className="font-mono text-zinc-300">
            ({apfForce[0].toFixed(2)}, {apfForce[1].toFixed(2)})
          </span>{" "}
          |F| ={" "}
          <span className="font-mono text-zinc-300">
            {Math.hypot(apfForce[0], apfForce[1]).toFixed(2)}
          </span>
        </p>
      )}
      {planInfo && (
        <div className="panel-card px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Crosshair size={12} aria-hidden className="text-sky-400" />
            规划元数据
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Metric label="算法" value={planInfo.algorithm} compact />
            <Metric label="膨胀半径" value={`${planInfo.inflation_m.toFixed(2)} m`} compact />
            <Metric label="搜索节点" value={String(planInfo.expanded_nodes.length)} compact />
            <Metric
              label="栅格"
              value={planInfo.grid ? `${planInfo.grid.cols}×${planInfo.grid.rows}` : "—"}
              compact
            />
          </dl>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        种子会话 · 安全边距与速度上限在顶部设置后新建会话生效
      </p>
    </div>
  );
}

/** Metric tile: tiny zinc-400 label over a mono value on a zinc-950/60 tile —
 * the same tile language as SessionMetricsFooter. */
function Metric({
  label,
  value,
  valueClassName = "text-zinc-100",
  compact = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "min-w-0"
          : "min-w-0 rounded-md bg-zinc-950/60 px-2 py-1.5"
      }
    >
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd
        className={`font-mono tabular-nums ${
          compact ? "text-zinc-200" : `text-xs ${valueClassName}`
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
