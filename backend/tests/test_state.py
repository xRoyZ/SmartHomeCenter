"""The house state exposes the seed that drives the simulation."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.simulation import house


def test_fresh_state_carries_the_configured_seed(client: TestClient) -> None:
    state = client.get("/api/state").json()
    settings = client.get("/api/settings").json()

    assert state["seed"] == settings["seed"]
    assert state["seed"] == house.initial_settings().seed


def test_seed_change_through_settings_reaches_the_next_state(client: TestClient) -> None:
    before = client.get("/api/state").json()["seed"]

    response = client.put("/api/settings", json={"seed": 1234})

    assert response.status_code == 200
    assert response.json()["seed"] == 1234
    assert client.get("/api/state").json()["seed"] == 1234
    assert client.get("/api/state").json()["seed"] != before


def test_websocket_snapshot_carries_the_current_seed(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        snapshot = websocket.receive_json()

    assert snapshot["type"] == "snapshot"
    assert snapshot["payload"]["seed"] == client.get("/api/settings").json()["seed"]
