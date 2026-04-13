# 🗺️ Roadmap & Estratégia do Projeto VoxPulse Realtime Voice Hub

> Visão de longo prazo, marcos e prioridades

---

## 📌 Visão Geral

**VoxPulse Realtime Voice Hub** é um sistema de conversação full-duplex em tempo real baseado em IA (LocalAI (backend OpenAI-compatible)) que:

1. ✅ **V1 (Atual):** Chat bidirecional com persona e voice control
2. ✅ **V1.1 (Concluído técnico):** Wake word detector local (economia de recursos)
3. 🤖 **V2 (Futuro):** Integração com Open Claw (braço robótico)
4. 🌐 **V3 (Longo Prazo):** Multi-usuário, histórico persistido, analytics

**Diretriz de stack backend (preferência):** Node.js + Express + TypeScript + Drizzle ORM.

---

## 🎯 Roadmap Detalhado

### **FASE 1: MVP Atual** ✅ (Concluído)

**Objetivo:** Chat em tempo real 1:1 com IA

```
[✅] Refatoração: remoção de dependências PersonaPlex/HuggingFace/NVIDIA
[✅] Integração LocalAI (OpenAI-compatible, localhost:8080)
[✅] Backend Moshi Voice + MIMI Codec
[✅] Frontend Angular + Web Audio API
[✅] Streaming WebSocket binary protocol
[✅] Audio input/output simultâneo (full-duplex)
[✅] Persona control (text prompt)
[✅] Voice selection (NATF/NATM/VAR)
[✅] Parameter tuning (temperature, topK, etc)
[✅] Docker deployment
[✅] SSL/TLS support
[✅] Qualidade de código: 0 erros lint/SonarQube em server.py, loaders.py, offline.py
[✅] Frontend: node_modules instalados, 0 erros TypeScript
```

**Métricas de Sucesso:**
- ✅ Latência <500ms (primeira resposta)
- ✅ Áudio contínuo sem gaps (jitter <50ms)
- ✅ Docker deploy funcional
- ✅ Documentação básica

---

### **FASE 1.1: Wake Word Detector** ✅ (Aug-Sep 2026)

**Objetivo:** Economizar 90%+ de recursos em standby

```
Timeline: 8-16 horas dev

[✅] Integração Silero VAD/ONNX (React + Angular, com fallback RMS)
[✅] Audio capture contínuo + wake processing no browser (baseline RMS)
[✅] Detector ONNX no Angular implementado (com fallback RMS)
[✅] State machine (standby/listening/conversing)
[✅] Auto-disconnect após silêncio
[✅] UI Indicator visual
[✅] Base Angular criada para migração do frontend com wake word shell
[✅] Build e testes Angular validados após integração do detector
[✅] Testes unitários (WakeWordStateService e WakeWordDetectorService no Angular)
[✅] Benchmark inicial reproduzível no Angular/ONNX (`npm run benchmark:wake-word`) com baseline de latência
[✅] Compatibilidade de I/O do modelo ONNX reforçada (`state/stateN` e legado `h/c`)
```

**Estimativa:** 2 sprints (2 semanas)

**Arquivos a Criar:**
```
client/src/
├── hooks/
│   ├── useWakeWordDetector.ts (novo)
│   ├── useWakeWordState.ts (novo)
│   └── useSilenceDetector.ts (novo, implementado)
├── utils/wakeWordModels/ (novo dir)
└── components/WakeWordIndicator/ (novo)
```

**Sucesso:**
- ✅ Wake word detectado em <100ms
- ✅ False positive rate <1% por hora
- ✅ CPU standby: 2-5% (vs 15-25% hoje)
- ✅ Suporta múltiplas frases wake

---

### **FASE 2: Open Claw Integration** 🤖 (Oct-Nov 2026)

**Objetivo:** Converter comandos de voz para ações robóticas

```
Timeline: 3-4 semanas

[x] Bridge OpenClaw↔Moshi full-duplex concluído (WebSocket monitor)
[x] Bridge ROS (Robot Operating System) com dispatch HTTP opcional + fallback log
[x] LLM action extraction (JSON) com parser robusto (nested JSON/fenced block/PT-BR)
[x] Command parsing & validation concluído (distance/speed/angle/direction + aliases)
[x] Testes unitários backend (action extraction + safety)
[x] Testes de emissão `action/action_rejected` no monitor OpenClaw
[x] Feedback loop de sensores no monitor (snapshot + safety contextual)
[x] Safety constraints contextuais (distance/speed/angle + sensores de obstaculo/bateria/e-stop)
[x] UI Angular para visualizar feed de ações (aprovadas/rejeitadas)
[x] Integration tests com simulator/fakes (monitor events + sensor flow)
[x] Serviço Debian em background parametrizado (systemd + compose + env)

Status atual: Fase 2 concluída tecnicamente no escopo planejado (bridge, safety, parser, testes e operação).
```

**Arquitetura:**

```
User Command          Moshi LLM           ROS Bridge      Open Claw
"Pega a xícara"  →  Extract Action   →  {"grab": ...} → Execute
                     {"confidence": 95}   {"status": ok}   👇
                                                           Robô se move
```

**Exemplo de Workflow:**

```json
{
  "user_input": "Pega a xícara vermelha na mesa",
  "moshi_output": {
    "text": "Pegando a xícara vermelha...",
    "audio": "base64_encoded_wav",
    "action": {
      "type": "reach_and_grab",
      "target": "red_cup",
      "location": "table_3",
      "confidence": 0.94
    }
  },
  "ros_command": {
    "robot_id": "open_claw_1",
    "operation": "reach",
    "coords": [x, y, z],
    "grasp_force": 0.8
  },
  "feedback": {
    "status": "success",
    "execution_time": 3.5,
    "object_detected": true
  }
}
```

**Arquivos a Criar:**

```
moshi/moshi/
├── integrations/
│   ├── __init__.py
│   ├── open_claw/
│   │   ├── ros_bridge.py (novo)
│   │   ├── action_extractor.py (novo)
│   │   └── safety_constraints.py (novo)
│   └── base_integration.py

client/src/
└── components/RobotControl/ (novo)
    ├── RobotStatus.tsx
    └── ActionPreview.tsx
```

**Sucesso:**
- ✅ Detecta intenção de ação em 100ms
- ✅ Converte para comando ROS válido
- ✅ 90%+ taxa de sucesso em simulador
- ✅ Safety constraints prevenindo colisão

---

### **FASE 3: Multi-User & Persistence** 🌐 (Dec 2026 - Jan 2027)

**Objetivo:** Suportar múltiplos usuários com histórico

**Contexto de infraestrutura:** servidor `jcm` já possui PostgreSQL, Redis, Keycloak, Fluentd, Kibana e Elasticsearch ativos; nesta fase o foco é integração e governança desses serviços no fluxo da aplicação.

```
Timeline: 4-6 semanas

[x] Session management (JWT) — access + refresh tokens, rotação segura; server/src/lib/jwt.ts
[x] Database (PostgreSQL - instância pronta no jcm; Drizzle ORM schema criado) — server/src/db/schema.ts
[x] Chat history persistence — /conversations + /messages REST API
[x] User preferences (favorite personas/voices) — /preferences GET+PUT
[x] Analytics dashboard (Fluentd HTTP emitter → Kibana no jcm) — server/src/lib/analytics.ts
[x] User authentication (Keycloak OIDC — Authorization Code Flow + JWKS) — server/src/lib/keycloak.ts
[x] Rate limiting & quotas — express-rate-limit (global 120rpm + 20rpm em /auth)
[x] Multi-server load balancing — nginx upstream + SSL termination; deploy/nginx/nginx.conf
```

**Arquitectura:**

```
Browser 1                Browser 2
   ↓                        ↓
   └─────→ Load Balancer ←──┘
           ├─→ Moshi Server 1
           ├─→ Moshi Server 2
           └─→ Moshi Server 3
                   ↓
              PostgreSQL
              (histórico)
```

**Nova Stack:**
- Backend: Node.js + Express + TypeScript + Drizzle ORM
- DB: PostgreSQL + Redis cache
- Auth: Keycloak (servidor jcm)
- Monitoring: Fluentd + Elasticsearch + Kibana (servidor jcm)

---

### **FASE 4: Advanced Features** ⭐ (2027+)

```
Future Enhancements:

[  ] Fine-tuning em datasets custom
[  ] Múltiplos modelos (seleção de tamanho)
[  ] Integração com APIs externas (weather, news)
[  ] Voice cloning para usuários
[  ] Emotion detection & response
[  ] Streaming transcription (live captions)
[  ] Chrome extension
[  ] Mobile app (React Native)
[  ] Video conferencing integration
```

---

## 📊 Timeline Visual

```
2026                                    2027
Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  Jan
│    │    │    │    │    │    │    │    │    │
🟢   │    │    │    │    │    │    │    │    │    MVP ✅
    │    │    │    │    ■─────────■    │    │    V1.1 Wake Word ✅
     │    │    │    │    │    │    │    ■─────────■ V2 Open Claw 🤖
     │    │    │    │    │    │    │    │    │    │  V3 Multi-User 🌐

■ Start    ■ Delivery
```

---

## 🎯 Key Initiatives (KPIs)

### Por Fase

#### V1 (Atual)
- ✅ Chat latency: <500ms (target: 300ms)
- ✅ Audio quality: >8kHz stereo
- ✅ Uptime: 99.5%
- ✅ User sentiment: >4.5/5 stars

#### V1.1 (Wake Word)
- 📋 Standby power: <10W (target: 5W)
- 📋 Detection latency: <100ms
- 📋 False positive rate: <1% per hour
- 📋 CPU efficiency: 10x improvement

#### V2 (Open Claw)
- 🤖 Action accuracy: >90%
- 🤖 Safety compliance: 100% (no collisions)
- 🤖 Execution time: <10s per command
- 🤖 Integration tests: >95% pass rate

#### V3 (Multi-User)
- 🌐 Concurrent users: 100+
- 🌐 Message persistence: 99.99%
- 🌐 Historical search: <1s query
- 🌐 System SLA: 99.9%

---

## 💰 Priorização & Risk Matrix

```
                  HIGH IMPACT
                     ↑
        ┌────────────┼────────────┐
        │     │                   │
        │   QUICK  │              │
        │   WINS   │    MOONSHOT  │
LOW◄────┼──────────┼──────────┤→HIGH
RISK    │          │ │        │   RISK
        │  DRUDGE  │ │  RISKY  │
        │  WORK    │ │ COMPLEX │
        │          │            │
        └────────────┼────────────┘
                     ↓
                 LOW IMPACT

🟢 V1.1 Wake Word:        QUICK WIN   (HIGH impact, LOW risk)
🔵 V2 Open Claw:          COMPLEX     (HIGH impact, MEDIUM risk)
🟣 V3 Multi-User:         ROADBLOCK   (MEDIUM impact, MEDIUM risk)
🟡 V4 Advanced Features:  STRATEGIC   (HIGH impact, HIGH risk)
```

**Recomendação:** Focar em **V2 (Open Claw)** e na integração da **V3** com serviços já ativos no servidor `jcm`.

---

## 👥 Roles & Responsabilidades

```
┌─────────────────────────────────────┐
│  PRODUCT MANAGER                    │
│  • Roadmap decisions                │
│  • User feedback → prioritization    │
│  • KPI tracking                     │
└─────────────────────────────────────┘
         ↓ guia ↓

┌──────────────┬────────────────┐
│  FRONTEND    │  BACKEND       │
│  • UI/UX     │  • LLM         │
│  • Angular   │  • Node.js/Express │
│  • Audio API │  • TypeScript + Drizzle ORM │
│  • WebSocket │  • API Design + Streaming   │
└──────────────┴────────────────┘
         ↓ entrega ↓

┌─────────────────────────────────────┐
│  DEVOPS / INFRA                     │
│  • Docker deployment                │
│  • Kubernetes orchestration         │
│  • Monitoring & alerts              │
│  • CI/CD pipeline                   │
└─────────────────────────────────────┘
```

---

## 📈 Success Metrics (10k feet view)

### Business Metrics
- **Time to Market:** V1.1 em 2 semanas ✅
- **User Acquisition:** 1k beta users em 3 meses
- **Retention:** 70% DAU na semana 4
- **Revenue:** Model TBD (freemium/enterprise)

### Technical Metrics
- **Performance:** P50 latency <300ms, P99 <1s
- **Reliability:** 99.9% uptime SLA
- **Scalability:** 1k+ concurrent users
- **Cost:** <$0.10 per conversation (GPU amortized)

### User Experience
- **Ease of Use:** 5min first interaction
- **Satisfaction:** >4.5/5 stars
- **Churn:** <5% monthly
- **NPS:** >50

---

## 🚨 Risks & Mitigation

| Risk | Probabilidade | Impacto | Mitigation |
|------|---|---|---|
| GPU latency > 500ms | MÉDIA | ALTO | Use quantization, optimize batch size |
| Wake word false positives | BAIXA | MÉDIA | Threshold tuning, custom training |
| ROS integration complexity | ALTA | ALTO | PoC com simulator first, hire ROS expert |
| Multi-user bottlenecks | MÉDIA | ALTO | Load testing early, Redis caching |
| Security vulnerabilities | BAIXA | CRÍTICO | Security audit, penetration testing |

---

## 🎓 Learning Path

Para o time ficar proficiente:

### Week 1: Foundation
- [ ] Ler [DOCUMENTACAO_TECNICA.md](DOCUMENTACAO_TECNICA.md)
- [ ] Ler [GUIA_RAPIDO_SETUP.md](GUIA_RAPIDO_SETUP.md)
- [ ] Setup local (dev environment)
- [ ] Entender WebSocket protocol

### Week 2: Deep Dive
- [ ] Estudar Moshi Voice architecture (paper)
- [ ] Entender MIMI codec
- [ ] Analisar backend Express em TypeScript (LLM inference + APIs)
- [ ] Analisar `client-angular/src/app/app.ts` (orchestration)

### Week 3: Hands-On
- [ ] Implementar pequeño feature (ex: novo parâmetro)
- [ ] Escrever testes unitários
- [ ] Deploy em staging
- [ ] Performance profiling

### Week 4: Ready for Contribution
- [ ] Implementar wake word detector (ou outro feature)
- [ ] Code review com team
- [ ] Merge para main branch
- [ ] Deploy em produção

---

## 📚 Documentation Hierarchy

```
README.md (overview de 30s)
    ↓
GUIA_RAPIDO_SETUP.md (5-10 min)
    ↓
DOCUMENTACAO_TECNICA.md (1-2 horas)
    ↓
IMPLEMENTACAO_WAKE_WORD.md (deep dive, 2-3 horas)
    ↓
Code comments & JSDoc (reference durante dev)
```

---

## 🔄 Decision Framework

**Como priorizar features?**

```python
def prioritize(feature):
    score = 0
    score += feature.user_impact * 2      # Weight 2x
    score += feature.tech_debt_reduction  # Weight 1x
    score -= feature.implementation_days  # Weight -0.5x
    score -= feature.risk_level * 3       # Weight -3x (risk averse)
    return score

# Wake Word: high impact, low risk, fast = 🟢 HIGH PRIORITY
# Open Claw: high impact, medium risk, slow = 🔵 MEDIUM PRIORITY
# Multi-User: medium impact, medium risk, slow = 🟡 LOW PRIORITY
```

---

## 🎉 Success Stories (Aspirational)

### 3 Meses
> "VoxPulse Realtime Voice Hub processou 10k conversas com 99.8% uptime. Wake word detectou pharases em português com 97% accuracy."

### 6 Meses
> "Open Claw robô integrado. Usuários podem pedir ações naturalmente em português. NPS=+60."

### 1 Ano
> "Multi-user SaaS com 100k usuários. VoxPulse Realtime Voice Hub é referência em IA conversacional em português."

---

## 📞 Governance & Decision Making

### Change Request Process

```
Feature Request
      ↓
PM Review (viability, priority)
      ↓
Technical Feasibility Study (2-3 days)
      ↓
Team Discussion (async Slack + sync meeting)
      ↓
DECISION (Go/No-Go/Defer)
      ↓
If Go: Create epic + tasks → Implementation
```

### Code Review Standards

- [ ] Código passa lint/prettier
- [ ] Tests cobrem >80%
- [ ] Documentation updated
- [ ] Performance impact <5%
- [ ] 2 approvals antes de merge

### Release Cadence

- **Hotfix:** ASAP (security/critical bugs)
- **Patch:** Weekly (v1.x.y)
- **Minor:** Bi-weekly (v1.y.0)
- **Major:** Quarterly (v2.0.0)

---

## 🏁 Conclusion

**VoxPulse Realtime Voice Hub** é um projeto ambicioso com clara visão:

1. **Now (V1):** MVP conversa IA - ✅ Pronto
2. **Next (V2):** Integração robô - 🤖 Em evolução
3. **Soon (V3):** Multi-usuário, persistência e analytics - 🌐 Em planejamento
4. **Future (V3+):** Multi-usuário, IA avançada - 🌐 Roadmap

**Próximo Passo:** Consolidar V2 (bridge ROS + extração de ações) e iniciar integrações de persistência/autenticação da V3 com PostgreSQL e Keycloak do servidor `jcm`.

---

**Documento:** Estratégia & Roadmap VoxPulse Realtime Voice Hub
**Atualizado:** Abril 2026
**Próxima Review:** Julho 2026
