import type { SessionStatus, Snapshot } from "../types";

const STATUS_CHIPS: Record<SessionStatus, { label: string; className: string }> = {
  idle: { label: "待机", className: "bg-slate-700 text-slate-200" },
  running: { label: "运行中", className: "bg-sky-600 text-white" },
  paused: { label: "已暂停", className: "bg-amber-600 text-white" },
  finished: { label: "已结束", className: "bg-emerald-700 text-white" },
  error: { label: "错误", className: "bg-red-700 text-white" },
};

const RUN_STATUS_LABELS: Record<string, string> = {
  running: "行驶中",
  reached_goal: "到达终点",
  collided: "碰撞",
  timeout: "超时",
  stuck: "被困",
};

/** Status chip + key metrics rendered DIRECTLY under one map. Used for both
 * sides of the side-by-side view so the layout stays comparable (spec §5). */
export function SessionMetricsFooter({
  snapshot,
  connected,
}: {
  snapshot: Snapshot | null;
  connected: boolean;
}) {
  if (!snapshot) {
    return (
      <div className="mt-2 flex h-16 items-center justify-center rounded-md border border-slate-800 bg-slate-900/40 text-xs text-slate-500">
        尚未创建会话
      </div>
    );
  }
  const chip = STATUS_CHIPS[snapshot.status] ?? STATUS_CHIPS.idle;
  const finishedReason =
    snapshot.status === "finished"
      ? `已结束 · ${RUN_STATUS_LABELS[snapshot.run_status] ?? snapshot.run_status}`
      : null;
  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.className}`}
        >
          {finishedReason ?? chip.label}
        </span>
        {!connected && (
          <span className="text-[10px] text-slate-500">WS 未连接</span>
        )}
      </div>
      <dl className="grid grid-cols-5 gap-x-2 text-xs">
        <Metric
          label="结果"
          value={RUN_STATUS_LABELS[snapshot.run_status] ?? snapshot.run_status}
        />
        <Metric label="用时" value={`${snapshot.metrics.sim_time.toFixed(1)}s`} />
        <Metric
          label="距离"
          value={`${snapshot.metrics.distance_traveled.toFixed(1)}m`}
        />
        <Metric label="碰撞" value={String(snapshot.metrics.collision_count)} />
        <Metric label="重规划" value={String(snapshot.metrics.replans)} />
      </dl>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] text-slate-500">{label}</dt>
      <dd className="truncate font-mono text-slate-200">{value}</dd>
    </div>
  );
}
