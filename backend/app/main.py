"""FastAPI application entry point: uvicorn app.main:app"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router, store

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Robot Navigation Workbench", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("shutdown")
async def shutdown() -> None:
    await store.close_all()
