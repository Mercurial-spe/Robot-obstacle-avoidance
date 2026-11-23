import { LAYER_IDS } from "../hooks/useLayerToggles";
import type { LayerId, LayerToggles } from "../hooks/useLayerToggles";
import { LAYER_STYLE } from "../canvas/layerStyles";

interface LegendProps {
  layers: LayerToggles;
  /** Clicking a legend entry toggles its layer; omit for a read-only legend. */
  onToggle?: (id: LayerId) => void;
}

/** 图例 — maps each visualization layer to its color. Doubles as a toggle
 * bar; disabled layers are dimmed so the active visualization is obvious. */
export function Legend({ layers, onToggle }: LegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {LAYER_IDS.map((id) => {
        const style = LAYER_STYLE[id];
        const on = layers[id];
        return (
          <button
            key={id}
            type="button"
            onClick={onToggle ? () => onToggle(id) : undefined}
            disabled={!onToggle}
            title={onToggle ? "点击切换图层" : undefined}
            className={`flex items-center gap-1.5 text-xs transition-opacity ${
              on ? "opacity-100" : "opacity-35"
            } ${onToggle ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
          >
            <Swatch kind={style.kind} color={style.color} />
            <span className={on ? "text-slate-300" : "text-slate-500"}>
              {style.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Swatch({
  kind,
  color,
}: {
  kind: "line" | "fill" | "dot" | "arrow";
  color: string;
}) {
  if (kind === "line") {
    return (
      <span
        className="inline-block h-0.5 w-5 rounded-full"
        style={{ backgroundColor: color }}
      />
    );
  }
  if (kind === "fill") {
    return (
      <span
        className="inline-block h-3 w-4 rounded-sm border border-slate-500"
        style={{ backgroundColor: "rgba(148, 163, 184, 0.25)" }}
      />
    );
  }
  if (kind === "dot") {
    return (
      <span className="relative inline-block h-3 w-5">
        <span
          className="absolute left-0 top-1 h-1 w-1 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span
          className="absolute left-2 top-1 h-1 w-1 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span
          className="absolute left-4 top-1 h-1 w-1 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
    );
  }
  // arrow
  return (
    <span
      className="inline-block text-[10px] leading-none"
      style={{ color }}
      aria-hidden
    >
      ➜
    </span>
  );
}
