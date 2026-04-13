# SPDX-License-Identifier: MIT

import argparse
import asyncio
import base64
import json
import time
from dataclasses import dataclass, field
from typing import Any

import aiohttp

from .integrations.open_claw import (
    ActionExtractor,
    RosBridge,
    RosCommand,
    SafetyConstraints,
    SensorSnapshot,
    parse_sensor_snapshot,
)
from .utils.logging import setup_logger


logger = setup_logger(__name__)


@dataclass
class MonitorConfig:
    openclaw_ws: str
    moshi_base_ws: str
    reconnect_delay: float = 2.0
    audio_json_out: bool = False
    emit_actions: bool = False
    action_min_confidence: float = 0.75
    max_action_distance_m: float = 2.0
    max_action_speed_mps: float = 1.2
    max_action_angle_deg: float = 180.0
    min_obstacle_distance_m: float = 0.3
    min_battery_pct: float = 5.0
    sensor_stale_after_ms: float = 3000.0
    rosbridge_http_endpoint: str | None = None
    rosbridge_timeout_s: float = 1.5
    rosbridge_auth_token: str | None = None
    query: dict[str, str] = field(default_factory=dict)


class OpenClawMonitor:
    def __init__(self, config: MonitorConfig):
        self.config = config
        self.action_extractor = ActionExtractor()
        self.safety_constraints = SafetyConstraints(
            max_distance_m=config.max_action_distance_m,
            max_speed_mps=config.max_action_speed_mps,
            max_angle_deg=config.max_action_angle_deg,
            min_obstacle_distance_m=config.min_obstacle_distance_m,
            min_battery_pct=config.min_battery_pct,
        )
        self.ros_bridge = RosBridge(
            http_endpoint=config.rosbridge_http_endpoint,
            timeout_s=config.rosbridge_timeout_s,
            auth_token=config.rosbridge_auth_token,
        )
        self.last_sensor_snapshot: SensorSnapshot | None = None
        self.last_sensor_seen_at: float = 0.0

    def _build_moshi_ws_url(self) -> str:
        if not self.config.query:
            return self.config.moshi_base_ws
        sep = '&' if '?' in self.config.moshi_base_ws else '?'
        query = '&'.join(f"{k}={v}" for k, v in self.config.query.items())
        return f"{self.config.moshi_base_ws}{sep}{query}"

    async def _send_openclaw_json(self, ws: aiohttp.ClientWebSocketResponse, payload: dict[str, Any]) -> None:
        await ws.send_str(json.dumps(payload, ensure_ascii=False))

    async def _handle_openclaw_text(
        self,
        msg_data: str,
        openclaw_ws: aiohttp.ClientWebSocketResponse,
        moshi_ws: aiohttp.ClientWebSocketResponse,
    ) -> None:
        try:
            payload = json.loads(msg_data)
        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON from OpenClaw")
            return

        msg_type = payload.get("type")
        if msg_type == "audio":
            encoded = payload.get("data")
            if not isinstance(encoded, str):
                return
            try:
                raw = base64.b64decode(encoded)
            except Exception:
                logger.warning("Failed to decode base64 audio from OpenClaw")
                return
            await moshi_ws.send_bytes(b"\x01" + raw)
            return

        if msg_type == "control":
            action = payload.get("action")
            if action == "ping":
                await self._send_openclaw_json(openclaw_ws, {"type": "control", "action": "pong"})
            elif action == "stop":
                await moshi_ws.close()
            return

        if msg_type in {"sensor", "feedback"}:
            sensor_payload = payload.get("data", payload)
            snapshot = parse_sensor_snapshot(sensor_payload)
            if snapshot is None:
                logger.warning("Ignoring invalid sensor payload from OpenClaw")
                return
            self.last_sensor_snapshot = snapshot
            self.last_sensor_seen_at = time.monotonic()
            await self._send_openclaw_json(
                openclaw_ws,
                {
                    "type": "sensor_ack",
                    "data": {
                        "accepted": True,
                        "battery_pct": snapshot.battery_pct,
                        "obstacle_distance_m": snapshot.obstacle_distance_m,
                        "emergency_stop": snapshot.emergency_stop,
                    },
                },
            )

    async def _openclaw_to_moshi(
        self,
        openclaw_ws: aiohttp.ClientWebSocketResponse,
        moshi_ws: aiohttp.ClientWebSocketResponse,
        stop_event: asyncio.Event,
    ) -> None:
        try:
            async for msg in openclaw_ws:
                if msg.type == aiohttp.WSMsgType.BINARY:
                    await moshi_ws.send_bytes(b"\x01" + msg.data)
                elif msg.type == aiohttp.WSMsgType.TEXT:
                    await self._handle_openclaw_text(msg.data, openclaw_ws, moshi_ws)
                elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
        finally:
            stop_event.set()

    async def _moshi_to_openclaw(
        self,
        openclaw_ws: aiohttp.ClientWebSocketResponse,
        moshi_ws: aiohttp.ClientWebSocketResponse,
        stop_event: asyncio.Event,
    ) -> None:
        try:
            async for msg in moshi_ws:
                if msg.type != aiohttp.WSMsgType.BINARY:
                    if msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                        break
                    continue

                payload = msg.data
                if not payload:
                    continue
                kind, content = payload[0], payload[1:]

                if kind == 0:
                    await self._send_openclaw_json(openclaw_ws, {"type": "status", "target": "moshi", "state": "handshake"})
                elif kind == 1:
                    await openclaw_ws.send_bytes(content)
                    if self.config.audio_json_out:
                        await self._send_openclaw_json(
                            openclaw_ws,
                            {"type": "audio", "encoding": "base64", "data": base64.b64encode(content).decode("ascii")},
                        )
                elif kind == 2:
                    text = content.decode("utf-8", errors="replace")
                    await self._send_openclaw_json(openclaw_ws, {"type": "text", "data": text})
                    await self._maybe_emit_action(openclaw_ws, text)
        finally:
            stop_event.set()

    async def _maybe_emit_action(
        self,
        openclaw_ws: aiohttp.ClientWebSocketResponse,
        text: str,
    ) -> None:
        if not self.config.emit_actions:
            return

        candidate = self.action_extractor.extract(text)
        if candidate is None:
            return

        if candidate.confidence < self.config.action_min_confidence:
            logger.info(
                "Skipping extracted action below confidence threshold action=%s confidence=%.2f",
                candidate.action,
                candidate.confidence,
            )
            return

        sensor_context = self._get_fresh_sensor_context()
        validation = self.safety_constraints.validate(candidate.action, candidate.params, sensor_context)
        if not validation.allowed:
            logger.warning(
                "Blocked extracted action action=%s reason=%s source=%s",
                candidate.action,
                validation.reason,
                candidate.source_text,
            )
            await self._send_openclaw_json(
                openclaw_ws,
                {
                    "type": "action_rejected",
                    "data": {
                        "action": candidate.action,
                        "reason": validation.reason,
                        "source": candidate.source_text,
                        "sensor": sensor_context,
                    },
                },
            )
            return

        self.ros_bridge.dispatch(RosCommand(action=candidate.action, params=candidate.params))
        await self._send_openclaw_json(
            openclaw_ws,
            {
                "type": "action",
                "data": {
                    "action": candidate.action,
                    "params": candidate.params,
                    "confidence": candidate.confidence,
                    "source": candidate.source_text,
                    "sensor": sensor_context,
                },
            },
        )

    def _get_fresh_sensor_context(self) -> dict[str, Any]:
        if self.last_sensor_snapshot is None:
            return {}
        stale_after_s = self.config.sensor_stale_after_ms / 1000.0
        if stale_after_s <= 0:
            stale_after_s = 0.001
        if (time.monotonic() - self.last_sensor_seen_at) > stale_after_s:
            return {}
        return {
            "battery_pct": self.last_sensor_snapshot.battery_pct,
            "obstacle_distance_m": self.last_sensor_snapshot.obstacle_distance_m,
            "emergency_stop": self.last_sensor_snapshot.emergency_stop,
        }

    async def _bridge_once(self, session: aiohttp.ClientSession) -> None:
        logger.info("Connecting to OpenClaw WS: %s", self.config.openclaw_ws)
        async with session.ws_connect(self.config.openclaw_ws, heartbeat=30) as openclaw_ws:
            await self._send_openclaw_json(openclaw_ws, {"type": "status", "target": "openclaw", "state": "connected"})

            moshi_ws_url = self._build_moshi_ws_url()
            logger.info("Connecting to Moshi WS: %s", moshi_ws_url)
            async with session.ws_connect(moshi_ws_url, heartbeat=30) as moshi_ws:
                await self._send_openclaw_json(openclaw_ws, {"type": "status", "target": "moshi", "state": "connected"})

                stop_event = asyncio.Event()
                tasks = [
                    asyncio.create_task(self._openclaw_to_moshi(openclaw_ws, moshi_ws, stop_event)),
                    asyncio.create_task(self._moshi_to_openclaw(openclaw_ws, moshi_ws, stop_event)),
                ]

                await stop_event.wait()
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

    async def run(self) -> None:
        timeout = aiohttp.ClientTimeout(total=None)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            while True:
                try:
                    await self._bridge_once(session)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.error("Bridge error: %s", exc)

                logger.info("Reconnecting in %.1fs", self.config.reconnect_delay)
                await asyncio.sleep(self.config.reconnect_delay)


def _parse_kv(pairs: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in pairs:
        if '=' not in item:
            raise ValueError(f"Invalid query override '{item}'. Expected key=value")
        key, value = item.split('=', 1)
        out[key] = value
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenClaw <-> Moshi full-duplex WebSocket monitor")
    parser.add_argument("--openclaw-ws", required=True, help="OpenClaw WebSocket endpoint")
    parser.add_argument(
        "--moshi-ws",
        default="ws://127.0.0.1:8998/api/chat",
        help="Moshi WebSocket endpoint",
    )
    parser.add_argument(
        "--moshi-query",
        action="append",
        default=[],
        help="Extra Moshi query params as key=value (repeatable)",
    )
    parser.add_argument("--reconnect-delay", type=float, default=2.0, help="Reconnect delay in seconds")
    parser.add_argument(
        "--audio-json-out",
        action="store_true",
        help="Mirror audio to OpenClaw as base64 JSON besides raw binary",
    )
    parser.add_argument(
        "--emit-actions",
        action="store_true",
        help="Extract actionable commands from model text and emit action events",
    )
    parser.add_argument(
        "--action-min-confidence",
        type=float,
        default=0.75,
        help="Minimum confidence required to emit an extracted action",
    )
    parser.add_argument(
        "--max-action-distance-m",
        type=float,
        default=2.0,
        help="Safety upper bound for extracted movement distance in meters",
    )
    parser.add_argument(
        "--max-action-speed-mps",
        type=float,
        default=1.2,
        help="Safety upper bound for extracted movement speed in meters per second",
    )
    parser.add_argument(
        "--max-action-angle-deg",
        type=float,
        default=180.0,
        help="Safety upper bound for extracted turn angle in degrees",
    )
    parser.add_argument(
        "--min-obstacle-distance-m",
        type=float,
        default=0.3,
        help="Minimum obstacle distance required to allow movement actions",
    )
    parser.add_argument(
        "--min-battery-pct",
        type=float,
        default=5.0,
        help="Minimum battery percentage required for non-stop actions",
    )
    parser.add_argument(
        "--sensor-stale-after-ms",
        type=float,
        default=3000.0,
        help="Maximum age of sensor snapshots used for action safety checks",
    )
    parser.add_argument(
        "--rosbridge-http-endpoint",
        default=None,
        help="Optional HTTP endpoint used to dispatch approved actions to ROS gateway",
    )
    parser.add_argument(
        "--rosbridge-timeout-s",
        type=float,
        default=1.5,
        help="Timeout in seconds for ROS HTTP dispatch requests",
    )
    parser.add_argument(
        "--rosbridge-auth-token",
        default=None,
        help="Optional bearer token used for ROS HTTP dispatch authentication",
    )

    args = parser.parse_args()
    cfg = MonitorConfig(
        openclaw_ws=args.openclaw_ws,
        moshi_base_ws=args.moshi_ws,
        reconnect_delay=args.reconnect_delay,
        audio_json_out=args.audio_json_out,
        emit_actions=args.emit_actions,
        action_min_confidence=args.action_min_confidence,
        max_action_distance_m=args.max_action_distance_m,
        max_action_speed_mps=args.max_action_speed_mps,
        max_action_angle_deg=args.max_action_angle_deg,
        min_obstacle_distance_m=args.min_obstacle_distance_m,
        min_battery_pct=args.min_battery_pct,
        sensor_stale_after_ms=args.sensor_stale_after_ms,
        rosbridge_http_endpoint=args.rosbridge_http_endpoint,
        rosbridge_timeout_s=args.rosbridge_timeout_s,
        rosbridge_auth_token=args.rosbridge_auth_token,
        query=_parse_kv(args.moshi_query),
    )
    monitor = OpenClawMonitor(cfg)
    asyncio.run(monitor.run())


if __name__ == "__main__":
    main()
