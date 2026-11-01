"""Outdoor weather simulation step.

Implemented by the simulation-clock ticket; the skeleton keeps the contract
signature so sibling modules can import it.
"""

from __future__ import annotations

from random import Random

from ..schemas import HouseState


def step_weather(state: HouseState, rng: Random, dt_min: int) -> None:
    """Advance weather, season and solar production by ``dt_min`` simulated minutes."""
    return None
