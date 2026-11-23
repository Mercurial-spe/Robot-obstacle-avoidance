"""REST and WebSocket routes.

Note: no ``from __future__ import annotations`` here — FastAPI needs the real
model objects in the route annotations to build response validation eagerly.
"""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.api.sessions import ALGORITHMS, SessionError, SessionStore
from app.experiments import batch as batch_experiments
from app.experiments.schemas import BatchExperimentOut, BatchExperimentRequest
from app.scenarios.presets import list_presets
from app.schemas.models import (
    AlgorithmInfo,
    CommandRequest,
    ErrorResponse,
    PlanInfoOut,
    SceneUpdate,
    SessionCreate,
    ScenarioSummary,
    Snapshot,
)

router = APIRouter(prefix="/api")

store = SessionStore()

_ERROR_STATUS = {
    "session_not_found": 404,
    "scene_locked": 409,
    "invalid_scene": 400,
    "invalid_command": 400,
    "unknown_algorithm": 400,
    "unknown_scenario": 400,
    "invalid_request": 400,
}


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error={"code": code, "message": message}).model_dump(),
    )


def _session_error_response(exc: SessionError) -> JSONResponse:
    return error_response(exc.code, exc.message, _ERROR_STATUS.get(exc.code, 400))


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/algorithms")
async def algorithms() -> list[AlgorithmInfo]:
    """Algorithm registry: wire ids (SessionCreate.algorithm) + display names."""
    return [AlgorithmInfo(id=key, name=name) for key, name in ALGORITHMS.items()]


@router.get("/scenarios")
async def scenarios() -> list[ScenarioSummary]:
    return [
        ScenarioSummary(
            id=s.id,
            name=s.name,
            description=s.description,
            width=s.width,
            height=s.height,
            has_dynamic_obstacles=s.has_dynamic_obstacles(),
        )
        for s in list_presets()
    ]


@router.post("/sessions")
async def create_session(request: SessionCreate) -> Snapshot:
    try:
        session = store.create(
            scenario_id=request.scenario_id,
            algorithm=request.algorithm,
            seed=request.seed,
            speed=request.speed,
            safety_margin=request.safety_margin,
            v_max=request.v_max,
        )
    except SessionError as exc:
        return _session_error_response(exc)
    return session.snapshot()


@router.post("/sessions/{session_id}/commands")
async def session_command(session_id: str, request: CommandRequest):
    try:
        session = store.get(session_id)
        session.command(request.action)
    except SessionError as exc:
        return _session_error_response(exc)
    return session.snapshot()


@router.put("/sessions/{session_id}/scene")
async def update_scene(session_id: str, request: SceneUpdate) -> Snapshot:
    """Full scene replacement; only accepted while the session is idle/paused."""
    try:
        session = store.get(session_id)
        session.update_scene(request.obstacles, request.start, request.goal)
    except SessionError as exc:
        return _session_error_response(exc)
    return session.snapshot()


@router.get("/sessions/{session_id}/plan-info")
async def plan_info(session_id: str) -> PlanInfoOut:
    try:
        session = store.get(session_id)
    except SessionError as exc:
        return _session_error_response(exc)
    return session.plan_info()


@router.post("/experiments/batch")
async def run_batch_experiment(request: BatchExperimentRequest) -> BatchExperimentOut:
    """Headless batch experiment: run every (algorithm, seed) pair on a preset
    scenario, aggregate per algorithm and export CSV/JSON.

    The batch may take seconds; it runs in a worker thread so live sessions
    keep stepping on the event loop. Outcomes are data: reached_goal /
    collided / timeout / stuck / planning_failed are all reported as-is.
    """
    try:
        return await asyncio.to_thread(
            batch_experiments.run_batch_experiment,
            request.scenario_id,
            request.algorithms,
            request.seeds,
        )
    except SessionError as exc:
        return _session_error_response(exc)


@router.websocket("/sessions/{session_id}/stream")
async def session_stream(websocket: WebSocket, session_id: str) -> None:
    try:
        session = store.get(session_id)
    except SessionError:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=4)
    session.websockets.add(queue)
    try:
        # Push the current state immediately, then follow the session loop.
        await websocket.send_text(session.snapshot().model_dump_json())
        while True:
            payload = await queue.get()
            await websocket.send_text(payload)
    except WebSocketDisconnect:
        pass
    finally:
        session.websockets.discard(queue)
