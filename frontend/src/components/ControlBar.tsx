import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import type { ReactNode } from "react";
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

/**
 * Top-bar parameter area, organized into visually bounded groups —
 * 场景 / 算法 / 公平性参数 / 运行控制 — each with a tiny eyebrow label and a
 * vertical divider between neighbors. Compact by design; wraps on narrow
 * viewports without breaking the group structure.
 */
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ParamGroup label="场景">
        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
          value={scenarioId}
          onChange={(e) => onScenarioChange(e.target.value)}
        >
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </ParamGroup>

      <GroupDivider />

      <ParamGroup label="算法">
        <AlgorithmSelect
          algorithms={algorithms}
          value={algorithm}
          onChange={onAlgorithmChange}
          label={dual ? "A" : undefined}
        />
        {dual && algorithmB !== undefined && onAlgorithmBChange && (
          <AlgorithmSelect
            algorithms={algorithms}
            value={algorithmB}
            onChange={onAlgorithmBChange}
            label="B"
          />
        )}
      </ParamGroup>

      <GroupDivider />

      <ParamGroup label="公平性参数">
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
      </ParamGroup>

      <GroupDivider />

      <ParamGroup label="运行控制">
        <button
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          onClick={onCreate}
          disabled={busy}
        >
          新建会话
        </button>
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
      </ParamGroup>
    </div>
  );
}

/** One bounded group: tiny eyebrow label stacked over the controls. */
function ParamGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Vertical separator between parameter groups. */
function GroupDivider() {
  return <div aria-hidden="true" className="h-9 w-px self-center bg-zinc-800" />;
}

/** Algorithm registry select shared by both views. The inner label is the
 * A/B rank tag in dual mode; the group label already says 算法. */
function AlgorithmSelect({
  algorithms,
  value,
  onChange,
  label,
}: {
  algorithms: AlgorithmInfo[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
      {label && <span className="font-mono">{label}</span>}
      <select
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
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
    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
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
          className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 pr-7 font-mono text-sm text-zinc-200 placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
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
  children: ReactNode;
}) {
  return (
    <button
      className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
