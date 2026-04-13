"""ROS bridge abstraction for dispatching validated robot actions."""

from __future__ import annotations

import logging
import json
from dataclasses import dataclass
from typing import Any
from urllib import request, error

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RosCommand:
    """Normalized command payload sent to a ROS-compatible layer."""

    action: str
    params: dict[str, Any]


class RosBridge:
    """Transport adapter for ROS command dispatch.

    When ``http_endpoint`` is configured, commands are sent as JSON via HTTP
    POST to a rosbridge-compatible gateway. Without endpoint, dispatch falls
    back to structured logging.
    """

    def __init__(
        self,
        http_endpoint: str | None = None,
        timeout_s: float = 1.5,
        auth_token: str | None = None,
    ) -> None:
        self.http_endpoint = http_endpoint
        self.timeout_s = timeout_s
        self.auth_token = auth_token

    def dispatch(self, command: RosCommand) -> None:
        """Dispatch one command to the ROS layer."""
        if self.http_endpoint:
            self._dispatch_http(command)
            return
        logger.info("open_claw_ros_dispatch action=%s params=%s", command.action, command.params)

    def _dispatch_http(self, command: RosCommand) -> None:
        payload = {
            "action": command.action,
            "params": command.params,
        }
        headers = {
            "Content-Type": "application/json",
        }
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        req = request.Request(
            self.http_endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_s) as response:  # noqa: S310
                status = getattr(response, "status", None)
                logger.info(
                    "open_claw_ros_http_dispatch action=%s endpoint=%s status=%s",
                    command.action,
                    self.http_endpoint,
                    status,
                )
        except (error.HTTPError, error.URLError, OSError) as exc:
            logger.warning(
                "open_claw_ros_http_dispatch_failed action=%s endpoint=%s error=%s",
                command.action,
                self.http_endpoint,
                exc,
            )
