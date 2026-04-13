# Technical Documentation

## System Overview

VoxPulse is a real-time voice interaction stack composed of three main layers:

1. Angular client for audio capture, wake-word detection, and UI
2. Python voice runtime for streaming audio decode/inference/encode
3. Node.js API for auth, preferences, and persistence

## High-Level Flow

```text
Microphone -> Angular Web Audio pipeline -> WebSocket -> Python server
Python server -> text/audio response -> Angular playback/UI
Optional action extraction -> OpenClaw monitor -> ROS bridge
```

## Core Components

### Angular Client

- Entry: client-angular/src/app/app.ts
- Wake-word services:
  - client-angular/src/app/wake-word/wake-word-detector.service.ts
  - client-angular/src/app/wake-word/wake-word-state.service.ts
- OpenClaw action feed:
  - client-angular/src/app/open-claw-action-feed.service.ts

### Python Runtime

- Main server: moshi/moshi/server.py
- Offline runner: moshi/moshi/offline.py
- Model loading: moshi/moshi/models/loaders.py
- OpenClaw monitor: moshi/moshi/openclaw_monitor.py
- OpenClaw integration utilities:
  - moshi/moshi/integrations/open_claw/action_extractor.py
  - moshi/moshi/integrations/open_claw/safety_constraints.py
  - moshi/moshi/integrations/open_claw/ros_bridge.py

### Node API

- Entry: server/src/index.ts
- Routes:
  - server/src/routes/auth.ts
  - server/src/routes/conversations.ts
  - server/src/routes/messages.ts
  - server/src/routes/preferences.ts
- Database schema: server/src/db/schema.ts

## Configuration

Use .env variables from .env.example.

Important groups:

- LocalAI and voice runtime
- OpenClaw monitor and safety limits
- API auth and database access
- OIDC/Keycloak integration
- Redis and Fluentd integration

## Deployment

### Local development

- Run moshi server directly with SSL temp dir
- Run Angular dev server on port 4200

### Containerized deployment

Use docker-compose.yaml to run:

- moshi-voice
- openclaw-monitor
- api
- nginx

## Testing

### Python

```bash
cd moshi
pytest
```

### Angular

```bash
cd client-angular
npm test
```

### API

```bash
cd server
npm test
```

## Security Notes

- Never commit real tokens, secrets, or private keys
- Use environment variables or a secret manager
- Use HTTPS/WSS in production
- Keep JWT and OIDC credentials out of logs
