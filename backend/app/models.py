"""SQLAlchemy tables of the smart-home simulator.

The schema is created at startup by :func:`app.db.init_db`. All identifiers are
plain simulator keys; no personal data of a browser is ever stored here.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for every table of the product."""


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    is_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_temp: Mapped[float | None] = mapped_column(Float, nullable=True)
    power_w: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id"), nullable=False, index=True)
    metric: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    sim_time: Mapped[str] = mapped_column(String(32), nullable=False, index=True)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    room_id: Mapped[str | None] = mapped_column(ForeignKey("rooms.id"), nullable=True, index=True)
    text: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    acknowledged_at: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Automation(Base):
    __tablename__ = "automations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    condition_type: Mapped[str] = mapped_column(String(32), nullable=False)
    condition_room_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    condition_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    condition_time: Mapped[str | None] = mapped_column(String(8), nullable=True)
    action_type: Mapped[str] = mapped_column(String(32), nullable=False)
    action_room_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action_device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    notify: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)


class AutomationLog(Base):
    __tablename__ = "automation_log"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    automation_id: Mapped[str] = mapped_column(
        ForeignKey("automations.id"), nullable=False, index=True
    )
    sim_time: Mapped[str] = mapped_column(String(32), nullable=False)
    text: Mapped[str] = mapped_column(String(500), nullable=False)


class Threshold(Base):
    __tablename__ = "thresholds"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    default_value: Mapped[float] = mapped_column(Float, nullable=False)


class SimState(Base):
    __tablename__ = "sim_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sim_time: Mapped[str] = mapped_column(String(32), nullable=False)
    weekday: Mapped[str] = mapped_column(String(16), nullable=False)
    tick: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    speed: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    weather: Mapped[str] = mapped_column(String(16), nullable=False)
    season: Mapped[str] = mapped_column(String(16), nullable=False)
    occupancy_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    outdoor_temperature: Mapped[float] = mapped_column(Float, nullable=False)
    outdoor_weather: Mapped[str] = mapped_column(String(16), nullable=False)
    outdoor_season: Mapped[str] = mapped_column(String(16), nullable=False)
    is_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sunrise: Mapped[str] = mapped_column(String(8), nullable=False)
    sunset: Mapped[str] = mapped_column(String(8), nullable=False)
    solar_w: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    state_json: Mapped[str | None] = mapped_column(Text, nullable=True)
