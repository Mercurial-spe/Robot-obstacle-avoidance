import { useState } from "react";
import { ApiRequestError } from "../api/client";
import type { useSceneEditor } from "../hooks/useSceneEditor";
import type { SessionState } from "../hooks/useSession";

type SceneEditor = ReturnType<typeof useSceneEditor>;

/** Scene editing controls for the single-session view. Edits accumulate in
 * the draft and leave the frontend only via 「应用场景修改」 → PUT scene;
 * backend errors (409 scene_locked, 400 invalid_scene with the planner's
 * reason) surface inline — the UI never freezes on an invalid map. */
export function SceneEditorPanel({
  session,
  editor,
}: {
  session: SessionState;
  editor: SceneEditor;
}) {
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const canEdit = editor.canEdit && !session.busy;

  const handleApply = async () => {
    const body = editor.buildSceneUpdate();
    if (!body) return;
    setApplying(true);
    setApplyError(null);
    try {
      await session.updateScene(body);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setApplyError(
          err.code === "scene_locked"
            ? "会话正在运行，暂停后再应用场景修改"
            : `场景被拒绝：${err.message}`,
        );
      } else {
        setApplyError(String(err));
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400">场景编辑</h3>
        {editor.dirty && (
          <span className="rounded bg-amber-600/20 px-1.5 py-0.5 text-[10px] text-amber-400">
            有未应用的修改
          </span>
        )}
      </div>

      {applyError && (
        <p className="mb-2 rounded-md border border-red-800 bg-red-950/60 px-2.5 py-1.5 text-xs text-red-300">
          {applyError}
        </p>
      )}

      {/* add obstacle */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <select
          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200"
          value={editor.addConfig.shape}
          onChange={(e) =>
            editor.setAddConfig({
              ...editor.addConfig,
              shape: e.target.value as "circle" | "rect",
            })
          }
        >
          <option value="circle">圆形</option>
          <option value="rect">矩形</option>
        </select>
        {editor.addConfig.shape === "circle" ? (
          <SizeInput
            label="半径"
            value={editor.addConfig.radius}
            onChange={(radius) => editor.setAddConfig({ ...editor.addConfig, radius })}
          />
        ) : (
          <>
            <SizeInput
              label="宽"
              value={editor.addConfig.width}
              onChange={(width) => editor.setAddConfig({ ...editor.addConfig, width })}
            />
            <SizeInput
              label="高"
              value={editor.addConfig.height}
              onChange={(height) => editor.setAddConfig({ ...editor.addConfig, height })}
            />
          </>
        )}
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => editor.setAddMode(!editor.addMode)}
          className={`rounded px-2 py-1 font-medium disabled:opacity-40 ${
            editor.addMode
              ? "bg-sky-500 text-white"
              : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
          }`}
        >
          {editor.addMode ? "点击地图放置…" : "添加障碍物"}
        </button>
      </div>

      {/* selection */}
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {editor.selected !== null && editor.draft
            ? `已选中障碍物 #${editor.selected + 1}`
            : "点击障碍物可选中"}
        </span>
        <button
          type="button"
          disabled={!canEdit || editor.selected === null}
          onClick={editor.deleteSelected}
          className="rounded border border-red-800 bg-red-950/40 px-2 py-1 text-red-300 hover:bg-red-900/50 disabled:opacity-40"
        >
          删除所选
        </button>
      </div>

      <button
        type="button"
        disabled={!canEdit || !editor.dirty || applying}
        onClick={() => void handleApply()}
        className="w-full rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
      >
        {applying ? "正在应用…" : "应用场景修改"}
      </button>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        {editor.canEdit
          ? "拖拽障碍物、起点、终点，或添加/删除障碍物后应用；重置会还原预设场景。拖拽动态障碍物会平移其运动路径。"
          : "会话运行中，暂停后才能编辑场景。"}
      </p>
    </div>
  );
}

function SizeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-slate-400">
      {label}
      <input
        type="number"
        value={value}
        min={0.1}
        max={8}
        step={0.1}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (Number.isFinite(parsed) && parsed > 0) onChange(parsed);
        }}
        className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 font-mono text-slate-200 focus:border-sky-500 focus:outline-none"
      />
      <span className="text-[10px] text-slate-500">m</span>
    </label>
  );
}
