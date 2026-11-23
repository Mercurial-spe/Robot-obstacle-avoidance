import type { EventEntry } from "../hooks/useEventLog";

const KIND_STYLES: Record<EventEntry["kind"], string> = {
  info: "text-zinc-300",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

const KIND_DOTS: Record<EventEntry["kind"], string> = {
  info: "bg-zinc-500",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

/** Rolling 事件/状态 log: replans, trap/collision/timeout notices and backend
 * messages, newest first. Entries come from the snapshot stream only. */
export function EventsPanel({ entries }: { entries: EventEntry[] }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
      <h3 className="mb-2 text-xs font-semibold text-zinc-400">事件记录</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-zinc-500">暂无事件。</p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOTS[entry.kind]}`}
              />
              <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                {entry.sim_time.toFixed(1)}s
              </span>
              <span className={KIND_STYLES[entry.kind]}>{entry.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
