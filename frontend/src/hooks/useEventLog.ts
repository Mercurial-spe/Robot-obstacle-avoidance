import { useEffect, useRef, useState } from "react";
import type { RunStatus, Snapshot } from "../types";

export type EventKind = "info" | "success" | "warn" | "error";

export interface EventEntry {
  key: number;
  sim_time: number;
  text: string;
  kind: EventKind;
}

const RUN_STATUS_EVENTS: Record<RunStatus, { text: string; kind: EventKind } | null> = {
  running: null,
  reached_goal: { text: "到达终点", kind: "success" },
  collided: { text: "发生碰撞", kind: "error" },
  timeout: { text: "超时终止", kind: "warn" },
  stuck: { text: "被困（局部极小/停滞）", kind: "warn" },
};

let eventKeyCounter = 0;

function nextKey(): number {
  eventKeyCounter += 1;
  return eventKeyCounter;
}

/**
 * Rolling event log for one session, derived from the WS snapshot stream.
 * Never invents events: entries come from run-status transitions, replan
 * counter increases and backend messages only. Cleared on session change.
 */
export function useEventLog(snapshot: Snapshot | null): EventEntry[] {
  const [entries, setEntries] = useState<EventEntry[]>([]);
  const lastRef = useRef<{
    sessionId: string | null;
    replans: number;
    runStatus: string;
    message: string | null;
  }>({ sessionId: null, replans: 0, runStatus: "running", message: null });

  useEffect(() => {
    if (!snapshot) {
      lastRef.current = { sessionId: null, replans: 0, runStatus: "running", message: null };
      setEntries([]);
      return;
    }
    const last = lastRef.current;
    const sessionId = snapshot.session_id;
    if (last.sessionId !== sessionId) {
      // New session: reset the log, record the creation.
      lastRef.current = {
        sessionId,
        replans: snapshot.metrics.replans,
        runStatus: snapshot.run_status,
        message: snapshot.message,
      };
      setEntries([
        {
          key: nextKey(),
          sim_time: snapshot.sim_time,
          text: `会话已创建 · 算法 ${snapshot.session_id.slice(0, 8)}`,
          kind: "info",
        },
      ]);
      return;
    }
    const pending: EventEntry[] = [];
    if (snapshot.metrics.replans > last.replans) {
      pending.push({
        key: nextKey(),
        sim_time: snapshot.sim_time,
        text: `触发重规划（第 ${snapshot.metrics.replans} 次）`,
        kind: "info",
      });
    }
    if (snapshot.run_status !== last.runStatus) {
      const runEvent = RUN_STATUS_EVENTS[snapshot.run_status];
      if (runEvent) {
        pending.push({
          key: nextKey(),
          sim_time: snapshot.sim_time,
          text: runEvent.text,
          kind: runEvent.kind,
        });
      }
    }
    if (snapshot.message && snapshot.message !== last.message) {
      pending.push({
        key: nextKey(),
        sim_time: snapshot.sim_time,
        text: snapshot.message,
        kind: "error",
      });
    }
    lastRef.current = {
      sessionId,
      replans: snapshot.metrics.replans,
      runStatus: snapshot.run_status,
      message: snapshot.message,
    };
    if (pending.length > 0) {
      // Newest first; cap the log so long runs stay readable.
      setEntries((prev) => [...pending.reverse(), ...prev].slice(0, 60));
    }
  }, [snapshot]);

  return entries;
}
