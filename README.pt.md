[Leia este README em outro idioma: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Uma forma melhor de co-criar com agentes.

Autora: Marila Wang

## Destaques

- Interface command center em React + Vite com chat, timeline, inspector, temas, idiomas e anexos
- Backend em Node.js que pode se conectar a um gateway OpenClaw local ou remoto
- Interface disponivel em chines simplificado, chines tradicional (Hong Kong), ingles, japones, coreano, frances, espanhol, portugues, alemao, malaio e tamil
- Testes, CI, lint, cobertura e documentacao de contribuicao ja incluidos

## Documentacao

- Indice de idiomas: [docs/README.md](./docs/README.md)
- Documentacao em portugues: [docs/pt/documentation.md](./docs/pt/documentation.md)
- Inicio rapido: [docs/pt/documentation-quick-start.md](./docs/pt/documentation-quick-start.md)
- Visao geral da interface: [docs/pt/documentation-interface.md](./docs/pt/documentation-interface.md)
- Sessoes e runtime: [docs/pt/documentation-sessions.md](./docs/pt/documentation-sessions.md)

## Inicio rapido

Para a instalacao mais simples:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Depois abra [http://127.0.0.1:3000](http://127.0.0.1:3000).

Notas:

- No macOS, `lalaclaw init` tambem inicia automaticamente um servico `launchd`
- Em um checkout do codigo-fonte no macOS, `lalaclaw init` faz o build de `dist/` primeiro quando necessario para iniciar o servico de producao
- Se voce quiser apenas gravar a configuracao, use `lalaclaw init --no-background`
- No Linux, ou se voce desativar a inicializacao em segundo plano, siga com `lalaclaw doctor` e `lalaclaw start`
- A visualizacao de arquivos `doc`, `ppt` e `pptx` requer LibreOffice
- No macOS, voce pode executar `lalaclaw doctor --fix` ou `brew install --cask libreoffice`

Para desenvolvimento local:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
```

Em desenvolvimento use [http://127.0.0.1:5173](http://127.0.0.1:5173).

Se voce quiser o servico de producao em segundo plano a partir de um checkout do codigo no macOS, execute `npm run doctor` e depois `npm run lalaclaw:init`.

## Instalar em um host remoto via OpenClaw

Se voce ja tem uma maquina remota gerenciada pelo OpenClaw e tambem consegue entrar nela por SSH, pode pedir ao OpenClaw para instalar este projeto a partir do GitHub, iniciar o app no host remoto e depois acessar o dashboard localmente usando encaminhamento de porta por SSH.

Exemplo de instrucao para o OpenClaw:

```text
安装这个 https://github.com/aliramw/lalaclaw
```

Fluxo tipico:

1. O OpenClaw clona este repositorio na maquina remota
2. O OpenClaw instala as dependencias e inicia o LalaClaw
3. O app fica escutando em `127.0.0.1:3000` na maquina remota
4. Voce encaminha essa porta remota para sua maquina local com SSH
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

- Nessa configuracao, o seu `127.0.0.1:3000` local aponta na pratica para o `127.0.0.1:3000` da maquina remota
- O processo do app, a configuracao do OpenClaw, os transcripts, os logs e os workspaces ficam na maquina remota
- Essa abordagem e mais segura do que expor o dashboard diretamente na internet publica, porque caso contrario qualquer pessoa que conheca a URL pode usar esse painel sem senha
- Se a porta local `3000` ja estiver ocupada, voce pode usar outra porta local como `3300:127.0.0.1:3000` e depois abrir `http://127.0.0.1:3300`

## Atualizacao

Atualizar para a versao mais recente:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Instalar uma versao especifica:

```bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
```

## Notas de desenvolvimento

- Para desenvolvimento use `npm run dev:all` em vez de `npm start`
- Use `npm run lalaclaw:start` ou `npm start` apenas quando depender do build em `dist/`
- O app detecta automaticamente um OpenClaw local quando ele esta disponivel
- Para forcar o modo `mock`, use `COMMANDCENTER_FORCE_MOCK=1`
- `npm run doctor -- --fix` instala o LibreOffice automaticamente no macOS quando o suporte de visualizacao com LibreOffice estiver ausente

## Versionamento

O LalaClaw usa versionamento de calendario compativel com npm.

- Atualize [CHANGELOG.md](./CHANGELOG.md) sempre que a versao mudar
- Para varias releases no mesmo dia, use `YYYY.M.D-N`, por exemplo `2026.3.17-5`
