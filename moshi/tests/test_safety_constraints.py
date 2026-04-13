import unittest
from pathlib import Path
import sys

MODULE_ROOT = Path(__file__).resolve().parents[1] / "moshi"
if str(MODULE_ROOT) not in sys.path:
    sys.path.insert(0, str(MODULE_ROOT))

from integrations.open_claw.safety_constraints import SafetyConstraints


class SafetyConstraintsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constraints = SafetyConstraints(
            max_distance_m=2.0,
            max_speed_mps=1.2,
            max_angle_deg=180.0,
        )

    def test_allow_stop_action(self) -> None:
        result = self.constraints.validate("stop", {})
        self.assertTrue(result.allowed)

    def test_reject_unsupported_action(self) -> None:
        result = self.constraints.validate("dance", {})
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "unsupported_action:dance")

    def test_reject_distance_out_of_bounds(self) -> None:
        result = self.constraints.validate("move", {"distance_m": 3.0})
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "distance_out_of_bounds")

    def test_reject_speed_out_of_bounds(self) -> None:
        result = self.constraints.validate("move", {"speed_mps": 2.0})
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "speed_out_of_bounds")

    def test_reject_angle_out_of_bounds(self) -> None:
        result = self.constraints.validate("turn", {"angle_deg": 200.0})
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "angle_out_of_bounds")

    def test_allow_valid_move(self) -> None:
        result = self.constraints.validate("move", {"distance_m": 1.8, "speed_mps": 0.9})
        self.assertTrue(result.allowed)

    def test_reject_when_emergency_stop_is_active(self) -> None:
        result = self.constraints.validate(
            "move",
            {"distance_m": 0.5},
            {"emergency_stop": True},
        )
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "emergency_stop_active")

    def test_reject_when_obstacle_too_close(self) -> None:
        result = self.constraints.validate(
            "move",
            {"distance_m": 0.4},
            {"obstacle_distance_m": 0.2},
        )
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "obstacle_too_close")

    def test_reject_when_battery_too_low(self) -> None:
        result = self.constraints.validate(
            "pick",
            {},
            {"battery_pct": 3.0},
        )
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "battery_too_low")


if __name__ == "__main__":
    unittest.main()
