"""Settings and simulation-control endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_get_settings_returns_the_current_settings(client: TestClient) -> None:
    response = client.get("/api/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["speed"] == 1
    assert body["paused"] is False
    assert body["seed"] == 42
    assert body["weather"] in {"sunny", "cloudy", "rain", "storm"}
    assert body["season"] in {"spring", "summer", "autumn", "winter"}
    assert body["occupancy_mode"] in {"everyday", "home", "away"}
    assert body["sim_time"]
    assert body["weekday"]


def test_weather_season_and_speed_apply_immediately(client: TestClient) -> None:
    client.post("/api/simulation/control", json={"action": "pause"})

    response = client.put(
        "/api/settings",
        json={"weather": "rain", "season": "winter", "speed": 60},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["weather"] == "rain"
    assert body["season"] == "winter"
    assert body["speed"] == 60

    state = client.get("/api/state").json()
    assert state["outdoor"]["weather"] == "rain"
    assert state["outdoor"]["season"] == "winter"
    assert (state["outdoor"]["sunrise"], state["outdoor"]["sunset"]) == ("08:00", "16:30")
    assert state["speed"] == 60


def test_occupancy_mode_and_seed_are_stored(client: TestClient) -> None:
    response = client.put("/api/settings", json={"occupancy_mode": "away", "seed": 7})

    assert response.status_code == 200
    body = response.json()
    assert body["occupancy_mode"] == "away"
    assert body["seed"] == 7
    assert client.get("/api/settings").json()["seed"] == 7


def test_invalid_speed_is_rejected_without_changing_the_settings(client: TestClient) -> None:
    before = client.get("/api/settings").json()

    response = client.put("/api/settings", json={"speed": 7})

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["message"]
    after = client.get("/api/settings").json()
    assert after["speed"] == before["speed"]


def test_unknown_setting_key_is_rejected(client: TestClient) -> None:
    response = client.put("/api/settings", json={"weather": "sunny", "heating": True})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_unknown_weather_value_is_rejected(client: TestClient) -> None:
    response = client.put("/api/settings", json={"weather": "sandstorm"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert client.get("/api/settings").json()["weather"] != "sandstorm"


def test_pause_and_resume_control_the_clock(client: TestClient) -> None:
    paused = client.post("/api/simulation/control", json={"action": "pause"})

    assert paused.status_code == 200
    assert paused.json()["paused"] is True
    assert client.get("/api/state").json()["paused"] is True

    resumed = client.post("/api/simulation/control", json={"action": "resume"})

    assert resumed.status_code == 200
    assert resumed.json()["paused"] is False
    assert client.get("/api/state").json()["paused"] is False


def test_invalid_control_action_is_rejected(client: TestClient) -> None:
    response = client.post("/api/simulation/control", json={"action": "take-off"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert client.get("/api/state").json()["paused"] is False
