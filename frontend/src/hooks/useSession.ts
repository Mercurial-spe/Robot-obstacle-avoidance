import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  apiCommand,
  apiCreateSession,
  apiPlanInfo,
  apiUpdateScene,
  sessionStreamUrl,
} from "../api/client";
import type {
  CommandAction,
  PlanInfoOut,
  SceneUpdate,
  SessionCreateParams,
  Snapshot,
} from "../types";

export interface SessionState {
  snapshot: Snapshot | null;
  /** APF force vector from the latest snapshot ([fx, fy] meters/s² scale), if any. */
  apfForce: [number, number] | null;
  /** One-shot planning metadata; refetched on create/reset and on new replans. */
  planInfo: PlanInfoOut | null;
  /**
   * Bumped on session create, reset and scene update — the moments where the
   * frontend must re-sync any locally derived view state (e.g. the scene
   * editor draft) from the backend snapshot.
   */
  syncTick: number;
  connected: boolean;
  busy: boolean;
  error: string | null;
  createSession: (
    scenarioId: string,
    algorithm: string,
    params?: SessionCreateParams,
  ) => Promise<void>;
  sendCommand: (action: CommandAction) => Promise<void>;
  /**
   * PUT the edited scene (obstacles/start/goal). Only valid while the session
   * is idle/paused; rethrows so the editor can surface 409 scene_locked or
   * 400 invalid_scene next to the apply button.
   */
  updateScene: (body: SceneUpdate) => Promise<void>;
}

/**
 * Owns the session lifecycle: REST commands plus the WS snapshot stream.
 * Components read `snapshot`; they never touch the socket themselves.
 */
export function useSession(): SessionState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfoOut | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  // Keep a ref so `sendCommand` stays stable while snapshots stream in.
  const snapshotRef = useRef<Snapshot | null>(null);
  snapshotRef.current = snapshot;
  // Bumped on create/reset so plan-info is refetched even if `replans` is
  // unchanged (e.g. back-to-back resets of a fresh session).
  const [planInfoTick, setPlanInfoTick] = useState(0);
  // Cheap guard: snapshots arrive at ~15 Hz; only refetch plan-info when the
  // (session, replans, tick) key actually changed.
  const planInfoKeyRef = useRef<string>("");

  // (Re)connect the WS stream whenever a session is created.
  useEffect(() => {
    if (!snapshot) return;
    const sessionId = snapshot.session_id;
    let closedByUs = false;
    let retryTimer: number | undefined;
    let attempts = 0;

    const connect = () => {
      const socket = new WebSocket(sessionStreamUrl(sessionId));
      socketRef.current = socket;
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        setSnapshot(JSON.parse(event.data) as Snapshot);
      };
      socket.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        if (!closedByUs && attempts < 5) {
          attempts += 1;
          retryTimer = window.setTimeout(connect, 500 * attempts);
        }
      };
    };
    connect();
    return () => {
      closedByUs = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [snapshot?.session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch plan-info on session create and whenever the replan count changes.
  useEffect(() => {
    if (!snapshot) return;
    const key = `${snapshot.session_id}:${snapshot.metrics.replans}:${planInfoTick}`;
    if (planInfoKeyRef.current === key) return;
    planInfoKeyRef.current = key;
    let cancelled = false;
    apiPlanInfo(snapshot.session_id)
      .then((info) => {
        if (!cancelled) setPlanInfo(info);
      })
      .catch((err) => {
        if (!cancelled) console.error("failed to load plan-info", err);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot, planInfoTick]);

  const createSession = useCallback(
    async (
      scenarioId: string,
      algorithm: string,
      params?: SessionCreateParams,
    ) => {
      setBusy(true);
      setError(null);
      try {
        socketRef.current?.close();
        const created = await apiCreateSession(scenarioId, algorithm, params);
        planInfoKeyRef.current = "";
        setPlanInfo(null);
        setPlanInfoTick((tick) => tick + 1);
        setSnapshot(created);
      } catch (err) {
        setError(describe(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const sendCommand = useCallback(
    async (action: CommandAction) => {
      const current = snapshotRef.current;
      if (!current) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await apiCommand(current.session_id, action);
        if (action === "reset") {
          // The backend replans from scratch; force a plan-info refetch.
          planInfoKeyRef.current = "";
          setPlanInfoTick((tick) => tick + 1);
        }
        setSnapshot(updated);
      } catch (err) {
        setError(describe(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const updateScene = useCallback(async (body: SceneUpdate) => {
    const current = snapshotRef.current;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiUpdateScene(current.session_id, body);
      // The backend re-plans against the new scene; force a plan-info refetch.
      planInfoKeyRef.current = "";
      setPlanInfoTick((tick) => tick + 1);
      setSnapshot(updated);
    } catch (err) {
      setError(describe(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    snapshot,
    apfForce: snapshot?.apf_force ?? null,
    planInfo,
    syncTick: planInfoTick,
    connected,
    busy,
    error,
    createSession,
    sendCommand,
    updateScene,
  };
}

function describe(err: unknown): string {
  if (err instanceof ApiRequestError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
