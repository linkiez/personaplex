# ⚡ Guia Rápido - VoxPulse Realtime Voice Hub Setup

> Comece em 10 minutos

---

## 🚀 Setup Rápido (10 min)

### Infra já disponível no servidor jcm

As instâncias de `PostgreSQL`, `Redis`, `Keycloak`, `Fluentd`, `Kibana` e `Elasticsearch` já estão em execução no servidor `jcm`. Para este projeto, trate esses serviços como dependências externas (integração), sem recriar localmente via containers adicionais.

### Pré-requisitos

```bash
# Verificar versões
python3 --version    # >= 3.10
node --version       # >= 18
nvidia-smi           # GPU CUDA (opcional, CPU funciona)
```

### 1️⃣ Clone e Instale Backend

```bash
cd /home/linkiez/Projetos/voxpulse-realtime-voice-hub

# Instale Python package
cd moshi
pip install -e .

# Obtenha HuggingFace token de: https://huggingface.co/settings/tokens
export LOCALAI_BASE_URL=hf_xxxxxxxxxxxxx
```

### 2️⃣ Inicie Servidor

```bash
# Terminal 1: Backend
cd moshi
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR"

# Espere por: "Access the Web UI directly at https://localhost:8998"
```

### 3️⃣ Inicie Frontend

```bash
# Terminal 2: Frontend Angular
cd client-angular
npm install
npm run start

# Acesse: http://localhost:4200
# Que conecta ao backend em localhost:8998
```

### 4️⃣ Teste!

1. Abra http://localhost:4200
2. Clique no botão de microfone 🎙️
3. Fale com o modelo
4. Ouça a resposta em tempo real

---

## 📦 Com Docker (Recomendado para Produção)

```bash
# 1. Configure .env
cat > .env << 'EOF'
LOCALAI_BASE_URL=hf_xxxxxxxxxxxxx
MOSHI_PORT=8998
MOSHI_DEVICE=cuda
EOF

# 2. Build e execute
docker-compose up --build

# 3. Acesse https://localhost:8998
```

Observação: o `docker-compose` deste projeto sobe os serviços da aplicação Moshi/OpenClaw. Banco, cache, auth e observabilidade continuam no servidor `jcm`.

---

## 🏗️ Arquitetura em Resumo

```
Browser (Angular)         Server (Python)
     │                         │
     ├─→ Microfone ────→←─ LLM 7B (Moshi Voice)
     │
     ├─→ WebSocket ────────→ Audio Codec (MIMI)
     │ (Binary)               │
     ├─→ Texto ─────────────→ Voice Control
     │
     └─→ Áudio Output ←───── Geração tempo-real
```

---

## 🎯 Funcionalidades Principais

| Feature | Status | Como Usar |
|---------|--------|-----------|
| Chat Full-Duplex | ✅ Ativo | Clique microfone e fale |
| Persona Control | ✅ Ativo | Modifique "Text Prompt" |
| Voice Selection | ✅ Ativo | Escolha NATF0-3, NATM0-3 |
| **Wake Word** | ✅ Implementado | [Ver Guia Implementação](IMPLEMENTACAO_WAKE_WORD.md) |
| **Open Claw Integration** | 📋 Proposto | Extensão para robótica |

---

## 🎚️ Controles Principais

### ModelParams (Sliders)

- **Text Temperature** (0.0-2.0): Criatividade do texto
  - Baixo (0.3) = Resposta previsível
  - Alto (1.5) = Resposta criativa

- **Text TopK** (0-300): Restrição de vocabulário
  - Baixo = Palavras comuns
  - Alto = Mais variedade

- **Audio Temperature** (0.0-2.0): Variação de voz

- **Repetition Penalty** (0.0-2.0): Evita palavrões repetidos

### Buttons

- **🎤 Start/Stop**: Controla conversação
- **⏸️ Pause**: Pausa mid-stream
- **🔄 Restart**: Reinicia conexão

---

## 🐛 Troubleshooting Rápido

### ❌ "HuggingFace token not set"

```bash
export LOCALAI_BASE_URL=hf_xxxxx
# Ou aceite a licença do modelo:
# http://localhost:8080
```

### ❌ "Connection refused" na porta 8998

```bash
# Verifique se servidor está rodando:
ss -tlnp | grep 8998

# Se não, inicie:
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR"
```

### ❌ "CUDA out of memory"

```bash
# Use CPU offload:
python -m moshi.server --cpu-offload

# Ou use CPU puro:
python -m moshi.server --device cpu
```

### ❌ "WebSocket handshake failed"

```bash
# Verifique HTTPS/WSS:
# Browser requer HTTPS para mic access
# Try: https://localhost:8998 (não http://)
```

### ❌ "Áudio cortado/entrecortado"

```bash
# Aumentar buffer em audio-processor.ts:
this.maxBufferSamples = asSamples(15); // foi 10
```

---

## 📊 Monitorar Performance

### Terminal - Backend Stats

```bash
# GPU
watch -n 1 nvidia-smi

# CPU/Memória
top -p $(pgrep -f "python -m moshi.server")
```

### Browser - Stats em Tempo Real

```javascript
// Console (F12):
// Todos os logs começam com [Socket], [Conversation], etc

// Pausar quando clica em AudioVisualizer
```

---

## 📝 Commits & Workflow

### Convenção de Commits (pt-BR)

```bash
git add .
git commit -m "feat: adicionar suporte a wake word"
git commit -m "fix: corrigir lag de áudio em RTL"
git commit -m "docs: atualizar README"
```

### Branches de Desenvolvimento

```bash
# Feature nova
git checkout -b feature/wake-word-detector

# Bugfix
git checkout -b fix/audio-latency

# Docs
git checkout -b docs/api-documentation
```

---

## 🔧 Variáveis de Ambiente Comuns

```bash
# Backend (Python)
LOCALAI_BASE_URL=hf_xxxxx                   # OBRIGATÓRIO
MOSHI_DEVICE=cuda|cpu                # Default: cuda
MOSHI_CPU_OFFLOAD=true|false         # Default: false
MOSHI_PORT=8998                      # Default: 8998

# Frontend (Angular)
MOSHI_WORKER_ADDR=localhost:8998     # Server address
```

---

## 📚 Arquivos-Chave

| Arquivo | Função |
|---------|--------|
| `moshi/server.py` | Servidor principal + LLM inference |
| `client-angular/src/app/app.ts` | Shell principal Angular |
| `client-angular/src/app/wake-word/wake-word-detector.service.ts` | Detector wake word ONNX/RMS |
| `client-angular/src/app/wake-word/wake-word-state.service.ts` | Máquina de estados wake word |
| `docker-compose.yaml` | Orquestração container |

---

## 🎓 Próximos Passos

1. **Entender Protocolo**
   - Leia `client/src/protocol/types.ts` (referência do protocolo)
   - Ver fluxo de mensagens em websocket

2. **Implementar Wake Word**
   - Siga [IMPLEMENTACAO_WAKE_WORD.md](IMPLEMENTACAO_WAKE_WORD.md)
   - ~8-16 horas de dev

3. **Integrar Open Claw**
   - Bridge ROS em `moshi/server.py`
   - Extrair ações do LLM output

4. **Deploy em Produção**
   - Setup Kubernetes
   - Integrar logs no Fluentd (jcm)
   - Publicar dashboards no Kibana (Elastic do jcm)

---

## ❓ FAQ

### P: O sistema funciona sem GPU?
**R:** Sim, mas perde 10x em latência. Use `--device cpu`. GPU recomendada: 8GB+ VRAM.

### P: Quantos usuarios simultâneos?
**R:** ~1-2 por GPU (única instância). Para scale, use load balancer + múltiplos servidores.

### P: Consigo usar meu próprio modelo?
**R:** Sim, troque em `moshi/models/loaders.py`. Moshi Voice é base, pode fine-tune em seu dataset.

### P: Como funciona low-latency?
**R:** Streaming de áudio em chunks (~80ms) + Token generation contínuo (não aguarda sequência inteira).

### P: Suporta múltiplas línguas?
**R:** SIM - via `text_prompt`. Ex: "Você é um assistente em espanhol" → responde em ES.

### P: É possível usar em Raspi 4?
**R:** NÃO na versão atual (requer GPU NVIDIA com CUDA). Mas é possível com modelo quantizado (~1B params).

### P: Como customizar vozes?
**R:** Use `voice_prompt` com NATF0-3, NATM0-3 ou upload custom embedding via `--voice-prompt-dir`.

---

## 📞 Links Úteis

- 🤗 [Model Page](http://localhost:8080)
- 📑 [Architecture Paper](https://arxiv.org/abs/2602.06053)
- 🎮 [Live Demo](https://research.nvidia.com/labs/adlr/moshi-voice/)
- 💬 [Discord Community](https://discord.gg/5jAXrrbwRb)
- 🐍 [PyTorch Docs](https://pytorch.org/docs/)
- 🅰️ [Angular Docs](https://angular.dev/)

---

## 💡 Dicas Profissionais

1. **Sempre use SSL em produção** (HTTPS/WSS)
2. **Monitore GPU memory** - model pode crescer com cache
3. **Test com headphones** - melhor qualidade de áudio
4. **Customize persona** - seja criativo com texto prompt
5. **Optimize latency** - streaming é melhor que batch

---

**Última atualização:** Abril 2026
**Autor:** Documentação Técnica VoxPulse Realtime Voice Hub
