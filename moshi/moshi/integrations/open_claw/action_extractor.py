"""Rule-based extraction of actionable commands from natural language."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

_ACTION_PATTERNS: tuple[tuple[re.Pattern[str], str, float], ...] = (
    (re.compile(r"\b(move|go|walk|advance|forward)\b", re.IGNORECASE), "move", 0.7),
    (re.compile(r"\b(turn|rotate)\b", re.IGNORECASE), "turn", 0.7),
    (re.compile(r"\b(stop|halt|freeze)\b", re.IGNORECASE), "stop", 0.95),
    (re.compile(r"\b(pick|grab|collect)\b", re.IGNORECASE), "pick", 0.75),
    (re.compile(r"\b(drop|release)\b", re.IGNORECASE), "drop", 0.75),
)

_ACTION_ALIASES: dict[str, str] = {
    "advance": "move",
    "rotate": "turn",
    "halt": "stop",
    "freeze": "stop",
    "grab": "pick",
    "collect": "pick",
    "release": "drop",
}

_DIRECTION_ALIASES: dict[str, str] = {
    "forward": "forward",
    "backward": "backward",
    "left": "left",
    "right": "right",
}

_DIRECTION_PATTERN = re.compile(
    r"\b(left|right|forward|backward)\b",
    re.IGNORECASE,
)
_DISTANCE_PATTERN = re.compile(
    r"\b(?P<value>\d+(?:[\.,]\d+)?)\s*(?P<unit>m|meter|meters|cm)\b",
    re.IGNORECASE,
)
_ANGLE_PATTERN = re.compile(r"\b(?P<value>\d+(?:[\.,]\d+)?)\s*(deg|degree|degrees)\b", re.IGNORECASE)
_SPEED_PATTERN = re.compile(r"\b(at|a)\s+(?P<value>\d+(?:[\.,]\d+)?)\s*(m/s|mps)\b", re.IGNORECASE)
_JSON_SNIPPET_PATTERN = re.compile(r"\{[\s\S]*\}")


@dataclass(frozen=True, slots=True)
class ActionCandidate:
    """Candidate action extracted from text before safety validation."""

    action: str
    confidence: float
    source_text: str
    params: dict[str, Any]


class ActionExtractor:
    """Extracts action candidates from free text or JSON payloads."""

    def extract(self, payload: str) -> ActionCandidate | None:
        """Return an action candidate when input maps to a known command."""
        candidate_from_json = self._extract_from_json(payload)
        if candidate_from_json is not None:
            return candidate_from_json
        return self._extract_from_text(payload)

    def _extract_from_json(self, payload: str) -> ActionCandidate | None:
        parsed = self._parse_json_payload(payload)
        if parsed is None:
            return None
        data, json_source = parsed

        action, params, confidence_raw = self._extract_action_fields(data)

        action = self._normalize_action(action)
        if not action:
            return None

        try:
            confidence = max(0.0, min(float(confidence_raw), 1.0))
        except (TypeError, ValueError):
            confidence = 1.0

        params = self._normalize_params(params)

        return ActionCandidate(
            action=action,
            confidence=confidence,
            source_text=json_source,
            params=params,
        )

    def _parse_json_payload(self, payload: str) -> tuple[dict[str, Any], str] | None:
        raw_text = payload.strip()
        data = self._safe_json_load(raw_text)
        if isinstance(data, dict):
            return data, raw_text

        json_source = self._extract_json_snippet(raw_text)
        if json_source is None:
            return None

        data = self._safe_json_load(json_source)
        if not isinstance(data, dict):
            return None
        return data, json_source

    @staticmethod
    def _safe_json_load(payload: str) -> Any:
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            return None

    def _extract_action_fields(self, data: dict[str, Any]) -> tuple[str, dict[str, Any], Any]:
        action_data = data.get("action", data.get("command", ""))
        default_confidence: Any = data.get("confidence", 1.0)

        if isinstance(action_data, dict):
            return self._extract_nested_action_fields(action_data, default_confidence)

        params: dict[str, Any] = {}
        params_raw = data.get("params", {})
        if isinstance(params_raw, dict):
            params.update(params_raw)
        return str(action_data).strip().lower(), self._normalize_params(params), default_confidence

    def _extract_nested_action_fields(
        self,
        action_data: dict[str, Any],
        default_confidence: Any,
    ) -> tuple[str, dict[str, Any], Any]:
        action = str(
            action_data.get("type")
            or action_data.get("action")
            or action_data.get("name")
            or action_data.get("operation")
            or ""
        ).strip().lower()
        confidence = action_data.get("confidence", default_confidence)

        params: dict[str, Any] = {}
        nested_params = action_data.get("params")
        if isinstance(nested_params, dict):
            params.update(nested_params)
        else:
            for key, value in action_data.items():
                if key in {"type", "action", "name", "operation", "confidence"}:
                    continue
                params[key] = value

        return action, self._normalize_params(params), confidence

    def _extract_from_text(self, text: str) -> ActionCandidate | None:
        normalized = text.strip()
        if not normalized:
            return None

        for pattern, action, confidence in _ACTION_PATTERNS:
            if not pattern.search(normalized):
                continue

            params: dict[str, Any] = {}
            direction_match = _DIRECTION_PATTERN.search(normalized)
            if direction_match:
                direction = direction_match.group(1).lower()
                params["direction"] = _DIRECTION_ALIASES.get(direction, direction)

            distance_match = _DISTANCE_PATTERN.search(normalized)
            if distance_match:
                value = self._to_float(distance_match.group("value"))
                unit = distance_match.group("unit").lower()
                if unit in {"cm"}:
                    value = value / 100.0
                params["distance_m"] = value

            angle_match = _ANGLE_PATTERN.search(normalized)
            if angle_match:
                params["angle_deg"] = self._to_float(angle_match.group("value"))

            speed_match = _SPEED_PATTERN.search(normalized)
            if speed_match:
                params["speed_mps"] = self._to_float(speed_match.group("value"))

            return ActionCandidate(
                action=action,
                confidence=confidence,
                source_text=normalized,
                params=params,
            )

        return None

    @staticmethod
    def _extract_json_snippet(payload: str) -> str | None:
        fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", payload, re.IGNORECASE)
        if fenced_match:
            return fenced_match.group(1)

        object_match = _JSON_SNIPPET_PATTERN.search(payload)
        if object_match:
            return object_match.group(0)
        return None

    @staticmethod
    def _to_float(raw: Any) -> float:
        if isinstance(raw, (int, float)):
            return float(raw)
        return float(str(raw).replace(",", "."))

    def _normalize_action(self, action: str) -> str:
        normalized = action.strip().lower()
        if not normalized:
            return ""
        return _ACTION_ALIASES.get(normalized, normalized)

    def _normalize_params(self, params: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(params)
        direction_raw = normalized.get("direction")
        if isinstance(direction_raw, str):
            direction = direction_raw.strip().lower()
            normalized["direction"] = _DIRECTION_ALIASES.get(direction, direction)
        return normalized
