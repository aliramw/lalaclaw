[Voltar ao inicio](./documentation.md) | [Visao geral da interface](./documentation-interface.md) | [Sessoes, agentes e modos de execucao](./documentation-sessions.md) | [API e solucao de problemas](./documentation-api-troubleshooting.md)

# Inicio rapido

## Requisitos

- Use a versao do Node.js definida em [`.nvmrc`](../../.nvmrc), atualmente `22`
- Execute `npm ci` na raiz do projeto antes da primeira execucao local
- Execute `npm run lalaclaw:init` se quiser gerar um `.env.local` local

## Instalar a partir do GitHub em uma maquina nova

Se o OpenClaw ja estiver instalado na maquina e `~/.openclaw/openclaw.json` estiver disponivel:

```bash
git clone https://github.com/aliramw/CommandCenter.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
npm run lalaclaw:start
```

Notas:

- `npm run doctor` verifica Node.js, OpenClaw, configuracao local e portas
- `npm run doctor -- --json` retorna o mesmo diagnostico em JSON com `summary.status` e `summary.exitCode`
- `npm run lalaclaw:init` ajuda a criar ou atualizar `.env.local`
- `npm run lalaclaw:init -- --write-example` copia `.env.local.example` para o arquivo de configuracao de destino sem perguntas interativas
- `npm run lalaclaw:start` e a entrada recomendada para producao depois de `npm run build`
- `npm run lalaclaw:start` roda no terminal atual, entao fechar esse terminal interrompe o servico
- Se a configuracao local ja estiver pronta, voce pode pular `npm run lalaclaw:init`
- Se preferir configurar manualmente, use [`.env.local.example`](../../.env.local.example) como ponto de partida

## Modo de desenvolvimento

Inicie frontend e backend ao mesmo tempo e use a pagina do Vite como entrada do navegador.

Voce tambem pode fazer isso com um unico comando:

```bash
npm run dev:all
```

Se preferir iniciar separadamente:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

Use `http://127.0.0.1:5173` no navegador.

## Modo build

```bash
npm run build
npm run lalaclaw:start
```

Notas:

- `npm run lalaclaw:start` depende de `dist/`
- Se voce pular `npm run build`, o backend retorna `503 Web app build is missing`
- O modo build nao e a melhor escolha para o desenvolvimento diario do frontend

## Deploy persistente no macOS

Se voce quiser manter o app online mesmo depois de fechar o terminal no macOS, use `launchd`.

1. Faça o build do app:

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
```

2. Gere o plist com o script do repositorio:

```bash
./deploy/macos/generate-launchd-plist.sh
```

3. Carregue o servico:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

Comandos uteis:

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```

O guia completo do macOS esta em [deploy/macos/README.md](../../deploy/macos/README.md).

## `mock` e OpenClaw

Ao iniciar, o backend tenta ler primeiro `~/.openclaw/openclaw.json`.

- Se encontrar um gateway local e um token, entra no modo `openclaw`
- Caso contrario, usa `mock` por padrao

Forcar `mock`:

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

Se voce usar a CLI para inicializar a configuracao:

```bash
npm run lalaclaw:init
npm run doctor
```

No modo `remote-gateway`, `doctor` tambem faz uma verificacao real do gateway remoto e envia uma requisicao minima para validar o modelo e o agent configurados.

Configurar um gateway remoto:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
node server.js
```

Se o gateway estiver mais proximo da API Responses:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

## Proximos passos

- Para entender a interface: [Visao geral da interface](./documentation-interface.md)
- Para ir direto ao fluxo de uso: [Chat, anexos e comandos](./documentation-chat.md)
