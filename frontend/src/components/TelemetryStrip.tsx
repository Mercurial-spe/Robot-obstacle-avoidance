import { useTelemetry } from "../hooks/useTelemetry";
import type { TelemetrySample } from "../hooks/useTelemetry";
import type { Snapshot } from "../types";

/**
 * 底部实时遥测条 — the MotionView-style live strip under each map: a slim
 * mono pose readout (t / x / y / θ) plus three filled sparkline charts
 * (线速度 / 角速度 / 路径偏差). Every value derives from backend snapshots
 * via useTelemetry; nothing here is animated independently of state.
 */
export function TelemetryStrip({ snapshot }: { snapshot: Snapshot | null }) {
  const samples = useTelemetry(snapshot);
  if (!snapshot) return null;
  const { x, y, theta } = snapshot.robot;
  const deg = ((theta * 180) / Math.PI).toFixed(1);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 font-mono text-[11px] text-zinc-400">
        <Readout label="t" value={`${snapshot.sim_time.toFixed(2)} s`} />
        <Readout label="x" value={`${x.toFixed(2)} m`} />
        <Readout label="y" value={`${y.toFixed(2)} m`} />
        <Readout label="θ" value={`${deg}°`} />
        <span className="ml-auto text-zinc-600">实际值 · 来自快照流</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <TelemetryChart
          title="线速度"
          unit="m/s"
          color="#34d399"
          samples={samples}
          pick={(s) => s.v}
          centered={false}
        />
        <TelemetryChart
          title="角速度"
          unit="rad/s"
          color="#fb923c"
          samples={samples}
          pick={(s) => s.w}
          centered
        />
        <TelemetryChart
          title="路径偏差"
          unit="m"
          color="#38bdf8"
          samples={samples}
          pick={(s) => s.err}
          centered={false}
        />
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label} <span className="text-zinc-200">{value}</span>
    </span>
  );
}

/** One filled sparkline, SVG with a non-scaling stroke so the line stays
 * crisp at any card width. Angular velocity is rendered around a zero
 * midline; the others grow from the bottom. */
function TelemetryChart({
  title,
  unit,
  color,
  samples,
  pick,
  centered,
}: {
  title: string;
  unit: string;
  color: string;
  samples: TelemetrySample[];
  pick: (sample: TelemetrySample) => number;
  centered: boolean;
}) {
  const vals = samples.map(pick).filter((v) => Number.isFinite(v));
  const latest = vals.length > 0 ? vals[vals.length - 1] : null;
  const maxAbs = Math.max(...vals.map((v) => Math.abs(v)), centered ? 0.5 : 0.2);
  const span = maxAbs * 1.1 || 1;

  const W = 100;
  const H = 36;
  const toY = (v: number) =>
    centered ? H / 2 - (v / span) * (H / 2) : H - (v / span) * H;
  const points =
    vals.length > 0
      ? vals.map((v, i) => `${((i / Math.max(1, vals.length - 1)) * W).toFixed(2)},${toY(v).toFixed(2)}`)
      : [];
  const areaPath =
    vals.length > 1
      ? `M0,${toY(vals[0]).toFixed(2)} ${points.join(" ")} L${W},${centered ? H / 2 : H} L0,${centered ? H / 2 : H} Z`
      : null;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {title}
        </span>
        <span className="font-mono text-[11px] text-zinc-200">
          {latest === null ? "—" : `${latest.toFixed(2)} ${unit}`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-1 block h-10 w-full"
        role="img"
        aria-label={`${title} (${unit}) 随时间变化曲线`}
      >
        {centered && (
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#27272a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        {areaPath && (
          <>
            <path d={areaPath} fill={color} opacity={0.18} />
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}
