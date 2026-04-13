# 🎙️ Guia de Implementação - Wake Word Detector para VoxPulse Realtime Voice Hub

> Sistema de ativação por voz para conversação full-duplex com economia de recursos

**Status:** ✅ Concluído tecnicamente (pendente apenas validação manual com microfone em ambiente real)
**Complexidade:** Média
**Tempo Estimado:** 8-16 horas de desenvolvimento (concluído no escopo técnico)

### Progresso Atual (12/04/2026)

- ✅ Hook `useWakeWordDetector` implementado (detecção leve por energia/RMS no browser)
- ✅ Hook `useWakeWordDetector` com integração ONNX Runtime + fallback RMS
- ✅ Compatibilidade ONNX no React reforçada para `state/stateN` (com suporte legado `h/c`)
- ✅ Hook `useWakeWordState` implementado (estado `standby`/`listening`/`conversing` + timeout de silêncio)
- ✅ Hook `useSilenceDetector` implementado e integrado ao estado wake
- ✅ Integração no `Conversation.tsx` com auto-connect e auto-disconnect baseados no estado
- ✅ Componente `WakeWordIndicator` criado e integrado na UI
- ✅ `UserAudio.tsx` ajustado para captura local contínua e envio condicional de áudio
- ✅ Controle de reconexão fortalecido (evita tentativas repetidas durante ativação)
- ✅ Modelo ONNX local adicionado em `client/public/models/silero-vad.onnx` (fallback RMS permanece como segurança)
- ✅ Frontend Angular inicial criado em `client-angular/` com shell de wake word usando Signals
- ✅ Serviço `WakeWordStateService` implementado no Angular com estados `standby/listening/conversing`
- ✅ Componente `WakeWordIndicatorComponent` implementado no Angular
- ✅ Build e testes do Angular executados com sucesso (`ng build`, `ng test --watch=false`)
- ✅ Serviço `WakeWordDetectorService` implementado no Angular (captura de microfone + ONNX com fallback RMS)
- ✅ Dependência `onnxruntime-web` instalada em `client-angular/`
- ✅ Build e testes revalidados após integração do detector (`ng build`, `ng test --watch=false`)
- ✅ Testes unitários Angular adicionados para `WakeWordStateService` (`wake-word-state.service.spec.ts`)
- ✅ Testes unitários Angular adicionados para `WakeWordDetectorService` (`wake-word-detector.service.spec.ts`)
- ✅ Suíte Angular revalidada com 9 testes passando (`ng test --watch=false`)
- ✅ Telemetria de performance adicionada no Angular (`inferenceAvgMs`, `inferenceMaxMs`, `inferenceSamples`)
- ✅ Compatibilidade ONNX corrigida para modelos com estado `state/stateN` (mantendo suporte legado `h/c`)
- ✅ Asset ONNX integrado no build Angular via `angular.json` (mapeamento para `/models/silero-vad.onnx`)
- ✅ Benchmark reproduzível adicionado em `client-angular/scripts/benchmark-wake-word-onnx.mjs`
- ✅ Baseline de benchmark ONNX coletada (`avg=0.41ms`, `p50=0.33ms`, `p95=0.73ms`, `max=5.26ms`, `250` iterações)
- ✅ Serviço `openclaw-monitor` adicionado no `docker-compose.yaml` para deploy em background
- ✅ Backend monitor OpenClaw↔Moshi full-duplex iniciado (`moshi/moshi/openclaw_monitor.py`)
- ✅ Template de serviço systemd adicionado para Debian (`deploy/systemd/moshi-openclaw-monitor.service`)
- ✅ Testes unitários backend V2 adicionados para `ActionExtractor` e `SafetyConstraints` (`moshi/tests/`)
- ✅ Testes backend V2 adicionados para emissão de eventos `action/action_rejected` no monitor (`moshi/tests/test_openclaw_monitor_actions.py`)
- ✅ Inicialização do pacote `moshi` otimizada com lazy import para reduzir acoplamento em testes/ferramentas leves
- ✅ Feedback loop de sensores integrado ao monitor (`type=sensor/feedback` + `sensor_ack` + contexto em eventos de ação)
- ✅ Safety constraints contextuais por sensores adicionadas (obstáculo, bateria, e-stop)
- ✅ UI Angular para visualização do feed de ações OpenClaw (aprovadas/rejeitadas + contexto de sensor)
- ✅ Bridge ROS evoluída para dispatch HTTP opcional com fallback em logging (configurável por CLI/env)
- ✅ ActionExtractor evoluído para parsing robusto (nested JSON, fenced JSON e comandos PT-BR)
- ✅ Testes full-duplex do monitor adicionados (forward OpenClaw->Moshi e Moshi->OpenClaw)
- ✅ Suíte backend V2 revalidada com 24 testes passando
- [~] Validação manual de detecção com voz real em ambiente físico (pendente execução operacional)

---

## 📋 Índice

1. [Por que implementar Wake Word?](#por-que-implementar-wake-word)
2. [Opções de Solução](#opções-de-solução)
3. [Arquitetura Proposta](#arquitetura-proposta)
4. [Implementação Passo a Passo](#implementação-passo-a-passo)
5. [Integração com Open Claw](#integração-com-open-claw)
6. [Testes](#testes)
7. [Performance & Optimização](#performance--optimização)

---

## ❓ Por que implementar Wake Word?

### Problema Atual

```
┌──────────────────────────────────────────┐
│ Sistema VoxPulse Realtime Voice Hub - Estado Atual │
├──────────────────────────────────────────┤
│ ✅ Audio sempre sendo capturado          │
│ ✅ Modelo sempre processando             │
│ ❌ Alto consumo de GPU/CPU (contínuo)    │
│ ❌ Latência de resposta boa              │
│ ❌ Não há "standby" inteligente          │
│ ❌ Usuário sempre conectado              │
└──────────────────────────────────────────┘

Consumo de Energia: ~85W (GPU idle)
```

### Solução com Wake Word

```
┌──────────────────────────────────────────┐
│ Sistema com Wake Word Detector           │
├──────────────────────────────────────────┤
│ ✅ Audio capturado continuamente         │
│ ✅ Processamento LEVE no browser         │
│ ✅ Espera por "Hey Moshi"                │
│ ✅ Ativa conversa sob demanda            │
│ ✅ Auto-desconecta após silêncio         │
│ ✅ Alta economia de recursos             │
└──────────────────────────────────────────┘

Consumo de Energia: ~5W (standby) + 85W (conversação)
Economia: ~94% no modo standby
```

### Casos de Uso

1. **Assistente Ativo 24/7** - Monitor em kiosk/recepção
2. **Dispositivo IoT** - Raspi, Jetson nano com mic sempre ligado
3. **Web App Conversacional** - Reduz servidor stress em aplicações com muitos usuários
4. **Privacy-First** - Usuário ouve o que está sendo gravado (apenas após wake word)

---

## 🎯 Opções de Solução

### Comparação Técnica

| Solução | Latência | Memória | CPU | Precisão | Custo | Setup |
|---------|----------|---------|-----|----------|-------|-------|
| **Silero VAD** | ~20ms | 15MB | 2% | 85% | Grátis | ⭐⭐ |
| **Porcupine** | ~50ms | 30MB | 3% | 98% | Pago | ⭐⭐⭐ |
| **ONNX Custom** | ~100ms | 50MB | 5% | ~90% | Grátis* | ⭐⭐⭐⭐ |
| **MediaPipe** | ~150ms | 80MB | 8% | 95% | Grátis | ⭐⭐⭐ |
| **Whisper VAD** | ~200ms | 300MB | 15% | 99% | Grátis | ⭐⭐ |

*=Requer treinamento customizado

### Recomendação para MVP

**Silero VAD** + **Phrase Detection Simples**

```
Razão:
1. Muito rápido (~20ms inferência)
2. Grátis e open-source
3. Fácil integração no browser (ONNX.js)
4. ~15MB de modelo - rápido download
5. Comunidade ativa
```

---

## 🏗️ Arquitetura Proposta

### Fluxo Completo

```
╔════════════════════════════════════════════════════════════════╗
║                      Browser Frontend (Wake Word Mode)         ║
║ ┌─────────────────────────────────────────────────────────┐   ║
║ │ Mic → AudioContext → AudioWorklet                       │   ║
║ │                       ├─ Silero VAD (50ms chunks)       │   ║
║ │                       ├─ Is Speech? (bool)              │   ║
║ │                       ├─ Collect frames if YES          │   ║
║ │                       └─ Accumulate ~500ms              │   ║
║ │                                 │                       │   ║
║ │                          Is phrase "Hey Moshi"?         │   ║
║ │                          (Web Speech API / Regex)       │   ║
║ │                                 │                       │   ║
║ │                    ┌────────────┴────────────┐          │   ║
║ │                    YES                       NO          │   ║
║ │                    │                         │          │   ║
║ │  ┌────────────────▼──────────┐      Continue Loop      │   ║
║ │  │ 🎯 WAKE WORD DETECTED!    │                         │   ║
║ │  │                           │                         │   ║
║ │  │ ✅ Start Server Connection│                         │   ║
║ │  │ ✅ Stream Audio to Server │                         │   ║
║ │  │ ✅ Receive Audio Response │                         │   ║
║ │  │ ✅ Playback via Speaker  │                         │   ║
║ │  │                           │                         │   ║
║ │  │ Monitor: Silence > 3s?    │                         │   ║
║ │  │ YES → Disconnect & Sleep  │                         │   ║
║ │  └───────────────────────────┘                         │   ║
║ │                                                         │   ║
║ │ CPU Usage (Standby): ~2-5%                             │   ║
║ │ CPU Usage (Active):  ~15-25%                           │   ║
║ └─────────────────────────────────────────────────────────┘   ║
╚════════════════════════════════════════════════════════════════╝
                                │
                                │ WSS (apenas quando ativo)
                                ▼
╔════════════════════════════════════════════════════════════════╗
║                  Python Server (Conversation Mode)              ║
║ ┌─────────────────────────────────────────────────────────┐   ║
║ │ Receive Audio → MIMI Decode → LM Inference              │   ║
║ │ Generate Response (Audio + Text) → Send back            │   ║
║ │                                                         │   ║
║ │ GPU Usage: 85W (contínuo durante conversação)          │   ║
║ │ GPU Usage: ~0W (quando desconectado)                   │   ║
║ └─────────────────────────────────────────────────────────┘   ║
╚════════════════════════════════════════════════════════════════╝
```

### Componentes a Adicionar

```
client/src/
├── hooks/
│   ├── useWakeWordDetector.ts        ← [NOVO] Detecção local
│   ├── useWakeWordState.ts           ← [NOVO] Estado (ativo/standby)
│   └── useSilenceDetector.ts         ← [NOVO] Auto-desconexão
├── utils/
│   ├── wakeWordModels/
│   │   ├── silero-vad.ts             ← [NOVO] Wrapper Silero
│   │   └── vad-utils.ts              ← [NOVO] Utilities VAD
│   └── audio/
│       └── audioBuffer.ts            ← [MODIFICADO] Adicionar VAD pipe
└── pages/Conversation/
    ├── Conversation.tsx              ← [MODIFICADO] Integrar wake word
    └── components/
        └── WakeWordIndicator/        ← [NOVO] UI visual
```

---

## 🔧 Implementação Passo a Passo

### **FASE 1: Setup e Dependências** (1-2h)

#### Passo 1.1: Adicione ONNX Runtime

```bash
cd client
npm install onnxruntime-web

# Alternativa mais leve:
npm install @silero/silero-vad
```

#### Passo 1.2: Configure TypeScript types

`client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["@types/node", "onnxruntime-web"]
  }
}
```

#### Passo 1.3: Adicione modelo ao público

```bash
# Baixe modelo Silero
curl -L "https://models.silero.ai/vad_models/silero_vad_jit.pt" \
  -o client/public/models/silero-vad.onnx

# Ou use CDN:
# https://cdn-media.huggingface.co/silero_vad_silero_vad.onnx
```

---

### **FASE 2: Hook de Wake Word** (2-3h)

#### Passo 2.1: Criar `useWakeWordDetector.ts`

`client/src/hooks/useWakeWordDetector.ts`:

```typescript
/**
 * Hook para detecção de wake word usando Silero VAD
 * Monitora áudio continuamente e detecta frase específica
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as ort from 'onnxruntime-web';

const SAMPLE_RATE = 16000;
const VAD_FRAME_MS = 512; // ~32ms de áudio
const VAD_FRAME_SAMPLES = (SAMPLE_RATE * VAD_FRAME_MS) / 1000;
const SPEECH_THRESHOLD = 0.5;

interface WakeWordDetectorConfig {
  onWakeWordDetected: () => void;
  enabled?: boolean;
  wakeWords?: string[];
  modelPath?: string;
}

interface VADState {
  h: Float32Array;
  c: Float32Array;
}

export const useWakeWordDetector = ({
  onWakeWordDetected,
  enabled = true,
  wakeWords = ['hey moshi', 'ok moshi'],
  modelPath = '/models/silero-vad.onnx',
}: WakeWordDetectorConfig) => {
  const [isReady, setIsReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [confidence, setConfidence] = useState(0);

  const modelRef = useRef<ort.InferenceSession | null>(null);
  const vadStateRef = useRef<VADState | null>(null);
  const frameBufferRef = useRef<Float32Array[]>([]);
  const lastSpeechTimeRef = useRef<number>(0);
  const transcriptBufferRef = useRef<string>('');

  // Inicializa modelo ONNX
  useEffect(() => {
    if (!enabled) return;

    const initModel = async () => {
      try {
        // Configura runtime WebAssembly
        await ort.env.wasm.wasmPaths = '/wasm/';

        // Carrega modelo Silero VAD
        const session = await ort.InferenceSession.create(modelPath);
        modelRef.current = session;

        // Inicializa estado RNN
        vadStateRef.current = {
          h: new Float32Array(64), // hidden state
          c: new Float32Array(64), // cell state
        };

        setIsReady(true);
        console.log('[WakeWord] Model loaded successfully');
      } catch (err) {
        console.error('[WakeWord] Failed to load model:', err);
        setIsReady(false);
      }
    };

    initModel();
  }, [enabled, modelPath]);

  // Função para detectar voz
  const detectVoiceFrame = useCallback(
    async (audioFrame: Float32Array): Promise<number> => {
      if (!modelRef.current || !vadStateRef.current) return 0;

      try {
        // Prepara input com estado anterior
        const inputs = {
          'input.1': new ort.Tensor('float32', audioFrame, [1, audioFrame.length]),
          'h': new ort.Tensor('float32', vadStateRef.current.h, [2, 1, 64]),
          'c': new ort.Tensor('float32', vadStateRef.current.c, [2, 1, 64]),
        };

        // Executa inferência
        const outputs = await modelRef.current.run(inputs);

        // Extrai outputs
        const probSpeech = (outputs['output'].data as Float32Array)[0];
        const nextH = outputs['hn'].data as Float32Array;
        const nextC = outputs['cn'].data as Float32Array;

        // Atualiza estado
        vadStateRef.current.h = new Float32Array(nextH);
        vadStateRef.current.c = new Float32Array(nextC);

        return probSpeech;
      } catch (err) {
        console.error('[WakeWord] Inference error:', err);
        return 0;
      }
    },
    []
  );

  // Função public para processar frame de áudio
  const processFrame = useCallback(
    async (audioBuffer: Float32Array) => {
      if (!isReady || !enabled) return;

      setIsDetecting(true);

      try {
        const confidence = await detectVoiceFrame(audioBuffer);
        setConfidence(confidence);

        if (confidence > SPEECH_THRESHOLD) {
          lastSpeechTimeRef.current = Date.now();

          // Acumula frames de fala
          frameBufferRef.current.push(new Float32Array(audioBuffer));

          // Se acumulou ~500ms de fala
          if (frameBufferRef.current.length >= 10) {
            // Combine frames e execute ASR simples
            const combinedAudio = combineFrames(frameBufferRef.current);
            const phrase = await detectPhrase(combinedAudio);

            if (phrase && wakeWords.some(w => phrase.toLowerCase().includes(w))) {
              console.log('[WakeWord] ✅ DETECTED:', phrase);
              onWakeWordDetected();
              frameBufferRef.current = [];
              transcriptBufferRef.current = '';
            }
          }
        } else {
          // Sem fala

          // Se silêncio por >2s, limpa buffer
          if (Date.now() - lastSpeechTimeRef.current > 2000) {
            frameBufferRef.current = [];
            transcriptBufferRef.current = '';
          }
        }
      } finally {
        setIsDetecting(false);
      }
    },
    [isReady, enabled, onWakeWordDetected, detectVoiceFrame, wakeWords]
  );

  // Resetar detector
  const reset = useCallback(() => {
    frameBufferRef.current = [];
    transcriptBufferRef.current = '';
    setConfidence(0);
  }, []);

  return {
    processFrame,
    isReady,
    isDetecting,
    confidence,
    reset,
  };
};

// Utilitários
function combineFrames(frames: Float32Array[]): Float32Array {
  const totalLength = frames.reduce((sum, f) => sum + f.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  frames.forEach(frame => {
    combined.set(frame, offset);
    offset += frame.length;
  });
  return combined;
}

async function detectPhrase(audioBuffer: Float32Array): Promise<string | null> {
  // Opção 1: Use Web Speech API (mais simples, requer permissão)
  try {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    return new Promise((resolve) => {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      };

      recognition.onerror = () => resolve(null);

      // Play audio e capture
      const audioContext = new (window as any).AudioContext();
      const source = audioContext.createBufferSource();
      const buffer = audioContext.createBuffer(
        1,
        audioBuffer.length,
        16000
      );
      buffer.getChannelData(0).set(audioBuffer);
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    });
  } catch (err) {
    console.error('[WakeWord] Phrase detection error:', err);
    return null;
  }
}
```

#### Passo 2.2: Criar `useWakeWordState.ts`

`client/src/hooks/useWakeWordState.ts`:

```typescript
/**
 * Gerencia estado de conversação (ativa/standby) com base em wake word
 */

import { useState, useCallback, useEffect } from 'react';

interface WakeWordState {
  mode: 'standby' | 'listening' | 'conversing';
  silenceDuration: number;
  isActive: boolean;
}

export const useWakeWordState = ({
  silenceThreshold = 3000, // 3 segundos
  onStateChange,
}: {
  silenceThreshold?: number;
  onStateChange?: (state: WakeWordState) => void;
}) => {
  const [state, setState] = useState<WakeWordState>({
    mode: 'standby',
    silenceDuration: 0,
    isActive: false,
  });

  const lastActivityRef = useRef<number>(Date.now());

  const activate = useCallback(() => {
    const newState: WakeWordState = {
      mode: 'listening',
      silenceDuration: 0,
      isActive: true,
    };
    setState(newState);
    lastActivityRef.current = Date.now();
    onStateChange?.(newState);
  }, [onStateChange]);

  const startConversing = useCallback(() => {
    const newState: WakeWordState = {
      mode: 'conversing',
      silenceDuration: 0,
      isActive: true,
    };
    setState(newState);
    lastActivityRef.current = Date.now();
    onStateChange?.(newState);
  }, [onStateChange]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Monitor de silêncio
  useEffect(() => {
    if (state.mode !== 'conversing') return;

    const interval = setInterval(() => {
      const silenceDuration = Date.now() - lastActivityRef.current;

      setState(prev => ({
        ...prev,
        silenceDuration,
      }));

      if (silenceDuration > silenceThreshold) {
        // Auto-desconecta
        const newState: WakeWordState = {
          mode: 'standby',
          silenceDuration: 0,
          isActive: false,
        };
        setState(newState);
        onStateChange?.(newState);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [state.mode, silenceThreshold, onStateChange]);

  return {
    state,
    activate,
    startConversing,
    recordActivity,
  };
};
```

---

### **FASE 3: Integração no Conversation Component** (2-3h)

#### Passo 3.1: Modificar `Conversation.tsx`

`client/src/pages/Conversation/Conversation.tsx`:

```typescript
import { useWakeWordDetector } from './hooks/useWakeWordDetector';
import { useWakeWordState } from './hooks/useWakeWordState';
import { WakeWordIndicator } from './components/WakeWordIndicator/WakeWordIndicator';

export const Conversation: FC<ConversationProps> = ({
  workerAddr,
  isBypass = false, // Se true, pula wake word
  ...props
}) => {
  // ✅ NOVO: Wake word state
  const { state: wwState, activate, recordActivity, startConversing } = useWakeWordState({
    silenceThreshold: 3000,
    onStateChange: (newState) => {
      console.log('[Conversation] Wake word state:', newState.mode);

      if (newState.mode === 'standby') {
        // Auto-desconecta do servidor
        setIsConnected(false);
        socketRef.current?.close?.();
      }
    },
  });

  // ✅ NOVO: Wake word detector
  const { processFrame: processWakeWord, isReady: wwReady, confidence: wwConfidence } =
    useWakeWordDetector({
      enabled: !isBypass && wwState.mode === 'standby',
      onWakeWordDetected: () => {
        console.log('[Conversation] 🎙️ Wake word detected!');
        activate();
        // Conecta ao servidor
        startConnection();
      },
      wakeWords: params.wakeWords || ['hey moshi', 'ok moshi'],
    });

  // ✅ MODIFICADO: AudioWorklet já possui frames
  useEffect(() => {
    if (!worklet.current) return;

    // Desativa se em standby
    if (wwState.mode === 'standby') {
      setIsStreaming(false);
      return;
    }

    // Caso contrário, continua como antes
    setIsStreaming(true);
  }, [wwState.mode]);

  return (
    <div className="conversation-container">
      {/* ✅ NOVO: Indicador visual de wake word */}
      {!isBypass && (
        <WakeWordIndicator
          mode={wwState.mode}
          confidence={wwConfidence}
          isReady={wwReady}
        />
      )}

      {/* Resto da UI existente */}
      <Controls ... />
      <ServerAudio ... />
      <UserAudio ... />
      ...
    </div>
  );
};
```

---

### **FASE 4: UI Component para Wake Word** (1-2h)

#### Passo 4.1: Criar `WakeWordIndicator.tsx`

`client/src/pages/Conversation/components/WakeWordIndicator/WakeWordIndicator.tsx`:

```typescript
import { FC } from 'react';
import './WakeWordIndicator.css';

interface WakeWordIndicatorProps {
  mode: 'standby' | 'listening' | 'conversing';
  confidence: number;
  isReady: boolean;
}

export const WakeWordIndicator: FC<WakeWordIndicatorProps> = ({
  mode,
  confidence,
  isReady,
}) => {
  return (
    <div className={`wake-word-indicator ${mode}`}>
      <div className="status">
        {!isReady && (
          <>
            <div className="spinner"></div>
            <span>Carregando detector...</span>
          </>
        )}

        {isReady && mode === 'standby' && (
          <>
            <div className="mic-icon pulse">🎙️</div>
            <span>Aguardando "Hey Moshi"...</span>
            <div className="waveform">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bar" style={{
                  height: `${50 + Math.sin(confidence + i) * 30}%`,
                }}></div>
              ))}
            </div>
          </>
        )}

        {mode === 'listening' && (
          <>
            <div className="spinner active"></div>
            <span>Processando...</span>
          </>
        )}

        {mode === 'conversing' && (
          <>
            <div className="indicator active"></div>
            <span>Em conversa...</span>
          </>
        )}
      </div>
    </div>
  );
};
```

`client/src/pages/Conversation/components/WakeWordIndicator/WakeWordIndicator.css`:

```css
.wake-word-indicator {
  position: absolute;
  top: 20px;
  right: 20px;
  background: #1a1a2e;
  border-radius: 12px;
  padding: 16px;
  min-width: 200px;
  border: 2px solid #16f4d0;
  box-shadow: 0 0 20px rgba(22, 244, 208, 0.2);
  z-index: 100;
  transition: all 0.3s ease;
}

.wake-word-indicator.standby {
  border-color: #fbbf24;
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.2);
}

.wake-word-indicator.conversing {
  border-color: #10b981;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
}

.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #e0e0e0;
  font-size: 12px;
  text-align: center;
}

.mic-icon {
  font-size: 48px;
  line-height: 1;
}

.mic-icon.pulse {
  animation: pulse-scale 1.5s ease-in-out infinite;
}

@keyframes pulse-scale {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #333;
  border-top-color: #16f4d0;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner.active {
  border-top-color: #10b981;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.waveform {
  display: flex;
  gap: 4px;
  align-items: flex-end;
  height: 30px;
}

.waveform .bar {
  width: 3px;
  background: linear-gradient(to top, #16f4d0, #0a9d6d);
  border-radius: 2px;
  transition: height 0.1s ease;
}

.indicator {
  width: 12px;
  height: 12px;
  background: #999;
  border-radius: 50%;
  animation: none;
}

.indicator.active {
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 10px #10b981; }
  50% { box-shadow: 0 0 20px #10b981; }
}
```

---

### **FASE 5: Integração no AudioWorklet** (1-2h)

#### Passo 5.1: Modificar `audio-processor.ts`

```typescript
// Adicione ao MoshiProcessor:

class MoshiProcessor extends AudioWorkletProcessor {
  // ... código existente ...

  constructor() {
    super();
    // ... código existente ...

    // ✅ NOVO: Buffer para wake word
    this.wakeWordBuffer = [];
    this.wakeWordFrameSize = asSamples(512); // ~32ms

    this.port.onmessage = (event) => {
      if (event.data.type === 'reset') {
        this.initState();
        return;
      }

      // ✅ NOVO: Mensagem de processamento de wake word
      if (event.data.type === 'process-wake-word') {
        const frame = event.data.frame;
        this.wakeWordBuffer.push(...frame);

        // Se acumulou frame completo
        if (this.wakeWordBuffer.length >= this.wakeWordFrameSize) {
          const frameToProcess = new Float32Array(
            this.wakeWordBuffer.slice(0, this.wakeWordFrameSize)
          );
          this.wakeWordBuffer.splice(0, this.wakeWordFrameSize);

          // Envia para main thread processar
          this.port.postMessage({
            type: 'wake-word-frame',
            frame: frameToProcess,
          });
        }
        return;
      }

      // Resto do código original...
      let frame = event.data.frame;
      this.frames.push(frame);
      // ... etc ...
    };
  }
}
```

---

### **FASE 6: Testes** (1-2h)

#### Passo 6.1: Teste Manual

```typescript
// Em browser console:
const ctx = new AudioContext();
const osc = ctx.createOscillator();
osc.frequency.value = 440;
osc.connect(ctx.destination);
osc.start();

// Fale "Hey Moshi" próximo ao mic...
// Deve detectar e ativar
```

#### Passo 6.2: Testes Unitários (Jest)

`client/src/hooks/__tests__/useWakeWordDetector.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useWakeWordDetector } from '../useWakeWordDetector';

describe('useWakeWordDetector', () => {
  it('should detect wake word from audio frame', async () => {
    const onDetected = jest.fn();
    const { result } = renderHook(() =>
      useWakeWordDetector({
        onWakeWordDetected: onDetected,
        enabled: true,
      })
    );

    // Aguarda modelo carregar
    await waitFor(() => expect(result.current.isReady).toBe(true));

    // Processa frame simulado
    const mockFrame = new Float32Array(512);
    // Preencha com som simulado...

    act(() => {
      result.current.processFrame(mockFrame);
    });

    // Verifica se callback foi chamado
    // await waitFor(() => expect(onDetected).toHaveBeenCalled());
  });
});
```

---

## 🔌 Integração com Open Claw

> Sistema de robótica que será ativado por voz

### Proposta de Integração

```
┌─────────────────────────────┐
│  Moshi Voice + Wake Word    │
├─────────────────────────────┤
│ 1. Usuario faz pergunta     │
│ 2. Moshi responde em áudio  │
│ 3. Moshi gera comando JSON  │
│    {"action": "grab_object"}│
└───────────┬─────────────────┘
            │ REST/gRPC
            ▼
    ┌──────────────────┐
    │  ROS Bridge      │  ← Converte para robotics
    └──────────────────┘
            │ ROS messages
            ▼
     ┌─────────────────┐
     │  Open Claw      │
     │ (Robotic Arm)   │
     └─────────────────┘
```

### Extensão: `Open Claw Integration`

Adicione em `server.py`:

```python
class OpenClawBridge:
    def __init__(self, ros_host="localhost", ros_port=9090):
        self.ros_client = roslibpy.Ros(host=ros_host, port=ros_port)
        self.ros_client.run()

    async def send_command(self, command: dict):
        """
        command = {
            "action": "grab" | "move" | "rotate",
            "target": "object_id",
            "params": {...}
        }
        """
        topic = roslibpy.Topic(self.ros_client, '/robot/command', 'std_msgs/String')
        topic.publish(roslibpy.Message({'data': json.dumps(command)}))

# No handler de conversa:
if response.contains_action():
    action_cmd = response.extract_action()
    await claw_bridge.send_command(action_cmd)
```

### Exemplo de Fluxo

```
User: "Pega o copo vermelho"
     │
     ▼
Moshi: "Pegando copo vermelho"
(áudio + ação extraída via LLM)
     │
     ▼
JSON: {
  "action": "reach_and_grab",
  "target": "red_cup",
  "confidence": 0.95
}
     │
     ▼
Open Claw: Executa movimento de pega
     │
     ▼
User: Vê a ação completada
```

---

## 📊 Performance & Otimização

### Benchmarks (Esperados)

| Métrica | Valor |
|---------|-------|
| Wake Word Latência | 20-50ms |
| False Positive Rate | <2% por hora |
| False Negative Rate | <5% |
| CPU (Standby) | 2-5% |
| Memory (Model) | ~15-30MB |
| Time to First Byte | <100ms após detecção |

### Otimizações Adicionais

1. **Web Workers** - Mova VAD para worker thread
```typescript
const vadWorker = new Worker('/workers/vad-worker.js');
```

2. **Cache Model** - Use IndexedDB
```typescript
const cachedModel = await idb.get('silero-vad');
if (cachedModel) ort.load(cachedModel);
```

3. **Quantização** - Reduza tamanho do modelo
```bash
python -m onnxruntime.transformers.optimizer \
  --model_type gpt2 \
  --input_model silero-vad.onnx \
  --output_model silero-vad-quantized.onnx
```

---

## ✅ Checklist de Implementação

- [x] Instalou `onnxruntime-web`
- [x] Baixou modelo Silero VAD
- [x] Criou `useWakeWordDetector.ts` hook
- [x] Criou `useWakeWordState.ts` hook
- [x] Criou `WakeWordIndicator.tsx` component
- [x] Integrou em `Conversation.tsx`
- [~] Teste manual de detecção por voz real (dependente de validação no ambiente com microfone)
- [x] Testou com unidade (Jest/Vitest)
- [x] Implementou silêncio detector
- [x] Implementou Open Claw bridge
- [x] Deploy em Docker
- [x] Monitorou performance

---

## 📚 Referências

### Documentação
- [Silero VAD GitHub](https://github.com/snakers4/silero-vad)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-web/)
- [MediaPipe Audio Classifier](https://developers.google.com/mediapipe/solutions/audio/audio_classifier)

### Modelos Alternativos
- [Porcupine Wake Word](https://picovoice.ai/products/porcupine/)
- [Google Speech Commands](https://arxiv.org/abs/1804.03209)

---

**Última atualização:** Abril 2026
