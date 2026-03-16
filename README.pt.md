[Leia este README em outro idioma: English](./README.md) | [中文](./README.zh.md) | [日本語](./README.ja.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Uma forma melhor de co-criar com agentes.

## Destaques

- Interface command center em React + Vite com chat, timeline, inspector, temas, idiomas e anexos
- Backend em Node.js que pode se conectar a um gateway OpenClaw local ou remoto
- Interface disponivel em ingles, chines, japones, frances, espanhol e portugues
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
npm install -g lalaclaw
lalaclaw init
```

Depois abra [http://127.0.0.1:3000](http://127.0.0.1:3000).

Para desenvolvimento local:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
```

Em desenvolvimento use [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Atualizacao

Atualizar para a versao mais recente:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Instalar uma versao especifica:

```bash
npm install -g lalaclaw@2026.3.17-4
lalaclaw init
```

## Notas de desenvolvimento

- Para desenvolvimento use `npm run dev:all` em vez de `npm start`
- Use `npm run lalaclaw:start` ou `npm start` apenas quando depender do build em `dist/`
- O app detecta automaticamente um OpenClaw local quando ele esta disponivel
- Para forcar o modo `mock`, use `COMMANDCENTER_FORCE_MOCK=1`

## Versionamento

O LalaClaw usa versionamento de calendario compativel com npm.

- Atualize [CHANGELOG.md](./CHANGELOG.md) sempre que a versao mudar
- Para varias releases no mesmo dia, use `YYYY.M.D-N`, por exemplo `2026.3.17-4`
