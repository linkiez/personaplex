# 📚 VoxPulse Realtime Voice Hub - Documentação Técnica Completa

> Sistema de Conversação Full-Duplex com Ativação por Wake Word (Projeto VoxPulse Realtime Voice Hub)

**Data:** Abril de 2026
**Stack:** Angular/TypeScript (Frontend), Python/PyTorch (Backend), Docker, WebSocket

**Infra externa disponível (servidor jcm):** PostgreSQL, Redis, Keycloak, Fluentd, Kibana e Elasticsearch.

---

## 📋 Índice

1. [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Componentes Principais](#componentes-principais)
4. [Fluxo de Comunicação](#fluxo-de-comunicação)
5. [Configuração do Servidor](#configuração-do-servidor)
6. [Configuração do Cliente](#configuração-do-cliente)
7. [Sistema de Wake Word (Implementado)](#sistema-de-wake-word-implementado)
8. [Guia de Desenvolvimento](#guia-de-desenvolvimento)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## 🏗️ Visão Geral da Arquitetura

### Objetivo
Sistema de conversação em tempo real full-duplex (bidirecional simultâneo) que:
- ✅ Captura áudio do usuário continuamente
- ✅ Processa áudio com IA (LocalAI (backend OpenAI-compatible))
- ✅ Gera resposta em áudio + texto simultaneamente
- ✅ Permite personnalização de voz e persona (role prompt)
- ✅ Ativação por wake word implementada (com fallback RMS e benchmark ONNX)

### Arquitetura em Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Browser (Angular)                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Conversation Component                               │   │
│  │ ├─ Audio Input (Mic) → AudioContext → AudioWorklet  │   │
│  │ ├─ WebSocket Client → Server via WSMessage          │   │
│  │ ├─ Audio Output → AudioContext → Speakers           │   │
│  │ └─ UI: Controls, Stats, Text Display                │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────║────────────────────────────────────────┘
                     ║ WebSocket (wss://)
                     ║ Binary Protocol
                     ║
┌────────────────────╨────────────────────────────────────────┐
│              Python Server (aiohttp + PyTorch)              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ moshi/server.py                                      │   │
│  │ ├─ WebSocket Connection Handler                     │   │
│  │ ├─ Audio Encoding/Decoding (MIMI Codec)             │   │
│  │ ├─ Moshi Voice Model (7B LM + Voice Control)        │   │
│  │ ├─ Text Tokenization (SentencePiece)                │   │
│  │ └─ Real-time Audio Processing (SPHN)                │   │
│  │                                                      │   │
│  │ Key Models:                                         │   │
│  │ • MimiModel: Codec for audio compression            │   │
│  │ • LMModel: 7B Language Model (Moshi Voice)          │   │
│  │ • LMGen: Inference generator                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack Tecnológico

### Frontend (Angular + TypeScript)
- **Framework:** Angular 21
- **Linguagem:** TypeScript 5
- **Build:** Angular CLI
- **Styling:** Tailwind CSS + DaisyUI
- **Roteamento:** Angular Router
- **WebSocket:** Native WebSocket API
- **Audio:** Web Audio API + AudioWorklet

### Backend (Python)
- **Framework:** aiohttp (async HTTP server)
- **ML Framework:** PyTorch 2.2+
- **Modelos:**
  - Moshi Voice 7B (NVIDIA) - LLM + Voice Control
  - Moshi Architecture backbone
- **Audio Codec:** MIMI (Meta codec)
- **Processamento de Áudio:** SPHN
- **Tokenização:** SentencePiece
- **Deployment:** Docker + Docker Compose

### Infraestrutura externa (Servidor jcm)
- **Banco de dados:** PostgreSQL
- **Cache/filas leves:** Redis
- **Identidade e acesso:** Keycloak
- **Observabilidade/logs:** Fluentd + Elasticsearch + Kibana

Esses serviços são consumidos por integração (endpoints/credenciais externas) e não são provisionados por padrão neste repositório.

### Protocolos & Comunicação
- **Protocol:** WebSocket com mensagens binárias
- **Codec:** Custom binary message protocol
- **Segurança:** SSL/TLS (self-signed)
- **Port Padrão:** 8998

---

## 🔌 Componentes Principais

### 1. **Servidor Backend** (`moshi/server.py`)

**Responsabilidades:**
- Gerenciar conexões WebSocket
- Carregar modelo Moshi Voice (7B LM)
- Processar áudio de entrada
- Gerar áudio + texto de saída
- Gerenciar estado de sessão

**Classe Principal: `ServerState`**
```python
@dataclass
class ServerState:
    mimi: MimiModel              # Codec de áudio
    other_mimi: MimiModel        # Codec alternativo
    text_tokenizer: SentencePiece # Tokenizador
    lm_gen: LMGen                # Gerador do modelo
    lock: asyncio.Lock           # Sincronização
```

**Funções de Módulo (extraídas para reduzir complexidade):**
- `_recv_loop(ws, opus_reader, close_event, clog)` — loop de recepção WebSocket
- `_send_loop(ws, opus_writer, close_event)` — loop de envio WebSocket

**Métodos de `ServerState` para Gerenciamento de Sessão:**
- `_resolve_voice_prompt(request)` — resolve o caminho do voice prompt
- `_configure_lm_prompts(request, voice_prompt_path)` — configura prompts de texto e voz
- `_process_pcm_frames(ws, opus_writer, all_pcm_data)` — processa e envia frames PCM
- `_opus_loop(ws, opus_reader, opus_writer, close_event)` — loop principal de Opus/áudio

**Principais Endpoints:**
- `POST /api/chat` (WebSocket) - Chat em tempo real

### 2. **Monitor OpenClaw Full-Duplex** (`moshi/openclaw_monitor.py`)

**Responsabilidades:**
- Conectar OpenClaw e Moshi via WebSocket com reconexão automática
- Repassar áudio binário em ambas direções com baixa latência
- Encaminhar texto gerado pelo Moshi para OpenClaw em JSON
- Operar em background no Debian via `systemd`

**Flags Importantes:**
```bash
--ssl <dir>           # Gera SSL auto-assinado
--cpu-offload         # Offload para CPU se GPU insuficiente
--voice-prompt-dir    # Diretório com prompts de voz customizados
--device cuda/cpu     # Dispositivo de computação
```

### 2. **Wake Word Baseline (Frontend)** (`client/src/pages/Conversation`)

**Implementado nesta etapa:**
- `hooks/useWakeWordDetector.ts` — detecção local por energia (RMS) para ativação inicial
- `hooks/useWakeWordState.ts` — máquina de estados (`standby`, `listening`, `conversing`)
- `components/WakeWordIndicator/WakeWordIndicator.tsx` — indicador visual e toggle de modo wake
- Integração no `Conversation.tsx` e `components/UserAudio/UserAudio.tsx` com auto-connect/disconnect por atividade

**Observação:**
- A integração ONNX/Silero permanece como próximo incremento; a versão atual é uma base funcional para economia de recursos e validação de fluxo.

### 2. **Cliente Frontend** (`client/src/`)

**Estrutura:**
```
src/
├── pages/
│   ├── Conversation/          # Página principal
│   │   ├── Conversation.tsx   # Orquestrador
│   │   ├── SocketContext.tsx  # Contexto WebSocket
│   │   ├── MediaContext.tsx   # Contexto de mídia
│   │   └── components/        # UI components
│   │       ├── AudioVisualizer/
│   │       ├── Controls/
│   │       ├── ModelParams/
│   │       ├── ServerAudio/
│   │       ├── UserAudio/
│   │       └── TextDisplay/
│   └── Queue/                 # Fila de processamento
├── protocol/
│   ├── types.ts         # Tipos de mensagem
│   └── encoder.ts       # Codificação binária
├── audio-processor.ts   # AudioWorklet para processamento
└── components/
    ├── Button/
    └── Input/
```

**Componentes Principais:**

#### `Conversation.tsx`
- Orquestrador principal
- Gerencia WebSocket
- Controla fluxo de áudio input/output
- Gerencia parâmetros do modelo

#### `useSocket()` Hook
```typescript
const { sendMessage, socketStatus } = useSocket({
  onMessage: handleMessage,
  uri: buildURL({...}),
  onDisconnect: handleDisconnect,
});
```
- Mantém conexão WebSocket ativa
- Envia/recebe mensagens binárias
- Gerencia reconexão automática

#### `AudioWorklet` (`audio-processor.ts`)
- Processa buffer de áudio em thread separada
- Gerencia delay de playback
- Estatísticas de taxa de quadros

### 3. **Protocolo de Comunicação**

**Tipos de Mensagem** (`protocol/types.ts`):

```typescript
type WSMessage =
  | { type: "handshake"; version: VERSION; model: MODEL }
  | { type: "audio"; data: Uint8Array }
  | { type: "text"; data: string }
  | { type: "control"; action: CONTROL_MESSAGE }
  | { type: "metadata"; data: unknown }
  | { type: "error"; data: string }
  | { type: "ping" }

type CONTROL_MESSAGE = "start" | "endTurn" | "pause" | "restart"
```

**Fluxo de Mensagens:**
1. **Handshake** → Acordo de versão
2. **Audio** → Chunks em formato binário (por padrão: 80ms)
3. **Text** → Transcrição/resposta do servidor
4. **Control** → Comandos (start, pause, end turn)
5. **Metadata** → Info adicional (stats, params)

### 4. **Codificação de Áudio** (MIMI)

- Codec de compressão lossy
- ~6.5 KB/s @ 16 kHz
- Latência muito baixa
- Streaming em chunks

---

## 🔄 Fluxo de Comunicação

### Sequência de Inicialização

```
Browser                          Server
  │                                │
  ├──────── WebSocket Open ──────→ │
  │                                ├─ Carrega modelo
  │                                ├─ Prepara audio codec
  │                                │
  │ ←────── Handshake Message ──── │
  │                                │
  ├──────── Handshake ACK ───────→ │
  │                                │
  └── Aguarda input do usuário ─── │
```

### Fluxo de Conversação em Tempo Real

```
USER FALA                          SERVER
  │                                  │
  ├─ AudioContext captura ──→ Encoda audio
  ├──── Audio Message ────────→ Recebe chunks
  │                            Decodifica (MIMI)
  │                            ├─ Tokeniza texto
  │                            ├─ Executa LM (Moshi Voice)
  │                            └─ Gera áudio resposta
  │                            │
  │ ←───── Audio Chunks ────── Envia audio em RT
  │ ←───── Text Message(s) ─── Envia transcrição
  │                            │
  ├─ AudioContext output ──── Toca resposta
  ├─ Renderiza texto ───────→ Display na UI
  │                            │
  └──────────────────────────────┘
```

### Parâmetros do Modelo Passados via URL

```
text_temperature (float)     : 0.0-2.0, default ~0.8
text_topk (int)              : 0-100, default ~250
audio_temperature (float)    : 0.0-2.0
audio_topk (int)             : 0-100
pad_mult (int)               : Padding multiplier
text_seed (int)              : Reprodutibilidade
audio_seed (int)             : Reprodutibilidade
repetition_penalty (float)   : Penaliza palavras repetidas
repetition_penalty_context () : Contexto para penalidade
text_prompt (string)         : Persona/role (e.g., "Você é um assistente amigável")
voice_prompt (string)        : Voz predefinida (NATF0-3, NATM0-3, VAR0-3)
```

---

## ⚙️ Configuração do Servidor

### Instalação Completa

```bash
# 1. Clone o repositório
git clone <repo-url>
cd voxpulse-realtime-voice-hub

# 2. Instale dependências Python
cd moshi
pip install .

# 3. (Opcional) Instale PyTorch para GPU específica (ex: CUDA 13.1)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu131

# 4. Configure HuggingFace token
export LOCALAI_BASE_URL=<seu_token_aqui>

# 5. Aceite a licença do modelo: http://localhost:8080
```

### Executar Servidor Interativo

```bash
# Com SSL auto-gerado
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR"

# Acesse em: https://localhost:8998
```

### Variáveis de Ambiente

```bash
LOCALAI_BASE_URL                 # Token HuggingFace (OBRIGATÓRIO)
MOSHI_DEVICE              # cuda | cpu (default: cuda)
MOSHI_CPU_OFFLOAD         # true | false (default: false)
MOSHI_VOICE_PROMPT_DIR    # Dir com embeddings de voz custom
NO_TORCH_COMPILE         # true (para evitar erros de compilação)
```

### Docker (Recommended para Produção)

```bash
# Copie o arquivo .env.example e configure
cp .env.example .env
# Edite .env com seus valores

# Build e execute
docker-compose up --build

# Acesse em: https://localhost:8998
```

### Flags de Configuração

| Flag | Descrição | Default |
|------|-----------|---------|
| `--ssl <dir>` | Gera certificado SSL no dir especificado | N/A |
| `--cpu-offload` | Offload de camadas para CPU | False |
| `--device cuda\|cpu` | Dispositivo de computação | cuda (se disponível) |
| `--voice-prompt-dir <path>` | Diretório com prompts de voz | Padrão: embeddings built-in |
| `--seed <int>` | Seed para reprodutibilidade | 42 |

---

## 💻 Configuração do Cliente

### Instalação Frontend

```bash
cd client-angular

# Instale dependências
npm install

# Desenvolvimento com hot-reload
npm run start

# Build produção
npm run build

# Testes
npm run test -- --watch=false
```

### Configuração do Server Address

**Arquivos principais:** `client-angular/src/app/app.ts` e serviços em `client-angular/src/app/wake-word/`

```typescript
// O frontend Angular usa configuração local para apontar o backend em localhost:8998.
// Para ambiente remoto, ajuste a origem do WebSocket conforme ambiente/deploy.
```

### Variáveis de Ambiente Client

```bash
MOSHI_WORKER_ADDR     # Endereço do servidor (ex.: localhost:8998)
MOSHI_WORKER_AUTH_ID  # ID de autenticação (opcional)
MOSHI_SESSION_AUTH_ID # ID de sessão (opcional)
```

### Build para Produção

```bash
npm run build

# Saída em: client-angular/dist/client-angular/
```

---

## 🎙️ Sistema de Wake Word (Implementado)

### 📌 Motivação
Atualmente o sistema está **sempre ativo**, processando áudio continuamente. Isso consome GPU/CPU desnecessariamente.

**Solução:** Detector local de wake word (roda só no frontend) que ativa conversa apenas quando detectado.

### Arquitetura Proposta

```
┌─────────────────────────────┐
│ Mic Input (Continuous)      │
└──────────┬──────────────────┘
           │
      ┌────▼──────┐
      │   Audio   │
      │ in Stream │
      └────┬──────┘
           │
      ┌────▼────────────────────────┐
      │ Wake Word Detector (WebML)   │  ← LOW latency, runs locally
      │ e.g., "Hey Moshi" / "OK"    │    Offline, ~50ms inference
      └────┬───────────────────┬────┘
           │                   │
           │ NOT detected      │ DETECTED
           │                   │
           │                ┌──▼─────────────────┐
           │                │ Start Conversation │
           │                │ Enable Server Chat │
           │                │ (~3-5s of silence) │
           │                │ → Auto disconnect  │
           │                └────────────────────┘
           │
      Continua dormindo
      com baixo overhead
```

### Implementação: Passos

#### **Passo 1: Adicione Dependência**

```bash
npm install onnxruntime-web
# ou
npm install google/mediapipe-tasks

# Alternativas:
# - Silero VAD (ligeiro)
# - Trending: "Porcupine" (Picovoice - pago)
# - "Offline Speech Recognition" (WebRTC)
```

#### **Passo 2: Crie Hook para Wake Word**

`client/src/pages/Conversation/hooks/useWakeWordDetector.ts`:

```typescript
import { useEffect, useRef, useState } from 'react';

export const useWakeWordDetector = ({
  onWakeWordDetected,
  enabled = true,
  wakeWordPhrase = 'hey moshi', // Personalizável
}: {
  onWakeWordDetected: () => void;
  enabled?: boolean;
  wakeWordPhrase?: string;
}) => {
  const modelRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const initModel = async () => {
      try {
        // Exemplo: Silero VAD
        const Silero = require('@silero/silero-vad');
        const model = await Silero.default();
        modelRef.current = model;
        setIsReady(true);
      } catch (err) {
        console.error('Failed to load wake word model', err);
      }
    };

    initModel();
  }, [enabled]);

  const detect = async (audioBuffer: Float32Array): Promise<boolean> => {
    if (!modelRef.current) return false;
    try {
      const isSpeech = modelRef.current.predict(audioBuffer);
      return isSpeech;
    } catch (err) {
      console.error('Detection error', err);
      return false;
    }
  };

  return { detect, isReady };
};
```

#### **Passo 3: Integre no AudioWorklet**

`client/src/audio-processor.ts`:

```typescript
// No handler de mensagens:
this.port.onmessage = async (event) => {
  if (event.data.type === 'analyze') {
    const audioFrame = event.data.frame;
    const scores = await wakeWordModel.predict(audioFrame);

    if (scores > THRESHOLD) {
      this.port.postMessage({ type: 'wake-word-detected' });
    }
  }
};
```

#### **Passo 4: Atualize Conversation Component**

`client/src/pages/Conversation/Conversation.tsx`:

```typescript
const { detect: detectWakeWord, isReady } = useWakeWordDetector({
  onWakeWordDetected: () => {
    setIsConversationActive(true);
    sendMessage({ type: 'control', action: 'start' });
  },
  enabled: !isConversationActive, // Só detecta quando inativo
  wakeWordPhrase: params.textPrompt || 'hey moshi',
});

// Dentro do loop de processamento de áudio:
if (!isConversationActive && isReady && audioFrame.length > 0) {
  detectWakeWord(audioFrame); // Async, continua sem bloquear
}
```

#### **Passo 5: Adicione Timeout de Desconexão Automática**

```typescript
// Após detectar silêncio por N segundos:
useEffect(() => {
  if (!isConversationActive) return;

  const silenceThreshold = 3000; // 3 segundos
  let silenceTimer: NodeJS.Timeout;

  const resetSilenceTimer = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      console.log('Silence detected, disconnecting...');
      setIsConversationActive(false);
      sendMessage({ type: 'control', action: 'endTurn' });
    }, silenceThreshold);
  };

  resetSilenceTimer();
  return () => clearTimeout(silenceTimer);
}, [isConversationActive]);
```

### Opções Recomendadas para Wake Word

| Solução | Latência | Overhead | Custo | Notas |
|---------|----------|----------|-------|-------|
| **Silero VAD** | ~30ms | Muito baixo | Grátis | Detecta fala, não palavra-chave |
| **Porcupine** | ~50ms | Baixo | $99-499/mês | Customizável, preciso |
| **MediaPipe Audio Classifier** | ~100ms | Médio | Grátis | Amplo suporte, Google |
| **OpenAI Whisper VAD** | ~200ms | Alto | Grátis | Muito preciso, lento |
| **Custom ONNX Model** | ~100ms | Baixo | Treinamento custom | Máximo controle |

**Recomendação:** Comece com **Silero VAD** (Grátis + Rápido) como prototipo.

---

## 📖 Guia de Desenvolvimento

### Estrutura de Arquivos Importante

```
moshi-voice/
├── client/src/
│   ├── pages/Conversation/
│   │   ├── Conversation.tsx        [ENTRADA PRINCIPAL]
│   │   ├── hooks/
│   │   │   ├── useSocket.ts        [COMUNICAÇÃO WEBSOCKET]
│   │   │   ├── useUserAudio.ts     [CAPTURA DE MIC]
│   │   │   ├── useServerAudio.ts   [PLAYBACK]
│   │   │   └── useModelParams.ts   [PARÂMETROS DO MODELO]
│   │   └── components/
│   │       ├── Controls/           [BOTÕES PLAY/STOP]
│   │       ├── ModelParams/        [SLIDERS TEMPERATURA ETC]
│   │       ├── TextDisplay/        [MOSTRA TEXTO]
│   │       └── AudioVisualizer/    [GRÁFICOS]
│   ├── protocol/
│   │   ├── types.ts                [TIPOS DE MENSAGEM]
│   │   └── encoder.ts              [SERIALIZAÇÃO BINARY]
│   └── audio-processor.ts          [AUDIOWORKLET]
│
├── moshi/moshi/
│   ├── server.py                   [SERVIDOR PRINCIPAL]
│   ├── models/
│   │   ├── loaders.py              [CARREGA MODELOS]
│   │   ├── lm.py                   [LANGUAGE MODEL]
│   │   └── compression.py          [CODEC MIMI]
│   ├── modules/
│   │   ├── transformer.py          [ARQUITETURA]
│   │   ├── streaming.py            [STREAMING RT]
│   │   └── seanet.py               [AUDIO ENCODER]
│   └── utils/
│       ├── connection.py           [WEBSOCKET UTILS]
│       └── logging.py              [LOGGING]
│
└── docker-compose.yaml             [ORQUESTRAÇÃO]
```

### Workflow Típico de Desenvolvimento

#### **1. Alteração no Frontend**

```bash
cd client-angular
npm run start  # Hot-reload em http://localhost:4200

# Edite src/pages/Conversation/... ou hooks/...
# Angular recarrega automaticamente
```

#### **2. Alteração no Backend (Python)**

```bash
# Terminal 1: Servidor em desenvolvimento
cd moshi
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR" --device cuda

# Terminal 2: Frontend Angular
cd client-angular
npm run start
```

#### **3. Build & Teste Docker**

```bash
# Build completo
docker-compose build

# Run em background
docker-compose up -d

# Logs
docker-compose logs -f moshi-voice

# Stop
docker-compose down
```

### Debugging

#### **Frontend**
```typescript
// Console do browser (F12)
// Todos os mensagens WebSocket:
console.log('[Socket]', message);

// Limpe cache se tiver problemas:
localStorage.clear();
sessionStorage.clear();
```

#### **Backend**
```python
# Ative logging em server.py:
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Logs de performance de modelo:
torch.profiler.profile(...).record_function('inference')
```

### Commit & Versionamento

**Padrão de Commit (pt-BR, Conventional Commits):**
```
feat: adicionar componente de wake word detector
fix: corrigir lag de áudio em conexão lenta
refactor: reorganizar hooks de áudio
docs: atualizar README com instruções de deployment
test: adicionar testes para encoder binário
chore: atualizar dependências de npm
```

---

## 🚀 Deployment

### Opção 1: Docker Compose (Recomendado)

```bash
# 1. Configure .env
cat > .env << 'EOF'
LOCALAI_BASE_URL=your_huggingface_token_here
MOSHI_PORT=8998
MOSHI_DEVICE=cuda
MOSHI_CPU_OFFLOAD=false
EOF

# 2. Build e run
docker-compose up --build

# 3. Acesse https://<seu-ip>:8998
```

### Opção 2: Manual (Development)

```bash
# Terminal 1: Backend
cd moshi
export LOCALAI_BASE_URL=...
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR"

# Terminal 2: Frontend Angular
cd client-angular
npm run start
```

### Opção 3: Kubernetes (Escalabilidade)

```yaml
# k8s/moshi-voice-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: moshi-moshi-voice
spec:
  replicas: 2
  selector:
    matchLabels:
      app: moshi-moshi-voice
  template:
    metadata:
      labels:
        app: moshi-moshi-voice
    spec:
      containers:
      - name: moshi-voice
        image: moshi-voice:latest
        ports:
        - containerPort: 8998
        env:
        - name: LOCALAI_BASE_URL
          valueFrom:
            secretKeyRef:
              name: hf-secrets
              key: token
        resources:
          requests:
            gpu: "1"
          limits:
            gpu: "1"
```

### Produção: Checklist

- [ ] SSL com certificado válido (não auto-assinado)
- [ ] LOCALAI_BASE_URL em secrets (não hardcoded)
- [ ] GPU suficiente (mínimo 8GB VRAM)
- [ ] Integração com Fluentd (pipeline de logs no jcm)
- [ ] Dashboards no Kibana (Elastic no jcm)
- [ ] Rate limiting no 8998
- [ ] CORS configurado
- [ ] Health checks (/health endpoint)

---

## 🐛 Troubleshooting

### Problema: "Model not found" no HuggingFace

```bash
# Solução:
export LOCALAI_BASE_URL=your_token
huggingface-cli login
# Aceite a licença em: http://localhost:8080
```

### Problema: WebSocket "Connection refused"

```bash
# Verificar porta:
ss -tlnp | grep 8998

# Ou com lsof:
lsof -i :8998

# Solução: Libere a porta ou mude MOSHI_PORT
```

### Problema: GPU Out of Memory (OOM)

```bash
# Solução 1: CPU Offload
python -m moshi.server --cpu-offload

# Solução 2: Reduzir batch size (não disponível no servidor atual)

# Solução 3: Libere memoria:
nvidia-smi  # Ver uso
pkill -f python  # Mate processos python
```

### Problema: Áudio com delay alto (>500ms)

```typescript
// Frontend: Verificar latência
console.log('Network delay:', stats.delay);
console.log('Playback buffer:', stats.minPlaybackDelay, stats.maxPlaybackDelay);

// Backend: Verificar GPU utilização
nvidia-smi -l 1  # Atualizar a cada 1s
```

### Problema: Audio cortado/entrecortado

1. Verificar latência de rede (deve ser <100ms)
2. Verificar CPU/GPU (deve estar <80%)
3. Aumentar buffer: `partialBufferSamples` em `audio-processor.ts`

### Problema: Handshake não completa

```bash
# Verificar SSL:
openssl s_client -connect localhost:8998

# Verificar certificado no server:
ls -la $SSL_DIR/

# Regenerar SSL se necessário:
rm -rf $SSL_DIR
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR"
```

---

## 📊 Monitoramento & Observabilidade

### Métricas Importantes

**Frontend:**
```typescript
// Agregue no componente:
{
  fps: framesPerSecond,
  audioLatency: currentTime - micTime,
  webSocketStatus: 'connected' | 'disconnected',
  bufferHealth: (bufferedSamples / maxBuffer) * 100,
  cpuUsage: performance.measureUserAgentSpecificMemory?.()
}
```

**Backend:**
```python
# ModelProfiler em server.py
torch.profiler.profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    record_shapes=True,
).step()
```

### Dashboards Recomendados

```bash
# Stack já disponível no servidor jcm
# - Fluentd: coleta e roteamento de logs
# - Elasticsearch: armazenamento e indexação
# - Kibana: dashboards e investigação

# Foco desta aplicação: emitir logs estruturados e métricas para os endpoints do jcm
```

---

## 🔐 Segurança

### Checklist

- [ ] Validar todas as mensagens WebSocket no servidor
- [ ] Rate limit por IP/sessão
- [ ] HTTPS obrigatório em produção
- [ ] LOCALAI_BASE_URL em ambiente seguro (não logs)
- [ ] CORS restritivo
- [ ] Input sanitization (text_prompt não executável)
- [ ] Timeout de sessão (15 min inatividade)

### Exemplo de Validação

```python
from zod import z  # ou Pydantic

MessageSchema = z.object({
    type: z.enum(['audio', 'text', 'control']),
    data: z.union([z.string(), z.bytes()]),
})

# No handler:
if not MessageSchema.parse(received_message):
    close_connection(reason="Invalid message format")
```

---

## 📚 Referências & Documentação

### Documentação Oficial

- [Moshi Architecture](https://arxiv.org/abs/2410.00037)
- [Moshi Voice Paper](https://arxiv.org/abs/2602.06053)
- [LocalAI Documentation](https://research.nvidia.com/labs/adlr/moshi-voice/)

### Links Úteis

| Recurso | Link |
|---------|------|
| HuggingFace Model | http://localhost:8080 |
| Repository | GitHub NVIDIA Moshi Voice |
| Discord Community | https://discord.gg/5jAXrrbwRb |
| Web Audio API | https://developer.mozilla.org/docs/Web/API/Web_Audio_API |
| PyTorch Docs | https://pytorch.org/docs/stable/ |
| aiohttp | https://docs.aiohttp.org/ |

---

## 📝 Histórico de Versões

| Versão | Data | Notas |
|--------|------|-------|
| 1.0 | Abr 2026 | Versão inicial - Moshi + Moshi Voice |
| 1.1 (Proposto) | - | Implementação de Wake Word Detector |
| 2.0 (Proposto) | - | Multi-usuario, persistência de histórico |
| 2.1 (Proposto) | - | Integração com Open Claw (robótica) |

---

## 📞 Suporte & Contribuição

### Reporte Bugs

```bash
# GH Issues template:
Title: [BUG] Descrição breve
Descrição: Passos para reproduzir, screenshots, logs
Environment: OS, GPU, PyTorch version
```

### Contribua

```bash
git checkout -b feature/sua-feature
# Faça commits em pt-BR Conventional Commits
git push origin feature/sua-feature
# Abra PR com descrição em pt-BR
```

---

**Documento atualizado em:** Abril de 2026
**Mantido por:** Equipe de Desenvolvimento VoxPulse Realtime Voice Hub
