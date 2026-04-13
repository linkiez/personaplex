import asyncio
import json
import types
import sys
import unittest
from pathlib import Path

MODULE_ROOT = Path(__file__).resolve().parents[1]
if str(MODULE_ROOT) not in sys.path:
    sys.path.insert(0, str(MODULE_ROOT))

if "aiohttp" not in sys.modules:
    sys.modules["aiohttp"] = types.SimpleNamespace(
        ClientWebSocketResponse=object,
        ClientSession=object,
        ClientTimeout=object,
        WSMsgType=types.SimpleNamespace(BINARY=1, TEXT=2, CLOSE=3, CLOSED=4, ERROR=5),
    )

from moshi.openclaw_monitor import MonitorConfig, OpenClawMonitor


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent_payloads: list[dict] = []
        self.sent_binary: list[bytes] = []

    async def send_str(self, payload: str) -> None:
        await asyncio.sleep(0)
        self.sent_payloads.append(json.loads(payload))

    async def send_bytes(self, payload: bytes) -> None:
        await asyncio.sleep(0)
        self.sent_binary.append(payload)


class _FakeMoshiWebSocket:
    def __init__(self, inbound_messages: list[object] | None = None) -> None:
        self.received_binary: list[bytes] = []
        self._inbound_messages = inbound_messages or []

    async def send_bytes(self, payload: bytes) -> None:
        await asyncio.sleep(0)
        self.received_binary.append(payload)

    def __aiter__(self):
        async def _gen():
            for message in self._inbound_messages:
                yield message
        return _gen()


class _InboundWebSocket:
    def __init__(self, inbound_messages: list[object]) -> None:
        self._inbound_messages = inbound_messages

    def __aiter__(self):
        async def _gen():
            for message in self._inbound_messages:
                yield message
        return _gen()


class _Message:
    def __init__(self, msg_type: int, data: bytes | str):
        self.type = msg_type
        self.data = data


class OpenClawMonitorActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_emit_action_when_candidate_is_valid(self) -> None:
        cfg = MonitorConfig(
            openclaw_ws="ws://openclaw",
            moshi_base_ws="ws://moshi",
            emit_actions=True,
            action_min_confidence=0.7,
        )
        monitor = OpenClawMonitor(cfg)
        ws = _FakeWebSocket()

        await monitor._maybe_emit_action(ws, "move forward 1 m at 0.6 m/s")

        self.assertGreaterEqual(len(ws.sent_payloads), 1)
        self.assertEqual(ws.sent_payloads[-1]["type"], "action")
        self.assertEqual(ws.sent_payloads[-1]["data"]["action"], "move")
        self.assertEqual(ws.sent_payloads[-1]["data"].get("sensor"), {})

    async def test_emit_rejected_action_when_safety_blocks(self) -> None:
        cfg = MonitorConfig(
            openclaw_ws="ws://openclaw",
            moshi_base_ws="ws://moshi",
            emit_actions=True,
            action_min_confidence=0.6,
            max_action_distance_m=1.0,
        )
        monitor = OpenClawMonitor(cfg)
        ws = _FakeWebSocket()

        await monitor._maybe_emit_action(ws, "move forward 2 m")

        self.assertGreaterEqual(len(ws.sent_payloads), 1)
        self.assertEqual(ws.sent_payloads[-1]["type"], "action_rejected")

    async def test_ingest_sensor_feedback_and_include_sensor_context(self) -> None:
        cfg = MonitorConfig(
            openclaw_ws="ws://openclaw",
            moshi_base_ws="ws://moshi",
            emit_actions=True,
            action_min_confidence=0.7,
        )
        monitor = OpenClawMonitor(cfg)
        ws = _FakeWebSocket()
        moshi_ws = _FakeMoshiWebSocket()

        await monitor._handle_openclaw_text(
            json.dumps(
                {
                    "type": "sensor",
                    "data": {
                        "battery_pct": 84.0,
                        "obstacle_distance_m": 0.9,
                        "emergency_stop": False,
                    },
                }
            ),
            ws,
            moshi_ws,
        )

        self.assertGreaterEqual(len(ws.sent_payloads), 1)
        self.assertEqual(ws.sent_payloads[-1]["type"], "sensor_ack")

        await monitor._maybe_emit_action(ws, "move forward 1 m")

        self.assertEqual(ws.sent_payloads[-1]["type"], "action")
        self.assertEqual(ws.sent_payloads[-1]["data"]["sensor"]["battery_pct"], 84.0)

    async def test_sensor_context_can_block_action(self) -> None:
        cfg = MonitorConfig(
            openclaw_ws="ws://openclaw",
            moshi_base_ws="ws://moshi",
            emit_actions=True,
            action_min_confidence=0.7,
        )
        monitor = OpenClawMonitor(cfg)
        ws = _FakeWebSocket()
        moshi_ws = _FakeMoshiWebSocket()

        await monitor._handle_openclaw_text(
            json.dumps(
                {
                    "type": "sensor",
                    "data": {
                        "battery_pct": 40.0,
                        "obstacle_distance_m": 0.1,
                        "emergency_stop": False,
                    },
                }
            ),
            ws,
            moshi_ws,
        )

        await monitor._maybe_emit_action(ws, "move forward 1 m")

        self.assertEqual(ws.sent_payloads[-1]["type"], "action_rejected")
        self.assertEqual(ws.sent_payloads[-1]["data"]["reason"], "obstacle_too_close")

    async def test_openclaw_binary_audio_is_forwarded_to_moshi(self) -> None:
        cfg = MonitorConfig(
            openclaw_ws="ws://openclaw",
            moshi_base_ws="ws://moshi",
        )
        monitor = OpenClawMonitor(cfg)
        openclaw_ws = _InboundWebSocket([
            _Message(sys.modules["aiohttp"].WSMsgType.BINARY, b"\x10\x20\x30"),
        ])
        moshi_ws = _FakeMoshiWebSocket()
        stop_event = asyncio.Event()

        await monitor._openclaw_to_moshi(openclaw_ws, moshi_ws, stop_event)

        self.assertEqual(len(moshi_ws.received_binary), 1)
        self.assertEqual(moshi_ws.received_binary[0], b"\x01\x10\x20\x30")
        self.assertTrue(stop_event.is_set())

    async def test_moshi_binary_text_and_audio_are_forwarded_to_openclaw(self) -> None:
        cfg = MonitorConfig(
            openclaw_ws="ws://openclaw",
            moshi_base_ws="ws://moshi",
            audio_json_out=True,
        )
        monitor = OpenClawMonitor(cfg)
        openclaw_ws = _FakeWebSocket()
        moshi_ws = _FakeMoshiWebSocket(
            inbound_messages=[
                _Message(sys.modules["aiohttp"].WSMsgType.BINARY, b"\x01\xaa\xbb"),
                _Message(sys.modules["aiohttp"].WSMsgType.BINARY, b"\x02hello world"),
            ]
        )
        stop_event = asyncio.Event()

        await monitor._moshi_to_openclaw(openclaw_ws, moshi_ws, stop_event)

        self.assertEqual(openclaw_ws.sent_binary, [b"\xaa\xbb"])
        self.assertEqual(openclaw_ws.sent_payloads[0]["type"], "audio")
        self.assertEqual(openclaw_ws.sent_payloads[1]["type"], "text")
        self.assertEqual(openclaw_ws.sent_payloads[1]["data"], "hello world")
        self.assertTrue(stop_event.is_set())


if __name__ == "__main__":
    unittest.main()
