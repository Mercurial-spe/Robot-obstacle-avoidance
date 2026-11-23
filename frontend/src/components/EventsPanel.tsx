import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { motion } from "motion/react";
import type { EventEntry } from "../hooks/useEventLog";

const KIND_STYLES: Record<EventEntry["kind"], string> = {
  info: "text-zinc-300",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

/** lucide icon per event kind, colored by the same semantics as the text. */
const KIND_ICONS: Record<EventEntry["kind"], typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

const KIND_ICON_COLORS: Record<EventEntry["kind"], string> = {
  info: "text-zinc-400",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

/** Rolling 事件/状态 log: replans, trap/collision/timeout notices and backend
 * messages, newest first. Entries come from the snapshot stream only. Only
 * NEWLY mounted entries fade in (120ms) — the keys keep existing rows mounted,
 * so a fresh event never replays the whole list. */
export function EventsPanel({ entries }: { entries: EventEntry[] }) {
  return (
    <div className="panel-card p-3">
      <h3 className="mb-2 text-xs font-semibold text-zinc-400">事件记录</h3>
      {entries.length === 0 ? (
        <p className="text-xs leading-relaxed text-zinc-500">
          暂无事件 · 运行会话后，重规划、碰撞、超时与结局信息会显示在这里。
        </p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const Icon = KIND_ICONS[entry.kind];
            return (
              <motion.li
                key={entry.key}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="flex items-start gap-2 text-xs"
              >
                <Icon
                  size={12}
                  aria-hidden
                  className={`mt-0.5 shrink-0 ${KIND_ICON_COLORS[entry.kind]}`}
                />
                <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-500">
                  {entry.sim_time.toFixed(1)}s
                </span>
                <span className={`min-w-0 ${KIND_STYLES[entry.kind]}`}>
                  {entry.text}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
