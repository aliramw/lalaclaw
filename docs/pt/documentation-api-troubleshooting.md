[Voltar ao inicio](./documentation.md) | [Inicio rapido](./documentation-quick-start.md) | [Inspector, preview de arquivos e rastreamento](./documentation-inspector.md) | [Sessoes, agentes e modos de execucao](./documentation-sessions.md)

# API e solucao de problemas

## API

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## Problemas comuns

- Se `dist` estiver faltando, execute `npm run build`
- Se o ambiente de desenvolvimento falhar, confira `127.0.0.1:5173` e `127.0.0.1:3000`
- Se o app continuar em `mock`, revise `~/.openclaw/openclaw.json` e as variaveis `OPENCLAW_*`
- Se a primeira mensagem sumir e a conversa voltar ao estado vazio, execute `npm run doctor` e confirme que em `local-openclaw` nao aparece `OpenClaw CLI not found on PATH`
- No navegador, verifique se `POST /api/chat` volta com `conversation` vazio
- A causa mais comum e ter `~/.openclaw/openclaw.json`, mas nao ter o binario `openclaw` instalado ou disponivel no `PATH`
- Rode `which openclaw`; se nao houver resultado, instale OpenClaw CLI ou adicione-o ao `PATH`
- Se o binario estiver em um caminho personalizado, inicie o backend assim:

```bash
OPENCLAW_BIN=/absolute/path/to/openclaw PORT=3000 HOST=127.0.0.1 node server.js
```
