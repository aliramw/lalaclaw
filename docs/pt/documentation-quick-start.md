[Voltar ao inicio](./documentation.md) | [Visao geral da interface](./documentation-interface.md) | [Sessoes, agentes e modos de execucao](./documentation-sessions.md) | [API e solucao de problemas](./documentation-api-troubleshooting.md)

# Inicio rapido

## Requisitos

- Use a versao do Node.js definida em [`.nvmrc`](../../.nvmrc), atualmente `22`
- Execute `npm ci` na raiz do projeto antes da primeira execucao local

## Modo de desenvolvimento

Inicie frontend e backend ao mesmo tempo e use a pagina do Vite como entrada do navegador.

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

Use `http://127.0.0.1:5173` no navegador.
