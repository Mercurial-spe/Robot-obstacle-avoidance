import { Columns2, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Legend } from "./Legend";
import { MapCanvas } from "../canvas/MapCanvas";
import { algoColor } from "../canvas/layerStyles";
import { SessionMetricsFooter } from "./SessionMetricsFooter";
import { TelemetryStrip } from "./TelemetryStrip";
import { sessionChip } from "./status";
import type { LayerId, LayerToggles } from "../hooks/useLayerToggles";
import type { SessionState } from "../hooks/useSession";
import type { AlgorithmInfo } from "../types";

/**
 * 并排对跑 — the classroom main view. Two sessions (algorithm A vs B) run on
 * the SAME scenario with the SAME seed; the shared control bar sends every
 * command to BOTH sessions, both maps share the viewport/scale (PX_PER_M),
 * the layer toggles and the legend, and each map carries its own algorithm
 * card (identity dot + live metric chips + status badge) above the map plus
 * a metrics footer. Reset re-creates both sessions (App-level), restoring
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
      {hasAnySession && (
        /* shared readout + legend */
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-zinc-300">
              仿真时间
              <span className="ml-2 font-mono text-zinc-100">
                {simTime === null ? "—" : `${simTime.toFixed(2)} s`}
              </span>
            </span>
            <span className="text-xs text-zinc-500">
              同一场景 · 同一种子 · 双方同步运行
            </span>
          </div>
          <Legend layers={layers} onToggle={toggleLayer} />
        </div>
      )}

      {!hasAnySession ? (
        /* 空态引导卡：替代两列地图的各自空态 */
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-10 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-sky-500">
              <Columns2 size={22} />
            </span>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-zinc-200">
                并排对比尚无会话
              </p>
              <p className="text-xs leading-relaxed text-zinc-500">
                选择场景与算法，创建 A/B 两个会话并排对比。
                <br />
                双方共享同一场景与种子，逐步对跑。
              </p>
            </div>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="mt-1 flex items-center gap-1.5 rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
            >
              <Plus size={16} />
              新建会话
            </button>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-4">
          <MapSide
            tag="A"
            name={nameOf(algorithmA)}
            accent={algoColor(algorithmA)}
            session={sessionA}
            layers={layers}
          />
          <MapSide
            tag="B"
            name={nameOf(algorithmB)}
            accent={algoColor(algorithmB)}
            session={sessionB}
            layers={layers}
          />
        </div>
      )}
    </div>
  );
}

function MapSide({
  tag,
  name,
  accent,
  session,
  layers,
}: {
  /** A/B rank tag (identity color follows the algorithm, not the rank). */
  tag: string;
  name: string;
  /** Algorithm identity color from algoColor(). */
  accent: string;
  session: SessionState;
  layers: LayerToggles;
}) {
  return (
    <section className="flex min-w-0 flex-col">
      <AlgoCard tag={tag} name={name} accent={accent} session={session} />
      <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-md border border-zinc-800 p-2">
        <MapCanvas snapshot={session.snapshot} planInfo={session.planInfo} layers={layers} />
      </div>
      <TelemetryStrip snapshot={session.snapshot} />
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

/** 算法卡 — the header bar above each map: identity dot + rank tag +
 * algorithm name on the left, live metric chips + status badge on the right. */
function AlgoCard({
  tag,
  name,
  accent,
  session,
}: {
  tag: string;
  name: string;
  accent: string;
  session: SessionState;
}) {
  const metrics = session.snapshot?.metrics ?? null;
  return (
    <div className="mb-2 flex items-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 transition duration-150 ease-out hover:-translate-y-px hover:border-zinc-600">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-300">
        {tag}
      </span>
      <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-100">
        {name}
      </h2>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <MetricChip
          label="用时"
          value={metrics ? `${metrics.sim_time.toFixed(1)}s` : "—"}
        />
        <MetricChip
          label="距离"
          value={metrics ? `${metrics.distance_traveled.toFixed(1)}m` : "—"}
        />
        <MetricChip
          label="碰撞"
          value={metrics ? String(metrics.collision_count) : "—"}
        />
        <StatusBadge session={session} />
      </div>
    </div>
  );
}

/** 等宽 live metric chip (用时 / 距离 / 碰撞). */
function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1 rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-0.5 text-[11px]">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200">{value}</span>
    </span>
  );
}

/** Status chip with a short cross-fade whenever the session status changes. */
function StatusBadge({ session }: { session: SessionState }) {
  const snapshot = session.snapshot;
  const chip = snapshot
    ? sessionChip(snapshot.status, snapshot.run_status)
    : { label: "待创建", className: "bg-zinc-700 text-zinc-200" };
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={chip.label}
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${chip.className}`}
      >
        {chip.label}
      </motion.span>
    </AnimatePresence>
  );
}
