"""Runtime configuration read from the environment.

Values are read lazily so that importing a module never depends on the
environment being configured. :func:`get_settings` validates everything once
and raises a message that names the offending variable.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = str(BACKEND_DIR / "smarthome.db")
DEFAULT_TICK_SECONDS = "1.0"
DEFAULT_CORS_ORIGINS = ("http://localhost:5173",)

DB_PATH_ENV = "SMARTHOME_DB_PATH"
TICK_SECONDS_ENV = "SMARTHOME_TICK_SECONDS"
CORS_ORIGINS_ENV = "SMARTHOME_CORS_ORIGINS"


@dataclass(frozen=True, slots=True)
class Settings:
    """Validated backend configuration."""

    db_path: str
    tick_seconds: float
    cors_origins: tuple[str, ...]


def _database_path(raw: str) -> str:
    """Return the configured database path, relative to the backend directory."""

    if not raw:
        return DEFAULT_DB_PATH
    if raw == ":memory:":
        return raw
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return str(path)


def get_settings() -> Settings:
    """Read and validate the environment configuration."""

    db_path = _database_path(os.environ.get(DB_PATH_ENV, "").strip())

    raw_tick = os.environ.get(TICK_SECONDS_ENV, "").strip() or DEFAULT_TICK_SECONDS
    try:
        tick_seconds = float(raw_tick)
    except ValueError as exc:
        raise RuntimeError(f"{TICK_SECONDS_ENV} must be a number, got {raw_tick!r}") from exc
    if tick_seconds <= 0:
        raise RuntimeError(f"{TICK_SECONDS_ENV} must be greater than zero, got {raw_tick!r}")

    raw_origins = os.environ.get(CORS_ORIGINS_ENV, "").strip()
    cors_origins = tuple(origin.strip() for origin in raw_origins.split(",") if origin.strip())
    if not cors_origins:
        cors_origins = DEFAULT_CORS_ORIGINS

    return Settings(
        db_path=db_path,
        tick_seconds=tick_seconds,
        cors_origins=cors_origins,
    )
