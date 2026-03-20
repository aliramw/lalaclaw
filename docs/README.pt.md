[Leia este README em outro idioma: English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Uma forma melhor de co-criar com agentes.

Autora: Marila Wang

## Destaques

- Interface command center em React + Vite com chat, timeline, inspector, temas, idiomas e anexos
- Exploracao de arquivos no estilo VS Code com arvore de sessao, arvore de workspace e acoes de preview
- Interface disponivel em 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu e தமிழ்
- Backend em Node.js que pode se conectar a um gateway OpenClaw local ou remoto
- Testes, CI, lint, guia de contribuicao e notas de release ja incluidos

## Tour do produto

- Barra superior para agent, modelo, fast mode, think mode, contexto, fila, tema e idioma
- Area principal de chat para prompts, anexos, respostas em streaming e reset de sessao
- Inspector para timeline, arquivos, artifacts, snapshots e atividade do runtime
- Superficie de Environment dentro do Inspector para diagnosticos do OpenClaw, acoes de gerenciamento, edicao segura de configuracao e caminhos de arquivos/diretorios com aberturas distintas
- Runtime utilizavel em modo `mock` por padrao, com opcao de mudar para gateways OpenClaw reais

Uma apresentacao mais longa esta em [pt/showcase.md](./pt/showcase.md).

## Documentacao

- Indice de idiomas: [README.md](./README.md)
- Guia em portugues: [pt/documentation.md](./pt/documentation.md)
- Inicio rapido: [pt/documentation-quick-start.md](./pt/documentation-quick-start.md)
- Guia da interface: [pt/documentation-interface.md](./pt/documentation-interface.md)
- Sessoes e runtime: [pt/documentation-sessions.md](./pt/documentation-sessions.md)
- Arquitetura: [pt/architecture.md](./pt/architecture.md)

Mais notas de estrutura estao em [server/README.md](../server/README.md) e [src/features/README.md](../src/features/README.md).

## Guia de instalacao

### Instalar pelo npm

Para a instalacao mais simples:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Depois abra [http://127.0.0.1:5678](http://127.0.0.1:5678).

Notas:

- `lalaclaw init` grava a configuracao local em `~/.config/lalaclaw/.env.local` no macOS e Linux
- Por padrao, `lalaclaw init` usa `HOST=127.0.0.1`, `PORT=5678` e `FRONTEND_PORT=4321`
- Em um checkout de codigo-fonte, `lalaclaw init` inicia Server e Vite Dev Server em segundo plano e depois sugere abrir a URL do Dev Server
- Em instalacoes npm no macOS, `lalaclaw init` instala e inicia o servico `launchd` do Server e depois sugere abrir a URL do Server
- Em instalacoes npm no Linux, `lalaclaw init` inicia o Server em segundo plano e depois sugere abrir a URL do Server
- Use `lalaclaw init --no-background` se quiser apenas escrever a configuracao sem iniciar servicos
- Depois de `--no-background`, execute `lalaclaw doctor` e use `lalaclaw dev` para checkout fonte ou `lalaclaw start` para instalacao empacotada
- `lalaclaw status`, `lalaclaw restart` e `lalaclaw stop` controlam apenas o servico `launchd` do Server no macOS
- A visualizacao de arquivos `doc`, `ppt` e `pptx` exige LibreOffice. No macOS, use `lalaclaw doctor --fix` ou `brew install --cask libreoffice`

### Instalar via OpenClaw

Use o OpenClaw para instalar o LalaClaw em uma maquina remota Mac ou Linux e depois acessar localmente via encaminhamento de porta SSH.

Se voce ja tem uma maquina com OpenClaw instalado e consegue acessar essa maquina por SSH, pode pedir ao OpenClaw para instalar este projeto a partir do GitHub, iniciar tudo no host remoto e depois encaminhar essa porta para sua maquina local.

Diga ao OpenClaw:

```text
Install https://github.com/aliramw/lalaclaw
```

Fluxo tipico:

1. O OpenClaw clona este repositorio na maquina remota.
2. O OpenClaw instala as dependencias e inicia o LalaClaw.
3. O app escuta em `127.0.0.1:5678` na maquina remota.
4. Voce encaminha essa porta remota para sua maquina local via SSH.
5. Voce abre o endereco local encaminhado no navegador.

Exemplo de encaminhamento SSH:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Depois abra este endereco local:

```text
http://127.0.0.1:3000
```

### Instalar pelo GitHub

Se voce quiser um checkout do codigo para desenvolvimento ou mudancas locais:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Depois abra [http://127.0.0.1:4321](http://127.0.0.1:4321).

Notas:

- `npm run lalaclaw:init` agora inicia Server e Vite Dev Server em segundo plano por padrao, a menos que voce passe `--no-background`
- Depois da inicializacao, o comando sugere abrir a URL do Dev Server, cujo padrao e `http://127.0.0.1:4321`
- Se quiser apenas gerar a configuracao, use `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` roda no terminal atual e para quando esse terminal e fechado
- Se depois quiser o ambiente de desenvolvimento ao vivo, execute `npm run dev:all` e abra `http://127.0.0.1:4321` ou o `FRONTEND_PORT` configurado

### Atualizar o LalaClaw

Se voce instalou LalaClaw com npm e quer a versao mais recente:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Se quiser uma versao especifica, por exemplo `2026.3.21-1`:

```bash
npm install -g lalaclaw@2026.3.21-1
lalaclaw init
```

Se voce instalou LalaClaw pelo GitHub e quer a versao mais recente:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Se quiser uma versao especifica, por exemplo `2026.3.21-1`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.21-1
npm ci
npm run build
npm run lalaclaw:start
```

## Comandos comuns

- `npm run dev:all` inicia o fluxo padrao de desenvolvimento local
- `npm run doctor` verifica Node.js, deteccao do OpenClaw, portas e configuracao local
- `npm run lalaclaw:init` grava ou atualiza a configuracao local de bootstrap
- `npm run lalaclaw:start` inicia o app buildado apos verificar `dist/`
- `npm run build` cria o bundle de producao
- `npm test` executa o Vitest uma vez
- `npm run lint` executa o ESLint

Para a lista completa de comandos e o fluxo de contribuicao, veja [CONTRIBUTING.md](../CONTRIBUTING.md).

## Contribuir

Contribuicoes sao bem-vindas. Para recursos grandes, mudancas de arquitetura ou mudancas visiveis para o usuario, abra primeiro uma issue.

Antes de abrir um PR:

- Mantenha as mudancas focadas e evite refactors sem relacao
- Adicione ou atualize testes para mudancas de comportamento
- Coloque todo texto visivel em `src/locales/*.js`
- Atualize a documentacao quando houver mudanca visivel
- Atualize [CHANGELOG.md](../CHANGELOG.md) quando houver mudancas versionadas

A checklist completa esta em [CONTRIBUTING.md](../CONTRIBUTING.md).

## Notas de desenvolvimento

- Use `npm run dev:all` para o fluxo padrao de desenvolvimento local
- Em desenvolvimento, a URL frontend padrao e [http://127.0.0.1:4321](http://127.0.0.1:4321), ou a que voce configurar em `FRONTEND_PORT`
- Reserve `npm run lalaclaw:start` e `npm start` para verificacoes baseadas em `dist/`
- O app detecta automaticamente um gateway OpenClaw local quando ele esta disponivel
- Para forcar o modo `mock`, use `COMMANDCENTER_FORCE_MOCK=1`
- Antes de um PR, recomenda-se executar `npm run lint`, `npm test` e `npm run build`

## Versionamento

O LalaClaw usa versionamento de calendario compativel com npm.

- Atualize [CHANGELOG.md](../CHANGELOG.md) sempre que a versao mudar
- Para varias releases no mesmo dia, use `YYYY.M.D-N`, por exemplo `2026.3.21-1`
- Explique claramente mudancas breaking em notas de release e documentos de migracao
- Para desenvolvimento, a versao recomendada de Node.js e `22`, definida em [`.nvmrc`](../.nvmrc). O pacote npm publicado suporta `^20.19.0 || ^22.12.0 || >=24.0.0`

## Integracao com OpenClaw

Se existir `~/.openclaw/openclaw.json`, o LalaClaw detecta automaticamente seu gateway OpenClaw local e reutiliza o endpoint loopback e o token.

Para um novo checkout fonte, uma configuracao tipica e esta:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Se quiser apontar para outro gateway compativel com OpenClaw, defina:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

Se o seu gateway se parece mais com a API OpenAI Responses, use:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

Sem essas variaveis, o app inicia em modo `mock`, de modo que a UI e o loop de chat continuam utilizaveis durante o bootstrap.
