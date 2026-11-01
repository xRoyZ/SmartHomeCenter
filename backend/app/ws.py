"""WebSocket connection management and inbound message validation.

Inbound messages are size-limited and validated against :class:`PingMessage`.
A malformed or oversized message answers a structured error and leaves the
connection (and every other client) open.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Literal

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, ValidationError

from .schemas import ErrorBody, HouseState

MAX_MESSAGE_BYTES = 4096

# Expected failures of a socket that is going away. No other exception is
# swallowed: a real defect must stay visible.
_CONNECTION_ERRORS = (WebSocketDisconnect, RuntimeError, ConnectionError, OSError)


class PingMessage(BaseModel):
    """The only inbound WebSocket message the server accepts."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["ping"]


class ConnectionManager:
    """Tracks the live WebSocket clients of the simulator."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    @property
    def active_connections(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def send_snapshot(self, websocket: WebSocket, state: HouseState) -> None:
        await websocket.send_json({"type": "snapshot", "payload": state.model_dump(mode="json")})

    async def broadcast(self, state: HouseState) -> None:
        """Send a snapshot to every connected client, dropping dead ones."""

        message = {"type": "snapshot", "payload": state.model_dump(mode="json")}
        for websocket in list(self._connections):
            try:
                await websocket.send_json(message)
            except _CONNECTION_ERRORS:
                self.disconnect(websocket)

    async def close_all(self) -> None:
        for websocket in list(self._connections):
            try:
                await websocket.close()
            except _CONNECTION_ERRORS:
                self.disconnect(websocket)
            else:
                self.disconnect(websocket)


manager = ConnectionManager()


async def _send_error(websocket: WebSocket, code: str, message: str) -> None:
    await websocket.send_json(
        {"type": "error", "error": ErrorBody(code=code, message=message).model_dump()}
    )


async def handle_connection(websocket: WebSocket, state_provider: Callable[[], HouseState]) -> None:
    """Serve one WebSocket connection until the client disconnects."""

    await manager.connect(websocket)
    try:
        await manager.send_snapshot(websocket, state_provider())
        while True:
            event = await websocket.receive()
            if event["type"] == "websocket.disconnect":
                break
            raw = event.get("text")
            if raw is None:
                await _send_error(
                    websocket,
                    "validation_error",
                    "Ungültige WebSocket-Nachricht.",
                )
                continue
            if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
                await _send_error(
                    websocket,
                    "validation_error",
                    "Die WebSocket-Nachricht ist zu groß.",
                )
                continue
            try:
                payload = json.loads(raw)
                message = PingMessage.model_validate(payload)
            except (ValueError, ValidationError):
                await _send_error(
                    websocket,
                    "validation_error",
                    "Ungültige WebSocket-Nachricht.",
                )
                continue
            if message.type == "ping":
                await websocket.send_json({"type": "pong", "sim_time": state_provider().sim_time})
    except _CONNECTION_ERRORS:
        pass
    finally:
        manager.disconnect(websocket)
