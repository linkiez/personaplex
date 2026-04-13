"""Safety guards for action commands emitted by the Open Claw integration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_ALLOWED_ACTIONS = frozenset({"move", "turn", "stop", "pick", "drop"})
_DEFAULT_MAX_DISTANCE_M = 2.0
_DEFAULT_MAX_SPEED_MPS = 1.2
_DEFAULT_MAX_ANGLE_DEG = 180.0
_DEFAULT_MIN_OBSTACLE_DISTANCE_M = 0.3
_DEFAULT_MIN_BATTERY_PCT = 5.0


@dataclass(frozen=True, slots=True)
class ActionValidationResult:
    """Validation outcome for one action command."""

    allowed: bool
    reason: str | None = None


class SafetyConstraints:
    """Apply deterministic limits before dispatching robot actions."""

    def __init__(
        self,
        max_distance_m: float = _DEFAULT_MAX_DISTANCE_M,
        max_speed_mps: float = _DEFAULT_MAX_SPEED_MPS,
        max_angle_deg: float = _DEFAULT_MAX_ANGLE_DEG,
        min_obstacle_distance_m: float = _DEFAULT_MIN_OBSTACLE_DISTANCE_M,
        min_battery_pct: float = _DEFAULT_MIN_BATTERY_PCT,
    ) -> None:
        self.max_distance_m = max_distance_m
        self.max_speed_mps = max_speed_mps
        self.max_angle_deg = max_angle_deg
        self.min_obstacle_distance_m = min_obstacle_distance_m
        self.min_battery_pct = min_battery_pct

    def validate(
        self,
        action: str,
        params: dict[str, Any],
        sensor_snapshot: dict[str, Any] | None = None,
    ) -> ActionValidationResult:
        """Return whether an action is safe enough to be emitted."""
        if action not in _ALLOWED_ACTIONS:
            return ActionValidationResult(False, f"unsupported_action:{action}")

        sensor_result = self._validate_sensor_snapshot(sensor_snapshot)
        if sensor_result is not None:
            return sensor_result

        if action == "stop":
            return ActionValidationResult(True)

        distance_m = self._as_float(params.get("distance_m"))
        if distance_m is not None and (distance_m <= 0.0 or distance_m > self.max_distance_m):
            return ActionValidationResult(False, "distance_out_of_bounds")

        speed_mps = self._as_float(params.get("speed_mps"))
        if speed_mps is not None and (speed_mps <= 0.0 or speed_mps > self.max_speed_mps):
            return ActionValidationResult(False, "speed_out_of_bounds")

        angle_deg = self._as_float(params.get("angle_deg"))
        if angle_deg is not None and abs(angle_deg) > self.max_angle_deg:
            return ActionValidationResult(False, "angle_out_of_bounds")

        return ActionValidationResult(True)

    def _validate_sensor_snapshot(
        self,
        sensor_snapshot: dict[str, Any] | None,
    ) -> ActionValidationResult | None:
        sensor = sensor_snapshot or {}
        if bool(sensor.get("emergency_stop")):
            return ActionValidationResult(False, "emergency_stop_active")

        obstacle_distance_m = self._as_float(sensor.get("obstacle_distance_m"))
        if obstacle_distance_m is not None and obstacle_distance_m < self.min_obstacle_distance_m:
            return ActionValidationResult(False, "obstacle_too_close")

        battery_pct = self._as_float(sensor.get("battery_pct"))
        if battery_pct is not None and battery_pct < self.min_battery_pct:
            return ActionValidationResult(False, "battery_too_low")

        return None

    @staticmethod
    def _as_float(value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
