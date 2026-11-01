"""Occupant behaviour simulation.

Implemented by the occupant ticket; the skeleton keeps the contract signature so
sibling modules can import it.
"""

from __future__ import annotations

from random import Random

from ..schemas import HouseState


def step_behavior(state: HouseState, rng: Random, dt_min: int) -> None:
    """Advance windows, doors, motion and device use by ``dt_min`` simulated minutes."""
    return None
