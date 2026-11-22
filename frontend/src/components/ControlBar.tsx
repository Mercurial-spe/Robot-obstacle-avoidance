import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import type { CommandAction, SessionStatus, ScenarioSummary } from "../types";

interface ControlBarProps {
  scenarios: ScenarioSummary[];
  scenarioId: string;
  algorithm: string;
  status: SessionStatus | null;
  busy: boolean;
  onScenarioChange: (id: string) => void;
  onAlgorithmChange: (id: string) => void;
  onCreate: () => void;
  onCommand: (action: CommandAction) => void;
}

const ALGORITHMS = [
  { id: "astar", name: "A*" },
  { id: "apf", name: "APF (P1)" },
  { id: "hybrid", name: "Hybrid (P2)" },
];

export function ControlBar({
  scenarios,
  scenarioId,
  algorithm,
  status,
  busy,
  onScenarioChange,
  onAlgorithmChange,
  onCreate,
  onCommand,
}: ControlBarProps) {
  const hasSession = status !== null;
  const runFinished = status === "finished" || status === "error";
  return (
    <div className="flex items-center gap-3">
      <select
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
        value={scenarioId}
        onChange={(e) => onScenarioChange(e.target.value)}
      >
        {scenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.name}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
        value={algorithm}
        onChange={(e) => onAlgorithmChange(e.target.value)}
      >
        {ALGORITHMS.map((algo) => (
          <option key={algo.id} value={algo.id} disabled={algo.id !== "astar"}>
            {algo.name}
          </option>
        ))}
      </select>
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
