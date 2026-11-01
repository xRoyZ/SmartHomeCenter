"""FastAPI application factory and process entry point.

``uvicorn app.main:app`` starts the service. Configuration is validated once in
the lifespan hook, the SQLite schema is created there, and the simulation engine
is attached to ``app.state.engine``.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import (
    automations,
    devices,
    events,
    health,
    history,
    messages,
    reset,
    rooms,
    settings,
    simulation,
    state,
    thresholds,
)
from .config import get_settings
from .db import get_session_factory, init_db
from .schemas import ApiError, HouseState, error_body
from .simulation import house
from .simulation.engine import SimulationEngine
from .ws import handle_connection, manager

_access_logger = logging.getLogger("smarthome.access")


def _configure_access_logging() -> None:
    """Log only timestamp, method, path and status code (no client data)."""

    if _access_logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S"))
    _access_logger.addHandler(handler)
    _access_logger.setLevel(logging.INFO)
    _access_logger.propagate = False


async def _access_log_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    try:
        response = await call_next(request)
    except Exception:
        # Log only method, path and status: no exception text, no traceback and
        # no client data ever reaches a log line.
        _access_logger.info("%s %s %s", request.method, request.url.path, 500)
        return JSONResponse(
            status_code=500,
            content=error_body("internal_error", "Ein interner Fehler ist aufgetreten."),
        )
    _access_logger.info("%s %s %s", request.method, request.url.path, response.status_code)
    return response


def _status_error(status_code: int) -> tuple[str, str]:
    if status_code == 400:
        return "invalid_query", "Ungültige Anfrage."
    if status_code == 404:
        return "not_found", "Die angeforderte Ressource wurde nicht gefunden."
    if status_code == 405:
        return "method_not_allowed", "Diese HTTP-Methode ist für den Pfad nicht zulässig."
    if status_code == 422:
        return "validation_error", "Ungültige Eingabe."
    if status_code == 501:
        return "not_implemented", "Diese Funktion ist noch nicht verfügbar."
    return "internal_error", "Ein interner Fehler ist aufgetreten."


def _register_exception_handlers(application: FastAPI) -> None:
    @application.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_body("validation_error", "Ungültige Eingabe."),
        )

    @application.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            content = detail
        elif isinstance(detail, dict) and "code" in detail and "message" in detail:
            content = error_body(str(detail["code"]), str(detail["message"]))
        else:
            code, message = _status_error(exc.status_code)
            content = error_body(code, message)
        return JSONResponse(
            status_code=exc.status_code,
            content=content,
            headers=getattr(exc, "headers", None),
        )

    @application.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message),
        )

    @application.exception_handler(Exception)
    async def _unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=error_body("internal_error", "Ein interner Fehler ist aufgetreten."),
        )


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Validate configuration, create the schema and start the engine."""

    configuration = get_settings()
    init_db()

    async def publish(snapshot: HouseState) -> None:
        await manager.broadcast(snapshot)

    application.state.engine = SimulationEngine(get_session_factory(), publish)
    application.state.settings = configuration
    try:
        yield
    finally:
        await manager.close_all()


def _current_state(application: FastAPI) -> HouseState:
    engine = getattr(application.state, "engine", None)
    current = getattr(engine, "state", None) if engine is not None else None
    if current is not None:
        return current
    return house.build_house(house.DEFAULT_SEED)


def create_app() -> FastAPI:
    """Build the FastAPI application with every router and the WebSocket."""

    _configure_access_logging()
    configuration = get_settings()

    application = FastAPI(
        title="Smart-Home-Simulator",
        version="0.1.0",
        lifespan=lifespan,
    )

    application.middleware("http")(_access_log_middleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(configuration.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _register_exception_handlers(application)

    for router in (
        health.router,
        state.router,
        rooms.router,
        devices.router,
        history.router,
        messages.router,
        thresholds.router,
        automations.router,
        settings.router,
        simulation.router,
        reset.router,
        events.router,
    ):
        application.include_router(router)

    @application.websocket("/ws")
    async def websocket_route(websocket: WebSocket) -> None:
        await handle_connection(websocket, lambda: _current_state(application))

    return application


app = create_app()
