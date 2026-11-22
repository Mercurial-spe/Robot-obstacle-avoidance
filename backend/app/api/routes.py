"""REST and WebSocket routes.

Note: no ``from __future__ import annotations`` here — FastAPI needs the real
model objects in the route annotations to build response validation eagerly.
"""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.api.sessions import SessionError, SessionStore
from app.scenarios.presets import list_presets
from app.schemas.models import (
    CommandRequest,
    ErrorResponse,
    SessionCreate,
    ScenarioSummary,
    Snapshot,
)

router = APIRouter(prefix="/api")

store = SessionStore()


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error={"code": code, "message": message}).model_dump(),
    )


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/scenarios")
async def scenarios() -> list[ScenarioSummary]:
    return [
        ScenarioSummary(
            id=s.id,
            name=s.name,
            description=s.description,
            width=s.width,
            height=s.height,
        )
        for s in list_presets()
    ]


@router.post("/sessions")
async def create_session(request: SessionCreate) -> Snapshot:
    session = store.create(
        scenario_id=request.scenario_id,
        algorithm=request.algorithm,
        seed=request.seed,
        speed=request.speed,
    )
    return session.snapshot()


@router.post("/sessions/{session_id}/commands")
async def session_command(session_id: str, request: CommandRequest):
    try:
        session = store.get(session_id)
        session.command(request.action)
    except SessionError as exc:
        status = 404 if exc.code == "session_not_found" else 400
        return error_response(exc.code, exc.message, status)
    return session.snapshot()


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
