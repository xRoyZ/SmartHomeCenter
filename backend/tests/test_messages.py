"""Message list and acknowledgement endpoints (AC-08)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import get_session_factory
from app.models import Message as MessageRow
from app.models import Room


def _insert_room(room_id: str, name: str) -> None:
    with get_session_factory()() as session:
        session.merge(Room(id=room_id, name=name))
        session.commit()


def _insert_message(
    message_id: str,
    *,
    kind: str = "room_cold",
    severity: str = "warning",
    room_id: str | None = "living_room",
    text: str = "Wohnzimmer ist zu kalt: 17,8 °C.",
    created_at: str = "2026-06-15T08:10:00",
    acknowledged_at: str | None = None,
) -> None:
    with get_session_factory()() as session:
        session.merge(
            MessageRow(
                id=message_id,
                kind=kind,
                severity=severity,
                room_id=room_id,
                text=text,
                created_at=created_at,
                acknowledged_at=acknowledged_at,
            )
        )
        session.commit()


def _ids(response) -> list[str]:
    return [message["id"] for message in response.json()]


def test_open_messages_exclude_acknowledged_ones(client: TestClient) -> None:
    _insert_room("living_room", "Wohnzimmer")
    _insert_message("open_1")
    _insert_message("done_1", acknowledged_at="2026-06-15T08:20:00")

    default = client.get("/api/messages")
    opened = client.get("/api/messages", params={"status": "open"})
    acknowledged = client.get("/api/messages", params={"status": "acknowledged"})
    everything = client.get("/api/messages", params={"status": "all"})

    assert default.status_code == 200
    assert _ids(default) == ["open_1"]
    assert _ids(opened) == ["open_1"]
    assert _ids(acknowledged) == ["done_1"]
    assert set(_ids(everything)) == {"open_1", "done_1"}


def test_message_carries_room_name_and_severity(client: TestClient) -> None:
    _insert_room("living_room", "Wohnzimmer")
    _insert_message("open_1")

    message = client.get("/api/messages").json()[0]

    assert message["room_id"] == "living_room"
    assert message["room_name"] == "Wohnzimmer"
    assert message["severity"] == "warning"
    assert message["created_at"] == "2026-06-15T08:10:00"
    assert message["acknowledged_at"] is None


def test_messages_are_listed_newest_first(client: TestClient) -> None:
    _insert_room("living_room", "Wohnzimmer")
    _insert_message("older", created_at="2026-06-15T08:00:00")
    _insert_message("newer", created_at="2026-06-15T09:00:00")

    assert _ids(client.get("/api/messages")) == ["newer", "older"]


def test_acknowledge_removes_message_from_open_but_keeps_it_visible(
    client: TestClient,
) -> None:
    _insert_room("living_room", "Wohnzimmer")
    _insert_message("open_1")
    simulated_time = client.app.state.engine.state.sim_time

    response = client.post("/api/messages/open_1/ack")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "open_1"
    assert body["acknowledged_at"] == simulated_time

    assert _ids(client.get("/api/messages", params={"status": "open"})) == []
    assert "open_1" in _ids(client.get("/api/messages", params={"status": "acknowledged"}))
    assert "open_1" in _ids(client.get("/api/messages", params={"status": "all"}))


def test_acknowledge_unknown_message_returns_404_with_german_error(
    client: TestClient,
) -> None:
    response = client.post("/api/messages/missing/ack")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "unknown_message"
    assert body["error"]["message"]


def test_rejected_acknowledgement_changes_no_message(client: TestClient) -> None:
    _insert_room("living_room", "Wohnzimmer")
    _insert_message("open_1")

    client.post("/api/messages/missing/ack")

    assert _ids(client.get("/api/messages", params={"status": "open"})) == ["open_1"]
