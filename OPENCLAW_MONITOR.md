# OpenClaw Monitor (Debian Background Service)

Este monitor conecta OpenClaw e Moshi em full-duplex via WebSocket e roda em background no Debian usando `systemd`.

## Fluxo de dados

- OpenClaw -> Moshi:
  - audio binario (ou JSON base64) recebido do OpenClaw
  - enviado para Moshi com prefixo de tipo `0x01` (audio de cliente)
  - feedback de sensores (`type=sensor` ou `type=feedback`) ingerido para validar seguranca das acoes
- Moshi -> OpenClaw:
  - audio de servidor (tipo `0x01`) repassado como frame binario
  - texto de servidor (tipo `0x02`) repassado em JSON `{ "type": "text", "data": "..." }`
  - opcionalmente, texto e convertido em eventos de acao `{ "type": "action", "data": {...} }` apos validacao

## Execucao manual

No ambiente Python do projeto `moshi`:

```bash
moshi-openclaw-monitor \
  --openclaw-ws ws://127.0.0.1:7000/ws/audio \
  --moshi-ws ws://127.0.0.1:8998/api/chat \
  --moshi-query worker_auth_id=silence_check
```

Parametros principais:

- `--openclaw-ws`: endpoint WS do OpenClaw (obrigatorio)
- `--moshi-ws`: endpoint WS do Moshi (default: `ws://127.0.0.1:8998/api/chat`)
- `--moshi-query key=value`: parametros de query para o Moshi (repetivel)
- `--reconnect-delay`: delay entre tentativas de reconexao (default: `2.0`)
- `--audio-json-out`: tambem espelha audio de saida como JSON base64
- `--emit-actions`: habilita extracao de acoes a partir do texto gerado pelo Moshi
- `--action-min-confidence`: limiar minimo para emitir acao (default: `0.75`)
- `--max-action-distance-m`: limite maximo de deslocamento por acao (default: `2.0`)
- `--max-action-speed-mps`: limite maximo de velocidade (default: `1.2`)
- `--max-action-angle-deg`: limite maximo de rotacao em graus (default: `180`)
- `--min-obstacle-distance-m`: distancia minima de obstaculo para permitir movimento (default: `0.3`)
- `--min-battery-pct`: bateria minima para executar acoes nao emergenciais (default: `5.0`)
- `--sensor-stale-after-ms`: validade maxima do snapshot de sensor para checks de seguranca (default: `3000`)
- `--rosbridge-http-endpoint`: endpoint HTTP opcional para despacho das acoes aprovadas ao gateway ROS
- `--rosbridge-timeout-s`: timeout das requisicoes HTTP ao gateway ROS (default: `1.5`)
- `--rosbridge-auth-token`: token bearer opcional para autenticacao no gateway ROS

## Pipeline de acao (V2 bootstrap)

Quando `--emit-actions` esta ativo:

1. O texto de resposta do Moshi passa por `ActionExtractor` (parser JSON + fallback rule-based).
2. A acao candidata e validada por `SafetyConstraints` (acao suportada, limites de distancia/velocidade/angulo).
3. O snapshot de sensores mais recente (bateria/obstaculo/e-stop) e aplicado nos checks de seguranca.
4. A acao aprovada e enviada para `RosBridge`.
  - Sem endpoint configurado: fallback para logging estruturado.
  - Com `--rosbridge-http-endpoint`: envio HTTP `POST` (`action` + `params`) para gateway ROS.
5. O OpenClaw recebe um evento JSON `type=action` com `action`, `params`, `confidence`, `source` e `sensor`.

Se bloqueada, o OpenClaw recebe `type=action_rejected` com o motivo.

Eventos de feedback de sensor enviados pelo OpenClaw recebem `type=sensor_ack` quando aceitos.

## Execucao em background (systemd)

Arquivo de unidade pronto:

- `deploy/systemd/moshi-openclaw-monitor.service`

Passos no Debian:

```bash
sudo cp deploy/systemd/moshi-openclaw-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now moshi-openclaw-monitor
sudo systemctl status moshi-openclaw-monitor
```

Configuracao opcional por variaveis de ambiente (`/etc/default/moshi-openclaw-monitor`):

```bash
OPENCLAW_WS=ws://127.0.0.1:7000/ws/audio
MOSHI_WS=ws://127.0.0.1:8998/api/chat
MOSHI_WORKER_AUTH_ID=silence_check
OPENCLAW_RECONNECT_DELAY=2.0

OPENCLAW_AUDIO_JSON_OUT=false
OPENCLAW_EMIT_ACTIONS=false
OPENCLAW_ACTION_MIN_CONFIDENCE=0.75
OPENCLAW_MAX_ACTION_DISTANCE_M=2.0
OPENCLAW_MAX_ACTION_SPEED_MPS=1.2
OPENCLAW_MAX_ACTION_ANGLE_DEG=180.0
OPENCLAW_MIN_OBSTACLE_DISTANCE_M=0.3
OPENCLAW_MIN_BATTERY_PCT=5.0
OPENCLAW_SENSOR_STALE_AFTER_MS=3000

OPENCLAW_ROSBRIDGE_HTTP_ENDPOINT=
OPENCLAW_ROSBRIDGE_TIMEOUT_S=1.5
OPENCLAW_ROSBRIDGE_AUTH_TOKEN=

# Opcional: argumentos extras
OPENCLAW_EXTRA_ARGS=
```

Depois de alterar esse arquivo:

```bash
sudo systemctl daemon-reload
sudo systemctl restart moshi-openclaw-monitor
```

Logs:

```bash
sudo journalctl -u moshi-openclaw-monitor -f
```

## Execucao com Docker Compose

O `docker-compose.yaml` possui o servico `openclaw-monitor` para rodar o bridge em background junto com o `moshi-voice`.

Variaveis uteis no `.env`:

- `OPENCLAW_WS` (default: `ws://host.docker.internal:7000/ws/audio`)
- `MOSHI_WS` (default: `ws://moshi-voice:8998/api/chat`)
- `MOSHI_WORKER_AUTH_ID` (default: `silence_check`)
- `OPENCLAW_RECONNECT_DELAY` (default: `2.0`)
- `OPENCLAW_AUDIO_JSON_OUT` (default: `false`)
- `OPENCLAW_EMIT_ACTIONS` (default: `false`)
- `OPENCLAW_ACTION_MIN_CONFIDENCE` (default: `0.75`)
- `OPENCLAW_MAX_ACTION_DISTANCE_M` (default: `2.0`)
- `OPENCLAW_MAX_ACTION_SPEED_MPS` (default: `1.2`)
- `OPENCLAW_MAX_ACTION_ANGLE_DEG` (default: `180.0`)
- `OPENCLAW_MIN_OBSTACLE_DISTANCE_M` (default: `0.3`)
- `OPENCLAW_MIN_BATTERY_PCT` (default: `5.0`)
- `OPENCLAW_SENSOR_STALE_AFTER_MS` (default: `3000`)
- `OPENCLAW_ROSBRIDGE_HTTP_ENDPOINT` (default: vazio/fallback log)
- `OPENCLAW_ROSBRIDGE_TIMEOUT_S` (default: `1.5`)
- `OPENCLAW_ROSBRIDGE_AUTH_TOKEN` (default: vazio)
- `OPENCLAW_EXTRA_ARGS` (default: vazio)

Subir ambos os servicos:

```bash
docker compose up -d moshi-voice openclaw-monitor
docker compose logs -f openclaw-monitor
```

## Observacoes

- O monitor tenta reconectar automaticamente quando qualquer lado cai.
- O endpoint OpenClaw deve aceitar frames binarios para audio para menor latencia.
- Se o OpenClaw consumir apenas JSON, habilite `--audio-json-out`.
