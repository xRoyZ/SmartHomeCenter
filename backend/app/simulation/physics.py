"""Indoor climate and energy physics.

Implemented by the climate ticket; the skeleton keeps the contract signature so
sibling modules can import it.
"""

from __future__ import annotations

from random import Random

from ..schemas import HouseState


def step_physics(state: HouseState, rng: Random, dt_min: int) -> None:
    """Advance room climate, heating and energy by ``dt_min`` simulated minutes."""
    return None
