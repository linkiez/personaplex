# VoxPulse Realtime Voice Hub

Real-time full-duplex voice conversation platform built on Moshi-style audio streaming, with local wake-word detection in the browser and optional OpenClaw robotics action bridging.

## Architecture

```text
Browser (Angular + Web Audio + ONNX) --WSS--> Python Voice Server (aiohttp + PyTorch)
                                           \\-> Node API (auth, preferences, persistence)
```

## Requirements

- Python 3.10+
- Node.js 18+
- LocalAI-compatible endpoint for LLM text generation
- Optional NVIDIA GPU for lower latency

External services commonly used in integration environments:

- PostgreSQL
- Redis
- Keycloak
- Fluentd/Elasticsearch/Kibana

## Quick Start

```bash
git clone <repo-url>
cd voxpulse-realtime-voice-hub

# Python backend
cd moshi
pip install -e .

# Angular frontend
cd ../client-angular
npm install
```

Create environment variables:

```bash
cp .env.example .env
```

Run locally:

```bash
# Terminal 1
cd moshi
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR"

# Terminal 2
cd client-angular
npm run start
```

Open http://localhost:4200.

## Docker Compose

```bash
docker compose up --build
```

Main endpoints:

- Voice server: https://localhost:8998
- API server: http://localhost:3001

## Wake Word

Wake-word detection runs locally in the browser and only opens the active conversation flow when voice activity and trigger conditions are met.

See WAKE_WORD_IMPLEMENTATION.md for implementation details and benchmarks.

## Documentation

- INDEX.md: documentation map and navigation
- QUICK_START_GUIDE.md: quick setup workflow
- TECHNICAL_DOCUMENTATION.md: architecture and technical internals
- WAKE_WORD_IMPLEMENTATION.md: wake-word implementation guide
- OPENCLAW_MONITOR.md: OpenClaw monitor service guide
- PROJECT_ROADMAP.md: project roadmap

## License

MIT for project code. Third-party model assets follow their upstream licenses.
