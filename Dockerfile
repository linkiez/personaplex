ARG BASE_IMAGE="nvcr.io/nvidia/cuda"
ARG BASE_IMAGE_TAG="12.4.1-runtime-ubuntu22.04"

FROM ${BASE_IMAGE}:${BASE_IMAGE_TAG} AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libopus-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/moshi/

COPY moshi/ /app/moshi/
RUN uv venv /app/moshi/.venv --python 3.12
RUN uv sync

RUN mkdir -p /app/ssl /app/voice-prompts

# Criar script de entrada customizado
RUN <<'BASH_EOF'
cat > /app/docker-entrypoint.sh << 'SCRIPT_EOF'
#!/bin/bash
set -e

# Verificar HF_TOKEN
if [ -z "$HF_TOKEN" ]; then
    echo "❌ Erro: HF_TOKEN não configurado!"
    echo "ℹ️  Configure em .env ou via variável de ambiente"
    exit 1
fi

# Construir comando
CMD="/app/moshi/.venv/bin/python -m moshi.server"

# Host e port
CMD="$CMD --host ${PERSONAPLEX_HOST:-0.0.0.0}"
CMD="$CMD --port ${PERSONAPLEX_PORT:-8998}"

# Device (cuda ou cpu)
DEVICE=${PERSONAPLEX_DEVICE:-cuda}
CMD="$CMD --device $DEVICE"

# HF Repo
if [ ! -z "$PERSONAPLEX_HF_REPO" ]; then
    CMD="$CMD --hf-repo $PERSONAPLEX_HF_REPO"
fi

# Voice prompt directory
if [ ! -z "$PERSONAPLEX_VOICE_PROMPT_DIR" ]; then
    CMD="$CMD --voice-prompt-dir $PERSONAPLEX_VOICE_PROMPT_DIR"
fi

# CPU Offload
if [ "$PERSONAPLEX_CPU_OFFLOAD" = "true" ]; then
    CMD="$CMD --cpu-offload"
fi

echo "🚀 Iniciando PersonaPlex..."
echo "ℹ️  Device: $DEVICE"
echo "ℹ️  Modelo: ${PERSONAPLEX_HF_REPO:-nvidia/personaplex-7b-v1}"
echo "ℹ️  CPU Offload: ${PERSONAPLEX_CPU_OFFLOAD:-false}"
echo ""

exec $CMD
SCRIPT_EOF
chmod +x /app/docker-entrypoint.sh
BASH_EOF

EXPOSE 8998

ENTRYPOINT ["/app/docker-entrypoint.sh"]
