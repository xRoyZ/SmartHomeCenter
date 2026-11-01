"""Room detail endpoint (contract ``RoomDetail``)."""

from __future__ import annotations

from fastapi.testclient import TestClient

ROOM_IDS = (
    "living_room",
    "kitchen",
    "bedroom",
    "childrens_room",
    "bathroom",
    "hallway",
)


def test_every_room_is_reachable_with_devices_and_status(client: TestClient) -> None:
    for room_id in ROOM_IDS:
        response = client.get(f"/api/rooms/{room_id}")

        assert response.status_code == 200
        body = response.json()
        assert body["room"]["id"] == room_id
        assert body["room"]["name"]
        assert body["room"]["status_text"]
        assert body["devices"] == body["room"]["devices"]
        assert body["devices"]
        assert any(device["type"] == "heating" for device in body["devices"])


def test_unknown_room_answers_unknown_room(client: TestClient) -> None:
    response = client.get("/api/rooms/attic")

    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "unknown_room"
    assert body["error"]["message"]
    assert "nicht gefunden" in body["error"]["message"]


def test_room_detail_reports_the_running_state(client: TestClient, app) -> None:
    body = client.get("/api/rooms/kitchen").json()
    room = next(room for room in app.state.engine.state.rooms if room.id == "kitchen")

    assert body["room"]["sensors"]["temperature"] == room.sensors.temperature
    assert body["room"]["open_messages"] == room.open_messages
