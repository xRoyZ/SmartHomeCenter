"""Manual event triggers.

Implemented by the events ticket; the skeleton keeps the contract signature so
sibling modules can import it.
"""

from __future__ import annotations

from random import Random

from ..schemas import HouseState, MessageOut


def apply(state: HouseState, event_type: str, room_id: str | None, rng: Random) -> MessageOut:
    """Apply a manual event to the state and return the message it produced."""
    raise NotImplementedError("event triggers are implemented by the events ticket")
