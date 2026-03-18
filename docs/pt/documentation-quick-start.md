[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Voltar ao inicio](./documentation.md) | [Visao geral da interface](./documentation-interface.md) | [Sessoes, agentes e modos de execucao](./documentation-sessions.md) | [API e solucao de problemas](./documentation-api-troubleshooting.md)

# Inicio rapido

## Requisitos

- Use a versao do Node.js definida em [`.nvmrc`](../../.nvmrc), atualmente `22`
- A instalacao por npm e a opcao recomendada para o uso local normal
- Use um checkout do GitHub apenas se quiser modo de desenvolvimento ou alteracoes locais no codigo

## Instalar via OpenClaw

Use o OpenClaw para instalar o LalaClaw em uma maquina remota Mac ou Linux e depois acessar localmente via encaminhamento SSH.

```text
Install https://github.com/aliramw/lalaclaw
```

Exemplo:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Depois abra:

```text
http://127.0.0.1:3000
```

## Instalar a partir do npm

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Depois abra [http://127.0.0.1:5678](http://127.0.0.1:5678).

Notas:

- `lalaclaw init` grava a configuracao local em `~/.config/lalaclaw/.env.local`
- Os valores padrao sao `HOST=127.0.0.1`, `PORT=5678` e `FRONTEND_PORT=4321`
- Em um checkout fonte, `lalaclaw init` inicia Server e Vite Dev Server em segundo plano
- Em macOS com npm, `lalaclaw init` instala e inicia o servico `launchd` do Server
- Em Linux com npm, `lalaclaw init` inicia o Server em segundo plano

## Instalar a partir do GitHub

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Depois abra [http://127.0.0.1:4321](http://127.0.0.1:4321).

## Modo de desenvolvimento

Para o desenvolvimento do repositorio, use estas portas fixas:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

Ou:

```bash
npm run dev:all
```

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- Entrada do navegador: `http://127.0.0.1:5173`

## Browser Access Tokens

Se o navegador mostrar a tela de desbloqueio por token, voce pode encontrar ou renovar o token assim:

- `lalaclaw access token` para mostrar o token atual
- `lalaclaw access token --rotate` para gerar e salvar um novo token
- verifique `COMMANDCENTER_ACCESS_TOKENS` ou `COMMANDCENTER_ACCESS_TOKENS_FILE` em `~/.config/lalaclaw/.env.local`
- se esta instancia nao foi implantada por voce, peca o token para quem administra o ambiente
