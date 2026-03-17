[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Voltar ao inicio](./documentation.md) | [Visao geral da interface](./documentation-interface.md) | [Sessoes, agentes e modos de execucao](./documentation-sessions.md) | [API e solucao de problemas](./documentation-api-troubleshooting.md)

# Inicio rapido

## Requisitos

- Use a versao do Node.js definida em [`.nvmrc`](../../.nvmrc), atualmente `22`
- A instalacao por npm e a opcao recomendada para o uso local normal
- Use um checkout do GitHub apenas se quiser modo de desenvolvimento ou alteracoes locais no codigo

## Instalar a partir do npm

Para a configuracao mais simples para usuarios finais:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Notas:

- `lalaclaw init` grava sua configuracao local em `~/.config/lalaclaw/.env.local` no macOS e Linux
- Em instalacoes npm no macOS, `lalaclaw init` tambem inicia automaticamente um servico `launchd`
- No Linux, ou se voce desativar a inicializacao em segundo plano, continue com `lalaclaw doctor` e depois `lalaclaw start`

## Instalar a partir do GitHub

Use este caminho se quiser um checkout do codigo-fonte para desenvolvimento ou alteracoes locais.

Se o OpenClaw ja estiver instalado na maquina e `~/.openclaw/openclaw.json` estiver disponivel:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
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

## Instalar em um host remoto via OpenClaw

Se voce tiver uma maquina remota que o OpenClaw consegue controlar e tambem puder acessar essa maquina por SSH, pode deixar o OpenClaw instalar e iniciar o LalaClaw remotamente, e depois acessa-lo localmente por meio de encaminhamento de porta SSH.

Exemplo de instrucao para o OpenClaw:

```text
安装这个 https://github.com/aliramw/lalaclaw
```

Fluxo tipico:

1. O OpenClaw clona o repositorio na maquina remota
2. O OpenClaw instala as dependencias e inicia a aplicacao
3. O LalaClaw escuta em `127.0.0.1:3000` na maquina remota
4. Voce encaminha essa porta remota para sua maquina local via SSH
5. Depois abre no navegador o endereco local encaminhado

Exemplo de encaminhamento SSH:

```bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
```

Depois abra:

```text
http://127.0.0.1:3000
```

Notas:

- Nesse modo, o seu `127.0.0.1:3000` local aponta na pratica para o `127.0.0.1:3000` da maquina remota
- O processo do app, a configuracao do OpenClaw, os transcripts, os logs e os workspaces ficam na maquina remota
- Essa abordagem e mais segura do que expor o dashboard diretamente na internet publica, porque caso contrario qualquer pessoa que conheca a URL pode usar esse painel sem senha
- Se a porta local `3000` ja estiver ocupada, voce pode usar outra porta local como `3300:127.0.0.1:3000` e depois abrir `http://127.0.0.1:3300`

## Atualizar uma instalacao existente

Se voce instalou o LalaClaw com npm e quer a versao mais recente:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Se preferir uma versao publicada especifica, como `2026.3.17-7`:

```bash
npm install -g lalaclaw@2026.3.17-7
lalaclaw init
```

Se voce instalou o LalaClaw a partir do GitHub, atualize assim:

Se voce ja instalou o LalaClaw a partir do GitHub e quer a versao mais recente:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Se preferir uma versao publicada especifica, como `2026.3.17-7`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.17-7
npm ci
npm run build
npm run lalaclaw:start
```

Notas:

- `npm install -g lalaclaw@latest` atualiza o pacote npm instalado globalmente
- `git pull` atualiza sua copia local para a versao mais recente no GitHub
- `npm ci` instala as dependencias exigidas por essa versao
- `npm run build` atualiza os arquivos web usados pelo servidor de producao
- Se voce usa a configuracao de `launchd` no macOS, reinicie o servico apos a atualizacao com `launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app`
- Se o Git disser que voce tem alteracoes locais, faca backup delas ou confirme-as antes de atualizar

## Modo de desenvolvimento

O modo de desenvolvimento exige um checkout do GitHub com `npm ci` ja executado.

Inicie a interface e o backend ao mesmo tempo e use a pagina do Vite como entrada do navegador.

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
- Para ir direto ao fluxo de uso: [Conversa, anexos e comandos](./documentation-chat.md)
