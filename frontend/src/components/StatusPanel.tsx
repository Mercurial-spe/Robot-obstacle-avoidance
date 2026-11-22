import type { Snapshot } from "../types";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  idle: { label: "待机", className: "bg-slate-700 text-slate-200" },
  running: { label: "运行中", className: "bg-sky-600 text-white" },
  paused: { label: "已暂停", className: "bg-amber-600 text-white" },
  finished: { label: "已结束", className: "bg-emerald-700 text-white" },
  error: { label: "错误", className: "bg-red-700 text-white" },
};

const RUN_STATUS_LABELS: Record<string, string> = {
  running: "行驶中",
  reached_goal: "到达终点",
  collided: "发生碰撞",
  timeout: "超时",
  stuck: "被困",
};

export function StatusPanel({
  snapshot,
  connected,
}: {
  snapshot: Snapshot | null;
  connected: boolean;
}) {
  if (!snapshot) {
    return <p className="text-sm text-slate-500">尚无会话。</p>;
  }
  const statusInfo = STATUS_LABELS[snapshot.status] ?? STATUS_LABELS.idle;
  return (
    <div className="space-y-4 text-sm text-slate-300">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
        <span className="text-xs text-slate-500">
          {connected ? "WS 已连接" : "WS 未连接"}
        </span>
      </div>
      {snapshot.message && (
        <p className="rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-xs text-red-300">
          {snapshot.message}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Metric label="仿真时间" value={`${snapshot.metrics.sim_time.toFixed(2)} s`} />
        <Metric label="行驶距离" value={`${snapshot.metrics.distance_traveled.toFixed(2)} m`} />
        <Metric label="规划耗时" value={`${snapshot.metrics.planning_ms.toFixed(1)} ms`} />
        <Metric label="重规划次数" value={String(snapshot.metrics.replans)} />
        <Metric label="碰撞次数" value={String(snapshot.metrics.collision_count)} />
        <Metric label="运行结果" value={RUN_STATUS_LABELS[snapshot.run_status] ?? snapshot.run_status} />
      </dl>
      <p className="text-xs text-slate-500">seed 会话 · 算法与参数在右侧调参（P1 扩展）</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-200">{value}</dd>
    </div>
  );
}
