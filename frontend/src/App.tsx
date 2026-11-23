import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ControlBar } from "./components/ControlBar";
import { DualSessionView } from "./components/DualSessionView";
import { ExperimentPanel } from "./components/ExperimentPanel";
import { SingleSessionView } from "./components/SingleSessionView";
import { useLayerToggles } from "./hooks/useLayerToggles";
import { useSession } from "./hooks/useSession";
import { apiAlgorithms, apiScenarios } from "./api/client";
import type { AlgorithmInfo, CommandAction, ScenarioSummary, SessionStatus } from "./types";

const SAFETY_MARGIN_MIN = 0;
const SAFETY_MARGIN_MAX = 2;
const SAFETY_MARGIN_DEFAULT = 0.15;
const V_MAX_MIN = 0.1;
const V_MAX_MAX = 5;

/** 并排对跑 is the classroom default (spec §5). */
const VIEWS = [
  { id: "dual", label: "并排对跑" },
  { id: "single", label: "单车详情" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function App() {
  const [view, setView] = useState<ViewId>("dual");
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([]);
  // Dual view: two independently selectable algorithms; single view: its own.
  const [algorithmA, setAlgorithmA] = useState("astar");
  const [algorithmB, setAlgorithmB] = useState("apf");
  const [algorithmSingle, setAlgorithmSingle] = useState("astar");
  // Fairness overrides, kept as text so the inputs stay editable while typing.
  const [safetyMargin, setSafetyMargin] = useState("0.15");
  const [vMax, setVMax] = useState("");
  // Shared seed for the paired sessions (same scenario + same seed).
  const [seed, setSeed] = useState("1");
  const { layers, toggleLayer } = useLayerToggles();
  const sessionA = useSession();
  const sessionB = useSession();
  const sessionSingle = useSession();

  useEffect(() => {
    apiScenarios()
      .then((list) => {
        setScenarios(list);
        if (list.length > 0) setScenarioId(list[0].id);
      })
      .catch((err) => console.error("failed to load scenarios", err));
    apiAlgorithms()
      .then((list) => {
        setAlgorithms(list);
        // Keep the current selections only if the backend actually offers them.
        if (list.length > 0) {
          if (!list.some((algo) => algo.id === algorithmA)) setAlgorithmA(list[0].id);
          if (!list.some((algo) => algo.id === algorithmB))
            setAlgorithmB(list[1]?.id ?? list[0].id);
          if (!list.some((algo) => algo.id === algorithmSingle))
            setAlgorithmSingle(list[0].id);
        }
      })
      .catch((err) => console.error("failed to load algorithms", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseParams = useCallback(() => {
    const parsedMargin = parseFloat(safetyMargin);
    const trimmedVMax = vMax.trim();
    const parsedVMax = trimmedVMax === "" ? NaN : parseFloat(trimmedVMax);
    const parsedSeed = parseInt(seed, 10);
    return {
      safety_margin: Number.isFinite(parsedMargin)
        ? clamp(parsedMargin, SAFETY_MARGIN_MIN, SAFETY_MARGIN_MAX)
        : SAFETY_MARGIN_DEFAULT,
      v_max: Number.isFinite(parsedVMax)
        ? clamp(parsedVMax, V_MAX_MIN, V_MAX_MAX)
        : null,
      seed: Number.isFinite(parsedSeed) ? parsedSeed : null,
    };
  }, [safetyMargin, vMax, seed]);

  /** Paired creation: BOTH sessions get the same scenario, seed and fairness
   * overrides — this is also what 重置 does in the dual view (fresh sessions
   * restore initial conditions and discard scene edits). */
  const handleCreateDual = useCallback(() => {
    const params = parseParams();
    void sessionA.createSession(scenarioId, algorithmA, params);
    void sessionB.createSession(scenarioId, algorithmB, params);
  }, [sessionA, sessionB, scenarioId, algorithmA, algorithmB, parseParams]);

  const handleCreateSingle = useCallback(() => {
    const params = parseParams();
    void sessionSingle.createSession(scenarioId, algorithmSingle, params);
  }, [sessionSingle, scenarioId, algorithmSingle, parseParams]);

  /** Shared control bar: every command goes to BOTH sessions. 重置 re-creates
   * both fresh (backend reset semantics restore the preset scene anyway). */
  const handleDualCommand = useCallback(
    (action: CommandAction) => {
      if (action === "reset") {
        handleCreateDual();
        return;
      }
      void sessionA.sendCommand(action);
      void sessionB.sendCommand(action);
    },
    [sessionA, sessionB, handleCreateDual],
  );

  const handleSingleCommand = useCallback(
    (action: CommandAction) => {
      void sessionSingle.sendCommand(action);
    },
    [sessionSingle],
  );

  // Aggregated status for the shared control bar in dual mode.
  const statusA = sessionA.snapshot?.status ?? null;
  const statusB = sessionB.snapshot?.status ?? null;
  const dualStatus: SessionStatus | null =
    statusA === null && statusB === null
      ? null
      : statusA === "running" || statusB === "running"
        ? "running"
        : statusA === "error" || statusB === "error"
          ? "error"
          : statusA === "paused" || statusB === "paused"
            ? "paused"
            : "finished";
  const dualBusy = sessionA.busy || sessionB.busy;

  const onCreate = view === "dual" ? handleCreateDual : handleCreateSingle;
  const onCommand =
    view === "dual" ? handleDualCommand : handleSingleCommand;
  const controlStatus = view === "dual" ? dualStatus : sessionSingle.snapshot?.status ?? null;
  const controlBusy = view === "dual" ? dualBusy : sessionSingle.busy;

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold tracking-wide">
            Robot Navigation Workbench
            <span className="ml-3 text-xs font-normal text-slate-500">
              实验一 · 机器人避障
            </span>
          </h1>
          <ViewSwitcher view={view} onChange={setView} />
        </div>
        <ControlBar
          scenarios={scenarios}
          algorithms={algorithms}
          scenarioId={scenarioId}
          algorithm={view === "dual" ? algorithmA : algorithmSingle}
          algorithmB={view === "dual" ? algorithmB : undefined}
          seed={view === "dual" ? seed : undefined}
          safetyMargin={safetyMargin}
          vMax={vMax}
          status={controlStatus}
          busy={controlBusy}
          dual={view === "dual"}
          onScenarioChange={setScenarioId}
          onAlgorithmChange={view === "dual" ? setAlgorithmA : setAlgorithmSingle}
          onAlgorithmBChange={setAlgorithmB}
          onSeedChange={setSeed}
          onSafetyMarginChange={setSafetyMargin}
          onVMaxChange={setVMax}
          onCreate={onCreate}
          onCommand={onCommand}
        />
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            {view === "dual" ? (
              <motion.div
                key="dual"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="min-h-full"
              >
                <DualSessionView
                  sessionA={sessionA}
                  sessionB={sessionB}
                  algorithms={algorithms}
                  algorithmA={algorithmA}
                  algorithmB={algorithmB}
                  layers={layers}
                  toggleLayer={toggleLayer}
                  onCreate={handleCreateDual}
                  busy={dualBusy}
                />
              </motion.div>
            ) : (
              <motion.div
                key="single"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="min-h-full"
              >
                <SingleSessionView
                  session={sessionSingle}
                  layers={layers}
                  toggleLayer={toggleLayer}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <ExperimentPanel scenarios={scenarios} algorithms={algorithms} />
      </main>
    </div>
  );
}

/** 并排对跑 / 单车详情 switcher: subtle shared-layout pill (200 ms). */
function ViewSwitcher({
  view,
  onChange,
}: {
  view: ViewId;
  onChange: (view: ViewId) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
      {VIEWS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onChange(entry.id)}
          className={`relative rounded px-3 py-1 text-xs font-medium transition-colors ${
            view === entry.id ? "text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {view === entry.id && (
            <motion.span
              layoutId="view-pill"
              className="absolute inset-0 rounded bg-sky-600"
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          )}
          <span className="relative z-10">{entry.label}</span>
        </button>
      ))}
    </div>
  );
}
