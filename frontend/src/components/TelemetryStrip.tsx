import { useId, useRef } from "react";
import { useTelemetryDetailed } from "../hooks/useTelemetry";
import type { TelemetrySample } from "../hooks/useTelemetry";
import type { Snapshot } from "../types";

/** Six live channels, one colour each — all derived from backend snapshots. */
interface Channel {
  key: string;
  title: string;
  unit: string;
  color: string;
  pick: (sample: TelemetrySample) => number;
  /** Angular velocity is drawn around a zero midline; the others fill min–max. */
  centered: boolean;
  /** Minimal y span (display only): below this the window counts as
   * near-constant and the axis keeps an epsilon-wide band instead of
   * magnifying quantisation noise infinitely. */
  epsilon: number;
}

// ε per channel, in the channel's own unit — roughly the smallest variation
// that is physically meaningful (sensor / numeric noise floor), not a floor
// clamping the range to zero.
const CHANNELS: Channel[] = [
  { key: "v", title: "线速度", unit: "m/s", color: "#34d399", pick: (s) => s.v, centered: false, epsilon: 0.05 },
  { key: "w", title: "角速度", unit: "rad/s", color: "#fb923c", pick: (s) => s.w, centered: true, epsilon: 0.04 },
  { key: "err", title: "路径偏差", unit: "m", color: "#38bdf8", pick: (s) => s.err, centered: false, epsilon: 0.02 },
  { key: "goal", title: "距目标距离", unit: "m", color: "#a78bfa", pick: (s) => s.goalDist, centered: false, epsilon: 0.05 },
  { key: "apf", title: "APF 合力", unit: "N", color: "#f472b6", pick: (s) => s.apf, centered: false, epsilon: 0.05 },
  // `dist`（累计里程）同样走窗口 min–max 而非 0 基：它单调递增，在滑动窗口
  // 下 0 基呈现的是一条角度恒定的斜线，坡度变化（加减速）完全不可辨；
  // min–max 把 [min,max] 铺满全高后，斜率变化直接可读（斜率即线速度 v）。
  // 代价是绝对标高丢失——由右上角的 min–max 量程标注补回。
  { key: "dist", title: "累计里程", unit: "m", color: "#f5b04c", pick: (s) => s.dist, centered: false, epsilon: 0.5 },
];

/**
 * 底部实时遥测条 — the MotionView-style live strip under each map: a slim
 * mono pose readout (t / x / y / θ) plus six filled sparkline charts in a
 * 3×2 grid (线速度 / 角速度 / 路径偏差 / 距目标距离 / APF 合力 / 累计里程).
 * Every value derives from backend snapshots via useTelemetryDetailed; the
 * only smoothed quantity is the y-axis range (layout, not data). Each card
 * annotates its current window min–max so the viewer can tell the chart is
 * a magnifier, not an absolute-coordinate plot.
 */
export function TelemetryStrip({ snapshot }: { snapshot: Snapshot | null }) {
  const { samples, replanTimes } = useTelemetryDetailed(snapshot);
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
        {replanTimes.length > 0 && (
          <span className="flex items-center gap-1" title="metrics.replans 递增的时刻，在波形图上为竖直刻度线">
            <span className="inline-block h-3 w-px bg-zinc-600" />
            重规划
          </span>
        )}
        <span className="ml-auto text-zinc-600">实际值 · 来自快照流</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CHANNELS.map((channel) => (
          <TelemetryChart
            key={channel.key}
            channel={channel}
            samples={samples}
            events={replanTimes}
          />
        ))}
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

const W = 100;
const H = 44;

/** Y-range easing factor: both bounds chase the raw window bounds with this
 * α so a sudden excursion doesn't snap the whole curve vertically. */
const RANGE_ALPHA = 0.2;
/** Padding above/below the window min–max, as a fraction of the data span. */
const RANGE_PADDING = 0.18;

/** One filled sparkline, hand-written SVG with a non-scaling stroke so the
 * line stays crisp at any card width. The fill uses a per-instance
 * linearGradient (useId, so parallel strips never share ids); the curve end
 * carries a glowing dot drawn as an HTML overlay so it stays perfectly round
 * under the non-uniform viewBox scaling.
 *
 * Y range (display only — the plotted samples are the raw snapshot-derived
 * values, never scaled or smoothed):
 * - non-centered channels map the window [min, max] onto the full card height
 *   with 18% padding on both sides, so micro-wobble at a steady cruise is
 *   visible instead of collapsing onto a flat line at a 0-based scale;
 * - if the window is near-constant (max−min < ε) the axis keeps an ε-wide
 *   band centred on the constant — no divide-by-zero, no infinite noise gain;
 * - centered channels (ω) stay symmetric around the zero midline, easing
 *   |max| with the same EMA;
 * - both bounds are eased with an exponential moving average (α = 0.2) so the
 *   range itself doesn't jitter the whole curve frame to frame. */
function TelemetryChart({
  channel,
  samples,
  events,
}: {
  channel: Channel;
  samples: TelemetrySample[];
  events: number[];
}) {
  const { title, unit, color, pick, centered, epsilon } = channel;
  const gradientId = `grad-${useId().replace(/:/g, "")}`;

  // Smoothed y range: EMA across renders, reset when the window empties.
  const rangeRef = useRef<{ lo: number; hi: number } | null>(null);
  const points = samples.map((s) => ({ x: s.t, v: pick(s) }));
  const finite = points.filter((p) => Number.isFinite(p.v));
  const latest = finite.length > 0 ? finite[finite.length - 1].v : null;

  // Raw window extent — also shown verbatim as the magnifier annotation.
  const rawMin = finite.length > 0 ? Math.min(...finite.map((p) => p.v)) : null;
  const rawMax = finite.length > 0 ? Math.max(...finite.map((p) => p.v)) : null;

  let target: { lo: number; hi: number };
  if (finite.length === 0 || rawMin === null || rawMax === null) {
    rangeRef.current = null;
    target = centered ? { lo: -epsilon, hi: epsilon } : { lo: 0, hi: epsilon };
  } else if (centered) {
    // ω stays around the zero midline: the half-span is the window |max|,
    // nudged up 15% and clamped to ε for a near-zero yaw rate.
    const half = Math.max(
      Math.max(...finite.map((p) => Math.abs(p.v))) * 1.15,
      epsilon,
    );
    target = { lo: -half, hi: half };
  } else {
    const span = rawMax - rawMin;
    if (span < epsilon) {
      // Near-constant window: keep an ε-wide band centred on the constant so
      // quantisation noise is not magnified infinitely and the span stays
      // safely non-zero.
      const mid = (rawMin + rawMax) / 2;
      target = { lo: mid - epsilon / 2, hi: mid + epsilon / 2 };
    } else {
      // Adaptive min–max with padding on both sides.
      const pad = span * RANGE_PADDING;
      target = { lo: rawMin - pad, hi: rawMax + pad };
    }
  }
  const prevRange = rangeRef.current;
  const smoothed =
    prevRange === null
      ? target
      : {
          lo: prevRange.lo + (target.lo - prevRange.lo) * RANGE_ALPHA,
          hi: prevRange.hi + (target.hi - prevRange.hi) * RANGE_ALPHA,
        };
  rangeRef.current = smoothed;
  const lo = smoothed.lo;
  const hi = Math.max(smoothed.hi, smoothed.lo + 1e-6); // degenerate-span guard
  const span = hi - lo;

  const baseY = centered ? H / 2 : H;
  // Single linear map for both modes: lo → bottom edge, hi → top edge (the
  // centered range is symmetric, so 0 lands exactly on the midline). Clamped
  // so a value that outruns the eased range clips at the edge instead of
  // escaping the card.
  const toY = (v: number) => {
    const y = H - ((v - lo) / span) * H;
    return Math.min(H, Math.max(0, y));
  };

  // Time-based x so gaps and replan ticks line up across all six charts.
  const t0 = samples.length > 0 ? samples[0].t : 0;
  const t1 = samples.length > 0 ? samples[samples.length - 1].t : 1;
  const tSpan = Math.max(t1 - t0, 1e-6);
  const toX = (t: number) => ((t - t0) / tSpan) * W;

  // NaN values split the curve into contiguous finite segments.
  const segments: { line: string; area: string }[] = [];
  let cur: { x: number; y: number }[] = [];
  let endPoint: { x: number; y: number } | null = null;
  const flush = () => {
    if (cur.length === 0) return;
    const line = cur.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const first = cur[0];
    const last = cur[cur.length - 1];
    const area =
      cur.length > 1
        ? `${line} L${last.x.toFixed(2)},${baseY} L${first.x.toFixed(2)},${baseY} Z`
        : "";
    segments.push({ line, area });
    cur = [];
  };
  for (const p of points) {
    if (Number.isFinite(p.v)) {
      const pt = { x: toX(p.x), y: toY(p.v) };
      cur.push(pt);
      endPoint = pt;
    } else {
      flush();
    }
  }
  flush();

  const ticks = events
    .filter((t) => t >= t0 && t <= t1 && samples.length > 1)
    .map((t) => ({ t, x: toX(t) }));

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
        <span className="flex items-baseline gap-1.5">
          {rawMin !== null && rawMax !== null && (
            <span
              className="font-mono text-[9px] text-zinc-600"
              title="当前窗口的 y 量程（自适应 min–max）——曲线是放大镜，不是绝对坐标"
            >
              {centered
                ? `±${Math.max(Math.abs(rawMin), Math.abs(rawMax)).toFixed(2)}`
                : `${rawMin.toFixed(2)}–${rawMax.toFixed(2)}`}
            </span>
          )}
          <span className="font-mono text-[11px] text-zinc-200">
            {latest === null ? "—" : `${latest.toFixed(2)} ${unit}`}
          </span>
        </span>
      </div>
      <div className="relative mt-1 h-14 w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 block h-full w-full"
          role="img"
          aria-label={`${title} (${unit}) 随时间变化曲线`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {centered ? (
                <>
                  <stop offset="0%" stopColor={color} stopOpacity={0.02} />
                  <stop offset="50%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </>
              )}
            </linearGradient>
          </defs>
          {ticks.map((tick, i) => (
            <g key={i}>
              <title>{`重规划 · t=${tick.t.toFixed(2)} s`}</title>
              <line
                x1={tick.x}
                x2={tick.x}
                y1={0}
                y2={H}
                stroke="#52525b"
                strokeWidth={1}
                opacity={0.9}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {centered && (
            <line
              x1={0}
              x2={W}
              y1={H / 2}
              y2={H / 2}
              stroke="#3f3f46"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {segments.map((seg, i) => (
            <g key={i}>
              {seg.area && (
                <path d={seg.area} fill={`url(#${gradientId})`} />
              )}
              <path
                d={seg.line}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}
        </svg>
        {endPoint && (
          <span
            className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${(endPoint.x / W) * 100}%`,
              top: `${(endPoint.y / H) * 100}%`,
              backgroundColor: color,
              boxShadow: `0 0 6px 2px ${color}55`,
            }}
          />
        )}
      </div>
    </div>
  );
}
