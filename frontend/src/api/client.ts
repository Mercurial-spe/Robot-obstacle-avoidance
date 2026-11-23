/** Typed REST + WebSocket client. All backend access goes through this module. */

import type {
  AlgorithmInfo,
  ApiErrorBody,
  BatchExperimentOut,
  CommandAction,
  PlanInfoOut,
  ScenarioSummary,
  SceneUpdate,
  SessionCreate,
  SessionCreateParams,
  Snapshot,
} from "../types";

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let code = "http_error";
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as ApiErrorBody;
      code = body.error.code;
      message = body.error.message;
    } catch {
      // keep the generic message
    }
    throw new ApiRequestError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export function apiScenarios(): Promise<ScenarioSummary[]> {
  return request<ScenarioSummary[]>("/api/scenarios");
}

/** Algorithm registry: wire ids (SessionCreate.algorithm) + display names. */
export function apiAlgorithms(): Promise<AlgorithmInfo[]> {
  return request<AlgorithmInfo[]>("/api/algorithms");
}

export function apiCreateSession(
  scenarioId: string,
  algorithm: string,
  params?: SessionCreateParams,
): Promise<Snapshot> {
  const body: SessionCreate = {
    scenario_id: scenarioId,
    algorithm,
    seed: params?.seed ?? null,
    speed: params?.speed ?? 1.0,
    safety_margin: params?.safety_margin ?? 0.15,
    v_max: params?.v_max ?? null,
  };
  return request<Snapshot>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function apiCommand(
  sessionId: string,
  action: CommandAction,
): Promise<Snapshot> {
  return request<Snapshot>(`/api/sessions/${sessionId}/commands`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

/**
 * One-shot planning metadata (planner grid, expanded nodes, path, inflation).
 * Cheap to refetch; call again whenever `snapshot.metrics.replans` changes.
 */
export function apiPlanInfo(sessionId: string): Promise<PlanInfoOut> {
  return request<PlanInfoOut>(`/api/sessions/${sessionId}/plan-info`);
}

/**
 * Full scene replacement (obstacles, start, goal). Only accepted while the
 * session is idle/paused; the backend answers 409 scene_locked otherwise and
 * 400 invalid_scene (with a human-readable reason) for unreachable maps.
 */
export function apiUpdateScene(
  sessionId: string,
  body: SceneUpdate,
): Promise<Snapshot> {
  return request<Snapshot>(`/api/sessions/${sessionId}/scene`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Headless batch experiment: every (algorithm, seed) pair runs on the preset
 * scenario. Outcomes (collided/timeout/stuck) are reported as-is, never
 * converted into successes.
 */
export function apiBatchExperiment(
  scenarioId: string,
  algorithms: string[],
  seeds: number[],
): Promise<BatchExperimentOut> {
  return request<BatchExperimentOut>("/api/experiments/batch", {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId, algorithms, seeds }),
  });
}

/** WebSocket URL for a session stream, derived from the REST base. */
export function sessionStreamUrl(sessionId: string): string {
  const wsBase = BASE_URL.replace(/^http/, "ws");
  return `${wsBase}/api/sessions/${sessionId}/stream`;
}
