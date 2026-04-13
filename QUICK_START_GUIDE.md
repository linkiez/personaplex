# Quick Setup Guide

This guide gets the project running in about 10 minutes.

## 1. Prerequisites

```bash
python3 --version   # 3.10+
node --version      # 18+
```

Optional:

```bash
nvidia-smi
```

## 2. Install dependencies

```bash
cd /home/linkiez/Projetos/voxpulse-realtime-voice-hub

cd moshi
pip install -e .

cd ../client-angular
npm install
```

## 3. Configure environment

```bash
cd /home/linkiez/Projetos/voxpulse-realtime-voice-hub
cp .env.example .env
```

Set required variables in .env:

- LOCALAI_BASE_URL
- LOCALAI_MODEL
- MOSHI_PORT
- JWT_SECRET and JWT_REFRESH_SECRET (for API)

## 4. Run services

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

## 5. Docker option

```bash
docker compose up --build
```

## Troubleshooting

### LocalAI endpoint not reachable

Verify LOCALAI_BASE_URL and check the LocalAI process.

### Port 8998 unavailable

Check active listeners:

```bash
ss -tlnp | grep 8998
```

### GPU memory pressure

Use one of:

- MOSHI_CPU_OFFLOAD=true
- MOSHI_DEVICE=cpu

## Key files

- moshi/moshi/server.py
- client-angular/src/app/app.ts
- client-angular/src/app/wake-word/wake-word-detector.service.ts
- server/src/index.ts
