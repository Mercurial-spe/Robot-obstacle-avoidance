import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";

/** One derived telemetry sample. `err` is NaN while no path exists (the
 * chart breaks the line instead of pretending the error is zero). */
export interface TelemetrySample {
  t: number;
  /** Linear speed (m/s), from consecutive snapshot poses / dt. */
  v: number;
  /** Yaw rate (rad/s), angle delta wrapped to [-π, π] / dt. */
  w: number;
  /** Distance (m) from the robot to the nearest planned-path vertex. */
  err: number;
}

/** Rolling window length: 450 samples ≈ 30 s at the 15 Hz snapshot rate. */
const MAX_SAMPLES = 450;

/**
 * Derives the live telemetry curves from the snapshot stream. Everything is
 * computed from REAL backend state (pose deltas over sim_time, robot-to-path
 * distance) — the same honesty rule as the canvas: no invented motion.
 * The buffer clears when the session id changes (create/reset).
 */
export function useTelemetry(snapshot: Snapshot | null): TelemetrySample[] {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const prevRef = useRef<{
    id: string;
    t: number;
    x: number;
    y: number;
    theta: number;
  } | null>(null);

  useEffect(() => {
    if (!snapshot) {
      prevRef.current = null;
      setSamples([]);
      return;
    }
    const id = snapshot.session_id;
    const prev = prevRef.current;
    if (!prev || prev.id !== id) {
      prevRef.current = {
        id,
        t: snapshot.sim_time,
        x: snapshot.robot.x,
        y: snapshot.robot.y,
        theta: snapshot.robot.theta,
      };
      setSamples([]);
      return;
    }
    const dt = snapshot.sim_time - prev.t;
    if (dt <= 1e-6) return; // paused / duplicate snapshot: freeze, don't fake
    const v = Math.min(
      5,
      Math.hypot(snapshot.robot.x - prev.x, snapshot.robot.y - prev.y) / dt,
    );
    let dTheta = snapshot.robot.theta - prev.theta;
    dTheta = (((dTheta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const w = dTheta / dt;
    let err = NaN;
    if (snapshot.path.length > 0) {
      let best = Infinity;
      for (let i = 0; i < snapshot.path.length; i += 2) {
        const d = Math.hypot(snapshot.robot.x - snapshot.path[i][0], snapshot.robot.y - snapshot.path[i][1]);
        if (d < best) best = d;
      }
      err = best;
    }
    prevRef.current = { id, t: snapshot.sim_time, x: snapshot.robot.x, y: snapshot.robot.y, theta: snapshot.robot.theta };
    setSamples((existing) => {
      const next = [...existing, { t: snapshot.sim_time, v, w, err }];
      return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
    });
  }, [snapshot]);

  return samples;
}
