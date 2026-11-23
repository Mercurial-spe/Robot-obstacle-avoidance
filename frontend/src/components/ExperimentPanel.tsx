import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

interface ChartRow {
  name: string;
  /** Wire id of the algorithm this row aggregates (for stable colors). */
  algoId?: string;
  [key: string]: unknown;
}

/**
 * 批量实验 dashboard (bottom panel, both views): preset scenario + algorithm
 * multiselect (default astar+apf) + seed count (seeds auto-generated 1..N) →
 * POST /api/experiments/batch → Recharts bar charts. Failed outcomes are
 * shown as-is (collided/timeout/stuck chart) — never hidden or converted.
 * The last result is cached in state until the next run.
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricChart
                  title="成功率 (%)"
                  data={rows}
                  dataKey="successRate"
                  yMax={100}
                  valueFormatter={(v) => `${v}%`}
                />
                <MetricChart
                  title="平均用时 (s)"
                  data={rows}
                  dataKey="simTime"
                  valueFormatter={(v) => `${v} s`}
                />
                <MetricChart
                  title="平均行驶距离 (m)"
                  data={rows}
                  dataKey="distance"
                  valueFormatter={(v) => `${v} m`}
                />
                <MetricChart
                  title="平均碰撞次数"
                  data={rows}
                  dataKey="collisions"
                  valueFormatter={(v) => `${v} 次`}
                />
                <MetricChart
                  title="失败次数（碰撞/超时/被困）"
                  data={outcomeRows}
                  series={OUTCOME_SERIES}
                  valueFormatter={(v) => `${v} 次`}
                />
              </div>

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

/** One bar chart. Single-metric mode: one bar per algorithm colored by
 * ALGO_COLORS (identity follows the algorithm). Series mode (failure counts):
 * fixed outcome colors with a legend. Thin rounded bars, recessive grid,
 * per-mark hover tooltip. */
function MetricChart({
  title,
  data,
  dataKey,
  series,
  yMax,
  valueFormatter,
}: {
  title: string;
  data: ChartRow[];
  dataKey?: string;
  series?: readonly { key: string; label: string; color: string }[];
  yMax?: number;
  valueFormatter: (value: number) => string;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
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
            domain={yMax !== undefined ? [0, yMax] : undefined}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 6,
              fontSize: 12,
              color: "#e2e8f0",
            }}
            formatter={(value) => valueFormatter(Number(value))}
          />
          {series ? (
            <>
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
            </>
          ) : (
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((row, i) => (
                <Cell key={i} fill={algoColor(row.algoId ?? row.name)} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
