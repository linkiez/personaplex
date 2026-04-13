# VoxPulse Realtime Voice Hub — Monitor Wake Word + Full-Duplex Conversation

Sistema de conversação full-duplex em tempo real baseado na arquitetura [Moshi](https://arxiv.org/abs/2410.00037), com detector de wake word local e backend de LLM via [LocalAI](https://localai.io) (`localhost:8080`).

> O usuário fala uma frase de ativação → o sistema acorda → inicia conversa bidirecional em tempo real → desconecta após silêncio.

## Arquitetura

```
Browser (Angular + Web Audio) ──WSS──► Python Server (aiohttp)
  ├─ Wake word detector (local)           ├─ MIMI codec (áudio)
  ├─ AudioWorklet (streaming)             ├─ LocalAI LLM (localhost:8080)
  └─ UI: visualizer, texto, controles     └─ SentencePiece tokenizer
```

## Pré-requisitos

### Infraestrutura compartilhada (servidor jcm)

As seguintes instâncias já estão disponíveis no servidor `jcm` e devem ser tratadas como serviços externos de integração:

- PostgreSQL
- Redis
- Keycloak
- Fluentd
- Kibana
- Elasticsearch

Este repositório não faz provisionamento desses serviços por padrão; o foco é consumir endpoints/credenciais já existentes via variáveis de ambiente e secrets.

### LocalAI rodando em localhost:8080

Instale e inicie o [LocalAI](https://localai.io/basics/getting_started/) com um modelo de sua escolha:

```bash
# Via Docker (recomendado)
docker run -p 8080:8080 \
  -v $(pwd)/models:/build/models \
  localai/localai:latest

# Instalar modelo (exemplo: Mistral 7B)
curl http://localhost:8080/models/apply -H 'Content-Type: application/json' \
  -d '{"id": "huggingface@theBloke/Mistral-7B-Instruct-v0.2-GGUF"}'

# Verificar modelos disponíveis
curl http://localhost:8080/v1/models
```

Qualquer modelo compatível com a API OpenAI funciona. Consulte a [galeria de modelos do LocalAI](https://localai.io/models/) para opções.

### Codec de áudio Opus

```bash
# Ubuntu/Debian
sudo apt install libopus-dev

# Fedora/RHEL
sudo dnf install opus-devel
```

## Instalação

```bash
git clone <repo-url>
cd voxpulse-realtime-voice-hub

# Backend Python
cd moshi
pip install -e .

# Frontend
cd ../client-angular
npm install
```

## Configuração

Copie e edite o arquivo de ambiente:

```bash
cp .env.example .env
```

Variáveis principais:

```bash
# URL do LocalAI (padrão: localhost:8080)
LOCALAI_BASE_URL=http://localhost:8080

# Nome do modelo carregado no LocalAI
LOCALAI_MODEL=mistral

# Porta do servidor de voz
MOSHI_PORT=8998
```

Quando a integração multiusuário estiver ativa, mantenha as credenciais de PostgreSQL/Redis/Keycloak e os endpoints de observabilidade (Fluentd/Elasticsearch/Kibana) em um gerenciador de segredos.

## Executar

### Desenvolvimento (manual)

```bash
# Terminal 1 — Backend
cd moshi
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR"

# Terminal 2 — Frontend Angular
cd client-angular
npm run start
```

Acesse: `http://localhost:4200`

### Docker Compose

```bash
docker-compose up --build
```

Acesse: `https://localhost:8998`

> O LocalAI deve estar rodando em `localhost:8080` antes de iniciar este sistema.

### Modo offline (avaliação)

Para avaliar com arquivo WAV de entrada:

```bash
python -m moshi.offline \
  --input-wav "assets/test/input_assistant.wav" \
  --seed 42 \
  --output-wav "output.wav" \
  --output-text "output.json"
```

Com CPU offload (GPU com pouca memória):

```bash
python -m moshi.offline --cpu-offload \
  --input-wav "assets/test/input_service.wav" \
  --output-wav "output.wav"
```

## Wake Word

O detector de wake word roda localmente no browser (sem enviar áudio ao servidor) e ativa a conversa apenas quando a frase de ativação é detectada.

Frases padrão: `"hey moshi"`, `"ok moshi"` (configuráveis no Frontend).

Após 3 segundos de silêncio, a sessão é encerrada automaticamente e o sistema volta ao modo standby.

Consulte [IMPLEMENTACAO_WAKE_WORD.md](IMPLEMENTACAO_WAKE_WORD.md) para o guia de implementação completo.

## Controle de Persona

O comportamento do assistente é controlado pelo `text_prompt` passado ao servidor via parâmetros da URL WebSocket. Exemplos:

```
You are a helpful assistant. Speak naturally and keep answers concise.
```
```
Você é um assistente técnico. Responda em português de forma objetiva.
```
```
You work for AcmeCorp support. Your name is Sam. Help customers with billing questions.
```

## Vozes

As vozes são controladas pelo parâmetro `voice_prompt` e dependem dos embeddings disponíveis no diretório `--voice-prompt-dir`.

## Documentação Completa

| Arquivo | Conteúdo |
|---|---|
| [INDEX.md](INDEX.md) | Índice e guia de navegação |
| [GUIA_RAPIDO_SETUP.md](GUIA_RAPIDO_SETUP.md) | Setup em 10 minutos |
| [DOCUMENTACAO_TECNICA.md](DOCUMENTACAO_TECNICA.md) | Arquitetura, componentes e API |
| [IMPLEMENTACAO_WAKE_WORD.md](IMPLEMENTACAO_WAKE_WORD.md) | Guia de implementação do wake word |
| [ROADMAP_ESTRATEGIA.md](ROADMAP_ESTRATEGIA.md) | Roadmap e próximas versões |

## Licença

Código sob licença MIT. Pesos do codec MIMI sob licença original do projeto [Moshi/Kyutai](https://github.com/kyutai-labs/moshi).
