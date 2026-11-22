import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  apiCommand,
  apiCreateSession,
  sessionStreamUrl,
} from "../api/client";
import type { CommandAction, Snapshot } from "../types";

export interface SessionState {
  snapshot: Snapshot | null;
  connected: boolean;
  busy: boolean;
  error: string | null;
  createSession: (scenarioId: string, algorithm: string) => Promise<void>;
  sendCommand: (action: CommandAction) => Promise<void>;
}

/**
 * Owns the session lifecycle: REST commands plus the WS snapshot stream.
 * Components read `snapshot`; they never touch the socket themselves.
 */
export function useSession(): SessionState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  // Keep a ref so `sendCommand` stays stable while snapshots stream in.
  const snapshotRef = useRef<Snapshot | null>(null);
  snapshotRef.current = snapshot;

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

  const createSession = useCallback(
    async (scenarioId: string, algorithm: string) => {
      setBusy(true);
      setError(null);
      try {
        socketRef.current?.close();
        const created = await apiCreateSession(scenarioId, algorithm);
        setSnapshot(created);
      } catch (err) {
        setError(describe(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const sendCommand = useCallback(async (action: CommandAction) => {
    const current = snapshotRef.current;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiCommand(current.session_id, action);
      setSnapshot(updated);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return { snapshot, connected, busy, error, createSession, sendCommand };
}

function describe(err: unknown): string {
  if (err instanceof ApiRequestError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
