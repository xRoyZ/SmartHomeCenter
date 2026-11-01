"""Demo seed command.

Run with ``python -m app.seed`` from the backend directory. The skeleton creates
the schema; the demo data (rooms, devices, example automations and thresholds)
is filled in by the seed ticket.
"""

from __future__ import annotations

from .db import init_db


def seed() -> None:
    """Populate the demo house. Implemented by the demo seed ticket."""


def main() -> int:
    init_db()
    seed()
    print("Seed abgeschlossen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
