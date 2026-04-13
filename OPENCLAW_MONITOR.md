# OpenClaw Monitor (Debian Background Service)

The OpenClaw monitor bridges OpenClaw and Moshi in full-duplex mode over WebSocket.

## Data Flow

- OpenClaw -> Moshi
  - Binary audio (or base64 JSON mode)
  - Sensor and feedback events
- Moshi -> OpenClaw
  - Binary audio frames
  - Text messages
  - Optional structured action events after validation

## Manual Run

```bash
moshi-openclaw-monitor \
  --openclaw-ws ws://127.0.0.1:7000/ws/audio \
  --moshi-ws ws://127.0.0.1:8998/api/chat \
  --moshi-query worker_auth_id=silence_check
```

## Important Flags

- --openclaw-ws: OpenClaw websocket endpoint
- --moshi-ws: Moshi websocket endpoint
- --reconnect-delay: reconnect delay in seconds
- --audio-json-out: mirror audio output as base64 JSON
- --emit-actions: enable action extraction from text output
- --action-min-confidence: action confidence threshold
- --max-action-distance-m: action movement distance limit
- --max-action-speed-mps: action speed limit
- --max-action-angle-deg: action rotation limit
- --min-obstacle-distance-m: safety distance threshold
- --min-battery-pct: minimum battery threshold
- --sensor-stale-after-ms: sensor snapshot freshness timeout
- --rosbridge-http-endpoint: optional ROS gateway endpoint

## Action Pipeline

When --emit-actions is enabled:

1. Parse model text into action candidates
2. Validate action type and limits
3. Apply sensor-aware safety constraints
4. Dispatch approved action to ROS bridge or structured logging
5. Emit action or action_rejected event to OpenClaw

## systemd Deployment

Unit file:

- deploy/systemd/moshi-openclaw-monitor.service

Setup:

```bash
sudo cp deploy/systemd/moshi-openclaw-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now moshi-openclaw-monitor
```

Logs:

```bash
sudo journalctl -u moshi-openclaw-monitor -f
```

## Docker Compose Usage

The compose stack includes openclaw-monitor and moshi-voice services.

```bash
docker compose up -d moshi-voice openclaw-monitor
docker compose logs -f openclaw-monitor
```
