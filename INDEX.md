# 📚 Índice de Documentação - VoxPulse Realtime Voice Hub

> Guia de navegação completo para entender e trabalhar com o projeto

---

## 🎯 Como Usar Este Índice

**Selecione seu perfil:**

- 👤 **Não conheço o projeto?** → [Comece Aqui](#-comece-aqui---primeiro-contato-10-min)
- 🚀 **Quero setup rápido?** → [Setup Rápido](#-arquivos-de-setup-rápido)
- 🏗️ **Preciso entender a arquitetura?** → [Documentação Técnica](#-documentação-técnica-completa)
- 💻 **Vou implementar features?** → [Guia de Desenvolvimento](#-guia-de-desenvolvimento)
- 🎙️ **Vou implementar wake word?** → [Implementação Wake Word](#-implementação-de-wake-word)
- 🗺️ **Qual é o roadmap?** → [Roadmap & Estratégia](#-roadmap--estratégia)
- 🧭 **Estou perdido** → [Mapa Rápido](#mapa-rápido)

---

## 🚦 Comece Aqui - Primeiro Contato (10 min)

### 1. Entender em 30 segundos

```
VoxPulse Realtime Voice Hub = ChatGPT em tempo real com IA que fala

✅ Você diz: "Olá, como está?"
✅ IA responde em áudio: "Oi! Tudo bem, e você?"
✅ Tudo acontece em 200-500ms

Stack: Angular + Python PyTorch + WebSocket
```

### 2. Entender em 3 minutos

📖 Leia seção ["Visão Geral da Arquitetura"](DOCUMENTACAO_TECNICA.md#visão-geral-da-arquitetura) em `DOCUMENTACAO_TECNICA.md`

### 3. Tried em 5 minutos

Siga [Passo 1-4 do Setup Rápido](GUIA_RAPIDO_SETUP.md#setup-rápido-10-min)

---

## 📋 Arquivos de Setup Rápido

| Arquivo | Tempo | Para Quem | Links |
|---------|-------|----------|-------|
| **GUIA_RAPIDO_SETUP.md** | 5-10 min | Devs que querem rodar localmente AGORA | [👉 Ler](GUIA_RAPIDO_SETUP.md#🚀-setup-rápido-10-min) |
| **docker-compose.yaml** | 5 min | Devs que preferem Docker | [👉 Deploy com Docker](GUIA_RAPIDO_SETUP.md#-com-docker-recomendado-para-produção) |
| **.env.example** | 2 min | Configurar tokens & secrets | [👉 Ver](GUIA_RAPIDO_SETUP.md#-variáveis-de-ambiente-comuns) |

### Checklist Quick Start

```bash
[ ] npm install em /client-angular
[ ] pip install em /moshi
[ ] export LOCALAI_BASE_URL=hf_xxxxx
[ ] python -m moshi.server --ssl $(mktemp -d)
[ ] npm run start em /client-angular
[ ] Acesse http://localhost:4200
[ ] Clique microfone e fale
```

---

## 📖 Documentação Técnica Completa

### Arquivo Principal: `DOCUMENTACAO_TECNICA.md` (1-2h)

**Se você quer entender TUDO sobre o projeto, leia isso.**

#### Seções-Chave:

1. **[Visão Geral da Arquitetura](DOCUMENTACAO_TECNICA.md#-visão-geral-da-arquitetura)** (10 min)
   - Diagrama: Browser ↔ Server
   - Stack tecnológico
   - Componentes principais

2. **[Stack Tecnológico](DOCUMENTACAO_TECNICA.md#-stack-tecnológico)** (10 min)
   - Frontend: Angular, TypeScript, Angular CLI, Tailwind
   - Backend: Python, PyTorch, aiohttp
   - Protocolos: WebSocket binary

3. **[Componentes Principais](DOCUMENTACAO_TECNICA.md#-componentes-principais)** (20 min)
   - `moshi/server.py` - LLM inference
   - `client/src/pages/Conversation/` - Orquestrador UI
   - `protocol/types.ts` - Types de mensagem
   - `audio-processor.ts` - AudioWorklet

4. **[Fluxo de Comunicação](DOCUMENTACAO_TECNICA.md#-fluxo-de-comunicação)** (15 min)
   - Sequência handshake
   - Loop de conversa em tempo real
   - Parâmetros do modelo passados via URL

5. **[Configuração Servidor](DOCUMENTACAO_TECNICA.md#%EF%B8%8F-configuração-do-servidor)** (15 min)
   - Instalação Python
   - Rodar servidor
   - Variáveis de ambiente
   - Docker Compose

6. **[Configuração Cliente](DOCUMENTACAO_TECNICA.md#-configuração-do-cliente)** (10 min)
   - Instalação npm
   - Server address
   - Build produção

7. **[Sistema de Wake Word](DOCUMENTACAO_TECNICA.md#%EF%B8%8F-sistema-de-wake-word-a-implementar)** (15 min)
   - Por que implementar
   - Arquitetura proposta
   - Opções de solução
   - Steps iniciais

8. **[Guia de Desenvolvimento](DOCUMENTACAO_TECNICA.md#-guia-de-desenvolvimento)** (20 min)
   - Estrutura de arquivos
   - Workflow de dev
   - Debugging tips
   - Commit conventions

9. **[Deployment](DOCUMENTACAO_TECNICA.md#-deployment)** (10 min)
   - Docker Compose
   - Manual
   - Kubernetes
   - Produção checklist

10. **[Troubleshooting](DOCUMENTACAO_TECNICA.md#-troubleshooting)** (15 min)
    - HuggingFace token issues
    - Conexão refused
    - OOM errors
    - Audio cortado

11. **[Monitoramento](DOCUMENTACAO_TECNICA.md#-monitoramento--observabilidade)** (10 min)
    - Frontend metrics
    - Backend metrics
    - Dashboards

12. **[Segurança](DOCUMENTACAO_TECNICA.md#-segurança)** (5 min)
    - Checklist
    - Como esconder secrets

---

## 💻 Guia de Desenvolvimento

### Para modificar o código, você precisa entender:

1. **Frontend Structure**
   ```
   client-angular/src/app/
   ├── app.ts                              ← Fluxo principal
   ├── app.routes.ts                       ← Rotas
   └── wake-word/
       ├── wake-word-detector.service.ts   ← Detecção ONNX + fallback RMS
       ├── wake-word-state.service.ts      ← Máquina de estados
       └── wake-word-indicator.component.ts
   ```

2. **Backend Structure**
   ```
   moshi/moshi/
   ├── server.py               ← MODIFICAR AQUI
   ├── models/
   │   ├── loaders.py
   │   └── lm.py              ← LM inference
   ├── modules/
   │   └── transformer.py     ← Architecture
   └── utils/
       └── connection.py      ← WebSocket utils
   ```

3. **Workflow Desarrollo**
   - Terminal 1: `python -m moshi.server --ssl $(mktemp -d)`
   - Terminal 2: `npm run start` em `/client-angular`
   - Angular CLI hot-reload automático
   - Backend requer reinicialização

### Tarefas Comuns

| Tarefa | Arquivo | Steps |
|--------|---------|-------|
| Adicionar novo parâmetro LLM | `moshi/server.py`, `client-angular/src/app/app.ts` | 1. Adicione flag 2. Passe em URL 3. Exponha na UI |
| Modificar UI | `client-angular/src/app/` | 1. Editar componente/serviço 2. Hot-reload 3. Testar |
| Corrigir bug de latência | `client-angular/src/app/wake-word/wake-word-detector.service.ts` | 1. Ajustar inferência/buffer 2. Testar 3. Benchmark |
| Adicionar integração | `moshi/moshi/integrations/` | 1. Criar novo dir 2. Implement 3. Export |

---

## 🎙️ Implementação de Wake Word

### Arquivo Principal: `IMPLEMENTACAO_WAKE_WORD.md` (2-3h)

**Siga este guia se você vai implementar o detector de wake word.**

#### Seções-Chave:

1. **[Por que implementar](IMPLEMENTACAO_WAKE_WORD.md#-por-que-implementar-wake-word)** (5 min)
   - Problema atual: alto consumo de recursos
   - Solução: standby inteligente
   - Economia: 94% power em standby

2. **[Opções de Solução](IMPLEMENTACAO_WAKE_WORD.md#-opções-de-solução)** (10 min)
   - Comparação: Silero VAD vs Porcupine vs MediaPipe vs...
   - **Recomendação: Silero VAD** (grátis, rápido, comunidade)

3. **[Arquitetura Proposta](IMPLEMENTACAO_WAKE_WORD.md#-arquitetura-proposta)** (10 min)
   - Fluxo completo com diagrama
   - Componentes a adicionar
   - Integração com `app.ts` / fluxo Angular

4. **[Implementação Passo a Passo](IMPLEMENTACAO_WAKE_WORD.md#-implementação-passo-a-passo)** (2-3 horas de código)
   - **FASE 1:** Setup e dependências (1-2h)
     - `npm install onnxruntime-web`
     - Download modelo Silero
   - **FASE 2:** Hook de Wake Word (2-3h)
     - `useWakeWordDetector.ts` (completo + comentado)
     - `useWakeWordState.ts`
    - **FASE 3:** Integração no app Angular (2-3h)
       - Modificar `app.ts`
     - Integrar hooks
   - **FASE 4:** UI Component (1-2h)
       - `wake-word-indicator.component.ts`
     - Estilo CSS
   - **FASE 5:** AudioWorklet (1-2h)
       - Ajustar pipeline de captura/inferência
   - **FASE 6:** Testes (1-2h)
     - Manual testing
     - Jest unit tests

5. **[Integração com Open Claw](IMPLEMENTACAO_WAKE_WORD.md#-integração-com-open-claw)** (10 min)
   - Extensão para robótica
   - ROS bridge
   - Fluxo: Voz → Ação → Braço se move

6. **[Performance & Otimização](IMPLEMENTACAO_WAKE_WORD.md#-performance--otimização)** (10 min)
   - Benchmarks esperados
   - Otimizações: Web Workers, caching, quantização

### Tempo Total

```
Setup:           1-2h
Implementação:   6-8h
Testes:          2-3h
Debug/Polish:    1-2h
─────────────────
TOTAL:           10-15h (~2 dias de trabalho focus)
```

### Checklist de Implementação

```bash
[x] Instalar onnxruntime-web
[x] Baixar modelo Silero
[x] Implementar detector ONNX com fallback RMS
[x] Implementar máquina de estados wake word
[x] Integrar no app Angular
[x] Criar indicador visual de wake word
[x] Adicionar testes automatizados do módulo wake word
[~] Executar teste manual com microfone/voz real
[x] Deploy em Docker
[x] Validar baseline de performance ONNX
```

---

## 🗺️ Roadmap & Estratégia

### Arquivo Principal: `ROADMAP_ESTRATEGIA.md` (1h)

**Entender a visão de longo prazo do projeto.**

#### Seções-Chave:

1. **[Visão Geral](ROADMAP_ESTRATEGIA.md#-visão-geral)** (5 min)
   - V1: MVP ✅
   - V1.1: Wake Word ✅
   - V2: Open Claw 🤖
   - V3: Multi-User 🌐

2. **[Roadmap Detalhado](ROADMAP_ESTRATEGIA.md#-roadmap-detalhado)** (20 min)
   - **FASE 1:** MVP (concluído)
   - **FASE 1.1:** Wake Word (8-16h dev)
   - **FASE 2:** Open Claw (3-4 semanas)
   - **FASE 3:** Multi-User (4-6 semanas)
   - **FASE 4:** Advanced Features (2027+)

3. **[Timeline Visual](ROADMAP_ESTRATEGIA.md#-timeline-visual)** (5 min)
   - Quando cada feature?
   - Interdependências

4. **[KPIs por Fase](ROADMAP_ESTRATEGIA.md#-key-initiatives-kpis)** (10 min)
   - Métricas de sucesso
   - Targets quantitativos

5. **[Risk Matrix](ROADMAP_ESTRATEGIA.md#-priorização--risk-matrix)** (15 min)
   - Impacto vs Risco
   - **Quick Win: Wake Word** (HIGH impact, LOW risk)
   - **Complex: Open Claw** (HIGH impact, MEDIUM risk)

6. **[Roles & Responsabilidades](ROADMAP_ESTRATEGIA.md#-roles--responsabilidades)** (5 min)
   - PM, Frontend, Backend, DevOps

7. **[Success Metrics](ROADMAP_ESTRATEGIA.md#-success-metrics-10k-feet-view)** (10 min)
   - Business: Time to market, users, retention
   - Technical: Latency, uptime, scalability
   - UX: Ease of use, satisfaction, NPS

8. **[Risks & Mitigation](ROADMAP_ESTRATEGIA.md#-risks--mitigation)** (10 min)
   - GPU latency > 500ms
   - Wake word false positives
   - ROS complexity
   - Security

9. **[Learning Path](ROADMAP_ESTRATEGIA.md#-learning-path)** (4 weeks)
   - Week 1: Foundation
   - Week 2: Deep dive
   - Week 3: Hands-on
   - Week 4: Ready for contribution

---

## 🧭 Mapa Rápido

**Quero apenas...** → **Leia isto** (tempo)

| Objetivo | Arquivo | Tempo |
|----------|---------|-------|
| Rodar localmente AGORA | `GUIA_RAPIDO_SETUP.md` | 5-10 min |
| Entender Arquitetura | `DOCUMENTACAO_TECNICA.md` sec 1-4 | 30-40 min |
| FAQ & Troubleshoot | `DOCUMENTACAO_TECNICA.md` sec 10 | 15-20 min |
| Implementar Wake Word | `IMPLEMENTACAO_WAKE_WORD.md` | 2-3 horas |
| Entender o Roadmap | `ROADMAP_ESTRATEGIA.md` | 1 hora |
| Começar a desenvolver | `DOCUMENTACAO_TECNICA.md` sec 8 | 20-30 min |
| Setup em Produção | `DOCUMENTACAO_TECNICA.md` sec 9 | 20-30 min |
| Performance tuning | `IMPLEMENTACAO_WAKE_WORD.md` sec 8 | 15-20 min |

---

## 🎓 Curva de Aprendizado

```
Dia 1:
  ├─ 10 min: Leia "Comece Aqui" (este arquivo)
  ├─ 5 min: Setup local
  ├─ 10 min: Teste no browser
  └─ Resultado: Sistema rodando ✅

Dia 2:
  ├─ 30 min: Leia DOCUMENTACAO_TECNICA.md
   ├─ 30 min: Explore código (server.py, app.ts)
  ├─ 30 min: Debug local
  └─ Resultado: Entende fluxo ✅

Dia 3:
  ├─ 1 hora: Leia ROADMAP_ESTRATEGIA.md
  ├─ 30 min: Planeje primeira feature
  ├─ 2-3 horas: Implemente
  └─ Resultado: Primeiro PR pronto ✅

Semana 1-2:
  ├─ Implemente Wake Word (IMPLEMENTACAO_WAKE_WORD.md)
  ├─ Code review com team
  └─ Resultado: V1.1 em staging ✅
```

---

## 📞 Onde Encontrar O Quê

```
README.md (repo root)
├─ Overview de 30s
├─ Quick start links
└─ Links para documentação

GUIA_RAPIDO_SETUP.md
├─ Setup em 10 min
├─ FAQ rápidas
└─ Troubleshooting comum

DOCUMENTACAO_TECNICA.md (COMPLETA)
├─ Visão geral
├─ Stack tech
├─ Componentes
├─ Protocolo
├─ Config servidor/cliente
├─ Wake word design
├─ Dev workflow
├─ Deployment
├─ Troubleshooting profundo
├─ Monitoramento
└─ Security

IMPLEMENTACAO_WAKE_WORD.md (DETALHADO)
├─ Motivação
├─ Opções de solução
├─ Arquitetura
├─ Implementation steps (FASE 1-6)
├─ Integração Open Claw
├─ Performance & otimização
└─ Checklist

ROADMAP_ESTRATEGIA.md (VISÃO)
├─ Roadmap visível
├─ Timeline
├─ KPIs
├─ Risk matrix
├─ Roles
├─ Success metrics
├─ Learning path
└─ Decision framework
```

---

## 🔗 Navegação Entre Arquivos

### De `GUIA_RAPIDO_SETUP.md` → **Próximos Passos**
```
✅ Se rodou: Parabéns! Você é developer agora 🎉
   Próximo: Leia DOCUMENTACAO_TECNICA.md (30-40 min)

❌ Se não rodou: Troubleshoot em DOCUMENTACAO_TECNICA.md sec 10
   Depois: Leia GUIA_RAPIDO_SETUP.md secção FAQ
```

### De `DOCUMENTACAO_TECNICA.md` → **Próximos Passos**
```
✅ Se entendeu a arquitetura:
   Opção A: Implemente wake word (IMPLEMENTACAO_WAKE_WORD.md)
   Opção B: Entenda roadmap (ROADMAP_ESTRATEGIA.md)
   Opção C: Faça pequeno fix (DOCUMENTACAO_TECNICA.md sec 8)

❌ Se has questions:
   → Slack team  (async)
   → Discord     (community)
   → GitHub Issues (bug tracker)
```

### De `IMPLEMENTACAO_WAKE_WORD.md` → **Próximos Passos**
```
✅ Se completou implementação:
   → Testes passando?  (Jest)
   → Performance OK?   (Benchmark)
   → Code review?      (Pull request)
   → Deploy staging?   (Docker)
   → Merge para main?  (Git)

❌ Se travou:
   → Consulte ROADMAP_ESTRATEGIA.md (risk matrix)
   → Pedir ajuda (team chat)
   → Ler related issues (GitHub)
```

---

## 💡 Pro Tips

### Tip 1: Workflow Óptimo
```bash
Terminal 1: cd moshi && python -m moshi.server --ssl $(mktemp -d)
Terminal 2: cd client-angular && npm run start
Terminal 3: git checkout -b feature/meu-feature
# Código com hot-reload do Angular CLI
git add . && git commit -m "feat: implementei..."
git push origin feature/meu-feature
# Abra PR no GitHub
```

### Tip 2: Debugging Rápido
```javascript
// Console browser (F12)
// Logs estruturados:
console.log('[Component]', 'mensagem', valor);
console.log('[WebSocket]', 'Mensagem recebida:', message);
console.log('[AudioWorklet]', 'Estatísticas:', stats);
```

### Tip 3: Performance Profiling
```bash
# Backend: GPU utilization
watch -n 1 nvidia-smi

# Frontend: DevTools Performance tab
# 1. F12 → Performance
# 2. Click Record
# 3. Interaja com UI
# 4. Stop e analyze frames
```

### Tip 4: Commits Bem Feitos
```bash
# Padrão pt-BR Conventional Commits:
git commit -m "feat: adicionar componente WakeWordIndicator"
git commit -m "fix: corrigir audio lag em conexões lentas"
git commit -m "docs: atualizar roadmap com Open Claw"
git commit -m "test: adicionar testes para wake word"
git commit -m "chore: atualizar dependências de npm"

# Body (opcional):
git commit -m "feat: implementar wake word

Implementa detector local usando Silero VAD.
- Reduz consumo de GPU em 94% no standby
- Latência de detecção <50ms
- Suporta múltiplas frases wake customizáveis

Closes #123"
```

---

## 🎯 Recomendações por Perfil

### 👨‍💼 Manager / PM
```
1. ROADMAP_ESTRATEGIA.md (full)          30 min
2. DOCUMENTACAO_TECNICA.md sec 1-3        20 min
3. Assistir demo em staging               10 min
   └─ Entender timelines, risks, KPIs
```

### 👨‍💻 Frontend Developer
```
1. GUIA_RAPIDO_SETUP.md                  10 min
2. DOCUMENTACAO_TECNICA.md sec 2,3,8      45 min
3. IMPLEMENTACAO_WAKE_WORD.md (FASE 3-6) 4-6h
   └─ Widget, hooks, CSS
```

### 🐍 Backend Developer
```
1. GUIA_RAPIDO_SETUP.md                  10 min
2. DOCUMENTACAO_TECNICA.md sec 1-2,5      40 min
3. IMPLEMENTACAO_WAKE_WORD.md (opcional) 8-16h
4. Estudar PyTorch + Transformers
   └─ Server LLM inference, ORM, APIs
```

### 🚀 DevOps / Infra
```
1. GUIA_RAPIDO_SETUP.md                  10 min
2. DOCUMENTACAO_TECNICA.md sec 5,9       30 min
3. docker-compose.yaml + monitoring       20 min
4. ROADMAP_ESTRATEGIA.md (deployment)    15 min
   └─ Docker, Kubernetes, monitoring
```

### 🤖 ML Engineer
```
1. DOCUMENTACAO_TECNICA.md sec 1-4        30 min
2. Estudar Moshi Voice paper              60 min
3. ROADMAP_ESTRATEGIA.md sec V2           20 min
4. Open Claw integration design           (futuro)
   └─ Fine-tuning, model optimization, actions extraction
```

---

## ✅ Checklist: "Estou Pronto?"

```bash
[ ] Já rodei o server localmente?
[ ] Já consegui conectar no browser?
[ ] Entendi o WebSocket protocol?
[ ] Vi o diagrama de arquitetura?
[ ] Li sobre os componentes principais?
[ ] Fiz um pequeno debug/fix?
[ ] Meu primeiro git commit está pronto?
[ ] Tenho conta no Discord community?

Se sim em todos: 👏 Você está pronto para contribuir!
Se não: Volte aos docs acima.
```

---

## 🚨 Emergências

### "Servidor não sobe"
→ [DOCUMENTACAO_TECNICA.md Troubleshooting](DOCUMENTACAO_TECNICA.md#-troubleshooting)

### "Áudio com latência alta"
→ [DOCUMENTACAO_TECNICA.md Audio Cortado](DOCUMENTACAO_TECNICA.md#problema-áudio-cortadoentrecortado)

### "Preciso implementar rápido"
→ [ROADMAP_ESTRATEGIA.md Risk Matrix](ROADMAP_ESTRATEGIA.md#-priorização--risk-matrix)

### "Esqueci como rodar"
→ [GUIA_RAPIDO_SETUP.md Setup Rápido](GUIA_RAPIDO_SETUP.md#-setup-rápido-10-min)

### "Qual é o código importante?"
→ [DOCUMENTACAO_TECNICA.md Componentes Principais](DOCUMENTACAO_TECNICA.md#-componentes-principais)

---

## 📞 Recursos Externos

- 🤗 [Moshi Voice Model](http://localhost:8080)
- 📄 [Moshi Paper](https://arxiv.org/abs/2410.00037)
- 📄 [Moshi Voice Paper](https://arxiv.org/abs/2602.06053)
- 🎮 [Live Demo](https://research.nvidia.com/labs/adlr/moshi-voice/)
- 💬 [Discord Community](https://discord.gg/5jAXrrbwRb)

---

## 📊 Documentação Status

| Arquivo | Status | Última Atualização |
|---------|--------|-------------------|
| GUIA_RAPIDO_SETUP.md | ✅ Completo | Abr 2026 |
| DOCUMENTACAO_TECNICA.md | ✅ Completo | Abr 2026 |
| IMPLEMENTACAO_WAKE_WORD.md | ✅ Completo | Abr 2026 |
| ROADMAP_ESTRATEGIA.md | ✅ Completo | Abr 2026 |
| INDEX.md (Este arquivo) | ✅ Completo | Abr 2026 |

---

**Bem-vindo ao VoxPulse Realtime Voice Hub! 🎉**

Escolha seu ponto de partida acima e bora começar!
