"""A triggered event and the message it leaves in the list (AC-07, AC-08).

The event route changes the running state, stores its message and marks the
conditions the event created as already alerted, so the next threshold
evaluation does not shadow the event's one visible message with a duplicate.
The stored message keeps its room, which the list needs for the room name even
on a store whose room table has not been written by a tick yet.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.simulation import alerts, house


def _pause_clock(app: FastAPI) -> None:
    """Keep the background tick out of the way so the test controls the steps."""

    app.state.engine.state.paused = True


def _open(client: TestClient) -> list[dict[str, object]]:
    return client.get("/api/messages", params={"status": "open"}).json()


def test_the_next_alert_evaluation_does_not_shadow_the_event_message(
    client: TestClient, app: FastAPI
) -> None:
    _pause_clock(app)
    state = app.state.engine.state
    thresholds = house.default_thresholds()
    alerts.evaluate(state, thresholds, state.sim_time)

    response = client.post("/api/events/smoke_alarm", json={})

    assert response.status_code == 201
    event_message = response.json()["message"]
    produced = alerts.evaluate(state, thresholds, state.sim_time)

    assert produced == []
    smoke = [message for message in _open(client) if message["kind"] == "smoke"]
    assert len(smoke) == 1
    assert smoke[0]["id"] == event_message["id"]


def test_event_message_is_listed_with_its_room_on_a_fresh_store(
    client: TestClient, app: FastAPI
) -> None:
    _pause_clock(app)

    response = client.post("/api/events/water_damage", json={})

    assert response.status_code == 201
    event_message = response.json()["message"]
    listed = next(message for message in _open(client) if message["id"] == event_message["id"])
    assert listed["room_id"] == "bathroom"
    assert listed["room_name"] == "Badezimmer"
    assert listed["severity"] == "critical"
    assert listed["created_at"] == app.state.engine.state.sim_time
    assert listed["acknowledged_at"] is None
