/** Typed REST + WebSocket client. All backend access goes through this module. */

import type {
  ApiErrorBody,
  CommandAction,
  ScenarioSummary,
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

export function apiCreateSession(
  scenarioId: string,
  algorithm: string,
): Promise<Snapshot> {
  return request<Snapshot>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId, algorithm }),
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

/** WebSocket URL for a session stream, derived from the REST base. */
export function sessionStreamUrl(sessionId: string): string {
  const wsBase = BASE_URL.replace(/^http/, "ws");
  return `${wsBase}/api/sessions/${sessionId}/stream`;
}
