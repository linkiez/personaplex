import unittest
from pathlib import Path
import sys

MODULE_ROOT = Path(__file__).resolve().parents[1] / "moshi"
if str(MODULE_ROOT) not in sys.path:
    sys.path.insert(0, str(MODULE_ROOT))

from integrations.open_claw.action_extractor import ActionExtractor


class ActionExtractorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.extractor = ActionExtractor()

    def test_extract_from_json_payload(self) -> None:
        candidate = self.extractor.extract('{"action":"move","confidence":0.9,"params":{"distance_m":1.5}}')

        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.action, "move")
        self.assertAlmostEqual(candidate.confidence, 0.9)
        self.assertEqual(candidate.params.get("distance_m"), 1.5)

    def test_extract_from_nested_action_json(self) -> None:
        candidate = self.extractor.extract(
            '{"action":{"type":"turn","confidence":0.88,"params":{"angle_deg":90,"direction":"left"}}}'
        )

        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.action, "turn")
        self.assertAlmostEqual(candidate.confidence, 0.88)
        self.assertEqual(candidate.params.get("angle_deg"), 90)

    def test_extract_from_fenced_json_block(self) -> None:
        candidate = self.extractor.extract(
            'Aqui esta a acao:\n```json\n{"action":"stop","confidence":0.99,"params":{}}\n```'
        )

        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.action, "stop")
        self.assertAlmostEqual(candidate.confidence, 0.99)

    def test_extract_from_text_move_with_distance_and_speed(self) -> None:
        candidate = self.extractor.extract("move forward 120 cm at 0.8 m/s")

        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.action, "move")
        self.assertEqual(candidate.params.get("direction"), "forward")
        self.assertAlmostEqual(candidate.params.get("distance_m"), 1.2)
        self.assertAlmostEqual(candidate.params.get("speed_mps"), 0.8)

    def test_extract_turn_with_angle(self) -> None:
        candidate = self.extractor.extract("turn left 45 degrees")

        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.action, "turn")
        self.assertEqual(candidate.params.get("direction"), "left")
        self.assertAlmostEqual(candidate.params.get("angle_deg"), 45.0)

    def test_extract_from_pt_br_move_sentence(self) -> None:
        candidate = self.extractor.extract("mova para frente 1,5 m a 0,6 m/s")

        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.action, "move")
        self.assertEqual(candidate.params.get("direction"), "forward")
        self.assertAlmostEqual(candidate.params.get("distance_m"), 1.5)
        self.assertAlmostEqual(candidate.params.get("speed_mps"), 0.6)

    def test_extract_none_for_unrelated_text(self) -> None:
        candidate = self.extractor.extract("what is the weather today")
        self.assertIsNone(candidate)


if __name__ == "__main__":
    unittest.main()
