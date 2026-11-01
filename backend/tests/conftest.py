"""Shared pytest fixtures.

Every test gets its own temporary SQLite database, so tests never share state
and never write into the repository tree.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[FastAPI]:
    monkeypatch.setenv("SMARTHOME_DB_PATH", str(tmp_path / "test.db"))
    from app import db

    db.reset_engine()
    from app.main import create_app

    application = create_app()
    yield application
    db.reset_engine()


@pytest.fixture()
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
