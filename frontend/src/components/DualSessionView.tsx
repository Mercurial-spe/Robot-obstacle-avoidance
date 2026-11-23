import { Legend } from "./Legend";
import { MapCanvas } from "../canvas/MapCanvas";
import { SessionMetricsFooter } from "./SessionMetricsFooter";
import type { LayerId, LayerToggles } from "../hooks/useLayerToggles";
import type { SessionState } from "../hooks/useSession";
import type { AlgorithmInfo } from "../types";

/**
 * 并排对跑 — the classroom main view. Two sessions (algorithm A vs B) run on
 * the SAME scenario with the SAME seed; the shared control bar sends every
 * command to BOTH sessions, both maps share the viewport/scale (PX_PER_M),
 * the layer toggles and the legend, and each map carries its own status chip
 * + metrics footer. Reset re-creates both sessions (App-level), restoring
 * initial conditions and discarding scene edits.
 */
export function DualSessionView({
  sessionA,
  sessionB,
  algorithms,
  algorithmA,
  algorithmB,
  layers,
  toggleLayer,
  onCreate,
  busy,
}: {
  sessionA: SessionState;
  sessionB: SessionState;
  algorithms: AlgorithmInfo[];
  algorithmA: string;
  algorithmB: string;
  layers: LayerToggles;
  toggleLayer: (id: LayerId) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const nameOf = (id: string) => algorithms.find((a) => a.id === id)?.name ?? id;
  const hasAnySession = sessionA.snapshot !== null || sessionB.snapshot !== null;
  // Shared timeline: both sessions step on the same commands, so A's clock is
  // the shared readout (falls back to B before A exists).
  const simTime =
    sessionA.snapshot?.sim_time ?? sessionB.snapshot?.sim_time ?? null;

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      {/* shared readout + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-slate-300">
            仿真时间
            <span className="ml-2 font-mono text-slate-100">
              {simTime === null ? "—" : `${simTime.toFixed(2)} s`}
            </span>
          </span>
          <span className="text-xs text-slate-500">
            同一场景 · 同一种子 · 双方同步运行
          </span>
        </div>
        <div className="flex items-center gap-3">
          {hasAnySession && <Legend layers={layers} onToggle={toggleLayer} />}
          {!hasAnySession && (
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              新建会话（A + B）
            </button>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4">
        <MapSide
          title={`A · ${nameOf(algorithmA)}`}
          session={sessionA}
          layers={layers}
        />
        <MapSide
          title={`B · ${nameOf(algorithmB)}`}
          session={sessionB}
          layers={layers}
        />
      </div>
    </div>
  );
}

function MapSide({
  title,
  session,
  layers,
}: {
  title: string;
  session: SessionState;
  layers: LayerToggles;
}) {
  return (
    <section className="flex min-w-0 flex-col">
      <h2 className="mb-1.5 text-sm font-semibold text-slate-300">{title}</h2>
      <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-md border border-slate-800 p-2">
        <MapCanvas snapshot={session.snapshot} planInfo={session.planInfo} layers={layers} />
      </div>
      <SessionMetricsFooter
        snapshot={session.snapshot}
        connected={session.connected}
      />
      {session.error && (
        <p className="mt-2 rounded-md border border-red-800 bg-red-950/60 px-3 py-1.5 text-xs text-red-300">
          {session.error}
        </p>
      )}
    </section>
  );
}
