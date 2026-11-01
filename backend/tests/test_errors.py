"""The uniform error body never leaks internals (AC-28)."""

from __future__ import annotations

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.schemas import not_implemented

SECRET_DETAIL = "secret detail /tmp/private.db SELECT * FROM users"


def _assert_error_body(response: httpx.Response) -> dict:
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message"}
    assert isinstance(body["error"]["code"], str)
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["code"]
    assert body["error"]["message"]
    assert "Traceback" not in response.text
    assert SECRET_DETAIL not in response.text
    assert "sqlite" not in response.text.lower()
    return body


def test_unknown_path_returns_uniform_error_body(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    body = _assert_error_body(response)
    assert body["error"]["code"] == "not_found"


def test_validation_error_returns_uniform_error_body(client: TestClient) -> None:
    response = client.post("/api/simulation/control", json={"action": "take-off"})

    assert response.status_code == 422
    body = _assert_error_body(response)
    assert body["error"]["code"] == "validation_error"


def test_not_implemented_answers_501_with_error_body(app: FastAPI, client: TestClient) -> None:
    async def stub_route() -> None:
        raise not_implemented()

    app.add_api_route("/_stub", stub_route, methods=["GET"])

    response = client.get("/_stub")

    assert response.status_code == 501
    body = _assert_error_body(response)
    assert body["error"]["code"] == "not_implemented"
    assert body["error"]["message"]


def test_unexpected_exception_hides_internals_and_keeps_cors(
    app: FastAPI, client: TestClient
) -> None:
    async def boom() -> None:
        raise RuntimeError(SECRET_DETAIL)

    app.add_api_route("/_boom", boom, methods=["GET"])

    response = client.get("/_boom", headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 500
    body = _assert_error_body(response)
    assert body["error"]["code"] == "internal_error"
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
