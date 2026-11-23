import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";

/** One derived telemetry sample. `err` / `apf` are NaN while no path / force
 * exists (the chart breaks the line instead of pretending the value is zero). */
export interface TelemetrySample {
  t: number;
  /** Linear speed (m/s), from consecutive snapshot poses / dt. */
  v: number;
  /** Yaw rate (rad/s), angle delta wrapped to [-π, π] / dt. */
  w: number;
  /** Distance (m) from the robot to the nearest planned-path vertex. */
  err: number;
  /** Straight-line distance (m) from the robot to snapshot.goal. */
  goalDist: number;
  /** Magnitude |F| (N) of snapshot.apf_force, NaN when the force is null. */
  apf: number;
  /** Cumulative travelled distance (m), snapshot.metrics.distance_traveled. */
  dist: number;
}

/** Rolling window length: 600 samples ≈ 40 s at the 15 Hz snapshot rate. */
const MAX_SAMPLES = 600;
/** Keep at most this many replan event timestamps. */
const MAX_EVENTS = 80;

/** Full telemetry series: the rolling samples plus replan event timestamps. */
export interface TelemetrySeries {
  samples: TelemetrySample[];
  /** sim_time of every observed replan (metrics.replans increment), ascending. */
  replanTimes: number[];
}

interface PrevSnapshot {
  id: string;
  t: number;
  x: number;
  y: number;
  theta: number;
  replans: number;
}

/**
 * Derives the live telemetry curves from the snapshot stream. Everything is
 * computed from REAL backend state (pose deltas over sim_time, robot-to-path
 * distance, robot-to-goal distance, APF force magnitude, cumulative odometer)
 * — the same honesty rule as the canvas: no invented motion. The buffer
 * clears when the session id changes (create/reset). Replan events are the
 * moments where snapshot.metrics.replans increases; only the timestamp is
 * recorded, never any fabricated curve data.
 */
function useTelemetrySeries(snapshot: Snapshot | null): TelemetrySeries {
  const [series, setSeries] = useState<TelemetrySeries>({
    samples: [],
    replanTimes: [],
  });
  const prevRef = useRef<PrevSnapshot | null>(null);

  useEffect(() => {
    if (!snapshot) {
      prevRef.current = null;
      setSeries({ samples: [], replanTimes: [] });
      return;
    }
    const id = snapshot.session_id;
    const prev = prevRef.current;
    const replans = snapshot.metrics.replans;
    if (!prev || prev.id !== id) {
      prevRef.current = {
        id,
        t: snapshot.sim_time,
        x: snapshot.robot.x,
        y: snapshot.robot.y,
        theta: snapshot.robot.theta,
        replans,
      };
      setSeries({ samples: [], replanTimes: [] });
      return;
    }
    // Replan event ticks: pure timestamps, never derived curve data.
    if (replans > prev.replans) {
      setSeries((s) => {
        const times = [...s.replanTimes];
        for (let r = prev.replans + 1; r <= replans; r++) {
          times.push(snapshot.sim_time);
        }
        return {
          ...s,
          replanTimes:
            times.length > MAX_EVENTS ? times.slice(times.length - MAX_EVENTS) : times,
        };
      });
    }
    const dt = snapshot.sim_time - prev.t;
    prevRef.current = {
      id,
      t: snapshot.sim_time,
      x: snapshot.robot.x,
      y: snapshot.robot.y,
      theta: snapshot.robot.theta,
      replans,
    };
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
    // Straight-line distance to the goal point of this snapshot.
    const goalDist = Math.hypot(
      snapshot.robot.x - snapshot.goal[0],
      snapshot.robot.y - snapshot.goal[1],
    );
    // APF resultant magnitude; null force → NaN so the curve breaks.
    const apf = snapshot.apf_force
      ? Math.hypot(snapshot.apf_force[0], snapshot.apf_force[1])
      : NaN;
    const sample: TelemetrySample = {
      t: snapshot.sim_time,
      v,
      w,
      err,
      goalDist,
      apf,
      dist: snapshot.metrics.distance_traveled,
    };
    setSeries((s) => {
      const samples = [...s.samples, sample];
      return {
        replanTimes: s.replanTimes,
        samples:
          samples.length > MAX_SAMPLES
            ? samples.slice(samples.length - MAX_SAMPLES)
            : samples,
      };
    });
  }, [snapshot]);

  return series;
}

/**
 * Backward-compatible entry point: the rolling telemetry samples only.
 * For the replan event ticks use {@link useTelemetryDetailed}.
 */
export function useTelemetry(snapshot: Snapshot | null): TelemetrySample[] {
  return useTelemetrySeries(snapshot).samples;
}

/** Same stream plus the replan event timestamps, for chart tick marks. */
export function useTelemetryDetailed(
  snapshot: Snapshot | null,
): TelemetrySeries {
  return useTelemetrySeries(snapshot);
}
