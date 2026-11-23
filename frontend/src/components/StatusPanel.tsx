import type { PlanInfoOut, Snapshot } from "../types";
import { RUN_STATUS_LABELS, sessionChip } from "./status";

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
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Metric label="仿真时间" value={`${snapshot.metrics.sim_time.toFixed(2)} s`} />
        <Metric label="行驶距离" value={`${snapshot.metrics.distance_traveled.toFixed(2)} m`} />
        <Metric label="规划耗时" value={`${snapshot.metrics.planning_ms.toFixed(1)} ms`} />
        <Metric label="重规划次数" value={String(snapshot.metrics.replans)} />
        <Metric label="碰撞次数" value={String(snapshot.metrics.collision_count)} />
        <Metric label="运行结果" value={RUN_STATUS_LABELS[snapshot.run_status] ?? snapshot.run_status} />
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
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
          <p className="mb-1.5 text-xs font-medium text-zinc-400">规划元数据</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Metric label="算法" value={planInfo.algorithm} />
            <Metric label="膨胀半径" value={`${planInfo.inflation_m.toFixed(2)} m`} />
            <Metric label="搜索节点" value={String(planInfo.expanded_nodes.length)} />
            <Metric
              label="栅格"
              value={planInfo.grid ? `${planInfo.grid.cols}×${planInfo.grid.rows}` : "—"}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-mono text-zinc-200">{value}</dd>
    </div>
  );
}
