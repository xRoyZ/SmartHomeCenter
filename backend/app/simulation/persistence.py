"""Simulation state persistence.

Implemented by the persistence ticket; the skeleton keeps the contract signatures
so sibling modules can import them.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..schemas import HouseState, SettingsOut


def load(session: Session) -> tuple[HouseState, SettingsOut] | None:
    """Load the persisted house state and settings, or ``None`` when empty."""
    return None


def save(session: Session, state: HouseState, settings: SettingsOut) -> None:
    """Persist the current house state and settings."""
    return None


def reset_store(session: Session, reset_automations: bool, reset_thresholds: bool) -> None:
    """Reset persisted simulation data and optionally automations and thresholds."""
    return None
