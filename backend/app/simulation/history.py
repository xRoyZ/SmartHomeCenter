"""History recording, query and CSV export.

Implemented by the history ticket; the skeleton keeps the contract signatures so
sibling modules can import them.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..schemas import HistorySeries, HouseState


def record(session: Session, state: HouseState) -> None:
    """Store one reading per room and metric for the current simulated time."""
    return None


def query(session: Session, room_id: str, metric: str, window: str) -> HistorySeries:
    """Return the stored readings of one room and metric for a time window."""
    raise NotImplementedError("history queries are implemented by the history ticket")


def export(session: Session, room_id: str, metric: str, window: str) -> tuple[str, str]:
    """Return the CSV filename and content for one room and time window."""
    raise NotImplementedError("history export is implemented by the history ticket")
