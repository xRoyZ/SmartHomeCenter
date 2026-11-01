"""WebSocket snapshot, ping/pong and inbound message limits (AC-29)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.ws import MAX_MESSAGE_BYTES


def test_snapshot_on_connect_and_ping_pong(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        snapshot = websocket.receive_json()
        assert snapshot["type"] == "snapshot"
        payload = snapshot["payload"]
        assert len(payload["rooms"]) == 6
        assert payload["sim_time"]

        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()
        assert pong["type"] == "pong"
        assert pong["sim_time"] == payload["sim_time"]


def test_oversized_message_answers_error_and_keeps_connection(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        websocket.send_text("x" * (MAX_MESSAGE_BYTES + 1))
        error = websocket.receive_json()

        assert error["type"] == "error"
        assert set(error["error"]) == {"code", "message"}
        assert error["error"]["code"] == "validation_error"
        assert isinstance(error["error"]["message"], str)
        assert error["error"]["message"]

        websocket.send_json({"type": "ping"})
        assert websocket.receive_json()["type"] == "pong"


def test_invalid_message_answers_error_and_keeps_connection(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        websocket.send_json({"type": "shutdown"})
        error = websocket.receive_json()
        assert error["type"] == "error"
        assert error["error"]["code"] == "validation_error"

        websocket.send_text("not json at all")
        error = websocket.receive_json()
        assert error["type"] == "error"
        assert error["error"]["code"] == "validation_error"

        websocket.send_bytes(b"\x00\x01\x02")
        error = websocket.receive_json()
        assert error["type"] == "error"
        assert error["error"]["code"] == "validation_error"

        websocket.send_json({"type": "ping"})
        assert websocket.receive_json()["type"] == "pong"
