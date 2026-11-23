import { Legend } from "./Legend";
import { EventsPanel } from "./EventsPanel";
import { SceneEditorPanel } from "./SceneEditorPanel";
import { StatusPanel } from "./StatusPanel";
import { MapCanvas } from "../canvas/MapCanvas";
import { useEventLog } from "../hooks/useEventLog";
import type { LayerId, LayerToggles } from "../hooks/useLayerToggles";
import { useSceneEditor } from "../hooks/useSceneEditor";
import type { SessionState } from "../hooks/useSession";

type ToggleLayer = (id: LayerId) => void;

/**
 * 单车详情 — one session rendered large with all layers, the 事件/状态 panel
 * (rolling event log + planning stats) and scene editing (drag obstacles /
 * start / goal, add & delete, apply via PUT /scene). Editing is only wired
 * while the session is idle/paused; a running session renders read-only.
 */
export function SingleSessionView({
  session,
  layers,
  toggleLayer,
}: {
  session: SessionState;
  layers: LayerToggles;
  toggleLayer: ToggleLayer;
}) {
  const editor = useSceneEditor(session.snapshot, session.syncTick);
  const events = useEventLog(session.snapshot);
  const hasSession = session.snapshot !== null;

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
            <span className="text-xs text-slate-500">
              {editor.canEdit
                ? "可编辑场景：拖拽障碍物 / 起点 / 终点"
                : "运行中 — 地图只读"}
            </span>
          </div>
        )}
        <div className="flex min-h-[420px] w-full flex-1 items-center justify-center rounded-md border border-slate-800 p-2">
          <MapCanvas
            snapshot={session.snapshot}
            planInfo={session.planInfo}
            layers={layers}
            interaction={interaction}
          />
        </div>
        {session.error && (
          <p className="mt-2 w-full rounded-md border border-red-800 bg-red-950/60 px-3 py-1.5 text-xs text-red-300">
            {session.error}
          </p>
        )}
      </section>
      <aside className="w-[22rem] shrink-0 space-y-3 overflow-y-auto border-l border-slate-800 p-4">
        <StatusPanel
          snapshot={session.snapshot}
          connected={session.connected}
          planInfo={session.planInfo}
        />
        <EventsPanel entries={events} />
        {session.snapshot ? (
          <SceneEditorPanel session={session} editor={editor} />
        ) : (
          <p className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-500">
            创建会话后可在此编辑场景（拖拽、增删障碍物、改起终点）。
          </p>
        )}
      </aside>
    </div>
  );
}
