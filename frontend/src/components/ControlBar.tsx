import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import type {
  AlgorithmInfo,
  CommandAction,
  ScenarioSummary,
  SessionStatus,
} from "../types";

interface ControlBarProps {
  scenarios: ScenarioSummary[];
  /** Live algorithm registry from GET /api/algorithms. */
  algorithms: AlgorithmInfo[];
  scenarioId: string;
  algorithm: string;
  /** Fairness overrides sent with session creation. */
  safetyMargin: string;
  vMax: string;
  status: SessionStatus | null;
  busy: boolean;
  /** Side-by-side mode: a second algorithm select + shared seed field. */
  dual?: boolean;
  algorithmB?: string;
  seed?: string;
  onScenarioChange: (id: string) => void;
  onAlgorithmChange: (id: string) => void;
  onSafetyMarginChange: (value: string) => void;
  onVMaxChange: (value: string) => void;
  onAlgorithmBChange?: (id: string) => void;
  onSeedChange?: (value: string) => void;
  onCreate: () => void;
  onCommand: (action: CommandAction) => void;
}

export function ControlBar({
  scenarios,
  algorithms,
  scenarioId,
  algorithm,
  safetyMargin,
  vMax,
  status,
  busy,
  dual = false,
  algorithmB,
  seed,
  onScenarioChange,
  onAlgorithmChange,
  onSafetyMarginChange,
  onVMaxChange,
  onAlgorithmBChange,
  onSeedChange,
  onCreate,
  onCommand,
}: ControlBarProps) {
  const hasSession = status !== null;
  const runFinished = status === "finished" || status === "error";
  return (
    <div className="flex items-center gap-3">
      <select
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-slate-500"
        value={scenarioId}
        onChange={(e) => onScenarioChange(e.target.value)}
      >
        {scenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.name}
          </option>
        ))}
      </select>
      <AlgorithmSelect
        algorithms={algorithms}
        value={algorithm}
        onChange={onAlgorithmChange}
        label={dual ? "算法 A" : "算法"}
      />
      {dual && algorithmB !== undefined && onAlgorithmBChange && (
        <AlgorithmSelect
          algorithms={algorithms}
          value={algorithmB}
          onChange={onAlgorithmBChange}
          label="算法 B"
        />
      )}
      {dual && seed !== undefined && onSeedChange && (
        <NumberField
          label="种子"
          unit=""
          value={seed}
          onChange={onSeedChange}
          min={0}
          max={999999}
          step={1}
        />
      )}
      <NumberField
        label="安全边距"
        unit="m"
        value={safetyMargin}
        onChange={onSafetyMarginChange}
        min={0}
        max={2}
        step={0.05}
      />
      <NumberField
        label="速度上限"
        unit="m/s"
        value={vMax}
        onChange={onVMaxChange}
        min={0.1}
        max={5}
        step={0.1}
        placeholder="默认"
      />
      <button
        className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        onClick={onCreate}
        disabled={busy}
      >
        新建会话
      </button>
      <div className="mx-2 h-6 w-px bg-slate-700" />
      <IconButton
        label="开始"
        disabled={!hasSession || busy || status === "running" || runFinished}
        onClick={() => onCommand("start")}
      >
        <Play size={16} />
      </IconButton>
      <IconButton
        label="暂停"
        disabled={!hasSession || busy || status !== "running"}
        onClick={() => onCommand("pause")}
      >
        <Pause size={16} />
      </IconButton>
      <IconButton
        label="单步"
        disabled={!hasSession || busy || status === "running"}
        onClick={() => onCommand("step")}
      >
        <StepForward size={16} />
      </IconButton>
      <IconButton
        label="重置"
        disabled={!hasSession || busy}
        onClick={() => onCommand("reset")}
      >
        <RotateCcw size={16} />
      </IconButton>
    </div>
  );
}

/** Algorithm registry select shared by both views. */
function AlgorithmSelect({
  algorithms,
  value,
  onChange,
  label,
}: {
  algorithms: AlgorithmInfo[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      {label}
      <select
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 transition-colors hover:border-slate-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {algorithms.map((algo) => (
          <option key={algo.id} value={algo.id}>
            {algo.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Numeric parameter input with sane bounds; empty means "backend default". */
function NumberField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      {label}
      <span className="relative">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 pr-7 font-mono text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
          {unit}
        </span>
      </span>
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
