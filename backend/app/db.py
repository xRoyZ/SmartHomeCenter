"""Database engine, session factory and schema creation.

The engine is created lazily: configuration is read when the first session or
the startup hook needs it, never at import time. SQLite is the only store the
spec names, so no server and no migration tool is required.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import get_settings
from .models import Base

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def _build_engine() -> Engine:
    settings = get_settings()
    if settings.db_path == ":memory:":
        return create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
    engine = create_engine(
        f"sqlite:///{settings.db_path}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    event.listen(engine, "connect", _tune_sqlite)
    return engine


def _tune_sqlite(dbapi_connection, _record) -> None:
    """Use write-ahead logging so the per-minute commits stay cheap.

    The engine commits every simulated minute; with the default rollback
    journal each commit waits for a full sync of the file, which caps the
    clock well below 60x and 300x. WAL with ``synchronous=NORMAL`` keeps the
    file consistent across crashes and lets readers run beside the writer.
    """

    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


def get_engine() -> Engine:
    """Return the process-wide database engine, creating it on first use."""

    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """Return the session factory bound to the process-wide engine."""

    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(),
            class_=Session,
            expire_on_commit=False,
        )
    return _session_factory


def init_db() -> None:
    """Create the SQLite directory and every table at startup."""

    settings = get_settings()
    if settings.db_path != ":memory:":
        from pathlib import Path

        Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=get_engine())


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a session and always closes it."""

    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context manager that commits on success and rolls back on failure."""

    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_engine() -> None:
    """Drop the cached engine and session factory (used by tests and resets)."""

    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


class _EngineProxy:
    """Attribute proxy so ``from app.db import engine`` works lazily."""

    def __getattr__(self, name: str) -> object:
        return getattr(get_engine(), name)


engine = _EngineProxy()
