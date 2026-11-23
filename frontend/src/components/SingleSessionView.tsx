import { AnimatePresence, motion } from "motion/react";
import { Legend } from "./Legend";
import { EventsPanel } from "./EventsPanel";
import { SceneEditorPanel } from "./SceneEditorPanel";
import { StatusPanel } from "./StatusPanel";
import { TelemetryStrip } from "./TelemetryStrip";
import { sessionChip } from "./status";
import { MapCanvas } from "../canvas/MapCanvas";
import { algoColor } from "../canvas/layerStyles";
import { useEventLog } from "../hooks/useEventLog";
import type { LayerId, LayerToggles } from "../hooks/useLayerToggles";
import { useSceneEditor } from "../hooks/useSceneEditor";
import type { SessionState } from "../hooks/useSession";
import type { AlgorithmInfo } from "../types";
import type { ReactNode } from "react";

type ToggleLayer = (id: LayerId) => void;

/**
 * 单车详情 — one session rendered large with all layers, the 事件/状态 panel
 * (rolling event log + planning stats) and scene editing (drag obstacles /
 * start / goal, add & delete, apply via PUT /scene). Editing is only wired
 * while the session is idle/paused; a running session renders read-only.
 * The map sits on a subtle radial gradient so the arena reads as the focal
 * point; the sidebar opens with a compact session summary header (algorithm
 * identity + status badge + WebSocket state) followed by eyebrow-labelled
 * panel sections.
 */
export function SingleSessionView({
  session,
  algorithms,
  algorithmId,
  layers,
  toggleLayer,
}: {
  session: SessionState;
  /** Algorithm registry, for resolving the selected id to a display name. */
  algorithms: AlgorithmInfo[];
  /** Currently selected algorithm in the control bar (this session's planner). */
  algorithmId: string;
  layers: LayerToggles;
  toggleLayer: ToggleLayer;
}) {
  const editor = useSceneEditor(session.snapshot, session.syncTick);
  const events = useEventLog(session.snapshot);
  const hasSession = session.snapshot !== null;

  const algoName =
    algorithms.find((a) => a.id === algorithmId)?.name ?? algorithmId;
  const accent = algoColor(algorithmId);

  const interaction =
    session.snapshot && editor.canEdit && editor.draft
      ? {
          obstacles: editor.draft.obstacles,
          editable: true,
          selectedObstacle: editor.selected,
          onSelectObstacle: editor.setSelected,
          onObstacleDragEnd: editor.moveObstacle,
          onStartDragEnd: editor.moveStart,
          onGoalDragEnd: editor.moveGoal,
          onArenaClick: editor.onArenaClick,
        }
      : undefined;

  return (
    <div className="flex min-h-full">
      <section className="flex min-w-0 flex-1 flex-col items-center p-4">
        {hasSession && (
          <div className="mb-2 flex w-full items-center justify-between">
            <Legend layers={layers} onToggle={toggleLayer} />
            <span className="text-xs text-zinc-500">
              {editor.canEdit
                ? "可编辑场景：拖拽障碍物 / 起点 / 终点"
                : "运行中 — 地图只读"}
            </span>
          </div>
        )}
        <div
          className="flex min-h-[420px] w-full flex-1 items-center justify-center rounded-md border border-zinc-800 p-2"
          style={{
            backgroundImage:
              "radial-gradient(120% 120% at 50% 40%, #18181b 0%, #09090b 100%)",
          }}
        >
          <MapCanvas
            snapshot={session.snapshot}
            planInfo={session.planInfo}
            layers={layers}
            interaction={interaction}
          />
        </div>
        <div className="w-full">
          <TelemetryStrip snapshot={session.snapshot} />
        </div>
        {session.error && (
          <p className="mt-2 w-full rounded-md border border-red-800 bg-red-950/60 px-3 py-1.5 text-xs text-red-300">
            {session.error}
          </p>
        )}
      </section>
      <aside className="flex w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-zinc-800 bg-zinc-950/60 p-4">
        <SessionSummaryHeader
          session={session}
          algoName={algoName}
          accent={accent}
        />
        <div className="min-w-0 space-y-3">
          <SidebarSection label="实时状态">
            <StatusPanel
              snapshot={session.snapshot}
              connected={session.connected}
              planInfo={session.planInfo}
            />
          </SidebarSection>
          <SidebarSection label="事件日志">
            <EventsPanel entries={events} />
          </SidebarSection>
          <SidebarSection label="场景编辑">
            {session.snapshot ? (
              <SceneEditorPanel session={session} editor={editor} />
            ) : (
              <p className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">
                创建会话后可在此编辑场景（拖拽、增删障碍物、改起终点）。
              </p>
            )}
          </SidebarSection>
        </div>
      </aside>
    </div>
  );
}

/** Eyebrow-labelled sidebar section — gives the panel stack a navigation feel
 * without touching the panels themselves. */
function SidebarSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      {children}
    </section>
  );
}

/** Compact session summary at the top of the sidebar: algorithm identity dot
 * + name, status badge (cross-fades on change) and the WebSocket state. */
function SessionSummaryHeader({
  session,
  algoName,
  accent,
}: {
  session: SessionState;
  algoName: string;
  accent: string;
}) {
  const snapshot = session.snapshot;
  const chip = snapshot
    ? sessionChip(snapshot.status, snapshot.run_status)
    : { label: "未创建", className: "bg-zinc-700 text-zinc-200" };
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
          {algoName}
        </span>
        <span className="ml-auto shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={chip.label}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${chip.className}`}
            >
              {chip.label}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-500">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            session.connected ? "bg-emerald-500" : "bg-zinc-600"
          }`}
        />
        WebSocket {session.connected ? "已连接" : "未连接"}
        {snapshot && (
          <span className="ml-auto font-mono text-zinc-600">
            #{snapshot.session_id.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
}
