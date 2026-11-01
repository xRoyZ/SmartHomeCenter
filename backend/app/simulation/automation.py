"""Automation evaluation.

Implemented by the automation ticket; the skeleton keeps the contract signature
so sibling modules can import it.
"""

from __future__ import annotations

from ..schemas import AutomationOut, ExecutionOut, HouseState


def evaluate(
    state: HouseState, automations: list[AutomationOut], sim_time: str
) -> list[ExecutionOut]:
    """Evaluate every enabled automation and return the executions it produced."""
    return []
