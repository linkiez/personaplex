"""Sensor feedback normalization helpers for Open Claw integration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class SensorSnapshot:
    """Normalized sensor snapshot consumed by monitor and safety validation."""

    battery_pct: float | None = None
    obstacle_distance_m: float | None = None
    emergency_stop: bool = False


def parse_sensor_snapshot(raw: Any) -> SensorSnapshot | None:
    """Parse heterogeneous sensor payloads into a normalized snapshot."""
    if not isinstance(raw, dict):
        return None

    battery_raw = raw.get("battery_pct", raw.get("battery"))
    obstacle_raw = raw.get("obstacle_distance_m", raw.get("obstacle_distance"))
    emergency_stop_raw = raw.get("emergency_stop", False)

    return SensorSnapshot(
        battery_pct=_to_float(battery_raw),
        obstacle_distance_m=_to_float(obstacle_raw),
        emergency_stop=bool(emergency_stop_raw),
    )


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
