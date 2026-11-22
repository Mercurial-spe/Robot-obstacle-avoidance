import { useCallback, useEffect, useState } from "react";
import { MapCanvas } from "./canvas/MapCanvas";
import { ControlBar } from "./components/ControlBar";
import { StatusPanel } from "./components/StatusPanel";
import { useSession } from "./hooks/useSession";
import { apiScenarios } from "./api/client";
import type { ScenarioSummary } from "./types";

export default function App() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [algorithm, setAlgorithm] = useState("astar");
  const session = useSession();

  useEffect(() => {
    apiScenarios()
      .then((list) => {
        setScenarios(list);
        if (list.length > 0) setScenarioId(list[0].id);
      })
      .catch((err) => console.error("failed to load scenarios", err));
  }, []);

  const handleCreate = useCallback(() => {
    void session.createSession(scenarioId, algorithm);
  }, [session, scenarioId, algorithm]);

  const handleCommand = useCallback(
    (action: Parameters<typeof session.sendCommand>[0]) => {
      void session.sendCommand(action);
    },
    [session],
  );

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <h1 className="text-base font-semibold tracking-wide">
          Robot Navigation Workbench
          <span className="ml-3 text-xs font-normal text-slate-500">
            实验一 · 机器人避障 · P0
          </span>
        </h1>
        <ControlBar
          scenarios={scenarios}
          scenarioId={scenarioId}
          algorithm={algorithm}
          status={session.snapshot?.status ?? null}
          busy={session.busy}
          onScenarioChange={setScenarioId}
          onAlgorithmChange={setAlgorithm}
          onCreate={handleCreate}
          onCommand={handleCommand}
        />
      </header>
      <main className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 items-center justify-center p-6">
          <MapCanvas snapshot={session.snapshot} />
        </section>
        <aside className="w-80 shrink-0 border-l border-slate-800 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-400">实时状态</h2>
          {session.error && (
            <p className="mb-3 rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-xs text-red-300">
              {session.error}
            </p>
          )}
          <StatusPanel snapshot={session.snapshot} connected={session.connected} />
        </aside>
      </main>
    </div>
  );
}
