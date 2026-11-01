"""Threshold alert evaluation.

Implemented by the alerts ticket; the skeleton keeps the contract signature so
sibling modules can import it.
"""

from __future__ import annotations

from ..schemas import HouseState, MessageOut, ThresholdOut


def evaluate(state: HouseState, thresholds: list[ThresholdOut], sim_time: str) -> list[MessageOut]:
    """Evaluate thresholds and return the messages they produced."""
    return []
