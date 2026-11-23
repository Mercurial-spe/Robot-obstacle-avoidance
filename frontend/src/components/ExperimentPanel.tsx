import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { algoColor } from "../canvas/layerStyles";
import { apiBatchExperiment, ApiRequestError } from "../api/client";
import type {
  AlgorithmInfo,
  BatchExperimentOut,
  ExperimentSummaryOut,
  ScenarioSummary,
} from "../types";

/** Outcome-series colors for the failure-count chart. These encode run
 * outcomes (states), not algorithm identity — algorithm identity stays in the
 * X axis labels there, with a legend on the chart itself. */
const OUTCOME_SERIES = [
  { key: "collided", label: "碰撞", color: "#ef4444" },
  { key: "timeout", label: "超时", color: "#eab308" },
  { key: "stuck", label: "被困", color: "#f97316" },
  { key: "planning_failed", label: "规划失败", color: "#a1a1aa" },
] as const;

const ALGO_LABEL_FALLBACK: Record<string, string> = {
  astar: "A*",
  apf: "APF",
  hybrid: "A*+APF",
};

function algoDisplayName(id: string): string {
  return ALGO_LABEL_FALLBACK[id] ?? id;
}

/** Shared dark tooltip surface (#18181b) for every chart in this panel. */
const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  fontSize: 12,
  color: "#e2e8f0",
} as const;

interface ChartRow {
  name: string;
  /** Wire id of the algorithm this row aggregates (for stable colors). */
  algoId?: string;
  [key: string]: unknown;
}

/**
 * 批量实验 dashboard (bottom panel, both views): preset scenario + algorithm
 * multiselect (default astar+apf) + seed count (seeds auto-generated 1..N) →
 * POST /api/experiments/batch → Recharts bar charts + a normalized radar
 * comparison. Failed outcomes are shown as-is (collided/timeout/stuck chart)
 * — never hidden or converted. The last result is cached in state until the
 * next run.
 */
export function ExperimentPanel({
  scenarios,
  algorithms,
}: {
  scenarios: ScenarioSummary[];
  algorithms: AlgorithmInfo[];
}) {
  const [scenarioId, setScenarioId] = useState("");
  const [selected, setSelected] = useState<string[]>(["astar", "apf"]);
  const [seedCount, setSeedCount] = useState("5");
  const [result, setResult] = useState<BatchExperimentOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveScenario = scenarioId || scenarios[0]?.id || "";

  const toggleAlgorithm = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const run = async () => {
    const n = Math.max(1, Math.min(20, Math.floor(parseFloat(seedCount) || 5)));
    const seeds = Array.from({ length: n }, (_, i) => i + 1);
    const algos = selected.length > 0 ? selected : ["astar"];
    setBusy(true);
    setError(null);
    try {
      const out = await apiBatchExperiment(effectiveScenario, algos, seeds);
      setResult(out);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? `${err.code}: ${err.message}` : String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo<ChartRow[]>(() => {
    if (!result) return [];
    return result.summary.map((s: ExperimentSummaryOut) => ({
      name: algoDisplayName(s.algorithm),
      algoId: s.algorithm,
      successRate: Number((s.success_rate * 100).toFixed(1)),
      simTime: Number(s.mean_sim_time.toFixed(2)),
      distance: Number(s.mean_distance.toFixed(2)),
      collisions: Number(s.mean_collisions.toFixed(2)),
      planningMs: Number(s.mean_planning_ms.toFixed(1)),
      runs: s.runs,
    }));
  }, [result]);

  const outcomeRows = useMemo<ChartRow[]>(() => {
    if (!result) return [];
    return result.summary.map((s) => {
      const row: ChartRow = { name: algoDisplayName(s.algorithm), algoId: s.algorithm };
      for (const series of OUTCOME_SERIES) {
        row[series.label] = s.outcome_counts[series.key] ?? 0;
      }
      return row;
    });
  }, [result]);

  /**
   * 雷达对比数据：五个维度各算法归一化到 0-1（1 = 该维度最优）。
   *
   * 归一化公式（防除零）：
   * - 成功率：本身已是 0-1（0-100% ÷ 100），直接使用，不做相对归一化；
   * - 其余「越低越好」的指标（平均用时 / 行驶距离 / 碰撞 / 重规划）：
   *     在参与算法中取该指标的 min/max，norm = (x - min) / (max - min)，
   *     再取反 score = 1 - norm（低者得 1，高者得 0）；
   * - 除零保护：当 max === min（所有算法该指标持平）时，score 直接记 1，
   *     不做除法，也不拉开虚假差距。
   */
  const radarData = useMemo<ChartRow[]>(() => {
    if (!result) return [];
    const summary = result.summary;
    if (summary.length === 0) return [];
    const lowerIsBetter = [
      { metric: "平均用时", get: (s: ExperimentSummaryOut) => s.mean_sim_time },
      { metric: "行驶距离", get: (s: ExperimentSummaryOut) => s.mean_distance },
      { metric: "低碰撞", get: (s: ExperimentSummaryOut) => s.mean_collisions },
      { metric: "低重规划", get: (s: ExperimentSummaryOut) => s.mean_replans },
    ];
    const data: ChartRow[] = [
      {
        name: "成功率",
        ...Object.fromEntries(summary.map((s) => [s.algorithm, Number(s.success_rate.toFixed(3))])),
      },
    ];
    for (const dim of lowerIsBetter) {
      const values = summary.map(dim.get);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const row: ChartRow = { name: dim.metric };
      for (const s of summary) {
        const x = dim.get(s);
        // max === min 时全员记 1（持平即同优），避免除零。
        row[s.algorithm] = Number(
          (max === min ? 1 : 1 - (x - min) / (max - min)).toFixed(3),
        );
      }
      data.push(row);
    }
    return data;
  }, [result]);

  const nameById = (id: string) =>
    algorithms.find((a) => a.id === id)?.name ?? algoDisplayName(id);

  return (
    <section className="border-t border-zinc-800 bg-zinc-950">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-zinc-100">
          批量实验对比
          <span className="text-xs font-normal text-zinc-500 group-open:hidden">
            点击展开
          </span>
        </summary>
        <div className="space-y-3 px-4 pb-4">
          {/* controls */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <label className="flex items-center gap-1.5 text-zinc-400">
              场景
              <select
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
                value={effectiveScenario}
                onChange={(e) => setScenarioId(e.target.value)}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">算法</span>
              {algorithms.map((algo) => (
                <label
                  key={algo.id}
                  className="flex cursor-pointer items-center gap-1 text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(algo.id)}
                    onChange={() => toggleAlgorithm(algo.id)}
                    className="accent-sky-500"
                  />
                  {algo.name}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-zinc-400">
              种子数
              <input
                type="number"
                min={1}
                max={20}
                value={seedCount}
                onChange={(e) => setSeedCount(e.target.value)}
                className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 font-mono text-sm text-zinc-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy || !effectiveScenario}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              {busy ? "运行中…" : "运行批量实验"}
            </button>
            {result && !busy && (
              <span className="text-zinc-500">
                {result.runs.length} 次运行 · 种子 {result.seeds[0]}–
                {result.seeds[result.seeds.length - 1]}
              </span>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-red-800 bg-red-950/60 px-3 py-1.5 text-xs text-red-300">
              {error}
            </p>
          )}

          {result && (
            <>
              {/* 每算法一张「大数字」汇总卡：身份色竖条 + 成功率大数字 +
                  runs 数 + 平均用时。成功率着色：≥80% 绿、<50% 红、之间琥珀。 */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {result.summary.map((s) => {
                  const rate = s.success_rate * 100;
                  const rateColor =
                    rate >= 80
                      ? "text-emerald-400"
                      : rate < 50
                        ? "text-red-400"
                        : "text-amber-400";
                  return (
                    <div
                      key={s.algorithm}
                      className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-1"
                        style={{ backgroundColor: algoColor(s.algorithm) }}
                      />
                      <div className="flex items-baseline justify-between gap-2 pl-2">
                        <span className="truncate text-xs font-medium text-zinc-300">
                          {nameById(s.algorithm)}
                        </span>
                        <span className="shrink-0 text-[10px] text-zinc-500">
                          {s.runs} runs
                        </span>
                      </div>
                      <p
                        className={`pl-2 font-mono text-2xl font-semibold tabular-nums ${rateColor}`}
                      >
                        {rate.toFixed(0)}%
                      </p>
                      <p className="pl-2 text-[10px] text-zinc-500">
                        平均用时 {s.mean_sim_time.toFixed(2)} s · 平均规划{" "}
                        {s.mean_planning_ms.toFixed(0)} ms
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* shared algorithm identity legend: color follows the algorithm,
                  never its rank — charts below reuse the same fills */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {result.algorithms.map((id) => (
                  <span
                    key={id}
                    className="flex items-center gap-1.5 text-xs text-zinc-300"
                  >
                    <span
                      className="inline-block h-2.5 w-5 rounded-sm"
                      style={{ backgroundColor: algoColor(id) }}
                    />
                    {nameById(id)}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricChart
                  chartId="success-rate"
                  title="成功率 (%)"
                  data={rows}
                  dataKey="successRate"
                  yMax={100}
                  valueFormatter={(v) => `${v}%`}
                />
                <MetricChart
                  chartId="sim-time"
                  title="平均用时 (s)"
                  data={rows}
                  dataKey="simTime"
                  valueFormatter={(v) => `${v} s`}
                />
                <MetricChart
                  chartId="distance"
                  title="平均行驶距离 (m)"
                  data={rows}
                  dataKey="distance"
                  valueFormatter={(v) => `${v} m`}
                />
                <MetricChart
                  chartId="collisions"
                  title="平均碰撞次数"
                  data={rows}
                  dataKey="collisions"
                  valueFormatter={(v) => `${v} 次`}
                />
                <MetricChart
                  chartId="planning-ms"
                  title="平均规划耗时 (ms)"
                  data={rows}
                  dataKey="planningMs"
                  valueFormatter={(v) => `${v} ms`}
                />
                <MetricChart
                  chartId="failures"
                  title="失败次数（碰撞/超时/被困）"
                  data={outcomeRows}
                  series={OUTCOME_SERIES}
                  valueFormatter={(v) => `${v} 次`}
                />
              </div>

              <RadarCompare
                data={radarData}
                algorithmIds={result.algorithms}
                nameById={nameById}
              />

              <p className="text-[11px] text-zinc-500">
                导出目录：<span className="font-mono text-zinc-400">{result.output_dir}</span>
                {" · "}文件：
                {Object.entries(result.files).map(([key, file]) => (
                  <span key={key} className="ml-2 font-mono text-zinc-400">
                    {file}
                  </span>
                ))}
              </p>
            </>
          )}
          {!result && !busy && (
            <p className="text-xs text-zinc-500">
              选择场景与算法后运行；同一场景、同一批种子下各算法共享相同的机器人限制、碰撞规则与目标条件。
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

/** One bar chart. Single-metric mode: one bar per algorithm filled with a
 * per-algorithm vertical gradient (defs linearGradient, id namespaced by
 * chartId so charts never collide). Series mode (failure counts): fixed
 * outcome colors with a legend. Thin rounded bars, recessive grid,
 * per-mark hover tooltip. */
function MetricChart({
  title,
  chartId,
  data,
  dataKey,
  series,
  yMax,
  valueFormatter,
}: {
  title: string;
  /** Unique id prefix for this chart's gradient defs. */
  chartId: string;
  data: ChartRow[];
  dataKey?: string;
  series?: readonly { key: string; label: string; color: string }[];
  yMax?: number;
  valueFormatter: (value: number) => string;
}) {
  if (series) {
    return (
      <div className="panel-card p-3">
        <h4 className="mb-1 truncate text-xs font-medium text-zinc-300">{title}</h4>
        <ResponsiveContainer width="100%" height={185}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              stroke="#3f3f46"
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 10 }}
              stroke="#3f3f46"
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => valueFormatter(Number(value))}
            />
            <Legend
              iconSize={10}
              wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  const gradientIds = new Set(
    data.map((row) => String(row.algoId ?? row.name)),
  );
  return (
    <div className="panel-card p-3">
      <h4 className="mb-1 truncate text-xs font-medium text-zinc-300">{title}</h4>
      <ResponsiveContainer width="100%" height={185}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {[...gradientIds].map((id) => (
              <linearGradient
                key={id}
                id={`bar-${chartId}-${id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={algoColor(id)} stopOpacity={0.95} />
                <stop offset="100%" stopColor={algoColor(id)} stopOpacity={0.55} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            stroke="#3f3f46"
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            stroke="#3f3f46"
            domain={yMax !== undefined ? [0, yMax] : undefined}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => valueFormatter(Number(value))}
          />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((row, i) => {
              const algoId = String(row.algoId ?? row.name);
              return (
                <Cell
                  key={i}
                  fill={`url(#bar-${chartId}-${algoId})`}
                  stroke={algoColor(algoId)}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 雷达对比图：五个维度（成功率 / 平均用时 / 行驶距离 / 低碰撞 / 低重规划）
 * 各算法归一化到 0-1（公式见 radarData 的注释）。每个算法一条多边形，
 * algoColor 描边 + 0.15 透明度填充；0-1 径向轴不显示刻度以免噪音。 */
function RadarCompare({
  data,
  algorithmIds,
  nameById,
}: {
  data: ChartRow[];
  algorithmIds: string[];
  nameById: (id: string) => string;
}) {
  if (data.length === 0) return null;
  return (
    <div className="panel-card p-3">
      <h4 className="mb-1 text-xs font-medium text-zinc-300">
        五维归一化对比（1 = 该维度最优，成功率直接取 0–1）
      </h4>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="#27272a" />
          <PolarAngleAxis
            dataKey="name"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          {algorithmIds.map((id) => (
            <Radar
              key={id}
              name={nameById(id)}
              dataKey={id}
              stroke={algoColor(id)}
              strokeWidth={2}
              fill={algoColor(id)}
              fillOpacity={0.15}
            />
          ))}
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => Number(value).toFixed(2)}
          />
          <Legend
            iconSize={10}
            wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
