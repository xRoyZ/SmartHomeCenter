"""Health endpoint of the start contract."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_answers_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "ok", "sim_time": body["sim_time"]}
    assert isinstance(body["sim_time"], str)
    assert body["sim_time"]


def test_health_works_without_manual_database_setup(app, client: TestClient) -> None:
    # The TestClient context runs the real lifespan, which creates the schema.
    assert client.get("/api/health").status_code == 200
